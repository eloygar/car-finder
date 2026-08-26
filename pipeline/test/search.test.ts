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

    expect(result.items).toEqual([first, second, third]);
    expect(result.items[0]).toBe(first);
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

    expect(result.items).toEqual([{ id: '1' }]);
    expect(searchPage).toHaveBeenCalledTimes(1);
  });

  it('passes optional native vehicle filters through every page', async () => {
    const { client, searchPage } = clientWithPages({ items: [] });

    await runSearchBatch({
      client,
      searches: [{
        ...searches[0]!,
        model: 'Corolla',
        engine: 'hybride',
        transmission: 'automatic',
        bodyType: 'sedan',
        priceMin: 10_000,
        priceMax: 20_000,
      }],
      logger,
    });

    expect(searchPage).toHaveBeenCalledWith(expect.objectContaining({
      model: 'Corolla',
      engine: 'hybride',
      transmission: 'automatic',
      bodyType: 'sedan',
      priceMin: 10_000,
      priceMax: 20_000,
    }));
  });

  it('stops when a page is empty even if it includes a cursor', async () => {
    const { client, searchPage } = clientWithPages({ items: [], nextCursor: 'unused' });

    await runSearchBatch({ client, searches: [searches[0]!], maxPages: 3, logger });

    expect(searchPage).toHaveBeenCalledTimes(1);
  });

  it('stops safely and retains collected items when Wallapop repeats a cursor', async () => {
    const { client, searchPage } = clientWithPages(
      { items: [{ id: '1' }], nextCursor: 'same-cursor' },
      { items: [{ id: '2' }], nextCursor: 'same-cursor' },
    );

    const result = await runSearchBatch({
      client,
      searches: [searches[0]!],
      maxPages: 3,
      logger,
    });

    expect(result.items).toEqual([{ id: '1' }, { id: '2' }]);
    expect(searchPage).toHaveBeenCalledTimes(2);
    expect(logger.warn).toHaveBeenCalledWith(
      { searchId: 'first-search', page: 2 },
      'Wallapop repeated a pagination cursor; stopping this search',
    );
  });

  it('stops and retains captured items when a page fails', async () => {
    const first = { id: '1' };
    const searchPage = vi.fn()
      .mockResolvedValueOnce({ items: [first], nextCursor: 'cursor-a' })
      .mockRejectedValueOnce(new Error('malformed Wallapop response'));

    const result = await runSearchBatch({
      client: { searchPage },
      searches: [searches[0]!],
      logger,
    });

    expect(result.items).toEqual([first]);
    expect(result.warning).toBeDefined();
    expect(searchPage).toHaveBeenCalledTimes(2);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ searchId: 'first-search', page: 2 }),
      expect.stringContaining('failed after retries'),
    );
  });

  it('stops the failing search but still runs later searches', async () => {
    const a = { id: 'a' };
    const b = { id: 'b' };
    const searchPage = vi.fn()
      .mockResolvedValueOnce({ items: [a], nextCursor: 'cursor-a' })
      .mockRejectedValueOnce(new Error('malformed page'))
      .mockResolvedValueOnce({ items: [b] });

    const result = await runSearchBatch({
      client: { searchPage },
      searches,
      logger,
    });

    expect(result.items).toEqual([a, b]);
    expect(searchPage).toHaveBeenCalledTimes(3);
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

  it('returns no items when every page fails', async () => {
    const searchPage = vi.fn().mockRejectedValue(new Error('failed page'));

    const result = await runSearchBatch({
      client: { searchPage },
      searches: [searches[0]!],
      maxPages: 1,
      logger,
    });

    expect(result.items).toEqual([]);
    expect(result.warning).toBeDefined();
    expect(searchPage).toHaveBeenCalledTimes(1);
  });
});
