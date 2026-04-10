/**
 * Report Submission Service
 *
 * Handles user-initiated manual reports for messages and profiles.
 *
 * For message reports the service performs server-side cryptographic
 * verification: the reporter submits per-message session keys and the
 * server decrypts the ciphertext itself, ensuring the evidence cannot
 * be forged. Ed25519 signature verification confirms each message was
 * authored by the claimed sender.
 *
 * @module services/report-submission
 */

import { ObjectId, type Filter } from 'mongodb';
import {
  decrypt as aeadDecrypt,
  verify as ed25519Verify,
  fromBase64,
  toBytes,
  concatBytes,
  type CryptoProfile,
} from '@adieuu/crypto';
import { getMessageRepository } from '../repositories/message.repository';
import { getConversationRepository } from '../repositories/conversation.repository';
import { getIdentityRepository } from '../repositories/identity.repository';
import { getReportRepository, type ReportRepository } from '../repositories/report.repository';
import type { MessageDocument } from '../models/message';
import type {
  ReportCategory,
  ReportDocument,
  MessageEvidence,
  EvidenceAttachment,
  ReportEvidence,
} from '../models/report';
import { checkAndAward } from './achievement.service';
import elog from '../utils/adieuuLogger';

const MESSAGE_SIGN_DOMAIN = 'adieuu-msg-v1';
const CONTEXT_MESSAGE_COUNT = 3;

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export interface ReportSubmissionResult {
  success: boolean;
  reportId?: string;
  error?: string;
  errorCode?:
    | 'MESSAGE_NOT_FOUND'
    | 'CONVERSATION_NOT_FOUND'
    | 'NOT_PARTICIPANT'
    | 'IDENTITY_NOT_FOUND'
    | 'MISSING_SESSION_KEY'
    | 'DECRYPTION_FAILED'
    | 'DUPLICATE_REPORT'
    | 'DELETED_MESSAGE';
}

// ---------------------------------------------------------------------------
// Message payload parsing (server-side equivalent of messagePayload.ts)
// ---------------------------------------------------------------------------

interface ParsedAttachment {
  e2eMediaId: string;
  encryptionKey: string;
  encryptionNonce: string;
  contentType: string;
  fileName?: string;
  width?: number;
  height?: number;
  sizeBytes?: number;
}

interface ParsedPayload {
  text: string;
  attachments: ParsedAttachment[];
}

function isValidAttachment(a: unknown): a is ParsedAttachment {
  if (typeof a !== 'object' || a === null) return false;
  const obj = a as Record<string, unknown>;
  return (
    typeof obj.e2eMediaId === 'string' &&
    typeof obj.contentType === 'string' &&
    typeof obj.encryptionKey === 'string' &&
    typeof obj.encryptionNonce === 'string'
  );
}

function parseMessagePayload(plaintext: string): ParsedPayload {
  if (!plaintext.startsWith('{')) {
    return { text: plaintext, attachments: [] };
  }
  try {
    const parsed = JSON.parse(plaintext) as Record<string, unknown>;
    if (typeof parsed.version !== 'number' || parsed.version < 1) {
      return { text: plaintext, attachments: [] };
    }
    const rawAttachments = Array.isArray(parsed.attachments) ? parsed.attachments : [];
    return {
      text: typeof parsed.text === 'string' ? parsed.text : '',
      attachments: rawAttachments.filter(isValidAttachment),
    };
  } catch {
    return { text: plaintext, attachments: [] };
  }
}

// ---------------------------------------------------------------------------
// Crypto helpers
// ---------------------------------------------------------------------------

function verifyMessageSignature(
  signingPublicKey: string,
  msg: MessageDocument,
): boolean {
  try {
    const pubKey = fromBase64(signingPublicKey);
    const ciphertext = fromBase64(msg.ciphertext);
    const nonce = fromBase64(msg.nonce);
    const wrappedKeysJson = JSON.stringify(msg.wrappedKeys);
    const dataToVerify = concatBytes(
      toBytes(MESSAGE_SIGN_DOMAIN),
      ciphertext,
      nonce,
      toBytes(wrappedKeysJson),
    );
    return ed25519Verify(pubKey, dataToVerify, fromBase64(msg.signature));
  } catch {
    return false;
  }
}

function decryptMessageContent(
  sessionKeyBase64: string,
  msg: MessageDocument,
): string {
  const sessionKey = fromBase64(sessionKeyBase64);
  const ciphertext = fromBase64(msg.ciphertext);
  const nonce = fromBase64(msg.nonce);
  const profile = (msg.cryptoProfile ?? 'default') as CryptoProfile;
  const plaintext = aeadDecrypt(sessionKey, ciphertext, nonce, profile);
  return new TextDecoder().decode(plaintext);
}

