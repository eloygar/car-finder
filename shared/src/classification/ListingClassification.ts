import * as z from 'zod/v4';

/** Versioned v2 result returned by the vehicle-operability MCP tool. */
export const listingClassificationSchema = z.strictObject({
  status: z.enum(['operational', 'non_operational', 'unknown']),
  confidence: z.enum(['low', 'medium', 'high']),
  evidence: z.array(z.string().trim().min(1)),
  reason: z.string().trim().min(1),
});

export type ListingClassification = z.infer<typeof listingClassificationSchema>;

export function parseListingClassification(value: unknown): ListingClassification {
  return listingClassificationSchema.parse(value);
}
