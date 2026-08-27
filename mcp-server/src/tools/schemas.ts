import * as z from 'zod/v4';

export const vehicleQuerySchema = z.strictObject({
  brand: z.string().trim().min(1).max(100).describe('Vehicle manufacturer'),
  model: z.string().trim().min(1).max(100).describe('Vehicle model'),
  year: z.number().int().min(1886).max(2100).optional().describe('Model year'),
});

export const vehicleOperabilitySubmissionSchema = z.strictObject({
  description: z.string().describe('Untrusted seller description used as the only evidence source'),
  status: z.enum(['operational', 'non_operational', 'unknown']),
  confidence: z.enum(['low', 'medium', 'high']),
  evidence: z.array(z.string().trim().min(1)).describe('Short literal excerpts from description'),
  reason: z.string().trim().min(1).describe('Brief explanation grounded only in description'),
});

export const vehicleOperabilityOutputSchema = vehicleOperabilitySubmissionSchema.omit({
  description: true,
});

export const operationalStatusInputSchema = z.strictObject({
  description: z.string().describe('Untrusted seller description to analyze'),
});

const anthropicToolUsageSchema = z.strictObject({
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  webSearchRequests: z.number().int().nonnegative(),
});

export const operationalStatusToolOutputSchema = z.strictObject({
  operability: vehicleOperabilityOutputSchema,
  model: z.string(),
  usage: anthropicToolUsageSchema,
});

export const knownIssuesWebAnalysisSchema = z.strictObject({
  found: z.boolean(),
  summary: z.string().trim().min(1),
  sources: z.array(z.strictObject({
    title: z.string().trim().min(1),
    url: z.string().trim().min(1),
  })),
});

export const knownIssuesWebToolOutputSchema = z.strictObject({
  knownIssues: knownIssuesWebAnalysisSchema,
  model: z.string(),
  usage: anthropicToolUsageSchema,
});

const nullableYear = z.number().int().nullable();

export const checkKnownIssuesOutputSchema = z.object({
  hasKnownIssues: z.boolean(),
  issues: z.array(z.object({
    id: z.string(),
    description: z.string(),
    severity: z.enum(['low', 'medium', 'high', 'unknown']),
    yearFrom: nullableYear,
    yearTo: nullableYear,
    sourceUrl: z.string().url().nullable(),
  })),
});

const marketFiltersSchema = z.object({
  brand: z.string(),
  model: z.string(),
  yearWindow: z.object({ from: z.number().int(), to: z.number().int() }).nullable(),
});

export const estimateMarketPriceOutputSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('ok'),
    currency: z.literal('EUR'),
    sampleSize: z.number().int().nonnegative(),
    filters: marketFiltersSchema,
    average: z.string(),
    median: z.string(),
    minimum: z.string(),
    maximum: z.string(),
  }),
  z.object({
    status: z.literal('insufficient_data'),
    currency: z.literal('EUR'),
    sampleSize: z.number().int().nonnegative(),
    requiredSampleSize: z.literal(3),
    filters: marketFiltersSchema,
  }),
]);
