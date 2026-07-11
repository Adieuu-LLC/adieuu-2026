import type { BaseDocument } from './base';

export interface SiteAnnouncementDocument extends BaseDocument {
  message: string;
  title?: string;
  ctaLabel?: string;
  ctaUrl?: string;
  highPriority: boolean;
  dismissable: boolean;
  showAfter?: Date;
  showUntil?: Date;
  active: boolean;
  createdBy: string;
}
