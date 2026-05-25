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

import { Router } from '../../router';
import { getReleaseManifestResult } from './controller';

const router = new Router();

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
  const result = await getReleaseManifestResult(ctx.params.filename);
  if (!result.ok) {
    if (result.kind === 'not_found') return ctx.errors.notFound();
    return ctx.errors.internal();
  }

  return new Response(result.data.body, {
    status: 200,
    headers: { 'Content-Type': 'text/yaml; charset=utf-8' },
  });
});

export const releaseRoutes = router;
