/**
 * Discriminated outcomes for Space route controllers.
 *
 * Mirrors `routes/conversations/conversation-route-result` so controllers stay
 * transport-agnostic and testable: they return a typed result, and
 * {@link spaceRespond} maps it to a `Response`. `named_error` preserves the
 * service `errorCode` for the client (e.g. `SLUG_TAKEN`, `ENCRYPTION_NOT_SUPPORTED`).
 *
 * @module routes/spaces/space-route-result
 */

import type { RouteContext } from '../../router/types';
import { success, errors, error } from '../../utils/response';
import type { SpaceErrorCode } from '../../services/space/types';

export type SpaceRouteResult<T = unknown> =
  | { kind: 'ok'; data: T; message?: string }
  | { kind: 'unauthorized' }
  | { kind: 'forbidden'; message: string }
  | { kind: 'validation_failed' }
  | { kind: 'bad_request'; message: string }
  | { kind: 'not_found'; message: string }
  | { kind: 'conflict'; code: string; message: string }
  | { kind: 'named_error'; code: string; message: string; status: number };

export function spaceRespond<T>(ctx: RouteContext, r: SpaceRouteResult<T>): Response {
  switch (r.kind) {
    case 'ok':
      return success(r.data, r.message);
    case 'unauthorized':
      return ctx.errors.unauthorized();
    case 'forbidden':
      return errors.forbidden(r.message);
    case 'validation_failed':
      return ctx.errors.validationFailed();
    case 'bad_request':
      return errors.badRequest(r.message);
    case 'not_found':
      return errors.notFound(r.message);
    case 'conflict':
      return error(r.code, r.message, 409);
    case 'named_error':
      return error(r.code, r.message, r.status);
    default:
      return errors.badRequest('Unexpected error.');
  }
}

/**
 * Maps a Space service `errorCode` to a route result. Callers pass the
 * service's human-readable message through as the fallback.
 */
export function mapSpaceError(
  errorCode: SpaceErrorCode | undefined,
  message: string,
): SpaceRouteResult<never> {
  switch (errorCode) {
    case 'SPACE_NOT_FOUND':
    case 'CHANNEL_NOT_FOUND':
    case 'CATEGORY_NOT_FOUND':
    case 'MEMBER_NOT_FOUND':
    case 'INVITE_NOT_FOUND':
    case 'IDENTITY_NOT_FOUND':
    case 'MESSAGE_NOT_FOUND':
    case 'REACTION_NOT_FOUND':
    case 'PIN_NOT_FOUND':
    case 'ROLE_NOT_FOUND':
    case 'VOICE_SESSION_NOT_FOUND':
      return { kind: 'not_found', message };
    case 'TIER_REQUIRED':
    case 'INVITE_REQUIRED':
    case 'FORBIDDEN':
    case 'NOT_MEMBER':
    case 'NOT_AUTHORIZED':
    case 'NOT_AUTHOR':
    case 'OWNER_CANNOT_LEAVE':
    case 'CANNOT_REMOVE_OWNER':
    case 'SYSTEM_ROLE':
    case 'ESCALATION':
    case 'NOT_VOICE_CHANNEL':
      return { kind: 'forbidden', message };
    case 'LIVEKIT_UNAVAILABLE':
      return { kind: 'named_error', code: errorCode, message, status: 503 };
    case 'ROLE_IN_USE':
    case 'LAST_ADMIN':
      return { kind: 'named_error', code: errorCode, message, status: 403 };
    case 'SLUG_TAKEN':
      return { kind: 'conflict', code: 'SLUG_TAKEN', message };
    case 'SLUG_RESERVED':
    case 'SLUG_REQUIRED':
      return { kind: 'bad_request', message };
    case 'ALREADY_MEMBER':
      return { kind: 'conflict', code: 'ALREADY_MEMBER', message };
    case 'INVITE_EXISTS':
      return { kind: 'conflict', code: 'INVITE_EXISTS', message };
    case 'INVITE_NOT_PENDING':
      return { kind: 'conflict', code: 'INVITE_NOT_PENDING', message };
    case 'ENCRYPTION_NOT_SUPPORTED':
      return { kind: 'conflict', code: 'ENCRYPTION_NOT_SUPPORTED', message };
    case 'REACTION_EXISTS':
      return { kind: 'conflict', code: 'REACTION_EXISTS', message };
    case 'ALREADY_PINNED':
      return { kind: 'conflict', code: 'ALREADY_PINNED', message };
    case 'EDIT_CONFLICT':
      return { kind: 'conflict', code: 'EDIT_CONFLICT', message };
    case 'INVALID_ENCRYPTION':
    case 'INVALID_ID':
    case 'INVALID_CONTENT':
    case 'INVALID_PERMISSIONS':
    case 'CANNOT_INVITE_SELF':
    case 'INVALID_REPLY_TARGET':
    case 'MAX_EDITS_REACHED':
    case 'MESSAGE_DELETED':
      return { kind: 'bad_request', message };
    default:
      return { kind: 'bad_request', message };
  }
}
