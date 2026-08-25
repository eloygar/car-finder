export interface SearchLocation {
  label: string;
  latitude: number;
  longitude: number;
  distanceMeters: number;
}

export interface SearchDefinition {
  id: string;
  brand: string;
  model?: string;
  engine?: string;
  transmission?: string;
  bodyType?: string;
  priceMin?: number;
  priceMax?: number;
  location: SearchLocation;
}

const FIFTY_KILOMETRES = 50_000;

export const SEARCH_LOCATIONS: readonly (SearchLocation & { id: string })[] = [
  { id: 'madrid', label: 'Madrid', latitude: 40.4168, longitude: -3.7038, distanceMeters: FIFTY_KILOMETRES },
  { id: 'barcelona', label: 'Barcelona', latitude: 41.3874, longitude: 2.1686, distanceMeters: FIFTY_KILOMETRES },
  { id: 'valencia', label: 'Valencia', latitude: 39.4699, longitude: -0.3763, distanceMeters: FIFTY_KILOMETRES },
  { id: 'sevilla', label: 'Sevilla', latitude: 37.3891, longitude: -5.9845, distanceMeters: FIFTY_KILOMETRES },
  { id: 'zaragoza', label: 'Zaragoza', latitude: 41.6488, longitude: -0.8891, distanceMeters: FIFTY_KILOMETRES },
  { id: 'bilbao', label: 'Bilbao', latitude: 43.263, longitude: -2.935, distanceMeters: FIFTY_KILOMETRES },
] as const;

export const SEARCHES: readonly SearchDefinition[] = [
  {
    id: 'toyota-madrid',
    brand: 'Toyota',
    location: SEARCH_LOCATIONS[0]!,
  },
  {
    id: 'volkswagen-barcelona',
    brand: 'Volkswagen',
    location: SEARCH_LOCATIONS[1]!,
  },
  {
    id: 'renault-valencia',
    brand: 'Renault',
    location: SEARCH_LOCATIONS[2]!,
  },
  {
    id: 'seat-sevilla',
    brand: 'SEAT',
    location: SEARCH_LOCATIONS[3]!,
  },
  {
    id: 'peugeot-zaragoza',
    brand: 'Peugeot',
    location: SEARCH_LOCATIONS[4]!,
  },
  {
    id: 'bmw-bilbao',
    brand: 'BMW',
    location: SEARCH_LOCATIONS[5]!,
  },
] as const;
