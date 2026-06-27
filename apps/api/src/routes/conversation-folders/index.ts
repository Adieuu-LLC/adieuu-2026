/**
 * Conversation folder routes module.
 *
 * Provides CRUD endpoints for per-identity conversation folders.
 * All endpoints require an authenticated identity session.
 *
 * @module routes/conversation-folders
 */

import { Router } from '../../router';
import { conversationRespond } from '../conversations/conversation-route-result';
import * as folderController from './controller';

const router = new Router();

router.get('/conversation-folders', async (ctx) => {
  return conversationRespond(ctx, await folderController.listFoldersCtrl(ctx));
});

router.post('/conversation-folders', async (ctx) => {
  return conversationRespond(ctx, await folderController.createFolderCtrl(ctx));
});

router.patch('/conversation-folders/:id', async (ctx) => {
  return conversationRespond(ctx, await folderController.updateFolderCtrl(ctx));
});

router.post('/conversation-folders/:id/conversations', async (ctx) => {
  return conversationRespond(ctx, await folderController.addConversationToFolderCtrl(ctx));
});

router.delete('/conversation-folders/:id/conversations/:conversationId', async (ctx) => {
  return conversationRespond(ctx, await folderController.removeConversationFromFolderCtrl(ctx));
});

router.delete('/conversation-folders/:id', async (ctx) => {
  return conversationRespond(ctx, await folderController.deleteFolderCtrl(ctx));
});

export const conversationFolderRoutes = router;
