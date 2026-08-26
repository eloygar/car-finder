import data from './wallapop-car-taxonomy-capture.json';

export const taxonomyBrands: string[] = [...(data.brands as string[])].sort((a, b) =>
  a.localeCompare(b, 'es'),
);

export const taxonomyModels: Record<string, string[]> = data.models as Record<string, string[]>;
