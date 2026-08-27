import type { Message } from '@anthropic-ai/sdk/resources/messages';
import { describe, expect, it, vi } from 'vitest';

import { AnthropicVehicleAnalysisService } from '../src/anthropic/AnthropicVehicleAnalysisService.js';

describe('AnthropicVehicleAnalysisService', () => {
  it('uses Sonnet 5 without tools and grounds operability in the description', async () => {
    const create = vi.fn().mockResolvedValue(message({
      status: 'operational', confidence: 'high',
      evidence: ['Funciona perfectamente'], reason: 'El vendedor afirma que funciona.',
    }));
    const service = new AnthropicVehicleAnalysisService({ create });

    const result = await service.checkOperationalStatus('Funciona perfectamente.');

    const request = create.mock.calls[0]?.[0];
    expect(request).toMatchObject({
      model: 'claude-sonnet-5', thinking: { type: 'disabled' },
      output_config: { format: { type: 'json_schema' } },
    });
    expect(request).not.toHaveProperty('tools');
    expect(String(request.system)).toContain('Always write the reason in Spanish');
    expect(result).toMatchObject({
      operability: { status: 'operational' },
      usage: { inputTokens: 11, outputTokens: 3, webSearchRequests: 0 },
    });
  });

  it('uses Haiku 4.5 with native web_search and returns categorized issues', async () => {
    const create = vi.fn().mockResolvedValue(message({
      mechanical: ['Fallo documentado del módulo de control.'],
      bodywork: [], interior: [], other: [],
      sources: [{ title: 'Official recall', url: 'https://example.test/recall' }],
    }, { web_search_requests: 1 }));
    const service = new AnthropicVehicleAnalysisService({ create });

    const result = await service.checkKnownIssuesWeb({ brand: 'Toyota', model: 'Corolla', year: 2023 });

    expect(create.mock.calls[0]?.[0]).toMatchObject({
      model: 'claude-haiku-4-5-20251001',
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3 }],
    });
    const system = String(create.mock.calls[0]?.[0].system);
    expect(system).toContain('https://www.km77.com/');
    expect(system).toContain('https://www.consumerreports.org/cars/car-reliability-owner-satisfaction/');
    expect(system).toContain('https://www.nhtsa.gov/recalls');
    expect(system).toContain('https://www.adac.de/');
    expect(system).toContain('https://www.tuev-nord.de/');
    expect(system).toContain('https://www.carcomplaints.com/');
    expect(system).toContain('https://www.reddit.com/r/AskMechanics/');
    expect(system).toContain('https://www.expertoautorecambios.es/magazine/');
    expect(system).toContain('not ranked');
    expect(system).toContain('Spanish');
    expect(result).toMatchObject({
      knownIssues: { mechanical: ['Fallo documentado del módulo de control.'] },
      usage: { inputTokens: 11, outputTokens: 3, webSearchRequests: 1 },
    });
  });

  it('always searches the web for current Spanish repair costs', async () => {
    const create = vi.fn().mockResolvedValue(message({
      severity: 'high', evidenceSufficient: true,
      estimatedCostMinEUR: 800, estimatedCostMaxEUR: 1_600,
      reasoning: 'El fallo puede inmovilizar el vehículo y la reparación incluye piezas y mano de obra.',
      sources: [{ title: 'Tarifa de taller', url: 'https://example.test/taller' }],
    }, { web_search_requests: 1 }));
    const service = new AnthropicVehicleAnalysisService(
      { create }, undefined, undefined, undefined,
      () => new Date('2026-08-27T12:00:00Z'),
    );

    const result = await service.assessIssueSeverityAndCost({
      issue: 'Fallo grave del sistema de frenos.', brand: 'Toyota', model: 'Corolla',
    });

    expect(create.mock.calls[0]?.[0]).toMatchObject({
      model: 'claude-haiku-4-5-20251001',
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 5 }],
    });
    expect(String(create.mock.calls[0]?.[0].system)).toContain('always use web_search');
    expect(String(create.mock.calls[0]?.[0].messages[0]?.content)).toContain('Pricing year: 2026');
    expect(result).toMatchObject({
      assessment: { severity: 'high', estimatedCostMinEUR: 800 },
      pricingYear: 2026,
      usage: { webSearchRequests: 1 },
    });
  });

  it('rejects an assessment that did not execute web search', async () => {
    const create = vi.fn().mockResolvedValue(message({
      severity: 'low', evidenceSufficient: true,
      estimatedCostMinEUR: 50, estimatedCostMaxEUR: 100,
      reasoning: 'La incidencia es menor.',
      sources: [{ title: 'Taller', url: 'https://example.test/taller' }],
    }));
    const service = new AnthropicVehicleAnalysisService({ create });
    await expect(service.assessIssueSeverityAndCost({
      issue: 'Moldura suelta.', brand: 'Toyota', model: 'Corolla',
    })).rejects.toThrow('requires web search evidence');
  });

  it('rejects insufficient price evidence instead of caching an invented range', async () => {
    const create = vi.fn().mockResolvedValue(message({
      severity: 'medium', evidenceSufficient: false,
      estimatedCostMinEUR: 0, estimatedCostMaxEUR: 0,
      reasoning: 'No se encontraron precios suficientes.', sources: [],
    }, { web_search_requests: 1 }));
    const service = new AnthropicVehicleAnalysisService({ create });
    await expect(service.assessIssueSeverityAndCost({
      issue: 'Problema poco documentado.', brand: 'Marca', model: 'Modelo',
    })).rejects.toThrow('evidence was insufficient');
  });
});

function message(value: unknown, serverToolUse?: { web_search_requests: number }): Message {
  return {
    content: [{ type: 'text', text: JSON.stringify(value), citations: null }],
    stop_reason: 'end_turn',
    usage: {
      input_tokens: 11,
      output_tokens: 3,
      ...(serverToolUse ? { server_tool_use: serverToolUse } : {}),
    },
  } as unknown as Message;
}
