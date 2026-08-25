export interface SearchLocation {
  label: string;
  latitude: number;
  longitude: number;
  distanceMeters: number;
}

export interface SearchDefinition {
  id: string;
  brand: string;
  location: SearchLocation;
}

const FIFTY_KILOMETRES = 50_000;

export const SEARCHES: readonly SearchDefinition[] = [
  {
    id: 'toyota-madrid',
    brand: 'Toyota',
    location: {
      label: 'Madrid',
      latitude: 40.4168,
      longitude: -3.7038,
      distanceMeters: FIFTY_KILOMETRES,
    },
  },
  {
    id: 'volkswagen-barcelona',
    brand: 'Volkswagen',
    location: {
      label: 'Barcelona',
      latitude: 41.3874,
      longitude: 2.1686,
      distanceMeters: FIFTY_KILOMETRES,
    },
  },
  {
    id: 'renault-valencia',
    brand: 'Renault',
    location: {
      label: 'Valencia',
      latitude: 39.4699,
      longitude: -0.3763,
      distanceMeters: FIFTY_KILOMETRES,
    },
  },
  {
    id: 'seat-sevilla',
    brand: 'SEAT',
    location: {
      label: 'Sevilla',
      latitude: 37.3891,
      longitude: -5.9845,
      distanceMeters: FIFTY_KILOMETRES,
    },
  },
  {
    id: 'peugeot-zaragoza',
    brand: 'Peugeot',
    location: {
      label: 'Zaragoza',
      latitude: 41.6488,
      longitude: -0.8891,
      distanceMeters: FIFTY_KILOMETRES,
    },
  },
  {
    id: 'bmw-bilbao',
    brand: 'BMW',
    location: {
      label: 'Bilbao',
      latitude: 43.263,
      longitude: -2.935,
      distanceMeters: FIFTY_KILOMETRES,
    },
  },
] as const;
