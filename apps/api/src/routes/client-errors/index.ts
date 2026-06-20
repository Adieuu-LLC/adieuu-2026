/**
 * Client-side crash report ingestion.
 *
 * Accepts anonymous error reports from the frontend CrashBoundary and global
 * error handlers. No authentication is required because the user may not be
 * logged in (or the auth system itself may have crashed).
 *
 * Rate-limited by IP to prevent abuse.
 */

import { Router } from '../../router';
import { success } from '../../utils/response';
import { getCollection, Collections } from '../../db';
import { withTimestamps } from '../../models/base';
import { checkRateLimit, type RateLimitConfig } from '../../services/rate-limit.service';
import { getClientIp } from '../auth/controller';
import type { ClientErrorDocument, ClientErrorContactInfo } from '../../models/client-error';

const router = new Router();

const CLIENT_ERROR_RATE_LIMIT: RateLimitConfig = {
  limit: 10,
  windowSeconds: 60,
};

const MAX_MESSAGE_LENGTH = 2_000;
const MAX_STACK_LENGTH = 8_000;
const MAX_COMPONENT_STACK_LENGTH = 4_000;
const MAX_URL_LENGTH = 2_000;
const MAX_USER_DESCRIPTION_LENGTH = 2_000;
const MAX_APP_VERSION_LENGTH = 100;
const MAX_CONTACT_IDENTIFIER_LENGTH = 200;

const VALID_PLATFORMS = new Set(['web', 'desktop', 'mobile']);
const VALID_CONTACT_TYPES = new Set(['account', 'alias']);

function truncate(value: unknown, max: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  return value.slice(0, max) || undefined;
}

router.post('/client-errors', async (ctx) => {
  const ip = getClientIp(ctx.request);

  const rl = await checkRateLimit('client-error:submit', ip, CLIENT_ERROR_RATE_LIMIT);
  if (!rl.allowed) return ctx.errors.rateLimited();

  const body = ctx.body as Record<string, unknown> | undefined;
  if (!body || typeof body !== 'object') return ctx.errors.validationFailed();

  const message = truncate(body.message, MAX_MESSAGE_LENGTH);
  if (!message) return ctx.errors.validationFailed();

  const platform = typeof body.platform === 'string' && VALID_PLATFORMS.has(body.platform)
    ? (body.platform as ClientErrorDocument['platform'])
    : 'web';

  let contactInfo: ClientErrorContactInfo | undefined;
  if (body.contactInfo && typeof body.contactInfo === 'object') {
    const ci = body.contactInfo as Record<string, unknown>;
    if (
      typeof ci.type === 'string' &&
      VALID_CONTACT_TYPES.has(ci.type) &&
      typeof ci.identifier === 'string' &&
      ci.identifier.length > 0
    ) {
      contactInfo = {
        type: ci.type as ClientErrorContactInfo['type'],
        identifier: ci.identifier.slice(0, MAX_CONTACT_IDENTIFIER_LENGTH),
      };
    }
  }

  const doc = withTimestamps({
    message,
    stack: truncate(body.stack, MAX_STACK_LENGTH),
    componentStack: truncate(body.componentStack, MAX_COMPONENT_STACK_LENGTH),
    url: truncate(body.url, MAX_URL_LENGTH) ?? '',
    platform,
    userAgent: ctx.request.headers.get('User-Agent') ?? '',
    appVersion: truncate(body.appVersion, MAX_APP_VERSION_LENGTH),
    userDescription: truncate(body.userDescription, MAX_USER_DESCRIPTION_LENGTH),
    contactInfo,
    clientTimestamp: typeof body.timestamp === 'string' ? body.timestamp.slice(0, 50) : '',
    ip,
  });

  const collection = getCollection<ClientErrorDocument>(Collections.CLIENT_ERRORS);
  await collection.insertOne(doc as ClientErrorDocument);

  return success(undefined, 'Error report received.');
});

export const clientErrorRoutes = router;
