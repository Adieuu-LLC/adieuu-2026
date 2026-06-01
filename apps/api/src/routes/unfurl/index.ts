/**
 * URL unfurl routes.
 *
 * Provides an endpoint for fetching OpenGraph/meta metadata from external URLs
 * to render rich link embeds in conversations.
 *
 * @module routes/unfurl
 */

import { Router } from '../../router';
import { unfurlCtrl } from './controller';

const router = new Router();

/**
 * GET /unfurl?url=<encoded-url> - Fetch OpenGraph metadata for a URL.
 *
 * Requires identity auth. Returns cached metadata when available.
 *
 * @route GET /api/unfurl
 */
router.get('/unfurl', (ctx) => unfurlCtrl(ctx));

export const unfurlRoutes = router;
