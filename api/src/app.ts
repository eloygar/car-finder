import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import axios from 'axios';
import Fastify, { type FastifyInstance } from 'fastify';

import { SEARCH_LOCATIONS } from '../../pipeline/src/config/searches.js';
import { createPrismaClient } from '../../shared/src/db/client.js';
import {
  createLocalWallapopClient,
  executeLocalSearch,
} from './localSearch/executeLocalSearch.js';
import {
  localSearchRequestSchema,
  type LocalSearchRequest,
  type LocalSearchResult,
} from './localSearch/types.js';
import { buildListingFacetWhere, type ListingFacetQuery } from './listingFilters.js';
import { issueKey } from '../../shared/src/modelIssueAssessment.js';

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
  app.get('/api/listings', async (request, reply) => {
    const query = request.query as {
      status?: string;
      brand?: string;
      limit?: string;
    };
    const where: Record<string, unknown> = {};
    if (query.status) where.status = query.status;
    if (query.brand) where.brand = query.brand;

    const prisma = createPrismaClient();
    try {
      const [items, count] = await Promise.all([
        prisma.listing.findMany({
          where,
          include: {
            knownModelIssues: true,
            listingIssueExtraction: {
              include: {
                issues: {
                  include: { assessment: true },
                  orderBy: { createdAt: 'asc' },
                },
              },
            },
          },
          orderBy: { firstSeenAt: 'desc' },
          ...(query.limit ? { take: Number(query.limit) } : {}),
        }),
        prisma.listing.count({ where }),
      ]);
      const vehicleModelIds = [...new Set(items.flatMap((item) =>
        item.knownModelIssues ? [item.knownModelIssues.vehicleModelId] : []))];
      const assessments = vehicleModelIds.length === 0 ? [] : await prisma.modelIssueAssessment.findMany({
        where: { vehicleModelId: { in: vehicleModelIds } },
        select: {
          vehicleModelId: true, issueKey: true, severity: true,
          estimatedCostMinEUR: true, estimatedCostMaxEUR: true,
          reasoning: true, sources: true, pricingYear: true, assessedAt: true,
        },
      });
      const byVehicleModel = new Map<string, typeof assessments>();
      for (const assessment of assessments) {
        const group = byVehicleModel.get(assessment.vehicleModelId) ?? [];
        group.push(assessment);
        byVehicleModel.set(assessment.vehicleModelId, group);
      }
      return reply.send({
        count,
        items: items.map((item) => withListingIssueExtraction(withIssueAssessments(
          item,
          item.knownModelIssues ? byVehicleModel.get(item.knownModelIssues.vehicleModelId) ?? [] : [],
        ))),
      });
    } finally {
      await prisma.$disconnect();
    }
  });

  app.get('/api/listings/facets', async (request, reply) => {
    const query = request.query as ListingFacetQuery;
    const where = buildListingFacetWhere(query);

    const prisma = createPrismaClient();
    try {
      const brandGrouped = await prisma.listing.groupBy({
        by: ['brand'],
        where,
        _count: { _all: true },
      });
      const modelGrouped = await prisma.listing.groupBy({
        by: ['brand', 'model'],
        where,
        _count: { _all: true },
      });

      return reply.send({
        brands: brandGrouped.map((entry) => ({ brand: entry.brand, count: entry._count._all })),
        models: modelGrouped.map((entry) => ({
          brand: entry.brand,
          model: entry.model,
          count: entry._count._all,
        })),
      });
    } finally {
      await prisma.$disconnect();
    }
  });

  app.delete('/api/listings/:id', async (request, reply) => {
    const prisma = createPrismaClient();
    try {
      await prisma.listing.delete({ where: { id: String((request.params as { id: string }).id) } });
      return reply.send({ ok: true });
    } catch (error) {
      const isNotFound =
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        (error as { code?: string }).code === 'P2025';
      return reply.code(isNotFound ? 404 : 500).send({
        error: isNotFound ? 'not_found' : 'delete_failed',
        message: isNotFound
          ? 'El anuncio no existe o ya fue eliminado.'
          : 'No se ha podido eliminar el anuncio.',
      });
    } finally {
      await prisma.$disconnect();
    }
  });

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

function withIssueAssessments<T extends {
  knownModelIssues: null | {
    vehicleModelId: string;
    mechanical: string[];
    bodywork: string[];
    interior: string[];
    other: string[];
  };
}>(item: T, assessments: Array<{
  vehicleModelId: string;
  issueKey: string;
  severity: string;
  estimatedCostMinEUR: number;
  estimatedCostMaxEUR: number;
  reasoning: string;
  sources: unknown;
  pricingYear: number;
  assessedAt: Date;
}>) {
  if (!item.knownModelIssues) return item;
  const knownModelIssues = item.knownModelIssues;
  const cached = new Map(assessments.map((assessment) => [assessment.issueKey, assessment]));
  const categories = [
    ['mechanical', knownModelIssues.mechanical],
    ['bodywork', knownModelIssues.bodywork],
    ['interior', knownModelIssues.interior],
    ['other', knownModelIssues.other],
  ] as const;
  return {
    ...item,
    knownModelIssues: {
      ...knownModelIssues,
      issueAssessments: categories.flatMap(([category, issues]) => issues.map((issue) => ({
        issue,
        category,
        assessment: publicAssessment(cached.get(issueKey(issue))),
      }))),
    },
  };
}

function publicAssessment(assessment: {
  vehicleModelId: string;
  issueKey: string;
  severity: string;
  estimatedCostMinEUR: number;
  estimatedCostMaxEUR: number;
  reasoning: string;
  sources: unknown;
  pricingYear: number;
  assessedAt: Date;
} | undefined) {
  if (!assessment) return null;
  const { issueKey: _issueKey, vehicleModelId: _vehicleModelId, ...result } = assessment;
  return result;
}

function withListingIssueExtraction<T extends {
  listingIssueExtraction: null | {
    extractedAt: Date;
    issues: Array<{
      category: string;
      description: string;
      evidence: string[];
      assessment: null | {
        severity: string;
        estimatedCostMinEUR: number;
        estimatedCostMaxEUR: number;
        reasoning: string;
        sources: unknown;
        pricingYear: number;
        assessedAt: Date;
      };
    }>;
  };
}>(item: T) {
  if (!item.listingIssueExtraction) return item;
  return {
    ...item,
    listingIssueExtraction: {
      extractedAt: item.listingIssueExtraction.extractedAt,
      issues: item.listingIssueExtraction.issues.map((issue) => ({
        category: issue.category,
        description: issue.description,
        evidence: issue.evidence,
        assessment: issue.assessment,
      })),
    },
  };
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
