/**
 * NCMEC CyberTipline Reporting API client.
 *
 * Implements the multi-step report flow: submit XML -> upload evidence -> file details -> finish.
 * Auth credentials are loaded from env vars (ECS api_container_secrets or local .env).
 * Active test vs production is resolved from platform settings; API hosts are hardcoded.
 *
 * API docs: https://report.cybertip.org/ispws/documentation
 */

import { PLATFORM_SETTING_KEYS } from '../constants/platform-settings-keys';
import { getPlatformSettingsRepository } from '../repositories/platform-settings.repository';

export const CYBERTIPLINE_TEST_BASE_URL = 'https://exttest.cybertip.org/ispws';
export const CYBERTIPLINE_PROD_BASE_URL = 'https://report.cybertip.org/ispws';

const TEST_BASE_URL = CYBERTIPLINE_TEST_BASE_URL;
const PROD_BASE_URL = CYBERTIPLINE_PROD_BASE_URL;
const DEFAULT_CYBERTIPLINE_TIMEOUT_MS = 60_000;

function getCyberTiplineTimeoutMs(): number {
  const configured = process.env.CYBERTIPLINE_TIMEOUT_MS;
  if (configured === undefined || configured.trim() === '') {
    return DEFAULT_CYBERTIPLINE_TIMEOUT_MS;
  }
  const parsed = Number(configured);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_CYBERTIPLINE_TIMEOUT_MS;
}

export type CyberTiplineDeployEnv = 'test' | 'production';

/**
 * Resolves the active NCMEC CyberTipline environment ('test' | 'production').
 * Platform setting overrides CYBERTIPLINE_ENV. API base URLs are hardcoded per env.
 */
export async function resolveCyberTiplineDeployEnv(): Promise<CyberTiplineDeployEnv> {
  try {
    const repo = getPlatformSettingsRepository();
    const doc = await repo.findByKey(PLATFORM_SETTING_KEYS.NCMEC_CYBERTIPLINE_ENV);
    if (doc?.valueType === 'string' && (doc.value === 'test' || doc.value === 'production')) {
      return doc.value;
    }
  } catch {
    // fall through
  }

  const fromEnv = process.env.CYBERTIPLINE_ENV?.trim();
  if (fromEnv === 'test' || fromEnv === 'production') {
    return fromEnv;
  }

  return 'test';
}

export function cyberTiplineBaseUrlForEnv(env: CyberTiplineDeployEnv): string {
  const url = env === 'production' ? PROD_BASE_URL : TEST_BASE_URL;
  return url.replace(/\/$/, '');
}

function baseUrlHost(baseUrl: string): string {
  try {
    return new URL(baseUrl).host;
  } catch {
    return baseUrl;
  }
}

/**
 * When CYBERTIPLINE_ENV is set, ensures the configured base URL matches the intended NCMEC environment.
 */
