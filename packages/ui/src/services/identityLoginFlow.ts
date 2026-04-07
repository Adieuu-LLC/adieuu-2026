import type { LoginIdentityResult, SuspensionInfo } from '../hooks/useIdentity.types';

export interface LoginFailureResolution {
  result: LoginIdentityResult;
  suspensionInfo?: SuspensionInfo;
}

export function resolveLoginFailure(
  errorMessage: string,
  serverCode?: string,
  details?: {
    moderationReason?: string;
    moderationReportId?: string;
    suspendedUntil?: string;
  }
): LoginFailureResolution {
  if (serverCode === 'IDENTITY_SUSPENDED' || serverCode === 'IDENTITY_BANNED') {
    const info: SuspensionInfo = {
      type: serverCode === 'IDENTITY_BANNED' ? 'banned' : 'suspended',
      reason: details?.moderationReason,
      reportId: details?.moderationReportId,
      suspendedUntil: details?.suspendedUntil,
    };
    return {
      suspensionInfo: info,
      result: {
        success: false,
        error: errorMessage,
        errorCode: serverCode,
        suspensionInfo: info,
      },
    };
  }

  let errorCode: LoginIdentityResult['errorCode'] = 'INVALID_PASSPHRASE';
  if (serverCode === 'LOCKED_OUT' || errorMessage.includes('locked')) {
    errorCode = 'LOCKED_OUT';
  } else if (serverCode === 'RATE_LIMITED' || errorMessage.includes('wait')) {
    errorCode = 'RATE_LIMITED';
  }
  return {
    result: {
      success: false,
      error: errorMessage,
      errorCode,
    },
  };
}
