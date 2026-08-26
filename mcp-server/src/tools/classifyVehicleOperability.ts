import type {
  VehicleOperabilityResult,
  VehicleOperabilitySubmission,
} from './types.js';

export function classifyVehicleOperability(
  submission: VehicleOperabilitySubmission,
): VehicleOperabilityResult {
  const description = normalize(submission.description);
  const evidence = submission.evidence.map((excerpt) => excerpt.trim());

  for (const excerpt of evidence) {
    if (!description.includes(normalize(excerpt))) {
      throw new Error('Operability evidence must be a literal excerpt from description');
    }
  }

  return {
    status: submission.status,
    confidence: submission.confidence,
    evidence,
    reason: submission.reason.trim(),
  };
}

function normalize(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase('es');
}
