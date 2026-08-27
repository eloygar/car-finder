import { describe, expect, it } from 'vitest';

import { createClassificationTerminalReporter } from '../src/classify/terminalReporter.js';
import type { ClassificationSummary } from '../src/classify/types.js';

describe('classification terminal reporter', () => {
  it('prints progress, warnings, failures and a red final result', () => {
    let output = '';
    const reporter = createClassificationTerminalReporter({
      enabled: true,
      colors: true,
      write: (text) => { output += text; },
    });
    reporter.onProgress({
      current: 1, total: 3, externalId: 'listing-1', status: 'success', assessmentFailures: 0,
      failureCodes: [],
    });
    reporter.onProgress({
      current: 2, total: 3, externalId: 'listing-2', status: 'warning', assessmentFailures: 1,
      failureCodes: ['mcp_repair_cost_evidence_insufficient'],
    });
    reporter.onProgress({
      current: 3, total: 3, externalId: 'listing-3', status: 'failed', assessmentFailures: 0,
      failureCodes: ['mcp_anthropic_invalid_request'],
    });
    reporter.complete(summary({ classified: 2, failed: 1, listingAssessmentFailed: 1 }));
    reporter.fatal('La clasificación no pudo iniciarse');

    expect(output).toContain('[1/3]');
    expect(output).toContain('listing-2 clasificado; 1 evaluación pendiente por error');
    expect(output).toContain('sin evidencia de precios suficiente');
    expect(output).toContain('Anthropic rechazó la petición (HTTP 400)');
    expect(output).toContain('listing-3 no pudo clasificarse');
    expect(output).toContain('\u001b[31m');
    expect(output).toContain('Clasificación completada con errores');
    expect(output).toContain('La clasificación no pudo iniciarse');
  });

  it('stays silent when terminal progress is disabled', () => {
    let output = '';
    const reporter = createClassificationTerminalReporter({
      enabled: false, colors: false, write: (text) => { output += text; },
    });
    reporter.onProgress({
      current: 1, total: 1, externalId: 'one', status: 'success', assessmentFailures: 0, failureCodes: [],
    });
    reporter.complete(summary({ classified: 1 }));
    expect(output).toBe('');
  });

  it('uses a yellow partial-success summary when only enrichment failed', () => {
    let output = '';
    const reporter = createClassificationTerminalReporter({
      enabled: true, colors: true, write: (text) => { output += text; },
    });

    reporter.complete(summary({ classified: 5, listingAssessmentFailed: 1 }));

    expect(output).toContain('\u001b[33m⚠');
    expect(output).toContain('Clasificación guardada con evaluaciones pendientes');
    expect(output).not.toContain('Clasificación completada con errores');
  });
});

function summary(overrides: Partial<ClassificationSummary>): ClassificationSummary {
  return {
    selected: 1, classified: 0, failed: 0, stale: 0, inputTokens: 0, outputTokens: 0,
    assessmentsSelected: 0, assessed: 0, assessmentCached: 0, assessmentFailed: 0,
    modelIssueAssessmentsEnabled: false, listingIssueAssessmentsEnabled: false,
    listingIssuesDetected: 0, listingAssessmentsSelected: 0,
    listingAssessed: 0, listingAssessmentCached: 0, listingAssessmentFailed: 0,
    dryRun: false, version: 'test', ...overrides,
  };
}