// ---------------------------------------------------------------------------
// Message report submission
// ---------------------------------------------------------------------------

export interface SubmitMessageReportParams {
  targetMessageId: string;
  category: ReportCategory;
  reason?: string;
  sessionKeys: Record<string, string>;
}

export async function submitMessageReport(
  reporterIdentityId: string,
  reporterUserId: string,
  params: SubmitMessageReportParams,
): Promise<ReportSubmissionResult> {
  const messageRepo = getMessageRepository();
  const conversationRepo = getConversationRepository();
  const identityRepo = getIdentityRepository();
  const reportRepo = getReportRepository();

  // 1. Look up the target message
  let targetObjectId: ObjectId;
  try {
    targetObjectId = new ObjectId(params.targetMessageId);
  } catch {
    return { success: false, error: 'Invalid message ID', errorCode: 'MESSAGE_NOT_FOUND' };
  }

  const targetMsg = await messageRepo.findById(targetObjectId);
  if (!targetMsg) {
    return { success: false, error: 'Message not found', errorCode: 'MESSAGE_NOT_FOUND' };
  }
  if (targetMsg.deletedForEveryone) {
    return { success: false, error: 'Cannot report a deleted message', errorCode: 'DELETED_MESSAGE' };
  }

  // 2. Verify reporter is a participant
  const conversation = await conversationRepo.findById(targetMsg.conversationId);
  if (!conversation) {
    return { success: false, error: 'Conversation not found', errorCode: 'CONVERSATION_NOT_FOUND' };
  }
  const reporterObjId = new ObjectId(reporterIdentityId);
  const isParticipant = conversation.participants.some((p) => p.equals(reporterObjId));
  if (!isParticipant) {
    return { success: false, error: 'Not a participant in this conversation', errorCode: 'NOT_PARTICIPANT' };
  }

  // 3. Idempotency check
  const idempotencyKey = `manual:${reporterIdentityId}:message:${params.targetMessageId}`;
  const existing = await reportRepo.findByIdempotencyKey(idempotencyKey);
  if (existing) {
    return { success: false, error: 'You have already reported this message', errorCode: 'DUPLICATE_REPORT' };
  }

  // 4. Gather evidence window (target + up to 3 before + 3 after)
  const [messagesBefore, messagesAfter] = await Promise.all([
    messageRepo.findBefore(targetMsg.conversationId, targetObjectId, CONTEXT_MESSAGE_COUNT),
    messageRepo.findAfter(targetMsg.conversationId, targetObjectId, CONTEXT_MESSAGE_COUNT),
  ]);

  const evidenceMessages: MessageDocument[] = [
    ...messagesBefore.reverse(),
    targetMsg,
    ...messagesAfter,
  ].filter((m) => !m.deletedForEveryone && m.messageType !== 'system');

  // 5. Resolve signing keys for each unique sender
  const senderIds = [...new Set(evidenceMessages.map((m) => m.fromIdentityId.toHexString()))];
  const signingKeyMap = new Map<string, string>();
  for (const senderId of senderIds) {
    const identity = await identityRepo.findByIdentityId(senderId);
    if (identity?.signingPublicKey) {
      signingKeyMap.set(senderId, identity.signingPublicKey);
    }
  }

  // 6. Decrypt and verify each message
  const messageEvidence: MessageEvidence[] = [];

  for (const msg of evidenceMessages) {
    const msgId = msg._id.toHexString();
    const sessionKey = params.sessionKeys[msgId];
    if (!sessionKey) {
      return {
        success: false,
        error: `Missing session key for message ${msgId}`,
        errorCode: 'MISSING_SESSION_KEY',
      };
    }

    let plaintextStr: string;
    try {
      plaintextStr = decryptMessageContent(sessionKey, msg);
    } catch (err) {
      elog.warn('Report evidence decryption failed', { messageId: msgId, error: String(err) });
      return {
        success: false,
        error: `Decryption failed for message ${msgId}`,
        errorCode: 'DECRYPTION_FAILED',
      };
    }

    const senderId = msg.fromIdentityId.toHexString();
    const signingKey = signingKeyMap.get(senderId);
    const signatureVerified = signingKey ? verifyMessageSignature(signingKey, msg) : false;

    const parsed = parseMessagePayload(plaintextStr);

    const attachments: EvidenceAttachment[] = parsed.attachments.map((a) => ({
      e2eMediaId: a.e2eMediaId,
      encryptionKey: a.encryptionKey,
      encryptionNonce: a.encryptionNonce,
      contentType: a.contentType,
      fileName: a.fileName,
      width: a.width,
      height: a.height,
      sizeBytes: a.sizeBytes,
    }));

    messageEvidence.push({
      messageId: msgId,
      fromIdentityId: senderId,
      conversationId: targetMsg.conversationId.toHexString(),
      decryptedText: parsed.text,
      signatureVerified,
      isTargetMessage: msgId === params.targetMessageId,
      attachments: attachments.length > 0 ? attachments : undefined,
      createdAt: msg.createdAt.toISOString(),
    });
  }

  // 7. Create the report
  const targetIdentityId = targetMsg.fromIdentityId.toHexString();
  const evidence: ReportEvidence = {
    type: 'message',
    messageEvidence,
  };

  const report = await reportRepo.createReport({
    reportType: 'content',
    source: 'manual_user',
    category: params.category,
    scopeType: 'platform',
    targetRef: { type: 'message', id: params.targetMessageId },
    targetIdentityId,
    reporterIdentityId,
    reporterUserId,
    evidence,
    reporterReason: params.reason,
    idempotencyKey,
  });

  elog.info('Manual message report submitted', {
    reportId: report._id.toHexString(),
    reporterIdentityId,
    targetMessageId: params.targetMessageId,
    category: params.category,
    evidenceCount: messageEvidence.length,
  });

  checkMutualReport(reporterIdentityId, targetIdentityId, reportRepo).catch(() => {});

  return { success: true, reportId: report._id.toHexString() };
}

