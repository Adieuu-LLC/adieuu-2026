/**
 * Account-level ban/suspension categories and admin preset reason templates.
 */

export type AccountModerationCategory =
  | 'tos_violation'
  | 'spam'
  | 'harassment'
  | 'hate_speech'
  | 'violence'
  | 'illegal_content'
  | 'csam'
  | 'impersonation'
  | 'fraud'
  | 'security_abuse'
  | 'other';

export const ACCOUNT_MODERATION_CATEGORIES: readonly AccountModerationCategory[] = [
  'tos_violation',
  'spam',
  'harassment',
  'hate_speech',
  'violence',
  'illegal_content',
  'csam',
  'impersonation',
  'fraud',
  'security_abuse',
  'other',
] as const;

/** ~100 years — used for indefinite suspensions and ban troll countdown. */
export const BAN_TROLL_COUNTDOWN_MS = 100 * 365 * 24 * 60 * 60 * 1000;

export const ACCOUNT_MODERATION_PRESETS: Record<AccountModerationCategory, string> = {
  tos_violation:
    'Violation of our Terms of Service. Repeated or severe breaches may result in permanent account removal.',
  spam:
    'Repeated unsolicited messaging or promotional activity in violation of our Terms of Service.',
  harassment:
    'Harassment, bullying, or targeted abuse directed at other users in violation of our community standards.',
  hate_speech:
    'Hate speech or discriminatory content targeting individuals or groups based on protected characteristics.',
  violence:
    'Threats of violence, glorification of violence, or content that incites harm against others.',
  illegal_content:
    'Distribution or promotion of content that violates applicable law.',
  csam:
    'Content involving the sexual exploitation or abuse of minors, which is strictly prohibited and reported as required by law.',
  impersonation:
    'Impersonation of another person, organisation, or Adieuu staff member.',
  fraud:
    'Fraudulent activity, scams, or deceptive practices targeting users or the platform.',
  security_abuse:
    'Abuse of platform security features, including credential stuffing, automated access, or circumvention of restrictions.',
  other:
    'Violation of our community standards and Terms of Service.',
};
