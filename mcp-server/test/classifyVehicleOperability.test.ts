import { describe, expect, it } from 'vitest';

import { classifyVehicleOperability } from '../src/tools/classifyVehicleOperability.js';

describe('classifyVehicleOperability', () => {
  it('returns a grounded classification without the untrusted description', () => {
    expect(classifyVehicleOperability({
      description: 'El coche funciona perfectamente y se usa a diario.',
      status: 'operational',
      confidence: 'high',
      evidence: ['funciona perfectamente', 'se usa a diario'],
      reason: 'The description explicitly says the car works and is used daily.',
    })).toEqual({
      status: 'operational',
      confidence: 'high',
      evidence: ['funciona perfectamente', 'se usa a diario'],
      reason: 'The description explicitly says the car works and is used daily.',
    });
  });

  it('downgrades an unsupported definitive claim instead of failing the listing', () => {
    expect(classifyVehicleOperability({
      description: 'Información insuficiente.',
      status: 'operational',
      confidence: 'high',
      evidence: ['funciona perfectamente'],
      reason: 'Unsupported.',
    })).toEqual({
      status: 'unknown',
      confidence: 'low',
      evidence: [],
      reason: 'No hay evidencia literal en la descripción que permita determinar de forma concluyente si el vehículo está operativo.',
    });
  });

  it('tolerates harmless Unicode punctuation and whitespace differences', () => {
    expect(classifyVehicleOperability({
      description: 'El vendedor dice: “funciona\n perfectamente” — se usa a diario.',
      status: 'operational',
      confidence: 'high',
      evidence: ['funciona perfectamente', '— se usa a diario'],
      reason: 'The description explicitly says it works.',
    })).toMatchObject({
      status: 'operational',
      confidence: 'high',
      evidence: ['funciona perfectamente', '— se usa a diario'],
    });
  });

  it('drops an invented excerpt and lowers high confidence when other evidence is grounded', () => {
    expect(classifyVehicleOperability({
      description: 'Arranca y circula.',
      status: 'operational',
      confidence: 'high',
      evidence: ['Arranca y circula', 'ITV recién pasada'],
      reason: 'The description says it starts and drives.',
    })).toEqual({
      status: 'operational',
      confidence: 'medium',
      evidence: ['Arranca y circula'],
      reason: 'The description says it starts and drives.',
    });
  });
});
