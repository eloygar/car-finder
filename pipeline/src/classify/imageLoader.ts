const MAX_IMAGES = 3;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const IMAGE_TIMEOUT_MS = 10_000;
const ALLOWED_MEDIA_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);

export interface LoadedImage {
  data: string;
  mediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
}

export async function loadListingImages(
  urls: readonly string[],
  fetchImage: typeof fetch = fetch,
): Promise<LoadedImage[]> {
  const loaded: LoadedImage[] = [];
  for (const rawUrl of urls.slice(0, MAX_IMAGES)) {
    try {
      const url = parseAllowedUrl(rawUrl);
      const response = await fetchImage(url, { signal: AbortSignal.timeout(IMAGE_TIMEOUT_MS) });
      if (!response.ok || !isAllowedResponseUrl(response.url)) continue;
      const mediaType = response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase();
      if (!mediaType || !ALLOWED_MEDIA_TYPES.has(mediaType)) continue;
      const declaredLength = Number(response.headers.get('content-length'));
      if (Number.isFinite(declaredLength) && declaredLength > MAX_IMAGE_BYTES) continue;
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.byteLength === 0 || bytes.byteLength > MAX_IMAGE_BYTES) continue;
      loaded.push({
        data: Buffer.from(bytes).toString('base64'),
        mediaType: mediaType as LoadedImage['mediaType'],
      });
    } catch {
      // An unavailable image must not prevent text classification.
    }
  }
  return loaded;
}

function parseAllowedUrl(value: string): URL {
  const url = new URL(value);
  if (url.protocol !== 'https:' || !isWallapopImageHost(url.hostname)) {
    throw new Error('Image URL is not an allowed Wallapop HTTPS host');
  }
  return url;
}

function isAllowedResponseUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && isWallapopImageHost(url.hostname);
  } catch {
    return false;
  }
}

function isWallapopImageHost(hostname: string): boolean {
  return hostname === 'cdn.wallapop.com';
}
