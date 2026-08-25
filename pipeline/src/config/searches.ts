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
  { id: 'a-coruna', label: 'A Coruña', latitude: 43.3623, longitude: -8.4115, distanceMeters: FIFTY_KILOMETRES },
  { id: 'albacete', label: 'Albacete', latitude: 38.9942, longitude: -1.8564, distanceMeters: FIFTY_KILOMETRES },
  { id: 'alicante', label: 'Alicante', latitude: 38.3452, longitude: -0.481, distanceMeters: FIFTY_KILOMETRES },
  { id: 'almeria', label: 'Almería', latitude: 36.834, longitude: -2.4637, distanceMeters: FIFTY_KILOMETRES },
  { id: 'avila', label: 'Ávila', latitude: 40.6566, longitude: -4.6818, distanceMeters: FIFTY_KILOMETRES },
  { id: 'badajoz', label: 'Badajoz', latitude: 38.8794, longitude: -6.9707, distanceMeters: FIFTY_KILOMETRES },
  { id: 'barcelona', label: 'Barcelona', latitude: 41.3874, longitude: 2.1686, distanceMeters: FIFTY_KILOMETRES },
  { id: 'bilbao', label: 'Bilbao', latitude: 43.263, longitude: -2.935, distanceMeters: FIFTY_KILOMETRES },
  { id: 'burgos', label: 'Burgos', latitude: 42.344, longitude: -3.697, distanceMeters: FIFTY_KILOMETRES },
  { id: 'caceres', label: 'Cáceres', latitude: 39.4753, longitude: -6.3724, distanceMeters: FIFTY_KILOMETRES },
  { id: 'cadiz', label: 'Cádiz', latitude: 36.5297, longitude: -6.2927, distanceMeters: FIFTY_KILOMETRES },
  { id: 'castellon', label: 'Castellón de la Plana', latitude: 39.9864, longitude: -0.0513, distanceMeters: FIFTY_KILOMETRES },
  { id: 'ceuta', label: 'Ceuta', latitude: 35.8894, longitude: -5.3213, distanceMeters: FIFTY_KILOMETRES },
  { id: 'ciudad-real', label: 'Ciudad Real', latitude: 38.9848, longitude: -3.9274, distanceMeters: FIFTY_KILOMETRES },
  { id: 'cordoba', label: 'Córdoba', latitude: 37.8882, longitude: -4.7794, distanceMeters: FIFTY_KILOMETRES },
  { id: 'cuenca', label: 'Cuenca', latitude: 40.0704, longitude: -2.1374, distanceMeters: FIFTY_KILOMETRES },
  { id: 'girona', label: 'Girona', latitude: 41.9794, longitude: 2.8214, distanceMeters: FIFTY_KILOMETRES },
  { id: 'granada', label: 'Granada', latitude: 37.1773, longitude: -3.5986, distanceMeters: FIFTY_KILOMETRES },
  { id: 'guadalajara', label: 'Guadalajara', latitude: 40.6337, longitude: -3.1674, distanceMeters: FIFTY_KILOMETRES },
  { id: 'huelva', label: 'Huelva', latitude: 37.2614, longitude: -6.9447, distanceMeters: FIFTY_KILOMETRES },
  { id: 'huesca', label: 'Huesca', latitude: 42.1401, longitude: -0.4089, distanceMeters: FIFTY_KILOMETRES },
  { id: 'jaen', label: 'Jaén', latitude: 37.7796, longitude: -3.7849, distanceMeters: FIFTY_KILOMETRES },
  { id: 'las-palmas', label: 'Las Palmas de Gran Canaria', latitude: 28.1235, longitude: -15.4363, distanceMeters: FIFTY_KILOMETRES },
  { id: 'leon', label: 'León', latitude: 42.5987, longitude: -5.5671, distanceMeters: FIFTY_KILOMETRES },
  { id: 'lleida', label: 'Lleida', latitude: 41.6176, longitude: 0.62, distanceMeters: FIFTY_KILOMETRES },
  { id: 'logrono', label: 'Logroño', latitude: 42.4627, longitude: -2.445, distanceMeters: FIFTY_KILOMETRES },
  { id: 'lugo', label: 'Lugo', latitude: 43.0097, longitude: -7.5568, distanceMeters: FIFTY_KILOMETRES },
  { id: 'madrid', label: 'Madrid', latitude: 40.4168, longitude: -3.7038, distanceMeters: FIFTY_KILOMETRES },
  { id: 'malaga', label: 'Málaga', latitude: 36.7213, longitude: -4.4214, distanceMeters: FIFTY_KILOMETRES },
  { id: 'melilla', label: 'Melilla', latitude: 35.2923, longitude: -2.9381, distanceMeters: FIFTY_KILOMETRES },
  { id: 'murcia', label: 'Murcia', latitude: 37.9922, longitude: -1.1307, distanceMeters: FIFTY_KILOMETRES },
  { id: 'ourense', label: 'Ourense', latitude: 42.3358, longitude: -7.8639, distanceMeters: FIFTY_KILOMETRES },
  { id: 'oviedo', label: 'Oviedo', latitude: 43.3614, longitude: -5.8494, distanceMeters: FIFTY_KILOMETRES },
  { id: 'palencia', label: 'Palencia', latitude: 42.0096, longitude: -4.5288, distanceMeters: FIFTY_KILOMETRES },
  { id: 'palma', label: 'Palma', latitude: 39.5696, longitude: 2.6502, distanceMeters: FIFTY_KILOMETRES },
  { id: 'pamplona', label: 'Pamplona', latitude: 42.8125, longitude: -1.6458, distanceMeters: FIFTY_KILOMETRES },
  { id: 'pontevedra', label: 'Pontevedra', latitude: 42.4299, longitude: -8.6446, distanceMeters: FIFTY_KILOMETRES },
  { id: 'salamanca', label: 'Salamanca', latitude: 40.9701, longitude: -5.6635, distanceMeters: FIFTY_KILOMETRES },
  { id: 'san-sebastian', label: 'San Sebastián', latitude: 43.3183, longitude: -1.9812, distanceMeters: FIFTY_KILOMETRES },
  { id: 'santa-cruz-tenerife', label: 'Santa Cruz de Tenerife', latitude: 28.4636, longitude: -16.2518, distanceMeters: FIFTY_KILOMETRES },
  { id: 'santander', label: 'Santander', latitude: 43.4623, longitude: -3.81, distanceMeters: FIFTY_KILOMETRES },
  { id: 'segovia', label: 'Segovia', latitude: 40.9429, longitude: -4.1088, distanceMeters: FIFTY_KILOMETRES },
  { id: 'sevilla', label: 'Sevilla', latitude: 37.3891, longitude: -5.9845, distanceMeters: FIFTY_KILOMETRES },
  { id: 'soria', label: 'Soria', latitude: 41.7636, longitude: -2.4649, distanceMeters: FIFTY_KILOMETRES },
  { id: 'tarragona', label: 'Tarragona', latitude: 41.1189, longitude: 1.2445, distanceMeters: FIFTY_KILOMETRES },
  { id: 'teruel', label: 'Teruel', latitude: 40.3456, longitude: -1.1065, distanceMeters: FIFTY_KILOMETRES },
  { id: 'toledo', label: 'Toledo', latitude: 39.8628, longitude: -4.0273, distanceMeters: FIFTY_KILOMETRES },
  { id: 'valencia', label: 'Valencia', latitude: 39.4699, longitude: -0.3763, distanceMeters: FIFTY_KILOMETRES },
  { id: 'valladolid', label: 'Valladolid', latitude: 41.6523, longitude: -4.7245, distanceMeters: FIFTY_KILOMETRES },
  { id: 'vitoria', label: 'Vitoria-Gasteiz', latitude: 42.8467, longitude: -2.6727, distanceMeters: FIFTY_KILOMETRES },
  { id: 'zamora', label: 'Zamora', latitude: 41.5035, longitude: -5.7446, distanceMeters: FIFTY_KILOMETRES },
  { id: 'zaragoza', label: 'Zaragoza', latitude: 41.6488, longitude: -0.8891, distanceMeters: FIFTY_KILOMETRES },
] as const;

function searchLocation(id: string): SearchLocation {
  const location = SEARCH_LOCATIONS.find((candidate) => candidate.id === id);
  if (!location) throw new Error(`Missing configured search location: ${id}`);
  return location;
}

export const SEARCHES: readonly SearchDefinition[] = [
  {
    id: 'toyota-madrid',
    brand: 'Toyota',
    location: searchLocation('madrid'),
  },
  {
    id: 'volkswagen-barcelona',
    brand: 'Volkswagen',
    location: searchLocation('barcelona'),
  },
  {
    id: 'renault-valencia',
    brand: 'Renault',
    location: searchLocation('valencia'),
  },
  {
    id: 'seat-sevilla',
    brand: 'SEAT',
    location: searchLocation('sevilla'),
  },
  {
    id: 'peugeot-zaragoza',
    brand: 'Peugeot',
    location: searchLocation('zaragoza'),
  },
  {
    id: 'bmw-bilbao',
    brand: 'BMW',
    location: searchLocation('bilbao'),
  },
] as const;
