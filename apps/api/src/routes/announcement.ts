import { Router } from '../router';
import { success } from '../utils/response';
import { getSiteAnnouncementRepository } from '../repositories/site-announcement.repository';
import { toPublicAnnouncement } from './admin/announcement.controller';

const router = new Router();

router.get('/announcements/active', async () => {
  const repo = getSiteAnnouncementRepository();
  const docs = await repo.findVisible();
  return success({ announcements: docs.map(toPublicAnnouncement) });
});

export const publicAnnouncementRoutes = router;
