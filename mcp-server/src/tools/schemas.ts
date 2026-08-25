import * as z from 'zod/v4';

export const vehicleQuerySchema = z.object({
  brand: z.string().trim().min(1).max(100).describe('Vehicle manufacturer'),
  model: z.string().trim().min(1).max(100).describe('Vehicle model'),
  year: z.number().int().min(1886).max(2100).optional().describe('Model year'),
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
