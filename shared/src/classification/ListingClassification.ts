import * as z from 'zod/v4';

export const operabilityClassificationSchema = z.strictObject({
  status: z.enum(['operational', 'non_operational', 'unknown']),
  confidence: z.enum(['low', 'medium', 'high']),
  evidence: z.array(z.string().trim().min(1)),
  reason: z.string().trim().min(1),
});

const knownIssuesCompletedSchema = z.strictObject({
  status: z.literal('completed'),
  found: z.boolean(),
  summary: z.string().trim().min(1),
  sources: z.array(z.strictObject({
    title: z.string().trim().min(1),
    url: z.string().trim().min(1),
  })),
});

const knownIssuesSkippedSchema = z.strictObject({
  status: z.literal('skipped'),
  reason: z.literal('non_operational'),
});

/** Versioned v3 result produced by the deterministic two-stage MCP pipeline. */
export const listingClassificationSchema = z.strictObject({
  operability: operabilityClassificationSchema,
  knownIssuesWeb: z.discriminatedUnion('status', [
    knownIssuesCompletedSchema,
    knownIssuesSkippedSchema,
  ]),
});

export type ListingClassification = z.infer<typeof listingClassificationSchema>;

export function parseListingClassification(value: unknown): ListingClassification {
  return listingClassificationSchema.parse(value);
}
