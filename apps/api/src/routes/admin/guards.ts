/**
 * Shared platform-permission route guards for admin modules.
 *
 * @module routes/admin/guards
 */

import type { RouteContext } from '../../router';
import { requireIdentitySession } from '../../services/session.service';
import {
  gatePlatformPermissionSession,
  type AdminGateFailureReason,
} from './controller';
import type { PlatformPermission } from '../../constants/platform-permissions';
import type { PlatformCapabilities } from '../../services/platform-capabilities.service';
import type { IdentitySessionData } from '../../services/session.service';

export type AdminRouteContext =
  | {
      ok: true;
      session: IdentitySessionData;
      caps: PlatformCapabilities;
    }
  | {
      ok: false;
      response: Response;
    };

export async function requireAdminRouteContext(
  ctx: RouteContext,
  permission: PlatformPermission,
): Promise<AdminRouteContext> {
  const session = await requireIdentitySession(ctx.request);
  const gate = await gatePlatformPermissionSession(session, permission);
  if (!gate.ok) {
    return {
      ok: false as const,
      response:
        gate.reason === 'unauthorized' ? ctx.errors.unauthorized() : ctx.errors.forbidden(),
    };
  }
  return { ok: true as const, session: gate.session, caps: gate.caps };
}

export function mapAdminGateFailure(reason: AdminGateFailureReason): 'unauthorized' | 'forbidden' {
  return reason === 'unauthorized' ? 'unauthorized' : 'forbidden';
}
