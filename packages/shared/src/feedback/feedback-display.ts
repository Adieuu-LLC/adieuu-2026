import type { PublicFeedbackPost } from '../api/feedback-types';

export function shouldShowFeedbackAuthorCredit(
  post: Pick<PublicFeedbackPost, 'isRoadmapOfficial' | 'isStaffAuthored'>,
): boolean {
  return !post.isRoadmapOfficial && !post.isStaffAuthored;
}
