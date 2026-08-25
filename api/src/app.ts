import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance } from 'fastify';

import { SEARCH_LOCATIONS } from '../../pipeline/src/config/searches.js';
import { executeLocalSearch } from './localSearch/executeLocalSearch.js';
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
  const search = options.executeSearch ?? ((request) => executeLocalSearch(request, app.log));
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
      request.log.error(
        { errorType: error instanceof Error ? error.name : typeof error },
        'Local Wallapop search failed',
      );
      return reply.code(502).send({
        error: 'search_failed',
        message: 'Wallapop no ha completado la búsqueda. Inténtalo de nuevo.',
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
