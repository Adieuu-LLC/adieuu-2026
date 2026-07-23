/**
 * Community themes controller — query parsing, validation, and repository orchestration.
 *
 * Route modules map structured results to HTTP responses.
 *
 * @module routes/themes/controller
 */

import { ObjectId } from 'mongodb';
import { CommunityThemeUploadSchema } from '@adieuu/shared/schemas';
import { computeColorChecksum } from '@adieuu/shared';
import { getCommunityThemeRepository } from '../../repositories/community-theme.repository';
import {
  toPublicCommunityTheme,
  type PublicCommunityTheme,
} from '../../models/community-theme';
import { checkRateLimit, type RateLimitConfig } from '../../services/rate-limit.service';
import { sanitizeString, sanitizeObjectId } from '../../utils/sanitize';

export const THEME_UPLOAD_RATE_CONFIG: RateLimitConfig = {
  limit: 5,
  windowSeconds: 60 * 60,
};

/** Pre-computed SHA-256 checksums of built-in preset theme colours. */
export const BUILTIN_CHECKSUMS = new Set([
  '08115fe0f979e002004eeee7a02bc7f4bae8ed74e59bba9a338a63e333817346', // midnight
  '2abfd3c06e8ad582478da80e37a83d69e6ebc87b518ac6318a6601ab443e5b87', // daylight
  '9265bb720887db34db2efb93dc4a9a21d230518f263e5e6e82c3bb2e9cb583ed', // ember
  '9672f39d347898d40485184a2148d5a58eb975842a325ac64df94c6ba28aacf7', // verdant
  '8b2676056db3376c1b91e4c083e055219df3848f7e1079cb9927c34d7dbeed1f', // royal
]);

export type ThemeFailureKind =
  | 'validation_failed'
  | 'bad_request'
  | 'not_found'
  | 'forbidden'
  | 'conflict'
  | 'rate_limited';

export type ThemeResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; kind: ThemeFailureKind };

export type ThemeListQuery = {
  page: number;
  limit: number;
  search?: string;
  tag?: string;
  sort: 'newest' | 'downloads' | 'upvotes';
};

export type ParseThemeIdResult =
  | { ok: true; id: string }
  | { ok: false; kind: 'bad_request' };

export function parseThemeListQuery(searchParams: URLSearchParams): ThemeListQuery {
  const page = Math.max(1, Number(searchParams.get('page')) || 1);
  const limit = Math.min(50, Math.max(1, Number(searchParams.get('limit')) || 20));
  const rawSearch = searchParams.get('search');
  const search = rawSearch && rawSearch.length <= 100
    ? sanitizeString(rawSearch, 'general').value || undefined
    : undefined;
  const rawTag = searchParams.get('tag');
  const tag = rawTag && rawTag.length <= 30
    ? sanitizeString(rawTag, 'alphanumdash').value || undefined
    : undefined;
  const sortParam = searchParams.get('sort');
  const sort: ThemeListQuery['sort'] =
    sortParam === 'downloads' ? 'downloads' : sortParam === 'upvotes' ? 'upvotes' : 'newest';

  return { page, limit, search, tag, sort };
}

export function parseThemeId(raw: string | undefined): ParseThemeIdResult {
  if (!raw) return { ok: false, kind: 'bad_request' };
  const sanitized = sanitizeObjectId(raw);
  if (!sanitized.ok) return { ok: false, kind: 'bad_request' };
  return { ok: true, id: sanitized.id };
}

export type ListThemesData = {
  themes: PublicCommunityTheme[];
  total: number;
  page: number;
  limit: number;
};

export async function listThemesResult(searchParams: URLSearchParams): Promise<ThemeResult<ListThemesData>> {
  const query = parseThemeListQuery(searchParams);
  const repo = getCommunityThemeRepository();
  const { themes, total } = await repo.list(query);

  return {
    ok: true,
    data: {
      themes: themes.map(toPublicCommunityTheme),
      total,
      page: query.page,
      limit: query.limit,
    },
  };
}

export async function getSharedChecksumsResult(
  authorId: ObjectId,
): Promise<ThemeResult<{ checksums: string[] }>> {
  const repo = getCommunityThemeRepository();
  const checksums = await repo.listColorChecksumsByAuthor(authorId);
  return { ok: true, data: { checksums } };
}

