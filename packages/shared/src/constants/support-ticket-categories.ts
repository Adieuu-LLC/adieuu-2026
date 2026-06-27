/**
 * Support ticket category and subcategory constants.
 * Shared between API validation and UI localization keys.
 */

export const TICKET_CATEGORIES = [
  'account_access',
  'billing',
  'technical',
  'privacy_security',
  'moderation_appeal',
  'general',
] as const;

export type TicketCategory = (typeof TICKET_CATEGORIES)[number];

export const TICKET_SUBCATEGORIES: Record<TicketCategory, readonly string[]> = {
  account_access: ['login_issues', 'account_recovery', 'two_factor_auth'],
  billing: ['subscription', 'payments', 'refunds'],
  technical: ['bugs', 'performance', 'compatibility'],
  privacy_security: ['data_request', 'unauthorized_access', 'safety_concern'],
  moderation_appeal: ['content_removal', 'account_action', 'identity_restriction'],
  general: ['feedback', 'feature_request', 'other'],
};

export function isValidTicketSubcategory(
  category: TicketCategory,
  subcategory: string,
): boolean {
  return TICKET_SUBCATEGORIES[category].includes(subcategory);
}

export const TICKET_STATUSES = [
  'open',
  'in_progress',
  'escalated',
  'resolved',
  'closed',
] as const;

export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const TICKET_PRIORITIES = ['low', 'normal', 'high'] as const;

export type TicketPriority = (typeof TICKET_PRIORITIES)[number];

export const MAX_TICKET_TITLE_LENGTH = 300;
export const MAX_TICKET_BODY_LENGTH = 2000;
export const MAX_TICKET_ATTACHMENTS = 5;