// ---------------------------------------------------------------------------
// Mutual report check
// ---------------------------------------------------------------------------

async function checkMutualReport(
  reporterIdentityId: string,
  targetIdentityId: string,
  reportRepo: ReportRepository,
): Promise<void> {
  const reverse = await reportRepo.findOne({
    reporterIdentityId: targetIdentityId,
    targetIdentityId: reporterIdentityId,
  } as Filter<ReportDocument>);
  if (!reverse) return;

  checkAndAward(reporterIdentityId, 'mutual_report').catch(() => {});
  checkAndAward(targetIdentityId, 'mutual_report').catch(() => {});
}

// ---------------------------------------------------------------------------
// Profile report submission
// ---------------------------------------------------------------------------

export interface SubmitProfileReportParams {
  targetIdentityId: string;
  category: ReportCategory;
  reason?: string;
}

export async function submitProfileReport(
  reporterIdentityId: string,
  reporterUserId: string,
  params: SubmitProfileReportParams,
): Promise<ReportSubmissionResult> {
  const identityRepo = getIdentityRepository();
  const reportRepo = getReportRepository();

  // 1. Look up target identity
  const targetIdentity = await identityRepo.findByIdentityId(params.targetIdentityId);
  if (!targetIdentity) {
    return { success: false, error: 'Identity not found', errorCode: 'IDENTITY_NOT_FOUND' };
  }

  // 2. Idempotency check
  const idempotencyKey = `manual:${reporterIdentityId}:identity:${params.targetIdentityId}`;
  const existing = await reportRepo.findByIdempotencyKey(idempotencyKey);
  if (existing) {
    return { success: false, error: 'You have already reported this profile', errorCode: 'DUPLICATE_REPORT' };
  }

  // 3. Snapshot profile
  const now = new Date();
  const evidence: ReportEvidence = {
    type: 'profile',
    profileEvidence: {
      identityId: params.targetIdentityId,
      displayName: targetIdentity.displayName,
      username: targetIdentity.username,
      bio: targetIdentity.bio,
      avatarUrl: targetIdentity.avatarUrl,
      bannerUrl: targetIdentity.bannerUrl,
      snapshotAt: now.toISOString(),
    },
  };

  // 4. Create the report
  const report = await reportRepo.createReport({
    reportType: 'abuse',
    source: 'manual_user',
    category: params.category,
    scopeType: 'platform',
    targetRef: { type: 'identity', id: params.targetIdentityId },
    targetIdentityId: params.targetIdentityId,
    reporterIdentityId,
    reporterUserId,
    evidence,
    reporterReason: params.reason,
    idempotencyKey,
  });

  elog.info('Manual profile report submitted', {
    reportId: report._id.toHexString(),
    reporterIdentityId,
    targetIdentityId: params.targetIdentityId,
    category: params.category,
  });

  checkMutualReport(reporterIdentityId, params.targetIdentityId, reportRepo).catch(() => {});

  return { success: true, reportId: report._id.toHexString() };
}
