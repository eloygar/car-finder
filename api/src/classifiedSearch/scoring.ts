import { KNOWN_MODEL_ISSUES_VERSION } from '../../../shared/src/knownModelIssues.js';
import {
  CLASSIFIED_SEARCH_SCORING_VERSION,
  type ClassifiedListingSearch,
  type ListingRanking,
  type ListingScoringInput,
  VIGO_LOCATION,
} from './types.js';

const BASE_SCORE = 50;
const SUSPICIOUS_PRICE_EUR = 1_000;
const PRICE_TOLERANCE_EUR = 2_000;
const MILEAGE_TOLERANCE_KM = 100_000;
const EARTH_RADIUS_KM = 6_371;

export function scoreClassifiedListing(
  listing: ListingScoringInput,
  search: Pick<ClassifiedListingSearch, 'priceTargetMax' | 'mileageTargetMax'>,
): ListingRanking {
  const price = priceScore(listing.price, search.priceTargetMax);
  const mileage = mileageScore(listing.mileage, search.mileageTargetMax);
  const distanceKm = listing.latitude === null || listing.longitude === null
    ? null
    : haversineDistanceKm(
      VIGO_LOCATION.latitude,
      VIGO_LOCATION.longitude,
      listing.latitude,
      listing.longitude,
    );
  const distance = distanceScore(distanceKm);
  const listingIssues = listingIssueScore(listing.listingIssueExtraction);
  const modelIssues = modelIssueScore(listing.knownModelIssues);
  const breakdown = [
    { factor: 'base' as const, delta: BASE_SCORE, reason: 'Anuncio activo y clasificado como operativo o sin verificar para el modelo seleccionado.' },
    price,
    mileage,
    distance,
    listingIssues,
    modelIssues,
  ];
  return {
    score: clamp(0, 100, breakdown.reduce((sum, entry) => sum + entry.delta, 0)),
    distanceKm: distanceKm === null ? null : Math.round(distanceKm * 10) / 10,
    breakdown,
    version: CLASSIFIED_SEARCH_SCORING_VERSION,
  };
}

export function haversineDistanceKm(
  originLatitude: number,
  originLongitude: number,
  targetLatitude: number,
  targetLongitude: number,
): number {
  const latitudeDelta = radians(targetLatitude - originLatitude);
  const longitudeDelta = radians(targetLongitude - originLongitude);
  const origin = radians(originLatitude);
  const target = radians(targetLatitude);
  const a = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(origin) * Math.cos(target) * Math.sin(longitudeDelta / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function priceScore(price: number, target: number) {
  if (price < SUSPICIOUS_PRICE_EUR) {
    return {
      factor: 'price' as const,
      delta: -10,
      reason: `${formatEUR(price)} es un precio anormalmente bajo; podría representar ofertas o información incompleta.`,
    };
  }
  const delta = Math.round(clamp(
    -20,
    20,
    5 + 25 * ((target - price) / PRICE_TOLERANCE_EUR),
  ));
  return {
    factor: 'price' as const,
    delta,
    reason: price <= target
      ? `${formatEUR(price)} está ${formatEUR(target - price)} por debajo del máximo objetivo.`
      : `${formatEUR(price)} supera el máximo objetivo en ${formatEUR(price - target)}.`,
  };
}

function mileageScore(mileage: number | null, target: number) {
  if (mileage === null || mileage <= 0) {
    return {
      factor: 'mileage' as const,
      delta: 0,
      reason: 'El kilometraje no está disponible o no es fiable; no modifica la puntuación.',
    };
  }
  const delta = Math.round(clamp(
    -15,
    15,
    5 + 20 * ((target - mileage) / MILEAGE_TOLERANCE_KM),
  ));
  return {
    factor: 'mileage' as const,
    delta,
    reason: mileage <= target
      ? `${formatKm(mileage)} está ${formatKm(target - mileage)} por debajo del máximo objetivo.`
      : `${formatKm(mileage)} supera el máximo objetivo en ${formatKm(mileage - target)}.`,
  };
}

function distanceScore(distanceKm: number | null) {
  if (distanceKm === null) {
    return {
      factor: 'distance' as const,
      delta: 0,
      reason: 'El anuncio no tiene coordenadas; la distancia desde Vigo no modifica la puntuación.',
    };
  }
  const delta = Math.round(clamp(-15, 15, 15 - distanceKm / 20));
  return {
    factor: 'distance' as const,
    delta,
    reason: `El vehículo se anuncia aproximadamente a ${formatKm(Math.round(distanceKm))} de Vigo.`,
  };
}

function listingIssueScore(extraction: ListingScoringInput['listingIssueExtraction']) {
  if (!extraction) {
    return {
      factor: 'listing_issues' as const,
      delta: 0,
      reason: 'La descripción no tiene un análisis vigente de incidencias; no modifica la puntuación.',
    };
  }
  if (extraction.issues.length === 0) {
    return {
      factor: 'listing_issues' as const,
      delta: 0,
      reason: 'No se declararon incidencias en la descripción; esto no supone una bonificación.',
    };
  }
  const penalty = Math.min(15, extraction.issues.length);
  return {
    factor: 'listing_issues' as const,
    delta: -penalty,
    reason: `${extraction.issues.length} incidencia(s) declarada(s) aplican una penalización ligera, sin considerar su gravedad estimada.`,
  };
}

function modelIssueScore(issues: ListingScoringInput['knownModelIssues']) {
  if (!issues || issues.analysisVersion !== KNOWN_MODEL_ISSUES_VERSION) {
    return {
      factor: 'model_issues' as const,
      delta: 0,
      reason: 'No hay una investigación vigente en español para este modelo-año; no modifica la puntuación.',
    };
  }
  const count = issues.mechanical.length + issues.bodywork.length + issues.interior.length + issues.other.length;
  if (count === 0) {
    return {
      factor: 'model_issues' as const,
      delta: 0,
      reason: 'No se encontraron problemas generales del modelo-año; esto no supone una bonificación.',
    };
  }
  const penalty = Math.min(5, Math.ceil(count / 2));
  return {
    factor: 'model_issues' as const,
    delta: -penalty,
    reason: `${count} problema(s) conocido(s) del modelo-año aplican una penalización ligera.`,
  };
}

function clamp(minimum: number, maximum: number, value: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function radians(degrees: number): number {
  return degrees * Math.PI / 180;
}

function formatEUR(value: number): string {
  return new Intl.NumberFormat('es-ES', {
    style: 'currency', currency: 'EUR', maximumFractionDigits: 0,
  }).format(value);
}

function formatKm(value: number): string {
  return `${new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0 }).format(value)} km`;
}
