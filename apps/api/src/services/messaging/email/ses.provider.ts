/**
 * @fileoverview AWS SES Email Provider
 *
 * Sends emails via Amazon Simple Email Service using direct API calls
 * with AWS Signature v4 authentication (no heavy SDK dependency).
 *
 * @module services/messaging/email/ses
 *
 * @remarks
 * This implementation uses the native `fetch` API with manual AWS Signature v4
 * signing to avoid the large AWS SDK dependency. This keeps the bundle size
 * small while still providing full SES functionality.
 *
 * Required environment variables:
 * - `AWS_ACCESS_KEY_ID`: AWS access key
 * - `AWS_SECRET_ACCESS_KEY`: AWS secret key
 * - `AWS_REGION`: AWS region (e.g., 'us-east-1')
 * - `EMAIL_FROM_ADDRESS`: Verified sender email address
 *
 * @see https://docs.aws.amazon.com/ses/latest/APIReference/API_SendEmail.html
 *
 * @example
 * ```typescript
 * import { SesEmailProvider } from './ses.provider';
 *
 * const provider = new SesEmailProvider();
 *
 * if (provider.isConfigured()) {
 *   const result = await provider.send({
 *     to: 'user@example.com',
 *     subject: 'Hello',
 *     text: 'World',
 *   });
 * }
 * ```
 */

import { config } from '../../../config';
import type { IEmailProvider, EmailOptions, EmailResult } from '../types';
import elog from '../../../utils/adieuuLogger';

/**
 * AWS SES Email Provider
 *
 * Implements the IEmailProvider interface for sending emails via
 * Amazon Simple Email Service.
 *
 * @remarks
 * Uses lightweight fetch-based implementation with manual AWS Signature v4
 * signing instead of the full AWS SDK to minimize bundle size.
 *
 * Features:
 * - Supports both text and HTML email bodies
 * - Automatic AWS Signature v4 request signing
 * - Proper error handling and logging
 * - Returns message ID for tracking
 *
 * @example
 * ```typescript
 * const ses = new SesEmailProvider();
 *
 * if (!ses.isConfigured()) {
 *   throw new Error('SES not configured');
 * }
 *
 * const result = await ses.send({
 *   to: 'user@example.com',
 *   subject: 'Your verification code',
 *   text: 'Your code is: 123456',
 *   html: '<p>Your code is: <strong>123456</strong></p>',
 * });
 *
 * if (result.success) {
 *   console.log(`Sent with ID: ${result.messageId}`);
 * }
 * ```
 */
export class SesEmailProvider implements IEmailProvider {
  /** Provider name for identification */
  readonly name = 'ses';

  /** AWS region for SES endpoint */
  private readonly region: string;

  /** AWS access key ID */
  private readonly accessKeyId: string | undefined;

  /** AWS secret access key */
  private readonly secretAccessKey: string | undefined;

  /** Verified sender email address */
  private readonly fromAddress: string;

  /** Friendly sender name shown in email clients */
  private readonly fromName: string;

  /**
   * Creates a new SES email provider instance
   *
   * Reads configuration from environment variables via the config module.
   */
  constructor() {
    this.region = config.email.awsRegion;
    this.accessKeyId = config.email.awsAccessKeyId;
    this.secretAccessKey = config.email.awsSecretAccessKey;
    this.fromAddress = config.email.fromAddress;
    this.fromName = config.email.fromName;
  }

  /**
   * Checks if the provider has required credentials configured
   *
   * @returns True if both access key ID and secret key are set
   *
   * @example
   * ```typescript
   * const ses = new SesEmailProvider();
   * if (!ses.isConfigured()) {
   *   console.warn('SES credentials not configured');
   * }
   * ```
   */
  isConfigured(): boolean {
    return !!(this.accessKeyId && this.secretAccessKey);
  }

  /**
   * Sends an email via AWS SES
   *
   * Constructs and signs an SES SendEmail API request, then sends it
   * using the fetch API.
   *
   * @param options - Email options including recipient, subject, and body
   * @returns Promise resolving to send result with success status and message ID
   *
   * @example
   * ```typescript
   * const result = await ses.send({
   *   to: 'user@example.com',
   *   subject: 'Welcome',
   *   text: 'Welcome to our app!',
   * });
   * ```
   */
  async send(options: EmailOptions): Promise<EmailResult> {
    if (!this.isConfigured()) {
      elog.warn('SES not configured - email not sent');
      return {
        success: false,
        error: 'SES credentials not configured',
      };
    }

    try {
      // Build SES SendEmail request
      const endpoint = `https://email.${this.region}.amazonaws.com/`;
      const body = this.buildSendEmailBody(options);

      // Sign the request with AWS Signature v4
      const headers = await this.signRequest('POST', endpoint, body);

      const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body,
      });

      if (!response.ok) {
        const errorText = await response.text();
        elog.error('SES send failed', { status: response.status, error: errorText });
        return {
          success: false,
          error: `SES error: ${response.status}`,
        };
      }

      const responseText = await response.text();
      // Parse MessageId from XML response
      const messageIdMatch = responseText.match(/<MessageId>([^<]+)<\/MessageId>/);
      const messageId = messageIdMatch?.[1];

