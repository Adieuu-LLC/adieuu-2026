/**
 * English translations for the Adieuu UI.
 * Split across domain modules under this folder; keys and structure must stay in sync for `TranslationKeys`.
 */
import { account } from './account';
import { achievements } from './achievements';
import { admin } from './admin';
import { auth } from './auth';
import { call } from './call';
import { ciphers } from './ciphers';
import { conversations } from './conversations';
import { core } from './core';
import { gif } from './gif';
import { identity } from './identity';
import { moderation } from './moderation';
import { report } from './report';
import { staticPages } from './staticPages';
import { compliance } from './compliance';
import { sponsorship } from './sponsorship';
import { support } from './support';

export const en = {
  ...core,
  identity,
  account,
  ...staticPages,
  auth,
  call,
  ciphers,
  admin,
  conversations,
  report,
  moderation,
  support,
  gif,
  achievements,
  compliance,
  ...sponsorship,
  customEmoji: {
    conversationDisabledByAdmin: 'Disable custom emojis',
    conversationDisabledByAdminHint: 'This disables custom emoji usage for all members',
  },
} as const;

export type TranslationKeys = typeof en;
