import type {
  VehicleOperabilityResult,
  VehicleOperabilitySubmission,
} from './types.js';

export function classifyVehicleOperability(
  submission: VehicleOperabilitySubmission,
): VehicleOperabilityResult {
  const description = normalize(submission.description);
  const evidence = submission.evidence.map((excerpt) => excerpt.trim());
  const groundedEvidence = evidence.filter((excerpt) => description.includes(normalize(excerpt)));

  if (groundedEvidence.length === 0 && submission.status !== 'unknown') {
    return {
      status: 'unknown',
      confidence: 'low',
      evidence: [],
      reason: 'No literal evidence from the description supports a definitive operability status.',
    };
  }

  return {
    status: submission.status,
    confidence: groundedEvidence.length < evidence.length
      ? lowerConfidence(submission.confidence)
      : submission.confidence,
    evidence: groundedEvidence,
    reason: submission.reason.trim(),
  };
}

function normalize(value: string): string {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase('es')
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    .replace(/[\u2010-\u2015\u2212]/g, '-')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function lowerConfidence(confidence: VehicleOperabilitySubmission['confidence']) {
  return confidence === 'high' ? 'medium' : confidence;
}
