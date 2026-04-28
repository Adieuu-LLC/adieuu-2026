/**
 * VerifyMy v3 age verification provider.
 *
 * Implements the AgeVerificationProvider interface using the VerifyMy v3 API:
 * - POST /api/v3/verifications (start, with optional background check via user_info)
 * - GET  /api/v3/verifications/{id} (status polling)
 *
 * @see https://verifymy.io/developer-documentation/age-verification-estimation/apis/starting-a-verification/
 * @see https://verifymy.io/developer-documentation/age-verification-estimation/apis/status/
 */

import { createHash, createHmac, createCipheriv, randomBytes } from 'crypto';
import { config } from '../../config';
import { PLATFORM_SETTING_KEYS } from '../../constants/platform-settings-keys';
import { getPlatformSettingsRepository } from '../../repositories/platform-settings.repository';
import elog from '../../utils/adieuuLogger';
import type {
  AgeVerificationProvider,
  StartVerificationInput,
  StartVerificationResult,
  VerificationStatusResult,
  MethodAttemptInfo,
  ProviderVerificationStatus,
} from './provider';

const PROVIDER_ID = 'verifymy';

interface VerifyMyStartResponse {
  verification_id: string;
  verification_status: string;
  start_verification_url?: string;
}

interface VerifyMyStatusResponse {
  id: string;
  user_id?: string;
  status: string;
  approval_method?: string;
  threshold?: number;
  background_check?: string | null;
  created_at?: string;
  expires_at?: string;
  updated_at?: string;
  age_gate?: Record<string, {
    enabled: boolean;
    max_attempts: number;
    remaining_attempts: number;
  }>;
}

function mapStatus(raw: string): ProviderVerificationStatus {
  switch (raw) {
    case 'approved': return 'approved';
    case 'failed': return 'failed';
    case 'expired': return 'expired';
    case 'pending': return 'pending';
    default: return 'started';
  }
}

/**
 * Resolves the active VerifyMy environment ('sandbox' | 'production').
 * Platform setting overrides the env default.
 */
async function resolveEnvironment(): Promise<'sandbox' | 'production'> {
  try {
    const repo = getPlatformSettingsRepository();
    const doc = await repo.findByKey(PLATFORM_SETTING_KEYS.AGE_VERIFICATION_VERIFYMY_ENV);
    if (doc?.valueType === 'string' && (doc.value === 'sandbox' || doc.value === 'production')) {
      return doc.value;
    }
  } catch {
    // fall through
  }
  return config.verifymy.environment;
}

function getBaseUrl(env: 'sandbox' | 'production'): string {
  return env === 'production'
    ? config.verifymy.productionBaseUrl
    : config.verifymy.sandboxBaseUrl;
}

function computeHmac(content: string): string {
  return createHmac('sha256', config.verifymy.apiSecret)
    .update(content)
    .digest('hex');
}

function buildAuthHeader(hmacSignature: string): string {
  return `hmac ${config.verifymy.apiKey}:${hmacSignature}`;
}

/**
 * Encrypts a string using AES-256-CFB with a key derived from SHA-256(apiSecret).
 * IV is prepended to the ciphertext, then base64-encoded.
 */
function encryptUserInfo(plaintext: string): string {
  const key = createHash('sha256').update(config.verifymy.apiSecret).digest();
  const iv = randomBytes(16);
  const cipher = createCipheriv('aes-256-cfb', key, iv);
  const encrypted = Buffer.concat([iv, cipher.update(plaintext, 'utf8'), cipher.final()]);
  return encrypted.toString('base64');
}

export class VerifyMyProvider implements AgeVerificationProvider {
  readonly id = PROVIDER_ID;

  async startVerification(input: StartVerificationInput): Promise<StartVerificationResult> {
    const env = await resolveEnvironment();
    const baseUrl = getBaseUrl(env);

    const payload: Record<string, unknown> = {
      redirect_url: input.redirectUrl,
      country: input.country.toLowerCase(),
      external_user_id: input.externalUserId,
    };

    if (input.method) {
      payload.method = input.method;
    }

    if (input.userInfo) {
      const userInfo: Record<string, string> = {};
      if (input.userInfo.email) {
        userInfo.email = encryptUserInfo(input.userInfo.email);
      }
      if (input.userInfo.phone) {
        userInfo.phone = encryptUserInfo(input.userInfo.phone);
      }
      if (Object.keys(userInfo).length > 0) {
        payload.user_info = userInfo;
      }
    }

    if (input.webhookUrl) {
      payload.webhook = input.webhookUrl;
      if (input.webhookNotificationLevel) {
        payload.webhook_notification_level = input.webhookNotificationLevel;
      }
    }

    const body = JSON.stringify(payload);
    const hmac = computeHmac(body);

    const response = await fetch(`${baseUrl}/api/v3/verifications`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: buildAuthHeader(hmac),
      },
      body,
      signal: AbortSignal.timeout(config.verifymy.timeoutMs),
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      elog.warn('VerifyMy startVerification failed', {
        status: response.status,
        body: errorBody.slice(0, 500),
      });
      throw new Error(`VerifyMy API error: ${response.status}`);
    }

    const data = (await response.json()) as VerifyMyStartResponse;

    return {
      verificationId: data.verification_id,
      status: mapStatus(data.verification_status),
      redirectUrl: data.start_verification_url,
    };
  }

  async getVerificationStatus(verificationId: string): Promise<VerificationStatusResult> {
    const env = await resolveEnvironment();
    const baseUrl = getBaseUrl(env);

    const requestUri = `/api/v3/verifications/${encodeURIComponent(verificationId)}`;
    const url = `${baseUrl}${requestUri}`;

    // GET requests sign the request URI, not the body
    // @see https://verifymy.io/developer-documentation/age-verification-estimation/apis/redirect-urls/
    const hmac = computeHmac(requestUri);

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: buildAuthHeader(hmac),
      },
      signal: AbortSignal.timeout(config.verifymy.timeoutMs),
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      elog.warn('VerifyMy getVerificationStatus failed', {
        status: response.status,
        verificationId,
        body: errorBody.slice(0, 500),
      });
      throw new Error(`VerifyMy API error: ${response.status}`);
    }

    const data = (await response.json()) as VerifyMyStatusResponse;

    let methodAttempts: Record<string, MethodAttemptInfo> | undefined;
    if (data.age_gate) {
      methodAttempts = {};
      for (const [key, val] of Object.entries(data.age_gate)) {
        methodAttempts[key] = {
          enabled: val.enabled,
          maxAttempts: val.max_attempts,
          remaining: val.remaining_attempts,
        };
      }
    }

    return {
      verificationId: data.id,
      status: mapStatus(data.status),
      approvalMethod: data.approval_method,
      threshold: data.threshold,
      backgroundCheck: data.background_check,
      createdAt: data.created_at,
      expiresAt: data.expires_at,
      methodAttempts,
    };
  }
}