      return {
        success: true,
        messageId,
      };
    } catch (error) {
      elog.error('SES send error', { error });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Builds the URL-encoded request body for SES SendEmail API
   *
   * @param options - Email options
   * @returns URL-encoded string suitable for SES API
   * @internal
   */
  private buildSendEmailBody(options: EmailOptions): string {
    const params = new URLSearchParams();
    params.append('Action', 'SendEmail');
    const source = this.fromName
      ? `"${this.fromName}" <${this.fromAddress}>`
      : this.fromAddress;
    params.append('Source', source);
    params.append('Destination.ToAddresses.member.1', options.to);
    params.append('Message.Subject.Data', options.subject);
    params.append('Message.Body.Text.Data', options.text);

    if (options.html) {
      params.append('Message.Body.Html.Data', options.html);
    }

    params.append('Version', '2010-12-01');

    return params.toString();
  }

  /**
   * Signs a request with AWS Signature Version 4
   *
   * Implements the AWS Signature v4 algorithm for authenticating
   * requests to AWS services.
   *
   * @param method - HTTP method (e.g., 'POST')
   * @param endpoint - Full URL of the SES endpoint
   * @param body - Request body to sign
   * @returns Headers object with Authorization and required AWS headers
   *
   * @see https://docs.aws.amazon.com/general/latest/gr/sigv4_signing.html
   * @internal
   */
  private async signRequest(
    method: string,
    endpoint: string,
    body: string
  ): Promise<Record<string, string>> {
    const url = new URL(endpoint);
    const host = url.hostname;
    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
    const dateStamp = amzDate.slice(0, 8);

    const service = 'ses';
    const algorithm = 'AWS4-HMAC-SHA256';
    const credentialScope = `${dateStamp}/${this.region}/${service}/aws4_request`;

    // Create canonical request
    const contentType = 'application/x-www-form-urlencoded';
    const payloadHash = await this.sha256(body);

    const canonicalHeaders = [
      `content-type:${contentType}`,
      `host:${host}`,
      `x-amz-date:${amzDate}`,
    ].join('\n') + '\n';

    const signedHeaders = 'content-type;host;x-amz-date';

    const canonicalRequest = [
      method,
      '/',
      '',
      canonicalHeaders,
      signedHeaders,
      payloadHash,
    ].join('\n');

    // Create string to sign
    const canonicalRequestHash = await this.sha256(canonicalRequest);
    const stringToSign = [
      algorithm,
      amzDate,
      credentialScope,
      canonicalRequestHash,
    ].join('\n');

    // Calculate signature
    const signingKey = await this.getSignatureKey(dateStamp, this.region, service);
    const signature = await this.hmacHex(signingKey, stringToSign);

    // Build authorization header
    const authorization = [
      `${algorithm} Credential=${this.accessKeyId}/${credentialScope}`,
      `SignedHeaders=${signedHeaders}`,
      `Signature=${signature}`,
    ].join(', ');

    return {
      'Content-Type': contentType,
      'Host': host,
      'X-Amz-Date': amzDate,
      'Authorization': authorization,
    };
  }

  /**
   * Computes SHA-256 hash of a string
   *
   * @param data - String to hash
   * @returns Hexadecimal hash string
   * @internal
   */
  private async sha256(data: string): Promise<string> {
    const encoder = new TextEncoder();
    const buffer = await crypto.subtle.digest('SHA-256', encoder.encode(data));
    return Array.from(new Uint8Array(buffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  /**
   * Computes HMAC-SHA256 signature
   *
   * @param key - Signing key as ArrayBuffer or Uint8Array
   * @param data - String data to sign
   * @returns HMAC signature as ArrayBuffer
   * @internal
   */
  private async hmac(key: ArrayBuffer | Uint8Array, data: string): Promise<ArrayBuffer> {
    const encoder = new TextEncoder();
    // Normalize: TS lib types Uint8Array as ArrayBufferLike-backed; importKey expects ArrayBuffer-backed views (copy when needed).
    const keyMaterial =
      key instanceof ArrayBuffer ? key : new Uint8Array(key);
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      keyMaterial,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    return crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(data));
  }

  /**
   * Computes HMAC-SHA256 signature and returns as hex string
   *
   * @param key - Signing key as ArrayBuffer
   * @param data - String data to sign
   * @returns HMAC signature as hexadecimal string
   * @internal
   */
  private async hmacHex(key: ArrayBuffer, data: string): Promise<string> {
    const buffer = await this.hmac(key, data);
    return Array.from(new Uint8Array(buffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  /**
   * Derives the AWS Signature v4 signing key
   *
   * The signing key is derived through a series of HMAC operations:
   * kDate = HMAC("AWS4" + secret, dateStamp)
   * kRegion = HMAC(kDate, region)
   * kService = HMAC(kRegion, service)
   * kSigning = HMAC(kService, "aws4_request")
   *
   * @param dateStamp - Date in YYYYMMDD format
   * @param region - AWS region
   * @param service - AWS service name (e.g., 'ses')
   * @returns Derived signing key as ArrayBuffer
   * @internal
   */
  private async getSignatureKey(
    dateStamp: string,
    region: string,
    service: string
  ): Promise<ArrayBuffer> {
    const encoder = new TextEncoder();
    const kDate = await this.hmac(
      encoder.encode(`AWS4${this.secretAccessKey}`),
      dateStamp
    );
    const kRegion = await this.hmac(kDate, region);
    const kService = await this.hmac(kRegion, service);
    const kSigning = await this.hmac(kService, 'aws4_request');
    return kSigning;
  }
}
