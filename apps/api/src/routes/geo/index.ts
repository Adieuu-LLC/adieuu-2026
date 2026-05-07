/**
 * Geo / jurisdiction reference routes (account session only).
 *
 * @module routes/geo
 */

import { Router } from '../../router';
import { getJurisdictionRequirementsCtrl } from './controller';

const router = new Router();

/**
 * GET /geo/requirements?jurisdictions=US-TN,EU,FR
 *
 * Returns an array of public jurisdiction requirement documents for the
 * requested codes. Parents should be included explicitly (e.g. `EU` for EU-wide DSA).
 */
router.get('/geo/requirements', async (ctx) => getJurisdictionRequirementsCtrl(ctx));

export const geoRoutes = router;
