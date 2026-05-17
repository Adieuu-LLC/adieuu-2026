/** Serializable mention (composer {@link TrackedMention}); maps to payload {@link MentionEntity}. */
export interface MediaOutboxMention {
  identityId: string;
  offset: number;
  length: number;
}

/** Serializable moderation scan part for IndexedDB. */
export interface MediaOutboxPersistedScanPart {
  contentType: 'image/jpeg' | 'video/mp4';
  body: Blob;
}

/** One attachment after E2E upload completes (checkpoint before message send). */
export interface MediaOutboxE2eSnapshotItem {
  e2eMediaId: string;
  scanHash: string;
  contentType: string;
  fileName?: string;
  width?: number;
  height?: number;
  sizeBytes: number;
  exifPreserved: boolean;
  encryptionKey: string;
  encryptionNonce: string;
  /** Absent for non-visual file attachments (no scan copy needed). */
  moderationScan?: MediaOutboxPersistedScanPart | MediaOutboxPersistedScanPart[];
}

export type MediaOutboxStage =
  | 'queued'
  | 'preparing'
  | 'encrypting'
  | 'uploading_e2e'
  | 'sending'
  | 'scan_upload'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface MediaOutboxJobRecord {
  id: string;
  conversationId: string;
  stage: MediaOutboxStage;
  errorMessage?: string;
  createdAt: number;
  updatedAt: number;
  caption: string;
  mentionsJson: string;
  replyToMessageId?: string;
  ttlSeconds?: number;
  useForwardSecrecy: boolean;
  stripExif: boolean;
  /** When false, client-side moderation scanning is skipped for this send. */
  moderationEnabled: boolean;
  /**
   * When true, MP4 attachments skip ffmpeg re-encoding in {@link prepareConversationMediaFileForUpload}
   * (HEVC / opaque MP4). Best-effort decode for thumbnails and scan frames.
   */
  sendMp4WithoutReencode?: boolean;
  /** Raw user files (only present until E2E checkpoint; may be cleared after). */
  attachmentBlobs: { name: string; type: string; blob: Blob }[];
  /**
   * JSON array of the sender's custom emoji list at enqueue time (id, shortcode, cdnUrl, name, animated).
   * Used to embed shortcode metadata in the encrypted caption when sending completes.
   */
  composerCustomEmojisSnapshotJson?: string;
  /** After all E2E uploads succeed; enables resume if send or scan fails. */
  e2eSnapshot?: MediaOutboxE2eSnapshotItem[];
  /** Set after API send succeeds; scan retry must not resend message. */
  messageSendCompleted?: boolean;
}

export interface MediaOutboxEnqueueInput {
  conversationId: string;
  caption: string;
  mentions: MediaOutboxMention[];
  replyToMessageId?: string;
  ttlSeconds?: number;
  useForwardSecrecy: boolean;
  stripExif: boolean;
  /** When false, client-side moderation scanning is skipped for this send. */
  moderationEnabled: boolean;
  /** See {@link MediaOutboxJobRecord.sendMp4WithoutReencode}. */
  sendMp4WithoutReencode?: boolean;
  /** Sender's custom emoji list at enqueue time (embedded in encrypted payload for caption shortcodes). */
  composerCustomEmojisSnapshotJson?: string;
  files: File[];
}
