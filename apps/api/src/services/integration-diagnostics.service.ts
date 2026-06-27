/**
 * Startup diagnostics for third-party integrations.
 *
 * Logs resolved environments, base URLs, and credential presence so operators
 * can confirm which external systems the API is wired to — without making
 * side-effect API calls.
 */

import { config } from '../config';
import { PLATFORM_SETTING_KEYS } from '../constants/platform-settings-keys';
import { getPlatformSettingsRepository } from '../repositories/platform-settings.repository';
import elog from '../utils/adieuuLogger';
import { resolveVerifyMyDeployEnv } from './age-verification/verifymy.provider';
import { getActiveProvider } from './age-verification/providers';
import {
  cyberTiplineBaseUrlForEnv,
  loadCyberTiplineCredentialsFromEnv,
  resolveCyberTiplineDeployEnv,
} from './cybertipline.service';
import { isGeoLookupEnabled } from './geo/geo-settings';

export type IntegrationEnvironmentsSnapshot = {
  nodeEnv: string;
  ncmecCyberTipline: {
    environment: string;
    baseUrl: string;
    host: string;
    credentialsConfigured: boolean;
  };
  ageVerification: {
    provider: string;
    environment: string;
    baseUrl: string;
    host: string;
    credentialsConfigured: boolean;
  };
  geoLookup: {
    enabled: boolean;
    baseUrl: string;
    host: string;
    credentialsConfigured: boolean;
  };
  livekit: {
    enabled: boolean;
    url?: string;
    host?: string;
    credentialsConfigured: boolean;
  };
  csamHashServices: {
    services: string[];
  };
  messaging: {
    emailProvider: string;
    emailRegion: string;
    smsProvider: string;
    smsCredentialsConfigured: boolean;
  };
  media: {
    region: string;
    mediaBucket?: string;
    e2eMediaBucket?: string;
    cdnBaseUrl?: string;
    cdnHost?: string;
  };
  klipy: {
    baseUrl: string;
    host: string;
    contentFilter: string;
    credentialsConfigured: boolean;
  };
  appUrls: {
    webAppUrl: string;
    apiBaseUrl: string;
    webHost: string;
    apiHost: string;
  };
};

function hostFromUrl(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

async function readCsamHashServices(): Promise<string[]> {
  try {
    const repo = getPlatformSettingsRepository();
    const doc = await repo.findByKey(PLATFORM_SETTING_KEYS.CSAM_HASH_SERVICES);
    if (doc?.valueType === 'stringArray' && Array.isArray(doc.value)) {
      return (doc.value as string[]).filter(Boolean);
    }
  } catch {
    // fall through — snapshot will show an empty list
  }
  return [];
}

/**
 * Builds a single snapshot of resolved third-party integration environments.
 * Does not perform external API requests.
 */
export async function buildIntegrationEnvironmentsSnapshot(): Promise<IntegrationEnvironmentsSnapshot> {
  const [
    ncmecEnvironment,
    ageVerificationProvider,
    verifyMyEnvironment,
    geoEnabled,
    csamServices,
  ] = await Promise.all([
    resolveCyberTiplineDeployEnv(),
    getActiveProvider(),
    resolveVerifyMyDeployEnv(),
    isGeoLookupEnabled(),
    readCsamHashServices(),
  ]);

  const ncmecBaseUrl = cyberTiplineBaseUrlForEnv(ncmecEnvironment);
  const verifyMyBaseUrl =
    verifyMyEnvironment === 'production'
      ? config.verifymy.productionBaseUrl
      : config.verifymy.sandboxBaseUrl;

  const livekitUrl = config.livekit.url || undefined;

  return {
    nodeEnv: config.env,
    ncmecCyberTipline: {
      environment: ncmecEnvironment,
      baseUrl: ncmecBaseUrl,
      host: hostFromUrl(ncmecBaseUrl),
      credentialsConfigured: loadCyberTiplineCredentialsFromEnv() !== null,
    },
    ageVerification: {
      provider: ageVerificationProvider.id,
      environment: verifyMyEnvironment,
      baseUrl: verifyMyBaseUrl,
      host: hostFromUrl(verifyMyBaseUrl),
      credentialsConfigured: !!(config.verifymy.apiKey && config.verifymy.apiSecret),
    },
    geoLookup: {
      enabled: geoEnabled,
      baseUrl: config.geo.iplocate.baseUrl,
      host: hostFromUrl(config.geo.iplocate.baseUrl),
      credentialsConfigured: config.geo.iplocate.apiKey.length > 0,
    },
    livekit: {
      enabled: config.livekit.enabled,
      url: livekitUrl,
      host: livekitUrl ? hostFromUrl(livekitUrl) : undefined,
      credentialsConfigured: !!(
        config.livekit.apiKey
        && config.livekit.apiSecret
        && config.livekit.url
      ),
    },
    csamHashServices: {
      services: csamServices,
    },
    messaging: {
      emailProvider: config.email.provider,
      emailRegion: config.email.awsRegion,
      smsProvider: config.sms.provider,
      smsCredentialsConfigured: !!(
        config.sms.textmagicUsername && config.sms.textmagicApiKey
      ),
    },
    media: {
      region: config.s3.region,
      mediaBucket: config.s3.mediaBucket || undefined,
      e2eMediaBucket: config.s3.e2eMediaBucket || undefined,
      cdnBaseUrl: config.cdn.mediaBaseUrl || undefined,
      cdnHost: config.cdn.mediaBaseUrl ? hostFromUrl(config.cdn.mediaBaseUrl) : undefined,
    },
    klipy: {
      baseUrl: config.klipy.baseUrl,
      host: hostFromUrl(config.klipy.baseUrl),
      contentFilter: config.klipy.contentFilter,
      credentialsConfigured: config.klipy.apiKey.length > 0,
    },
    appUrls: {
      webAppUrl: config.webAppUrl,
      apiBaseUrl: config.apiBaseUrl,
      webHost: hostFromUrl(config.webAppUrl),
      apiHost: hostFromUrl(config.apiBaseUrl),
    },
  };
}

/**
 * Logs resolved third-party integration environments at startup as one object.
 */
export async function logIntegrationEnvironments(): Promise<void> {
  const integrations = await buildIntegrationEnvironmentsSnapshot();
  elog.info('Integration environments', integrations);
}
