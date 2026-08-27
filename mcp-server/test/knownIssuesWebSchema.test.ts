import { describe, expect, it } from 'vitest';
import { knownIssuesWebAnalysisSchema } from '../src/tools/schemas.js';

const valid = {
  mechanical: ['Desgaste prematuro de la bomba de agua.'], bodywork: [], interior: [], other: [],
  sources: [{ title: 'NHTSA', url: 'https://www.nhtsa.gov/recalls' }],
};

describe('knownIssuesWebAnalysisSchema', () => {
  it('requires all four categories and accepts a completed empty result', () => {
    expect(knownIssuesWebAnalysisSchema.parse({
      mechanical: [], bodywork: [], interior: [], other: [], sources: [],
    })).toEqual({ mechanical: [], bodywork: [], interior: [], other: [], sources: [] });
    expect(() => knownIssuesWebAnalysisSchema.parse({ ...valid, interior: undefined })).toThrow();
  });

  it('only accepts HTTP(S) sources and one category per issue', () => {
    expect(() => knownIssuesWebAnalysisSchema.parse({
      ...valid, sources: [{ title: 'FTP', url: 'ftp://example.test/file' }],
    })).toThrow();
    expect(() => knownIssuesWebAnalysisSchema.parse({
      ...valid, other: [valid.mechanical[0]!],
    })).toThrow();
  });

  it('rejects the former found and summary shape', () => {
    expect(() => knownIssuesWebAnalysisSchema.parse({
      found: true, summary: 'Problema conocido.', sources: [],
    })).toThrow();
  });
});
