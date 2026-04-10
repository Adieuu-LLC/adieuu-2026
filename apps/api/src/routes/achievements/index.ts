/**
 * Achievement routes module.
 *
 * Provides endpoints for achievement definitions, own achievements,
 * other identity achievements (privacy-gated), and global stats.
 *
 * @module routes/achievements
 */

import { Router } from '../../router';
import {
  getDefinitionsCtrl,
  getMyAchievementsCtrl,
  getAchievementStatsCtrl,
  getGlobalStatsCtrl,
  claimAchievementCtrl,
} from './controller';

const router = new Router();

/** GET /achievements/definitions - All achievement definitions (public) */
router.get('/achievements/definitions', async (ctx) => {
  return await getDefinitionsCtrl(ctx);
});

/** GET /achievements/me - Own achievements (identity session required) */
router.get('/achievements/me', async (ctx) => {
  return await getMyAchievementsCtrl(ctx);
});

/** GET /achievements/stats - Global holder counts (public) */
router.get('/achievements/stats', async (ctx) => {
  return await getGlobalStatsCtrl(ctx);
});

/** GET /achievements/:achievementId/stats - Single achievement holder count (public) */
router.get('/achievements/:achievementId/stats', async (ctx) => {
  return await getAchievementStatsCtrl(ctx);
});

/** POST /achievements/claim - Claim a client-triggered achievement (identity session required) */
router.post('/achievements/claim', async (ctx) => {
  return await claimAchievementCtrl(ctx);
});

export const achievementRoutes = router;
