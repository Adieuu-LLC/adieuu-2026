/**
 * Geo / jurisdiction reference routes (account session only).
 *
 * @module routes/geo
 */

import { Router } from '../../router';
import { success } from '../../utils/response';
import { requireAccountSession } from '../../services/session.service';
import { getJurisdictionRequirementsByCodes } from './controller';

const router = new Router();

/**
 * GET /geo/requirements?jurisdictions=US-TN,EU,FR
 *
 * Returns an array of public jurisdiction requirement documents for the
 * requested codes. Parents should be included explicitly (e.g. `EU` for EU-wide DSA).
 */
router.get('/geo/requirements', async (ctx) => {
  const session = await requireAccountSession(ctx.request);
  if (!session) {
    return ctx.errors.unauthorized();
  }

  const url = new URL(ctx.request.url, 'http://localhost');
  const raw = url.searchParams.get('jurisdictions') ?? url.searchParams.get('jurisdiction') ?? '';
  const parts = raw
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);

  if (parts.length === 0) {
    return success([]);
  }

  const data = await getJurisdictionRequirementsByCodes(parts);
  return success(data);
});

export const geoRoutes = router;
