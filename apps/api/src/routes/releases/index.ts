/**
 * Release manifest routes module.
 *
 * Serves electron-updater manifest files (latest*.yml) from a private S3
 * bucket. CloudFront routes `downloads.<domain>/latest/latest*.yml` to the
 * API via the ALB origin, and this endpoint reads the corresponding object
 * from the release-manifests bucket and returns it as `text/yaml`.
 *
 * The manifest bucket is separate from the downloads (binaries) bucket,
 * creating a trust boundary: compromising the downloads bucket alone cannot
 * produce valid updates because sha512 checksums live here.
 *
 * @module routes/releases
 */

import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { Router } from '../../router';
import { config } from '../../config';
import elog from '../../utils/adieuuLogger';

const router = new Router();

const ALLOWED_MANIFESTS = new Set([
  'latest.yml',
  'latest-mac.yml',
  'latest-linux.yml',
]);

let s3Client: S3Client | null = null;

function getS3Client(): S3Client {
  if (!s3Client) {
    s3Client = new S3Client({ region: config.releaseManifests.awsRegion });
  }
  return s3Client;
}

interface CachedManifest {
  body: string;
  cachedAt: number;
}

const manifestCache = new Map<string, CachedManifest>();
const CACHE_TTL_MS = 30_000;

/**
 * GET /v1/releases/latest/:filename
 *
 * Reads a manifest yml from the private release-manifests S3 bucket and
 * returns it with Content-Type: text/yaml. Results are cached in-memory
 * for 30s to reduce S3 reads (CloudFront also caches at the edge).
 *
 * @route GET /api/v1/releases/latest/:filename
 */
router.get('/v1/releases/latest/:filename', async (ctx) => {
  const { filename } = ctx.params;

  if (!filename || !ALLOWED_MANIFESTS.has(filename)) {
    return ctx.errors.notFound();
  }

  const bucket = config.releaseManifests.s3Bucket;
  if (!bucket) {
    elog.warn('RELEASE_MANIFESTS_S3_BUCKET not configured');
    return ctx.errors.notFound();
  }

  const cached = manifestCache.get(filename);
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
    return new Response(cached.body, {
      status: 200,
      headers: { 'Content-Type': 'text/yaml; charset=utf-8' },
    });
  }

  try {
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: filename,
    });

    const response = await getS3Client().send(command);
    const body = await response.Body?.transformToString('utf-8');

    if (!body) {
      return ctx.errors.notFound();
    }

    manifestCache.set(filename, { body, cachedAt: Date.now() });

    return new Response(body, {
      status: 200,
      headers: { 'Content-Type': 'text/yaml; charset=utf-8' },
    });
  } catch (err: unknown) {
    const code = (err as { name?: string }).name;
    if (code === 'NoSuchKey' || code === 'NotFound') {
      return ctx.errors.notFound();
    }

    elog.error('Failed to fetch release manifest from S3', {
      errorMessage: err instanceof Error ? err.message : String(err),
      filename,
      bucket,
    });
    return ctx.errors.internal();
  }
});

export const releaseRoutes = router;
