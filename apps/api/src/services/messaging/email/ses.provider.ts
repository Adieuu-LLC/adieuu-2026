/**
 * AWS SES Email Provider
 * Sends emails via Amazon Simple Email Service
 */

import { config } from '../../../config';
import type { IEmailProvider, EmailOptions, EmailResult } from '../types';
import elog from '../../../utils/adieuuLogger';

/**
 * AWS SES Email Provider
 * 
 * Uses AWS SDK v3 via fetch (no heavy SDK dependency)
 * Requires AWS credentials to be configured
 */
export class SesEmailProvider implements IEmailProvider {
  readonly name = 'ses';

  private readonly region: string;
  private readonly accessKeyId: string | undefined;
  private readonly secretAccessKey: string | undefined;
  private readonly fromAddress: string;

  constructor() {
    this.region = config.email.awsRegion;
    this.accessKeyId = config.email.awsAccessKeyId;
    this.secretAccessKey = config.email.awsSecretAccessKey;
    this.fromAddress = config.email.fromAddress;
  }

  /**
   * Check if provider is configured
   */
  isConfigured(): boolean {
    return !!(this.accessKeyId && this.secretAccessKey);
  }

  /**
   * Send an email via SES
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
   * Build SES SendEmail request body
   */
  private buildSendEmailBody(options: EmailOptions): string {
    const params = new URLSearchParams();
    params.append('Action', 'SendEmail');
    params.append('Source', this.fromAddress);
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
   * Sign request with AWS Signature v4
   * Simplified implementation for SES
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

  private async sha256(data: string): Promise<string> {
    const encoder = new TextEncoder();
    const buffer = await crypto.subtle.digest('SHA-256', encoder.encode(data));
    return Array.from(new Uint8Array(buffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  private async hmac(key: ArrayBuffer | Uint8Array, data: string): Promise<ArrayBuffer> {
    const encoder = new TextEncoder();
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      key,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    return crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(data));
  }

  private async hmacHex(key: ArrayBuffer, data: string): Promise<string> {
    const buffer = await this.hmac(key, data);
    return Array.from(new Uint8Array(buffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

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
