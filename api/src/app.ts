import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import axios from 'axios';
import Fastify, { type FastifyInstance } from 'fastify';

import { SEARCH_LOCATIONS } from '../../pipeline/src/config/searches.js';
import {
  createLocalWallapopClient,
  executeLocalSearch,
} from './localSearch/executeLocalSearch.js';
import {
  localSearchRequestSchema,
  type LocalSearchRequest,
  type LocalSearchResult,
} from './localSearch/types.js';

export interface CreateAppOptions {
  executeSearch?: (request: LocalSearchRequest) => Promise<LocalSearchResult>;
  logger?: boolean;
  serveWeb?: boolean;
}

export async function createApp(options: CreateAppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: options.logger === false ? false : { level: process.env.LOG_LEVEL ?? 'info' },
  });
  const sharedClient = options.executeSearch ? undefined : createLocalWallapopClient(app.log);
  const search = options.executeSearch ?? ((request) => executeLocalSearch(
    request,
    app.log,
    { client: sharedClient! },
  ));
  let searchInProgress = false;

  await app.register(cors, {
    origin: /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/,
  });

  app.get('/api/health', async () => ({ ok: true }));
  app.get('/api/taxonomy', async () => taxonomyResponse());

  app.post('/api/search', async (request, reply) => {
    const parsed = localSearchRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: 'invalid_search',
        fields: parsed.error.flatten().fieldErrors,
      });
    }
    if (searchInProgress) {
      return reply.code(409).send({
        error: 'search_in_progress',
        message: 'Ya hay una búsqueda en curso. Espera a que termine.',
      });
    }

    searchInProgress = true;
    try {
      return await search(parsed.data);
    } catch (error) {
      const failure = classifySearchFailure(error);
      request.log.error(
        {
          errorType: error instanceof Error ? error.name : typeof error,
          failureCode: failure.code,
          upstreamStatus: axios.isAxiosError(error) ? error.response?.status : undefined,
          networkCode: axios.isAxiosError(error) ? error.code : undefined,
        },
        'Local Wallapop search failed',
      );
      return reply.code(502).send({
        error: failure.code,
        message: failure.message,
      });
    } finally {
      searchInProgress = false;
    }
  });

  const webRoot = path.resolve('web/dist');
  if (options.serveWeb !== false && existsSync(webRoot)) {
    await app.register(fastifyStatic, { root: webRoot });
    app.setNotFoundHandler((request, reply) => {
      if (request.method === 'GET' && request.headers.accept?.includes('text/html')) {
        return reply.sendFile('index.html');
      }
      return reply.code(404).send({ error: 'not_found' });
    });
  }

  return app;
}

function classifySearchFailure(error: unknown): { code: string; message: string } {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    if (status === 403 || status === 429) {
      return {
        code: 'wallapop_rate_limited',
        message: 'Wallapop ha limitado temporalmente las peticiones. Espera un momento y vuelve a intentarlo.',
      };
    }
    if (status !== undefined && status >= 500) {
      return {
        code: 'wallapop_unavailable',
        message: 'Wallapop no está respondiendo correctamente. Inténtalo de nuevo más tarde.',
      };
    }
    if (!error.response || error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
      return {
        code: 'wallapop_network_error',
        message: 'La conexión con Wallapop se ha interrumpido después de varios intentos.',
      };
    }
  }

  if (error instanceof Error && (
    error.message.startsWith('Malformed Wallapop response')
    || error.message.includes('repeated cursor')
  )) {
    return {
      code: 'wallapop_protocol_error',
      message: 'Wallapop ha devuelto una respuesta inesperada. Inténtalo de nuevo.',
    };
  }

  return {
    code: 'search_failed',
    message: 'La búsqueda no se ha podido guardar. Revisa los logs del servidor.',
  };
}

type CapturedTaxonomy = {
  brands: string[];
  models: Record<string, string[]>;
  filters: Record<string, {
    options: Array<{ value: string; label: string; type: string }>;
    range: { minimum: string; maximum: string; unit: string | null; label: string } | null;
  }>;
};

let cachedTaxonomy: CapturedTaxonomy | undefined;

function taxonomyResponse() {
  const taxonomy = cachedTaxonomy ??= JSON.parse(
    readFileSync(path.resolve('docs/wallapop-car-taxonomy-capture.json'), 'utf8'),
  ) as CapturedTaxonomy;
  return {
    brands: taxonomy.brands,
    models: taxonomy.models,
    locations: SEARCH_LOCATIONS,
    filters: {
      fuel: taxonomy.filters['Combustible']?.options ?? [],
      transmission: taxonomy.filters['Cambio']?.options ?? [],
      bodyType: taxonomy.filters['Carrocería']?.options ?? [],
      price: taxonomy.filters['Precio']?.range,
      year: taxonomy.filters['Año']?.range,
      mileage: taxonomy.filters['Kilometraje']?.range,
    },
  };
}
