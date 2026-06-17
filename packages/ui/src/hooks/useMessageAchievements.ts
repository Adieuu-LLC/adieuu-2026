/**
 * Client-side achievement detection for message content.
 *
 * Since messages are E2E encrypted, the server never sees plaintext.
 * Detection runs locally after a successful send; claims are
 * fire-and-forget via the existing claim endpoint.
 */

import { useCallback } from 'react';
import { useClaimAchievement } from './useClaimAchievement';
import { useIdentity } from './useIdentity';
import { containsProfanity } from '../utils/profanityCheck';

const CONTAINS_42_RE = /\b42\b/;
const CONTAINS_420_RE = /\b420\b/;
const SAILOR_THRESHOLD = 25;

const RICKROLL_RE = /never gonna give you up|rickroll|dQw4w9WgXcQ/i;
const OVER_9000_RE = /over\s*9000/i;
const UWU_RE = /\b(uwu|owo)\b/i;
const LOL_RE = /\b(lol|lmao|rofl|lmfao)\b/i;
const ALL_CAPS_MIN_ALPHA = 10;

/*
* AD: wife and I still make jokes about this video, lol
* https://www.youtube.com/watch?v=EShUeudtaFg
* Is this a useless achievement? Absolutely.
* Did it amuse me and make my wife giggle? Absolutely.
* Worth it.
*/
const PRANGENT_WORDS = [
  'pregant',
  'pragnent',
  'pargant',
  'gregnant',
  'pegnate',
  'pegrent',
  'pregegnant',
  'pregonate',
  'prengan',
  'prregnant',
  'pregante',
  'pergert',
  'pegnat',
  'pragnet',
  'pergenat',
  'prangnet',
  'pragnan',
  'pregnart',
  'bregant',
  'pregarnt',
  'pregat',
  'fregnant',
  'pargnet',
  'peegnant',
  'pergnut',
  'pgrenant',
  'praganant',
  'prangent',
  'prefnat',
  'pregananant',
  'pregernet',
  'prengt',
  'prognant',
  'pretnet',
] as const;

const PRANGENT_RE = new RegExp(`\\b(?:${PRANGENT_WORDS.join('|')})\\b`, 'i');
const PRICELESS_RE = /\bpriceless\b/i;
const SYNERGY_RE = /\bsynergy\b/i;
const AWAY_MESSAGE_RE = /\b(?:brb|g2g)\b/i;
const CLIPPY_RE = /looks like you|trying to/i;
const ASL_RE = /a\/s\/l/i;
const LEEROY_JENKINS_RE = /\b(?:leeroy|jenkins)\b/i;
const MORDOR_RE = /one does not simply/i;
const MAGIC_WORD_RE = /magic word/i;
const RABBIT_HOLE_RE = /there is no spoon|red pill/i;

const GIF_STICKER_THRESHOLD = 25;

function getLocalCount(key: string): number {
  try {
    return parseInt(localStorage.getItem(key) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function setLocalCount(key: string, count: number): void {
  try {
    localStorage.setItem(key, String(count));
  } catch { /* quota exceeded or unavailable */ }
}

function detectGifOrSticker(plaintext: string): 'gif' | 'sticker' | null {
  try {
    const parsed = JSON.parse(plaintext);
    const attachments = parsed?.gifAttachments;
    if (!Array.isArray(attachments) || attachments.length === 0) return null;
    return attachments[0].type === 'sticker' ? 'sticker' : 'gif';
  } catch {
    return null;
  }
}

function isAllCaps(text: string): boolean {
  const alphaOnly = text.replace(/[^a-zA-Z]/g, '');
  return alphaOnly.length >= ALL_CAPS_MIN_ALPHA && alphaOnly === alphaOnly.toUpperCase();
}

function isPressF(text: string): boolean {
  const trimmed = text.trim();
  return trimmed === 'F' || trimmed === 'f';
}

function containsShrug(text: string): boolean {
  return text.includes('_(ツ)_/') || text.includes(':shrug:');
}

function isExactMessage(text: string, expected: string): boolean {
  return text.trim().toLowerCase() === expected.toLowerCase();
}

export function useMessageAchievements() {
  const claim = useClaimAchievement();
  const { identity } = useIdentity();

  return useCallback(
    (plaintext: string) => {
      if (!identity) return;

      // -- GIF / Sticker --
      const mediaType = detectGifOrSticker(plaintext);
      if (mediaType === 'gif') {
        claim('gif_sent');
        const next = getLocalCount(`ach_gif_${identity.id}`) + 1;
        setLocalCount(`ach_gif_${identity.id}`, next);
        if (next >= GIF_STICKER_THRESHOLD) {
          claim('gifs_sent_25');
        }
      } else if (mediaType === 'sticker') {
        claim('sticker_sent');
        const next = getLocalCount(`ach_sticker_${identity.id}`) + 1;
        setLocalCount(`ach_sticker_${identity.id}`, next);
        if (next >= GIF_STICKER_THRESHOLD) {
          claim('stickers_sent_25');
        }
      }

      // -- Number easter eggs --
      if (CONTAINS_42_RE.test(plaintext)) {
        claim('message_contains_42');
      }
      if (CONTAINS_420_RE.test(plaintext)) {
        claim('message_contains_420');
      }

      // -- Profanity --
      if (containsProfanity(plaintext)) {
        claim('curse_word_message_sent');
        const next = getLocalCount(`ach_curse_${identity.id}`) + 1;
        setLocalCount(`ach_curse_${identity.id}`, next);
        if (next >= SAILOR_THRESHOLD) {
          claim('curse_word_messages_25');
        }
      }

      // -- Memes & phrases --
      if (RICKROLL_RE.test(plaintext)) {
        claim('rickroll_sent');
      }
      if (isPressF(plaintext)) {
        claim('press_f_sent');
      }
      if (OVER_9000_RE.test(plaintext)) {
        claim('over_9000_sent');
      }
      if (UWU_RE.test(plaintext)) {
        claim('uwu_sent');
      }
      if (isAllCaps(plaintext)) {
        claim('all_caps_sent');
      }
      if (LOL_RE.test(plaintext)) {
        claim('lol_sent');
      }
      if (containsShrug(plaintext)) {
        claim('shrug_sent');
      }
      if (PRANGENT_RE.test(plaintext)) {
        claim('prangent_message_sent');
      }
      if (PRICELESS_RE.test(plaintext)) {
        claim('priceless_message_sent');
      }
      if (SYNERGY_RE.test(plaintext)) {
        claim('synergy_message_sent');
      }
      if (AWAY_MESSAGE_RE.test(plaintext)) {
        claim('brb_message_sent');
      }
      if (CLIPPY_RE.test(plaintext)) {
        claim('clippy_message_sent');
      }
      if (ASL_RE.test(plaintext)) {
        claim('asl_message_sent');
      }
      if (LEEROY_JENKINS_RE.test(plaintext)) {
        claim('leeroy_jenkins_message_sent');
      }
      if (MORDOR_RE.test(plaintext)) {
        claim('mordor_message_sent');
      }
      if (MAGIC_WORD_RE.test(plaintext)) {
        claim('magic_word_message_sent');
      }
      if (isExactMessage(plaintext, 'as if')) {
        claim('as_if_message_sent');
      }
      if (RABBIT_HOLE_RE.test(plaintext)) {
        claim('rabbit_hole_message_sent');
      }
    },
    [claim, identity],
  );
}
