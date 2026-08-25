export type RawWallapopItem = {
  id: string;
  [key: string]: unknown;
};

export interface WallapopSearchParams {
  brand: string;
  model?: string;
  engine?: string;
  transmission?: string;
  bodyType?: string;
  priceMin?: number;
  priceMax?: number;
  categoryId: number;
  latitude: number;
  longitude: number;
  distance: number;
  nextPage?: string;
}

export interface WallapopSearchPage {
  items: RawWallapopItem[];
  nextCursor?: string;
}