export async function getThemeResult(id: string): Promise<ThemeResult<PublicCommunityTheme>> {
  const idParsed = parseThemeId(id);
  if (!idParsed.ok) {
    return { ok: false, kind: 'bad_request' };
  }

  const repo = getCommunityThemeRepository();
  const theme = await repo.findById(idParsed.id);
  if (!theme) {
    return { ok: false, kind: 'not_found' };
  }

  void repo.incrementDownloads(idParsed.id);

  return { ok: true, data: toPublicCommunityTheme(theme) };
}

export async function uploadThemeResult(
  identityId: ObjectId,
  username: string,
  body: unknown,
): Promise<ThemeResult<PublicCommunityTheme>> {
  const rateLimitResult = await checkRateLimit(
    'theme_upload',
    identityId.toHexString(),
    THEME_UPLOAD_RATE_CONFIG,
  );
  if (!rateLimitResult.allowed) {
    return { ok: false, kind: 'rate_limited' };
  }

  const parseResult = CommunityThemeUploadSchema.safeParse(body);
  if (!parseResult.success) {
    return { ok: false, kind: 'validation_failed' };
  }

  const sanitizedName = sanitizeString(parseResult.data.name, 'general').value;
  if (!sanitizedName) return { ok: false, kind: 'validation_failed' };

  const sanitizedDescription = parseResult.data.description !== undefined
    ? sanitizeString(parseResult.data.description, 'general').value
    : undefined;
  const sanitizedTags = parseResult.data.tags?.map(
    (t: string) => sanitizeString(t, 'alphanumdash').value,
  ).filter(Boolean);

  const { theme, tags: _rawTags, name: _rawName, description: _rawDesc, ...rest } = parseResult.data;
  const name = sanitizedName;
  const description = sanitizedDescription;
  const tags = sanitizedTags;
  const colorChecksum = await computeColorChecksum(theme.colors);

  if (BUILTIN_CHECKSUMS.has(colorChecksum)) {
    return { ok: false, kind: 'conflict' };
  }

  const repo = getCommunityThemeRepository();
  const alreadyShared = await repo.existsByChecksumAndAuthor(colorChecksum, identityId);
  if (alreadyShared) {
    return { ok: false, kind: 'conflict' };
  }

  const sanitisedTheme = { ...theme, author: username };
  const doc = await repo.create({
    name,
    description: description ?? '',
    authorIdentityId: identityId,
    authorUsername: username,
    theme: sanitisedTheme,
    tags: tags ?? [],
    colorChecksum,
  });

  return { ok: true, data: toPublicCommunityTheme(doc) };
}

export async function deleteThemeResult(
  identityId: ObjectId,
  id: string,
): Promise<ThemeResult<undefined>> {
  const idParsed = parseThemeId(id);
  if (!idParsed.ok) {
    return { ok: false, kind: 'bad_request' };
  }

  const repo = getCommunityThemeRepository();
  const deleted = await repo.deleteByIdAndAuthor(idParsed.id, identityId);
  if (!deleted) {
    return { ok: false, kind: 'not_found' };
  }

  return { ok: true, data: undefined };
}

export async function upvoteThemeResult(
  identityId: ObjectId,
  id: string,
): Promise<ThemeResult<{ upvoted: boolean; upvotes: number }>> {
  const idParsed = parseThemeId(id);
  if (!idParsed.ok) {
    return { ok: false, kind: 'bad_request' };
  }

  const repo = getCommunityThemeRepository();
  const theme = await repo.findById(idParsed.id);
  if (!theme) {
    return { ok: false, kind: 'not_found' };
  }

  if (theme.authorIdentityId.equals(identityId)) {
    return { ok: false, kind: 'forbidden' };
  }

  const added = await repo.upvote(idParsed.id, identityId);

  return {
    ok: true,
    data: {
      upvoted: added,
      upvotes: added ? theme.upvotes + 1 : theme.upvotes,
    },
  };
}

export async function reportThemeResult(id: string): Promise<ThemeResult<undefined>> {
  const idParsed = parseThemeId(id);
  if (!idParsed.ok) {
    return { ok: false, kind: 'bad_request' };
  }

  const repo = getCommunityThemeRepository();
  const theme = await repo.findById(idParsed.id);
  if (!theme) {
    return { ok: false, kind: 'not_found' };
  }

  await repo.markReported(idParsed.id);
  return { ok: true, data: undefined };
}
