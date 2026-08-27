import * as z from 'zod/v4';

export const vehicleQuerySchema = z.strictObject({
  brand: z.string().trim().min(1).max(100).describe('Vehicle manufacturer'),
  model: z.string().trim().min(1).max(100).describe('Vehicle model'),
  year: z.number().int().min(1886).max(2100).optional().describe('Model year'),
});

export const knownIssuesWebQuerySchema = vehicleQuerySchema.extend({
  year: z.number().int().min(1886).max(2100).describe('Required model year'),
});

export const vehicleOperabilitySubmissionSchema = z.strictObject({
  description: z.string().describe('Untrusted seller description used as the only evidence source'),
  status: z.enum(['operational', 'non_operational', 'unknown']),
  confidence: z.enum(['low', 'medium', 'high']),
  evidence: z.array(z.string().trim().min(1)).describe('Short literal excerpts from description'),
  reason: z.string().trim().min(1).describe('Brief explanation in Spanish, grounded only in the description'),
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

const webAnthropicToolUsageSchema = anthropicToolUsageSchema.extend({
  webSearchRequests: z.number().int().min(1),
});

export const operationalStatusToolOutputSchema = z.strictObject({
  operability: vehicleOperabilityOutputSchema,
  model: z.string(),
  usage: anthropicToolUsageSchema,
});

export const issueCategorySchema = z.enum(['mechanical', 'bodywork', 'interior', 'other']);
const briefKnownIssueSchema = z.string().trim().min(1).max(300);
const httpSourceSchema = z.strictObject({
  title: z.string().trim().min(1),
  url: z.string().trim().url().refine((value) => {
    const protocol = new URL(value).protocol;
    return protocol === 'http:' || protocol === 'https:';
  }, 'Source URL must use HTTP or HTTPS'),
});

function categorizedIssuesShape<T extends z.ZodType>(itemSchema: T) {
  return {
    mechanical: z.array(itemSchema),
    bodywork: z.array(itemSchema),
    interior: z.array(itemSchema),
    other: z.array(itemSchema),
  };
}

function validateUniqueCategorizedIssues<T>(
  value: Record<'mechanical' | 'bodywork' | 'interior' | 'other', T[]>,
  context: z.core.$RefinementCtx,
  identity: (item: T) => string,
) {
  const seen = new Set<string>();
  for (const category of ['mechanical', 'bodywork', 'interior', 'other'] as const) {
    const issues = value[category];
    for (const issue of issues) {
      const key = identity(issue).normalize('NFKC').trim().replace(/\s+/gu, ' ').toLocaleLowerCase('es');
      if (seen.has(key)) {
        context.addIssue({ code: 'custom', path: [category], message: 'Each issue must appear in one category only' });
      }
      seen.add(key);
    }
  }
}

export const knownIssuesWebAnalysisSchema = z.strictObject({
  ...categorizedIssuesShape(briefKnownIssueSchema),
  sources: z.array(httpSourceSchema),
}).superRefine((value, context) => validateUniqueCategorizedIssues(value, context, (issue) => issue));

const detectedIssueSchema = z.strictObject({
  description: briefKnownIssueSchema,
  evidence: z.array(z.string().min(1)).min(1),
});

export const extractedVehicleIssuesSchema = z.strictObject({
  ...categorizedIssuesShape(detectedIssueSchema),
}).superRefine((value, context) => validateUniqueCategorizedIssues(
  value, context, (issue) => issue.description,
));

export const extractVehicleIssuesInputSchema = z.strictObject({
  text: z.string().describe('Untrusted vehicle listing text to analyze'),
});

export const extractVehicleIssuesToolOutputSchema = z.strictObject({
  issues: extractedVehicleIssuesSchema,
  model: z.string().trim().min(1),
  usage: anthropicToolUsageSchema.extend({ webSearchRequests: z.literal(0) }),
});

export const knownIssuesWebToolOutputSchema = z.strictObject({
  knownIssues: knownIssuesWebAnalysisSchema,
  model: z.string(),
  usage: anthropicToolUsageSchema,
});

export const issueAssessmentInputSchema = z.strictObject({
  issue: briefKnownIssueSchema,
  brand: z.string().trim().min(1).max(100),
  model: z.string().trim().min(1).max(100),
  year: z.number().int().min(1886).max(2100).optional(),
  evidence: z.array(z.string().min(1)).optional(),
});

export const issueSeverityAndCostAssessmentSchema = z.strictObject({
  severity: z.enum(['low', 'medium', 'high', 'critical']),
  estimatedCostMinEUR: z.number().int().nonnegative(),
  estimatedCostMaxEUR: z.number().int().nonnegative(),
  reasoning: z.string().trim().min(1).max(1_000),
  sources: z.array(httpSourceSchema).min(1),
}).refine(
  (value) => value.estimatedCostMaxEUR >= value.estimatedCostMinEUR,
  { path: ['estimatedCostMaxEUR'], message: 'Maximum cost must not be lower than minimum cost' },
);

export const issueSeverityAndCostToolOutputSchema = z.strictObject({
  assessment: issueSeverityAndCostAssessmentSchema,
  pricingYear: z.number().int().min(2000).max(2100),
  model: z.string().trim().min(1),
  usage: webAnthropicToolUsageSchema,
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
