export interface SelectOption {
  value: string;
  label: string;
  type: string;
}

export interface TaxonomyResponse {
  brands: string[];
  models: Record<string, string[]>;
  locations: Array<{
    id: string;
    label: string;
    latitude: number;
    longitude: number;
    distanceMeters: number;
  }>;
  filters: {
    fuel: SelectOption[];
    transmission: SelectOption[];
    bodyType: SelectOption[];
  };
}

export interface SearchItem {
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

export interface SearchResponse {
  captured: number;
  matched: number;
  displayed: number;
  outputPath: string;
  items: SearchItem[];
}