export function assertCyberTiplineEnvironment(baseUrl: string): void {
  const expected = process.env.CYBERTIPLINE_ENV as CyberTiplineDeployEnv | undefined;
  if (!expected || (expected !== 'test' && expected !== 'production')) return;

  const host = baseUrlHost(baseUrl);
  const isTest = host === 'exttest.cybertip.org';
  const isProd = host === 'report.cybertip.org';

  if (expected === 'test' && !isTest) {
    throw new Error(
      `CyberTipline: CYBERTIPLINE_ENV=test requires exttest base URL, got host ${host}`,
    );
  }
  if (expected === 'production' && !isProd) {
    throw new Error(
      `CyberTipline: CYBERTIPLINE_ENV=production requires report.cybertip.org base URL, got host ${host}`,
    );
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CyberTiplineCredentials {
  username: string;
  password: string;
  reporterFirstName: string;
  reporterLastName: string;
  reporterEmail: string;
  companyTemplate?: string;
  termsOfServiceUrl?: string;
  legalUrl?: string;
}

const REQUIRED_CREDENTIAL_FIELDS = [
  'username',
  'password',
  'reporterFirstName',
  'reporterLastName',
  'reporterEmail',
] as const satisfies readonly (keyof CyberTiplineCredentials)[];

export function parseCyberTiplineCredentials(raw: string): CyberTiplineCredentials {
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  for (const field of REQUIRED_CREDENTIAL_FIELDS) {
    const value = parsed[field];
    if (
      value === undefined ||
      value === null ||
      (typeof value === 'string' && value.trim() === '')
    ) {
      throw new Error(`CyberTipline: secret missing required field "${field}"`);
    }
  }
  return {
    username: String(parsed.username),
    password: String(parsed.password),
    reporterFirstName: String(parsed.reporterFirstName),
    reporterLastName: String(parsed.reporterLastName),
    reporterEmail: String(parsed.reporterEmail),
    companyTemplate:
      typeof parsed.companyTemplate === 'string' ? parsed.companyTemplate : undefined,
    termsOfServiceUrl:
      typeof parsed.termsOfServiceUrl === 'string' ? parsed.termsOfServiceUrl : undefined,
    legalUrl: typeof parsed.legalUrl === 'string' ? parsed.legalUrl : undefined,
  };
}

export interface CyberTiplineIpCapture {
  ipAddress: string;
  eventName?: 'Login' | 'Registration' | 'Purchase' | 'Upload' | 'Other' | 'Unknown';
  dateTime?: string;
}

export interface CyberTiplineReportedPerson {
  espIdentifier?: string;
  screenName?: string;
  displayName?: string;
  bio?: string;
  ipCaptureEvents?: CyberTiplineIpCapture[];
  permanentlyDisabled?: boolean;
  permanentlyDisabledDate?: string;
}

export interface CyberTiplineFileDetailsInput {
  reportId: string;
  fileId: string;
  originalFileName?: string;
  uploadedDateTime?: string;
  ipCaptureEvent?: CyberTiplineIpCapture;
  additionalInfo?: string;
  viewedByEsp?: boolean;
  industryClassification?: 'A1' | 'A2' | 'B1' | 'B2';
  originalHash?: { hashType: string; hashValue: string };
}

export interface CyberTiplineReportInput {
  incidentType: string;
  incidentDateTime: string;
  additionalInfoSummary?: string;
  reportedPerson?: CyberTiplineReportedPerson;
  additionalNotes?: string;
}

export interface CyberTiplineResponse {
  responseCode: number;
  responseDescription: string;
  reportId?: string;
  fileId?: string;
  hash?: string;
}

export interface CyberTiplineFinishResponse {
  responseCode: number;
  reportId: string;
  fileIds: string[];
}

export interface CyberTiplineSubmitResult {
  ncmecReportId: string;
  fileIds: string[];
}

// ---------------------------------------------------------------------------
// XML helpers
// ---------------------------------------------------------------------------

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function xmlTag(name: string, value: string | undefined | null, attrs?: string): string {
  if (value == null || value === '') return '';
  const attrStr = attrs ? ` ${attrs}` : '';
  return `<${name}${attrStr}>${escapeXml(value)}</${name}>`;
}

function xmlBool(name: string, value: boolean | undefined, attrs?: string): string {
  if (value == null) return '';
  const attrStr = attrs ? ` ${attrs}` : '';
  return `<${name}${attrStr}>${value}</${name}>`;
}

function buildIpCaptureXml(ip: CyberTiplineIpCapture): string {
  return [
    '<ipCaptureEvent>',
    xmlTag('ipAddress', ip.ipAddress),
    xmlTag('eventName', ip.eventName),
    xmlTag('dateTime', ip.dateTime),
    '</ipCaptureEvent>',
  ].filter(Boolean).join('\n');
}

// ---------------------------------------------------------------------------
// XML builders
// ---------------------------------------------------------------------------

function buildReportXml(
  report: CyberTiplineReportInput,
  creds: CyberTiplineCredentials,
): string {
  const person = report.reportedPerson;

  const reportedPersonXml = person ? [
    '<personOrUserReported>',
    xmlTag('espIdentifier', person.espIdentifier),
    xmlTag('screenName', person.screenName),
    person.displayName ? xmlTag('displayName', person.displayName) : '',
    person.bio ? xmlTag('userBio', person.bio) : '',
    ...(person.ipCaptureEvents?.map(buildIpCaptureXml) ?? []),
    person.permanentlyDisabled != null
      ? xmlBool(
          'permanentlyDisabled',
          person.permanentlyDisabled,
          person.permanentlyDisabledDate
            ? `disabledDate="${escapeXml(person.permanentlyDisabledDate)}"`
            : undefined,
        )
      : '',
    '</personOrUserReported>',
  ].filter(Boolean).join('\n') : '';

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<report xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"',
    '        xsi:noNamespaceSchemaLocation="https://report.cybertip.org/ispws/xsd">',
    '<incidentSummary>',
    xmlTag('incidentType', report.incidentType),
    xmlTag('incidentDateTime', report.incidentDateTime),
    report.additionalInfoSummary ? xmlTag('additionalInfo', report.additionalInfoSummary) : '',
    '</incidentSummary>',
    '<reporter>',
    '<reportingPerson>',
    xmlTag('firstName', creds.reporterFirstName),
    xmlTag('lastName', creds.reporterLastName),
    xmlTag('email', creds.reporterEmail),
    '</reportingPerson>',
    creds.companyTemplate ? xmlTag('companyTemplate', creds.companyTemplate) : '',
    creds.termsOfServiceUrl ? xmlTag('termsOfService', creds.termsOfServiceUrl) : '',
    creds.legalUrl ? xmlTag('legalURL', creds.legalUrl) : '',
    '</reporter>',
    reportedPersonXml,
    report.additionalNotes ? xmlTag('additionalNotes', report.additionalNotes) : '',
    '</report>',
  ].filter(Boolean).join('\n');

  return xml;
}

function buildFileDetailsXml(details: CyberTiplineFileDetailsInput): string {
  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<fileDetails xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"',
    '             xsi:noNamespaceSchemaLocation="https://report.cybertip.org/ispws/xsd">',
    xmlTag('reportId', details.reportId),
    xmlTag('fileId', details.fileId),
    xmlTag('originalFileName', details.originalFileName),
    xmlTag('uploadedDateTime', details.uploadedDateTime),
    details.ipCaptureEvent ? buildIpCaptureXml(details.ipCaptureEvent) : '',
    details.viewedByEsp != null ? xmlBool('viewedByEsp', details.viewedByEsp) : '',
    details.industryClassification ? xmlTag('industryClassification', details.industryClassification) : '',
    details.originalHash
      ? `<originalHash hashType="${escapeXml(details.originalHash.hashType)}">${escapeXml(details.originalHash.hashValue)}</originalHash>`
      : '',
    details.additionalInfo ? xmlTag('additionalInfo', details.additionalInfo) : '',
    '</fileDetails>',
  ].filter(Boolean).join('\n');

  return xml;
}

