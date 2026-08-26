import * as z from 'zod/v4';

import type { ReconcileSummary } from '../../../pipeline/src/reconcile/types.js';

const optionalRange = z.object({
  min: z.number().nonnegative().optional(),
  max: z.number().nonnegative().optional(),
}).refine(({ min, max }) => min === undefined || max === undefined || min <= max, {
  message: 'El mínimo no puede superar al máximo',
});

export const localSearchRequestSchema = z.object({
  brand: z.string().trim().min(1).max(100),
  model: z.string().trim().min(1).max(100).optional(),
  locationId: z.string().trim().min(1),
  distanceMeters: z.number().int().min(5_000).max(200_000),
  engine: z.string().trim().min(1).max(50).optional(),
  transmission: z.string().trim().min(1).max(50).optional(),
  bodyType: z.string().trim().min(1).max(50).optional(),
  price: optionalRange.optional(),
  year: optionalRange.optional(),
  mileage: optionalRange.optional(),
  maxPages: z.number().int().min(1).max(20).optional(),
});

export type LocalSearchRequest = z.infer<typeof localSearchRequestSchema>;

export interface SearchResultItem {
  id: string;
  title: string;
  price: number | null;
  currency: string;
  brand: string | null;
  model: string | null;
  year: number | null;
  mileage: number | null;
  location: string | null;
  imageUrl: string | null;
  url: string | null;
}

export interface LocalSearchResult {
  captured: number;
  matched: number;
  displayed: number;
  outputPath: string;
  items: SearchResultItem[];
  warning?: string;
  reconciliation:
    | { status: 'completed'; summary: ReconcileSummary }
    | { status: 'failed'; message: string };
}
