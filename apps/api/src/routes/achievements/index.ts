/**
 * Achievement routes module.
 *
 * Provides endpoints for achievement definitions, own achievements,
 * other identity achievements (privacy-gated), and global stats.
 *
 * @module routes/achievements
 */

import { Router } from '../../router';
import { success, errors } from '../../utils/response';
import {
  getDefinitionsResult,
  getMyAchievementsResult,
  getAchievementStatsResult,
  getGlobalStatsResult,
  claimAchievementResult,
} from './controller';

const router = new Router();

/** GET /achievements/definitions - All achievement definitions (public) */
router.get('/achievements/definitions', async (ctx) => {
  const result = await getDefinitionsResult();
  return success({ definitions: result.definitions });
});

/** GET /achievements/me - Own achievements (identity session required) */
router.get('/achievements/me', async (ctx) => {
  if (!ctx.identitySession) return ctx.errors.unauthorized();
  const result = await getMyAchievementsResult(ctx.identitySession.identity._id);
  return success({ achievements: result.achievements });
});

/** GET /achievements/stats - Global holder counts (public) */
router.get('/achievements/stats', async (ctx) => {
  const result = await getGlobalStatsResult();
  return success({ stats: result.stats });
});

/** GET /achievements/:achievementId/stats - Single achievement holder count (public) */
router.get('/achievements/:achievementId/stats', async (ctx) => {
  const result = await getAchievementStatsResult(ctx.params.achievementId);
  if (!result.ok) return ctx.errors.notFound();
  return success({ achievementId: result.achievementId, holderCount: result.holderCount });
});

/** POST /achievements/claim - Claim a client-triggered achievement (identity session required) */
router.post('/achievements/claim', async (ctx) => {
  if (!ctx.identitySession) return ctx.errors.unauthorized();
  const result = await claimAchievementResult(ctx.identitySession.identity._id, ctx.body);
  if (!result.ok) {
    return errors.badRequest('Invalid or non-claimable action.');
  }
  return success({ claimed: true });
});

export const achievementRoutes = router;