// ---------------------------------------------------------------------------
// Response parsing
// ---------------------------------------------------------------------------

function parseResponseXml(xml: string): CyberTiplineResponse {
  const code = xml.match(/<responseCode>(\d+)<\/responseCode>/);
  const desc = xml.match(/<responseDescription>(.*?)<\/responseDescription>/s);
  const reportId = xml.match(/<reportId>(\d+)<\/reportId>/);
  const fileId = xml.match(/<fileId>(.*?)<\/fileId>/);
  const hash = xml.match(/<hash>(.*?)<\/hash>/);

  return {
    responseCode: code?.[1] ? parseInt(code[1], 10) : -1,
    responseDescription: desc?.[1] ?? 'Unknown',
    reportId: reportId?.[1],
    fileId: fileId?.[1],
    hash: hash?.[1],
  };
}

function parseFinishResponseXml(xml: string): CyberTiplineFinishResponse {
  const code = xml.match(/<responseCode>(\d+)<\/responseCode>/);
  const reportId = xml.match(/<reportId>(\d+)<\/reportId>/);
  const fileIds: string[] = [];
  const fileIdMatches = xml.matchAll(/<fileId>(.*?)<\/fileId>/g);
  for (const m of fileIdMatches) {
    if (m[1]) {
      fileIds.push(m[1]);
    }
  }

  return {
    responseCode: code?.[1] ? parseInt(code[1], 10) : -1,
    reportId: reportId?.[1] ?? '',
    fileIds,
  };
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

function envOrTest(key: string, testKey: string): string | undefined {
  const v = process.env[key]?.trim();
  if (v) return v;
  return process.env[testKey]?.trim() || undefined;
}

/** Credentials from env / secrets. Same ESP account for test and production endpoints. */
export function loadCyberTiplineCredentialsFromEnv(): CyberTiplineCredentials | null {
  const username = envOrTest('CYBERTIPLINE_USERNAME', 'CYBERTIPLINE_TEST_USERNAME');
  const password = envOrTest('CYBERTIPLINE_PASSWORD', 'CYBERTIPLINE_TEST_PASSWORD');
  const reporterFirstName = envOrTest(
    'CYBERTIPLINE_REPORTER_FIRST_NAME',
    'CYBERTIPLINE_TEST_REPORTER_FIRST_NAME',
  );
  const reporterLastName = envOrTest(
    'CYBERTIPLINE_REPORTER_LAST_NAME',
    'CYBERTIPLINE_TEST_REPORTER_LAST_NAME',
  );
  const reporterEmail = envOrTest(
    'CYBERTIPLINE_REPORTER_EMAIL',
    'CYBERTIPLINE_TEST_REPORTER_EMAIL',
  );

  if (!username || !password || !reporterFirstName || !reporterLastName || !reporterEmail) {
    return null;
  }

  return {
    username,
    password,
    reporterFirstName,
    reporterLastName,
    reporterEmail,
    companyTemplate: process.env.CYBERTIPLINE_COMPANY_TEMPLATE?.trim() || undefined,
    termsOfServiceUrl: process.env.CYBERTIPLINE_TERMS_OF_SERVICE_URL?.trim() || undefined,
    legalUrl: process.env.CYBERTIPLINE_LEGAL_URL?.trim() || undefined,
  };
}

export class CyberTiplineClient {
  private baseUrl: string;
  private credentials: CyberTiplineCredentials | null = null;

  constructor(opts?: { baseUrl?: string; credentials?: CyberTiplineCredentials }) {
    this.baseUrl = (opts?.baseUrl ?? TEST_BASE_URL).replace(/\/$/, '');
    if (opts?.credentials) {
      this.credentials = opts.credentials;
    }
  }

  private async getCredentials(): Promise<CyberTiplineCredentials> {
    if (this.credentials) return this.credentials;

    const fromEnv = loadCyberTiplineCredentialsFromEnv();
    if (fromEnv) {
      this.credentials = fromEnv;
      return fromEnv;
    }

    throw new Error(
      'CyberTipline: set CYBERTIPLINE_USERNAME, CYBERTIPLINE_PASSWORD, and reporter fields (via env or api_container_secrets)',
    );
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }

  private async fetchWithTimeout(path: string, init: RequestInit): Promise<Response> {
    const timeoutMs = getCyberTiplineTimeoutMs();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      return await fetch(`${this.baseUrl}${path}`, {
        ...init,
        signal: controller.signal,
      });
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error(`CyberTipline request timed out after ${timeoutMs}ms`);
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }

  private async authHeader(): Promise<string> {
    const creds = await this.getCredentials();
    const encoded = Buffer.from(`${creds.username}:${creds.password}`).toString('base64');
    return `Basic ${encoded}`;
  }

  async checkStatus(): Promise<CyberTiplineResponse> {
    const auth = await this.authHeader();
    const resp = await this.fetchWithTimeout('/status', {
      method: 'GET',
      headers: { Authorization: auth },
    });
    const body = await resp.text();
    return parseResponseXml(body);
  }

  async submitReport(report: CyberTiplineReportInput): Promise<CyberTiplineResponse> {
    const creds = await this.getCredentials();
    const xml = buildReportXml(report, creds);
    const auth = await this.authHeader();

    const resp = await this.fetchWithTimeout('/submit', {
      method: 'POST',
      headers: {
        Authorization: auth,
        'Content-Type': 'text/xml; charset=utf-8',
      },
      body: xml,
    });

    const body = await resp.text();
    const parsed = parseResponseXml(body);

    if (parsed.responseCode !== 0) {
      throw new CyberTiplineError('submit', parsed);
    }

    return parsed;
  }

  async uploadFile(
    ncmecReportId: string,
    fileData: Buffer | Uint8Array | ReadableStream,
    fileName: string,
  ): Promise<CyberTiplineResponse> {
    const auth = await this.authHeader();

    const formData = new FormData();
    formData.append('id', ncmecReportId);

    let blob: Blob;
    if (fileData instanceof Buffer || fileData instanceof Uint8Array) {
      blob = new Blob([fileData]);
    } else {
      const chunks: Uint8Array[] = [];
      const reader = (fileData as ReadableStream<Uint8Array>).getReader();
      let done = false;
      while (!done) {
        const result = await reader.read();
        done = result.done;
        if (result.value) chunks.push(result.value);
      }
      blob = new Blob(chunks);
    }

    formData.append('file', blob, fileName);

    const resp = await this.fetchWithTimeout('/upload', {
      method: 'POST',
      headers: { Authorization: auth },
      body: formData,
    });

    const body = await resp.text();
    const parsed = parseResponseXml(body);

    if (parsed.responseCode !== 0) {
      throw new CyberTiplineError('upload', parsed);
    }

    return parsed;
  }

  async submitFileDetails(details: CyberTiplineFileDetailsInput): Promise<CyberTiplineResponse> {
    const xml = buildFileDetailsXml(details);
    const auth = await this.authHeader();

    const resp = await this.fetchWithTimeout('/fileinfo', {
      method: 'POST',
      headers: {
        Authorization: auth,
        'Content-Type': 'text/xml; charset=utf-8',
      },
      body: xml,
    });

    const body = await resp.text();
    const parsed = parseResponseXml(body);

    if (parsed.responseCode !== 0) {
      throw new CyberTiplineError('fileinfo', parsed);
    }

    return parsed;
  }

  async finishReport(ncmecReportId: string): Promise<CyberTiplineFinishResponse> {
    const auth = await this.authHeader();

    const formData = new FormData();
    formData.append('id', ncmecReportId);

    const resp = await this.fetchWithTimeout('/finish', {
      method: 'POST',
      headers: { Authorization: auth },
      body: formData,
    });

    const body = await resp.text();
    const parsed = parseFinishResponseXml(body);

    if (parsed.responseCode !== 0) {
      throw new CyberTiplineError('finish', {
        responseCode: parsed.responseCode,
        responseDescription: `Failed to finish report ${ncmecReportId}`,
      });
    }

    return parsed;
  }

  async retractReport(ncmecReportId: string): Promise<CyberTiplineResponse> {
    const auth = await this.authHeader();

    const formData = new FormData();
    formData.append('id', ncmecReportId);

    const resp = await this.fetchWithTimeout('/retract', {
      method: 'POST',
      headers: { Authorization: auth },
      body: formData,
    });

    const body = await resp.text();
    return parseResponseXml(body);
  }

  /**
   * Full report submission flow: submit -> upload file -> file details -> finish.
   * On failure after submit, retracts the report before throwing.
   */
  async submitFullReport(
    report: CyberTiplineReportInput,
    evidenceFile?: { data: Buffer | Uint8Array | ReadableStream; fileName: string; details?: Omit<CyberTiplineFileDetailsInput, 'reportId' | 'fileId'> },
  ): Promise<CyberTiplineSubmitResult> {
    console.info('[CyberTipline] submitFullReport', {
      baseUrlHost: baseUrlHost(this.baseUrl),
      hasEvidence: Boolean(evidenceFile),
      incidentType: report.incidentType,
    });

    const submitResp = await this.submitReport(report);
    const ncmecReportId = submitResp.reportId!;

    try {
      const fileIds: string[] = [];

      if (evidenceFile) {
        const uploadResp = await this.uploadFile(ncmecReportId, evidenceFile.data, evidenceFile.fileName);
        const fileId = uploadResp.fileId!;
        fileIds.push(fileId);

        if (evidenceFile.details) {
          await this.submitFileDetails({
            ...evidenceFile.details,
            reportId: ncmecReportId,
            fileId,
          });
        }
      }

      const finishResp = await this.finishReport(ncmecReportId);
      return {
        ncmecReportId: finishResp.reportId,
        fileIds: finishResp.fileIds,
      };
    } catch (err) {
      try { await this.retractReport(ncmecReportId); } catch { /* best-effort retract */ }
      throw err;
    }
  }
}

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

export class CyberTiplineError extends Error {
  public step: string;
  public responseCode: number;
  public responseDescription: string;

  constructor(step: string, response: Pick<CyberTiplineResponse, 'responseCode' | 'responseDescription'>) {
    super(`CyberTipline ${step} failed: code=${response.responseCode} ${response.responseDescription}`);
    this.name = 'CyberTiplineError';
    this.step = step;
    this.responseCode = response.responseCode;
    this.responseDescription = response.responseDescription;
  }
}

// ---------------------------------------------------------------------------
// Singleton + exported helpers for XML (useful in tests)
// ---------------------------------------------------------------------------

let clientInstance: CyberTiplineClient | null = null;

/** @deprecated Prefer createCyberTiplineClient() so platform settings apply per submission. */
export function getCyberTiplineClient(): CyberTiplineClient {
  if (!clientInstance) {
    clientInstance = new CyberTiplineClient();
  }
  return clientInstance;
}

/** Builds a client using the platform NCMEC environment (hardcoded base URL) and shared credentials. */
export async function createCyberTiplineClient(): Promise<CyberTiplineClient> {
  const env = await resolveCyberTiplineDeployEnv();
  const baseUrl = cyberTiplineBaseUrlForEnv(env);
  const credentials = loadCyberTiplineCredentialsFromEnv();
  return new CyberTiplineClient({
    baseUrl,
    ...(credentials ? { credentials } : {}),
  });
}

export { buildReportXml, buildFileDetailsXml, parseResponseXml, parseFinishResponseXml, escapeXml };
