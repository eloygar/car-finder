import { describe, expect, it, vi } from 'vitest';

import { loadListingImages } from '../src/classify/imageLoader.js';

function imageResponse(body: string, url = 'https://cdn.wallapop.com/image.jpg', type = 'image/jpeg') {
  const response = new Response(body, { status: 200, headers: { 'content-type': type } });
  Object.defineProperty(response, 'url', { value: url });
  return response;
}

describe('loadListingImages', () => {
  it('loads at most three allowed Wallapop images as base64', async () => {
    const fetchImage = vi.fn().mockImplementation(async (url: URL) => imageResponse(url.pathname));
    const images = await loadListingImages([
      'https://cdn.wallapop.com/1.jpg', 'https://cdn.wallapop.com/2.jpg',
      'https://cdn.wallapop.com/3.jpg', 'https://cdn.wallapop.com/4.jpg',
    ], fetchImage as typeof fetch);
    expect(images).toHaveLength(3);
    expect(fetchImage).toHaveBeenCalledTimes(3);
    expect(Buffer.from(images[0]!.data, 'base64').toString()).toBe('/1.jpg');
  });

  it('rejects foreign hosts, redirects, and unsupported MIME within the first three URLs', async () => {
    const fetchImage = vi.fn()
      .mockResolvedValueOnce(imageResponse('x', 'https://evil.example/image.jpg'))
      .mockResolvedValueOnce(imageResponse('x', 'https://cdn.wallapop.com/file.svg', 'image/svg+xml'));
    const images = await loadListingImages([
      'https://evil.example/a.jpg',
      'https://cdn.wallapop.com/redirect.jpg',
      'https://cdn.wallapop.com/vector.svg',
      'https://cdn.wallapop.com/large.jpg',
    ], fetchImage as typeof fetch);
    expect(images).toEqual([]);
    expect(fetchImage).toHaveBeenCalledTimes(2);
  });

  it('rejects images over the size limit', async () => {
    const fetchImage = vi.fn().mockResolvedValue(
      imageResponse('x'.repeat(5 * 1024 * 1024 + 1)),
    );
    await expect(loadListingImages(
      ['https://cdn.wallapop.com/large.jpg'],
      fetchImage as typeof fetch,
    )).resolves.toEqual([]);
  });
});
