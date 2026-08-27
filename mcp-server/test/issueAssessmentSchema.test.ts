import { describe, expect, it } from 'vitest';
import { issueSeverityAndCostToolOutputSchema } from '../src/tools/schemas.js';

const valid = {
  assessment: {
    severity: 'critical', estimatedCostMinEUR: 900, estimatedCostMaxEUR: 2_100,
    reasoning: 'La avería afecta a la seguridad y exige reparación inmediata.',
    sources: [{ title: 'Taller', url: 'https://example.test/taller' }],
  },
  pricingYear: 2026,
  model: 'claude-haiku-4-5-20251001',
  usage: { inputTokens: 20, outputTokens: 8, webSearchRequests: 1 },
};

describe('issueSeverityAndCostToolOutputSchema', () => {
  it.each(['low', 'medium', 'high', 'critical'] as const)('accepts severity %s', (severity) => {
    expect(issueSeverityAndCostToolOutputSchema.parse({
      ...valid, assessment: { ...valid.assessment, severity },
    }).assessment.severity).toBe(severity);
  });

  it('rejects invalid ranges, missing evidence and non-web execution', () => {
    expect(() => issueSeverityAndCostToolOutputSchema.parse({
      ...valid, assessment: { ...valid.assessment, estimatedCostMaxEUR: 100 },
    })).toThrow();
    expect(() => issueSeverityAndCostToolOutputSchema.parse({
      ...valid, assessment: { ...valid.assessment, sources: [] },
    })).toThrow();
    expect(() => issueSeverityAndCostToolOutputSchema.parse({
      ...valid, usage: { ...valid.usage, webSearchRequests: 0 },
    })).toThrow();
  });

  it('rejects unsafe URLs and the unwrapped legacy shape', () => {
    expect(() => issueSeverityAndCostToolOutputSchema.parse({
      ...valid, assessment: {
        ...valid.assessment, sources: [{ title: 'Unsafe', url: 'ftp://example.test/file' }],
      },
    })).toThrow();
    expect(() => issueSeverityAndCostToolOutputSchema.parse(valid.assessment)).toThrow();
  });
});
