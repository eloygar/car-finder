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

  it('rejects evidence that is not a literal description excerpt', () => {
    expect(() => classifyVehicleOperability({
      description: 'Información insuficiente.',
      status: 'operational',
      confidence: 'high',
      evidence: ['funciona perfectamente'],
      reason: 'Unsupported.',
    })).toThrow('literal excerpt');
  });
});
