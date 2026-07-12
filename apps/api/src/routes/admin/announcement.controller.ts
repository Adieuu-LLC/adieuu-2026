import { z } from '@adieuu/shared/schemas';
import { getSiteAnnouncementRepository } from '../../repositories/site-announcement.repository';
import type { SiteAnnouncementDocument } from '../../models/site-announcement';
import { sanitizeString, sanitizeObjectId } from '../../utils/sanitize';

const AnnouncementBodySchema = z.object({
  message: z.string().min(1).max(2000),
  title: z.string().max(200).optional(),
  ctaLabel: z.string().max(100).optional(),
  ctaUrl: z.string().url().max(2000).refine(
    (url) => /^https?:\/\//i.test(url),
    { message: 'ctaUrl must use http or https protocol' },
  ).optional(),
  highPriority: z.boolean(),
  dismissable: z.boolean(),
  showAfter: z.string().datetime().optional(),
  showUntil: z.string().datetime().optional(),
  active: z.boolean().optional(),
});

const ToggleActiveSchema = z.object({
  active: z.boolean(),
});

export function toPublicAnnouncement(doc: SiteAnnouncementDocument) {
  return {
    id: doc._id.toHexString(),
    message: doc.message,
    title: doc.title,
    ctaLabel: doc.ctaLabel,
    ctaUrl: doc.ctaUrl,
    highPriority: doc.highPriority,
    dismissable: doc.dismissable,
    showAfter: doc.showAfter?.toISOString() ?? null,
    showUntil: doc.showUntil?.toISOString() ?? null,
    active: doc.active,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

export function toAdminAnnouncement(doc: SiteAnnouncementDocument) {
  return {
    ...toPublicAnnouncement(doc),
    createdBy: doc.createdBy,
  };
}

type AnnouncementOk<T> = { ok: true } & T;
type AnnouncementErr = { ok: false; reason: 'validation_failed' | 'not_found' | 'internal' };

export async function listAnnouncementsResult(): Promise<
  AnnouncementOk<{ announcements: SiteAnnouncementDocument[] }>
> {
  const repo = getSiteAnnouncementRepository();
  const docs = await repo.listAll();
  return { ok: true, announcements: docs };
}

export async function createAnnouncementResult(
  identityId: string,
  body: unknown,
): Promise<AnnouncementOk<{ announcement: SiteAnnouncementDocument }> | AnnouncementErr> {
  const parsed = AnnouncementBodySchema.safeParse(body);
  if (!parsed.success) return { ok: false, reason: 'validation_failed' };

  const sanitizedMessage = sanitizeString(parsed.data.message, 'general').value;
  if (!sanitizedMessage) return { ok: false, reason: 'validation_failed' };

  const sanitizedTitle = parsed.data.title
    ? sanitizeString(parsed.data.title, 'general').value || undefined
    : undefined;
  const sanitizedCtaLabel = parsed.data.ctaLabel
    ? sanitizeString(parsed.data.ctaLabel, 'general').value || undefined
    : undefined;

  if (parsed.data.showAfter && parsed.data.showUntil) {
    if (new Date(parsed.data.showAfter) >= new Date(parsed.data.showUntil)) {
      return { ok: false, reason: 'validation_failed' };
    }
  }

  const repo = getSiteAnnouncementRepository();
  const doc = await repo.create({
    message: sanitizedMessage,
    title: sanitizedTitle,
    ctaLabel: sanitizedCtaLabel,
    ctaUrl: parsed.data.ctaUrl,
    highPriority: parsed.data.highPriority,
    dismissable: parsed.data.dismissable,
    showAfter: parsed.data.showAfter ? new Date(parsed.data.showAfter) : undefined,
    showUntil: parsed.data.showUntil ? new Date(parsed.data.showUntil) : undefined,
    active: parsed.data.active ?? true,
    createdBy: identityId,
  });
  return { ok: true, announcement: doc };
}

export async function updateAnnouncementResult(
  id: string,
  body: unknown,
): Promise<AnnouncementOk<{ announcement: SiteAnnouncementDocument }> | AnnouncementErr> {
  const sanitizedId = sanitizeObjectId(id);
  if (!sanitizedId.ok) return { ok: false, reason: 'validation_failed' };

  const parsed = AnnouncementBodySchema.safeParse(body);
  if (!parsed.success) return { ok: false, reason: 'validation_failed' };

  const sanitizedMessage = sanitizeString(parsed.data.message, 'general').value;
  if (!sanitizedMessage) return { ok: false, reason: 'validation_failed' };

  const sanitizedTitle = parsed.data.title
    ? sanitizeString(parsed.data.title, 'general').value || undefined
    : undefined;
  const sanitizedCtaLabel = parsed.data.ctaLabel
    ? sanitizeString(parsed.data.ctaLabel, 'general').value || undefined
    : undefined;

  if (parsed.data.showAfter && parsed.data.showUntil) {
    if (new Date(parsed.data.showAfter) >= new Date(parsed.data.showUntil)) {
      return { ok: false, reason: 'validation_failed' };
    }
  }

  const repo = getSiteAnnouncementRepository();
  const doc = await repo.update(sanitizedId.id, {
    message: sanitizedMessage,
    title: sanitizedTitle,
    ctaLabel: sanitizedCtaLabel,
    ctaUrl: parsed.data.ctaUrl,
    highPriority: parsed.data.highPriority,
    dismissable: parsed.data.dismissable,
    showAfter: parsed.data.showAfter ? new Date(parsed.data.showAfter) : undefined,
    showUntil: parsed.data.showUntil ? new Date(parsed.data.showUntil) : undefined,
    active: parsed.data.active ?? true,
  });
  if (!doc) return { ok: false, reason: 'not_found' };
  return { ok: true, announcement: doc };
}

export async function toggleAnnouncementActiveResult(
  id: string,
  body: unknown,
): Promise<AnnouncementOk<{ announcement: SiteAnnouncementDocument }> | AnnouncementErr> {
  const sanitizedId = sanitizeObjectId(id);
  if (!sanitizedId.ok) return { ok: false, reason: 'validation_failed' };

  const parsed = ToggleActiveSchema.safeParse(body);
  if (!parsed.success) return { ok: false, reason: 'validation_failed' };

  const repo = getSiteAnnouncementRepository();
  const doc = await repo.setActive(sanitizedId.id, parsed.data.active);
  if (!doc) return { ok: false, reason: 'not_found' };
  return { ok: true, announcement: doc };
}

export async function deleteAnnouncementResult(
  id: string,
): Promise<{ ok: true } | AnnouncementErr> {
  const sanitizedId = sanitizeObjectId(id);
  if (!sanitizedId.ok) return { ok: false, reason: 'validation_failed' };

  const repo = getSiteAnnouncementRepository();
  const deleted = await repo.deleteById(sanitizedId.id);
  if (!deleted) return { ok: false, reason: 'not_found' };
  return { ok: true };
}
