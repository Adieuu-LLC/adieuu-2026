/**
 * Custom emoji routes module.
 *
 * CRUD endpoints for user-uploaded custom emojis.
 * All endpoints require an identity session.
 *
 * @module routes/custom-emojis
 */

import { Router } from '../../router';
import {
  listCustomEmojisCtrl,
  createCustomEmojiCtrl,
  getCustomEmojiCtrl,
  updateCustomEmojiCtrl,
  deleteCustomEmojiCtrl,
} from './controller';

const router = new Router();

/** GET /custom-emojis - List the current identity's custom emojis. */
router.get('/custom-emojis', async (ctx) => listCustomEmojisCtrl(ctx));

/** POST /custom-emojis - Create a custom emoji (after upload is ready). */
router.post('/custom-emojis', async (ctx) => createCustomEmojiCtrl(ctx));

/** GET /custom-emojis/:id - Get a single custom emoji. */
router.get('/custom-emojis/:id', async (ctx) => getCustomEmojiCtrl(ctx));

/** PATCH /custom-emojis/:id - Update shortcode and/or name. */
router.patch('/custom-emojis/:id', async (ctx) => updateCustomEmojiCtrl(ctx));

/** DELETE /custom-emojis/:id - Delete a custom emoji. */
router.delete('/custom-emojis/:id', async (ctx) => deleteCustomEmojiCtrl(ctx));

export const customEmojiRoutes = router;
