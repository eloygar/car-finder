import type { ClassificationProgress, ClassificationSummary } from './types.js';

const ANSI = {
  green: '\u001b[32m',
  yellow: '\u001b[33m',
  red: '\u001b[31m',
  dim: '\u001b[2m',
  reset: '\u001b[0m',
} as const;

export interface ClassificationTerminalReporter {
  onProgress(progress: ClassificationProgress): void;
  complete(summary: ClassificationSummary): void;
  fatal(message: string): void;
}

export function createClassificationTerminalReporter(options: {
  enabled: boolean;
  colors: boolean;
  write: (text: string) => void;
}): ClassificationTerminalReporter {
  const paint = (color: keyof typeof ANSI, text: string) => (
    options.colors ? `${ANSI[color]}${text}${ANSI.reset}` : text
  );

  return {
    onProgress(progress) {
      if (!options.enabled) return;
      const prefix = paint('dim', `[${progress.current}/${progress.total}]`);
      if (progress.status === 'success') {
        options.write(`${prefix} ${paint('green', '✓')} ${progress.externalId} clasificado\n`);
        return;
      }
      if (progress.status === 'warning') {
        const count = progress.assessmentFailures;
        const reasons = progress.failureCodes.map(failureLabel).join(', ');
        options.write(
          `${prefix} ${paint('yellow', '⚠')} ${progress.externalId} clasificado; ${count} evaluación${count === 1 ? '' : 'es'} pendiente${count === 1 ? '' : 's'} por error${reasons ? ` (${reasons})` : ''}\n`,
        );
        return;
      }
      if (progress.status === 'stale') {
        options.write(`${prefix} ${paint('yellow', '↷')} ${progress.externalId} cambió durante la ejecución\n`);
        return;
      }
      const reasons = progress.failureCodes.map(failureLabel).join(', ');
      options.write(`${prefix} ${paint('red', '✗')} ${progress.externalId} no pudo clasificarse${reasons ? ` (${reasons})` : ''}\n`);
    },
    complete(summary) {
      if (!options.enabled) return;
      const assessmentFailures = summary.assessmentFailed + summary.listingAssessmentFailed;
      const failures = summary.failed + assessmentFailures;
      const marker = summary.failed > 0
        ? paint('red', '✗')
        : assessmentFailures > 0
          ? paint('yellow', '⚠')
          : paint('green', '✓');
      const label = summary.failed > 0
        ? 'Clasificación completada con errores'
        : assessmentFailures > 0
          ? 'Clasificación guardada con evaluaciones pendientes'
          : 'Clasificación completada';
      options.write(
        `${marker} ${label}: ${summary.classified} clasificados, ${summary.stale} obsoletos, ${failures} errores\n`,
      );
    },
    fatal(message) {
      if (!options.enabled) return;
      options.write(`${paint('red', '✗')} ${message}\n`);
    },
  };
}

function failureLabel(code: string): string {
  const labels: Record<string, string> = {
    mcp_repair_cost_evidence_insufficient: 'sin evidencia de precios suficiente',
    mcp_repair_cost_web_search_missing: 'la búsqueda web no se ejecutó',
    mcp_repair_cost_web_search_incomplete: 'la búsqueda web no terminó',
    mcp_anthropic_invalid_request: 'Anthropic rechazó la petición (HTTP 400)',
    mcp_anthropic_rate_limited: 'límite de Anthropic alcanzado',
    mcp_anthropic_unavailable: 'Anthropic no disponible',
    mcp_issue_assessment_invalid_output: 'respuesta de evaluación inválida',
    listing_assessment_candidates_failed: 'no se pudieron cargar las incidencias',
    known_assessment_candidates_failed: 'no se pudieron cargar los problemas del modelo',
    unexpected_error: 'error inesperado',
  };
  return labels[code] ?? code;
}
