import * as z from 'zod/v4';

const repairCostSchema = z.object({
  estimate: z.enum(['none', 'low', 'medium', 'high']),
  reasoning: z.string().trim().min(1),
});

const knownIssuesSchema = z.object({
  found: z.boolean(),
  detail: z.string().trim().min(1).nullable(),
});

/**
 * Versioned classifier output stored in Listing.classification.
 * `toolResults` and unknown top-level keys keep the document extensible while
 * the stable scoring fields remain validated.
 */
export const listingClassificationSchema = z.object({
  isDamaged: z.boolean(),
  damageConfidence: z.enum(['low', 'medium', 'high']),
  repairCost: repairCostSchema,
  knownIssues: knownIssuesSchema,
  toolResults: z.record(z.string(), z.unknown()).optional(),
}).catchall(z.unknown());

export type ListingClassification = z.infer<typeof listingClassificationSchema>;

export function parseListingClassification(value: unknown): ListingClassification {
  return listingClassificationSchema.parse(value);
}
