import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import type { SearchDefinition } from '../src/config/searches.js';
import {
  parseCliArgs,
  runSearchBatch,
  writeJsonAtomically,
  type BatchLogger,
  type SearchPageClient,
} from '../src/search.js';

const searches: readonly SearchDefinition[] = [
  {
    id: 'first-search',
    brand: 'Toyota',
    location: { label: 'Madrid', latitude: 40.4, longitude: -3.7, distanceMeters: 50_000 },
  },
  {
    id: 'second-search',
    brand: 'BMW',
    location: { label: 'Bilbao', latitude: 43.2, longitude: -2.9, distanceMeters: 50_000 },
  },
];

const logger: BatchLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

function clientWithPages(...pages: Array<{ items: Array<{ id: string; [key: string]: unknown }>; nextCursor?: string }>): {
  client: SearchPageClient;
  searchPage: ReturnType<typeof vi.fn>;
} {
  const searchPage = vi.fn();
  for (const page of pages) {
    searchPage.mockResolvedValueOnce(page);
  }
  return { client: { searchPage }, searchPage };
}

describe('runSearchBatch', () => {
  it('runs searches and pages sequentially and deduplicates by id', async () => {
    const first = { id: '1', title: 'first object is preserved' };
    const duplicate = { id: '1', title: 'duplicate must not replace first' };
    const second = { id: '2', providerField: { untouched: true } };
    const third = { id: '3' };
    const { client, searchPage } = clientWithPages(
      { items: [first], nextCursor: 'cursor-a' },
      { items: [duplicate, second] },
      { items: [third] },
    );

    const result = await runSearchBatch({ client, searches, logger });

    expect(result).toEqual([first, second, third]);
    expect(result[0]).toBe(first);
    expect(searchPage).toHaveBeenCalledTimes(3);
    expect(searchPage.mock.calls[1]?.[0]).toMatchObject({
      brand: 'Toyota',
      categoryId: 100,
      nextPage: 'cursor-a',
    });
    expect(searchPage.mock.calls[2]?.[0]).toMatchObject({
      brand: 'BMW',
      categoryId: 100,
    });
  });

  it('stops successfully at the configured page limit', async () => {
    const { client, searchPage } = clientWithPages({
      items: [{ id: '1' }],
      nextCursor: 'more-results-exist',
    });

    const result = await runSearchBatch({
      client,
      searches: [searches[0]!],
      maxPages: 1,
      logger,
    });

    expect(result).toEqual([{ id: '1' }]);
    expect(searchPage).toHaveBeenCalledTimes(1);
  });

  it('stops when a page is empty even if it includes a cursor', async () => {
    const { client, searchPage } = clientWithPages({ items: [], nextCursor: 'unused' });

    await runSearchBatch({ client, searches: [searches[0]!], maxPages: 3, logger });

    expect(searchPage).toHaveBeenCalledTimes(1);
  });

  it('fails the run when Wallapop repeats a cursor', async () => {
    const { client, searchPage } = clientWithPages(
      { items: [{ id: '1' }], nextCursor: 'same-cursor' },
      { items: [{ id: '2' }], nextCursor: 'same-cursor' },
    );

    await expect(
      runSearchBatch({ client, searches: [searches[0]!], maxPages: 3, logger }),
    ).rejects.toThrow('repeated cursor');
    expect(searchPage).toHaveBeenCalledTimes(2);
  });

  it('propagates a page failure and does not continue to the next search', async () => {
    const searchPage = vi.fn().mockRejectedValue(new Error('network unavailable'));

    await expect(
      runSearchBatch({ client: { searchPage }, searches, maxPages: 3, logger }),
    ).rejects.toThrow('network unavailable');
    expect(searchPage).toHaveBeenCalledTimes(1);
  });
});

describe('parseCliArgs', () => {
  it('uses stable defaults', () => {
    expect(parseCliArgs([], '/work')).toEqual({
      outputPath: path.resolve('/work/output/raw-listings.json'),
    });
  });

  it('parses max pages, one search, and a custom output path', () => {
    expect(
      parseCliArgs(
        ['--', '--max-pages', '1', '--only', 'toyota-madrid', '--output', 'captures/one.json'],
        '/work',
      ),
    ).toEqual({
      maxPages: 1,
      only: 'toyota-madrid',
      outputPath: '/work/captures/one.json',
    });
  });

  it.each([
    ['--max-pages', '0'],
    ['--max-pages', '1.5'],
    ['--only'],
    ['--unknown', 'value'],
  ])('rejects invalid arguments: %s', (...args) => {
    expect(() => parseCliArgs(args, '/work')).toThrow();
  });
});

describe('writeJsonAtomically', () => {
  it('writes a formatted plain array and replaces an existing artifact', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'car-finder-search-'));
    const outputPath = path.join(directory, 'nested', 'raw.json');
    await writeFile(path.join(directory, 'previous.json'), 'unrelated');

    await writeJsonAtomically(outputPath, [{ id: '1', nested: { raw: true } }]);
    await writeJsonAtomically(outputPath, [{ id: '2' }]);

    expect(JSON.parse(await readFile(outputPath, 'utf8'))).toEqual([{ id: '2' }]);
    expect(await readFile(outputPath, 'utf8')).toBe('[\n  {\n    "id": "2"\n  }\n]\n');
  });

  it('leaves an existing artifact untouched when the batch fails before writing', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'car-finder-search-'));
    const outputPath = path.join(directory, 'raw.json');
    await writeFile(outputPath, '[{"id":"old"}]\n');
    const searchPage = vi.fn().mockRejectedValue(new Error('failed page'));

    await expect(
      runSearchBatch({
        client: { searchPage },
        searches: [searches[0]!],
        maxPages: 1,
        logger,
      }),
    ).rejects.toThrow('failed page');

    expect(await readFile(outputPath, 'utf8')).toBe('[{"id":"old"}]\n');
  });
});
