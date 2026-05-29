/**
 * Discriminated outcomes for conversation route controllers.
 *
 * @module routes/conversations/conversation-route-result
 */

import type { RouteContext } from '../../router/types';
import { getErrorMessage } from '../../i18n';
import { success, errors, error } from '../../utils/response';

export type ConversationRouteResult<T = unknown> =
  | { kind: 'ok'; data: T; message?: string }
  | { kind: 'unauthorized' }
  | { kind: 'forbidden'; message: string }
  | { kind: 'validation_failed' }
  | { kind: 'bad_request'; message: string }
  | { kind: 'not_found'; message: string }
  | { kind: 'named_error'; code: string; message: string; status: number }
  | { kind: 'rate_limited'; retryAfter: number };

export function conversationRespond<T>(ctx: RouteContext, r: ConversationRouteResult<T>): Response {
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
    case 'named_error':
      return error(r.code, r.message, r.status);
    case 'rate_limited':
      return error('RATE_LIMITED', getErrorMessage('rateLimited', ctx.locale), 429, {
        retryAfter: String(r.retryAfter),
      }, {
        'Retry-After': String(r.retryAfter),
      });
    default:
      return errors.badRequest('Unexpected error.');
  }
}
