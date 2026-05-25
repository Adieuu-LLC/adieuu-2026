/**
 * Release manifest controller — allowlist validation, S3 fetch, and in-memory cache.
 *
 * @module routes/releases/controller
 */

import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { config } from '../../config';
import elog from '../../utils/adieuuLogger';

export const ALLOWED_MANIFEST_FILENAMES = new Set([
  'latest.yml',
  'latest-mac.yml',
  'latest-linux.yml',
]);

export const MANIFEST_CACHE_TTL_MS = 30_000;

export type ReleaseManifestResult =
  | { ok: true; data: { body: string } }
  | { ok: false; kind: 'not_found' | 'internal' };

let s3Client: S3Client | null = null;

interface CachedManifest {
  body: string;
  cachedAt: number;
}

const manifestCache = new Map<string, CachedManifest>();

function getS3Client(): S3Client {
  if (!s3Client) {
    s3Client = new S3Client({ region: config.releaseManifests.awsRegion });
  }
  return s3Client;
}

export function isAllowedManifestFilename(filename: string | undefined): boolean {
  return Boolean(filename && ALLOWED_MANIFEST_FILENAMES.has(filename));
}

/** Clears the in-memory manifest cache (for tests). */
export function clearManifestCacheForTests(): void {
  manifestCache.clear();
}

export async function getReleaseManifestResult(
  filename: string | undefined,
): Promise<ReleaseManifestResult> {
  if (!isAllowedManifestFilename(filename)) {
    return { ok: false, kind: 'not_found' };
  }

  const bucket = config.releaseManifests.s3Bucket;
  if (!bucket) {
    elog.warn('RELEASE_MANIFESTS_S3_BUCKET not configured');
    return { ok: false, kind: 'not_found' };
  }

  const cached = manifestCache.get(filename!);
  if (cached && Date.now() - cached.cachedAt < MANIFEST_CACHE_TTL_MS) {
    return { ok: true, data: { body: cached.body } };
  }

  try {
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: filename!,
    });

    const response = await getS3Client().send(command);
    const body = await response.Body?.transformToString('utf-8');

    if (!body) {
      return { ok: false, kind: 'not_found' };
    }

    manifestCache.set(filename!, { body, cachedAt: Date.now() });

    return { ok: true, data: { body } };
  } catch (err: unknown) {
    const code = (err as { name?: string }).name;
    if (code === 'NoSuchKey' || code === 'NotFound') {
      return { ok: false, kind: 'not_found' };
    }

    elog.error('Failed to fetch release manifest from S3', {
      errorMessage: err instanceof Error ? err.message : String(err),
      filename,
      bucket,
    });
    return { ok: false, kind: 'internal' };
  }
}
