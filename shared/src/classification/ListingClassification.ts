import * as z from 'zod/v4';

export const operabilityClassificationSchema = z.strictObject({
  status: z.enum(['operational', 'non_operational', 'unknown']),
  confidence: z.enum(['low', 'medium', 'high']),
  evidence: z.array(z.string().trim().min(1)),
  reason: z.string().trim().min(1),
});

/** Versioned v4 listing-owned result. Model-level research is stored relationally. */
export const listingClassificationSchema = z.strictObject({
  operability: operabilityClassificationSchema,
});

export type ListingClassification = z.infer<typeof listingClassificationSchema>;

export function parseListingClassification(value: unknown): ListingClassification {
  return listingClassificationSchema.parse(value);
}
