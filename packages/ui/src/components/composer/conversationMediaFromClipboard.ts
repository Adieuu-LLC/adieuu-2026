import {
  isAcceptedConversationMediaType,
  isVisualMediaMimeType,
  MAX_ATTACHMENT_BYTES,
  ACCEPTED_VIDEO_TYPES,
} from './composerTypes';

const SNIFF_PREFIX_BYTES = 64 * 1024;

/** Normalize clipboard / File.type hints so allowlist checks are more reliable. */
export function normalizeMimeType(mime: string): string {
  const m = mime.trim().toLowerCase();
  if (!m) return '';
  const map: Record<string, string> = {
    'image/x-png': 'image/png',
    'image/jpg': 'image/jpeg',
    'image/pjpeg': 'image/jpeg',
    'image/x-citrix-pjpeg': 'image/jpeg',
    'image/x-citrix-gif': 'image/gif',
    'image/x-icon': 'image/png',
  };
  return map[m] ?? m;
}

export function sniffConversationMediaMime(head: Uint8Array): string | null {
  if (head.length < 12) return null;
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return 'image/jpeg';
  if (head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47) return 'image/png';
  if (head[0] === 0x47 && head[1] === 0x49 && head[2] === 0x46 && head[3] === 0x38) return 'image/gif';
  if (
    head[0] === 0x52 &&
    head[1] === 0x49 &&
    head[2] === 0x46 &&
    head[3] === 0x46 &&
    head[8] === 0x57 &&
    head[9] === 0x45 &&
    head[10] === 0x42 &&
    head[11] === 0x50
  ) {
    return 'image/webp';
  }
  if (head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3) return 'video/webm';
  if (head.length >= 12 && head[4] === 0x66 && head[5] === 0x74 && head[6] === 0x79 && head[7] === 0x70) {
    const brand = String.fromCharCode(head[8]!, head[9]!, head[10]!, head[11]!);
    if (brand === 'qt  ') return 'video/quicktime';
    return 'video/mp4';
  }
  return null;
}

function extensionForMime(mime: string): string {
  const sub = mime.split('/')[1] ?? 'bin';
  if (sub === 'jpeg') return 'jpg';
  if (sub === 'quicktime') return 'mov';
  return sub;
}

function fileDedupeKey(f: File): string {
  return `${f.name}\0${f.size}\0${f.lastModified}`;
}

function defaultNameForPaste(mime: string): string {
  return `pasted-${Date.now()}.${extensionForMime(mime)}`;
}

/**
 * Resolve a File from input or clipboard to an accepted conversation media File, using sniffing when needed.
 */
export async function resolveConversationMediaFile(raw: File): Promise<{
  file: File;
  oversized: boolean;
} | null> {
  if (raw.size > MAX_ATTACHMENT_BYTES) {
    return null;
  }
  if (raw.size === 0) {
    return null;
  }

  const mime = normalizeMimeType(raw.type);

  if (isVisualMediaMimeType(mime)) {
    const named =
      raw.name && raw.name !== 'image.png' && raw.name !== 'blob'
        ? raw
        : new File([raw], defaultNameForPaste(mime), { type: mime });
    return { file: named, oversized: false };
  }

  if (mime && isAcceptedConversationMediaType(mime)) {
    const named =
      raw.name && raw.name !== 'image.png' && raw.name !== 'blob'
        ? raw
        : new File([raw], defaultNameForPaste(mime || 'application/octet-stream'), { type: mime || 'application/octet-stream' });
    return { file: named, oversized: false };
  }

  const n = Math.min(raw.size, SNIFF_PREFIX_BYTES);
  const buf = await raw.slice(0, n).arrayBuffer();
  const sniffed = sniffConversationMediaMime(new Uint8Array(buf));
  if (sniffed && isVisualMediaMimeType(sniffed)) {
    const named = new File(
      [raw],
      raw.name && raw.name !== 'image.png' && raw.name !== 'blob' ? raw.name : defaultNameForPaste(sniffed),
      { type: sniffed },
    );
    return { file: named, oversized: false };
  }

  const finalFile =
    raw.name && raw.name !== 'image.png' && raw.name !== 'blob'
      ? raw
      : new File([raw], defaultNameForPaste(raw.type || 'application/octet-stream'), { type: raw.type || 'application/octet-stream' });
  return { file: finalFile, oversized: false };
}

export type GatherConversationMediaResult = {
  files: File[];
  oversized: boolean;
};

/**
 * Collect image/video files from a FileList or File[] using the same rules as paste (sniffing, caps).
 */
export async function gatherConversationMediaFromFileList(
  list: FileList | File[],
): Promise<GatherConversationMediaResult> {
  const files: File[] = [];
  let oversized = false;
  const seen = new Set<string>();

  for (const raw of Array.from(list)) {
    if (raw.size > MAX_ATTACHMENT_BYTES) {
      oversized = true;
      continue;
    }
    const resolved = await resolveConversationMediaFile(raw);
    if (!resolved) continue;
    const k = fileDedupeKey(resolved.file);
    if (seen.has(k)) continue;
    seen.add(k);
    files.push(resolved.file);
  }

  return { files, oversized };
}

/**
 * Gather from clipboard DataTransfer (paste): items + .files, deduped, async sniff.
 */
export async function gatherConversationMediaFromDataTransfer(
  dt: DataTransfer,
): Promise<GatherConversationMediaResult> {
  const files: File[] = [];
  let oversized = false;
  const seen = new Set<string>();

  const tryAdd = async (raw: File | null) => {
    if (!raw) return;
    if (raw.size > MAX_ATTACHMENT_BYTES) {
      oversized = true;
      return;
    }
    const resolved = await resolveConversationMediaFile(raw);
    if (!resolved) return;
    const k = fileDedupeKey(resolved.file);
    if (seen.has(k)) return;
    seen.add(k);
    files.push(resolved.file);
  };

  for (const item of Array.from(dt.items)) {
    if (item.kind === 'file') {
      await tryAdd(item.getAsFile());
    }
  }

  for (const f of Array.from(dt.files)) {
    await tryAdd(f);
  }

  return { files, oversized };
}

/** True if paste should be intercepted to inspect media (preventDefault, then async). */
export function shouldInterceptPasteForMediaInspection(dt: DataTransfer): boolean {
  if (dt.files?.length) return true;
  for (const item of Array.from(dt.items)) {
    if (item.kind === 'file') return true;
    const t = normalizeMimeType(item.type);
    if (t.startsWith('image/') || t.startsWith('video/')) return true;
  }
  return false;
}

/**
 * Clipboard likely carried non-text media but we may fail to extract (for user messaging).
 */
export function clipboardPasteSuggestsNonPlainMedia(dt: DataTransfer): boolean {
  for (const item of Array.from(dt.items)) {
    if (item.kind === 'file') return true;
    const t = normalizeMimeType(item.type);
    if (t.startsWith('image/') || t.startsWith('video/')) return true;
    if (t === 'application/octet-stream') return true;
  }
  return !!dt.files?.length;
}

const CLIPBOARD_READ_TYPE_ORDER: string[] = [
  'image/png',
  'image/webp',
  'image/jpeg',
  'image/gif',
  ...ACCEPTED_VIDEO_TYPES,
];

function pickReadableClipboardType(types: readonly string[]): string | null {
  for (const pref of CLIPBOARD_READ_TYPE_ORDER) {
    if (types.includes(pref)) return pref;
  }
  for (const t of types) {
    const n = normalizeMimeType(t);
    if (isAcceptedConversationMediaType(n)) return t;
    if (t.startsWith('image/')) return t;
    if (t.startsWith('video/') && isAcceptedConversationMediaType(n)) return t;
  }
  return null;
}

/**
 * Read image/video blobs via async Clipboard API (fallback when DataTransfer yields nothing).
 * One file per ClipboardItem (avoids duplicate PNG+JPEG representations).
 */
export async function readClipboardMediaFilesViaApi(): Promise<GatherConversationMediaResult> {
  const files: File[] = [];
  let oversized = false;
  try {
    if (typeof navigator === 'undefined' || !navigator.clipboard?.read) {
      return { files, oversized };
    }
    const items = await navigator.clipboard.read();
    let seq = 0;
    for (const item of items) {
      const type = pickReadableClipboardType(item.types);
      if (!type) continue;
      const blob = await item.getType(type);
      if (!blob || blob.size === 0) continue;
      if (blob.size > MAX_ATTACHMENT_BYTES) {
        oversized = true;
        continue;
      }
      const mime = normalizeMimeType(blob.type || type);
      const useType = isAcceptedConversationMediaType(mime) ? mime : normalizeMimeType(type);
      if (!isAcceptedConversationMediaType(useType)) continue;
      const f = new File([blob], `pasted-${Date.now()}-${seq}.${extensionForMime(useType)}`, { type: useType });
      seq += 1;
      files.push(f);
    }
  } catch {
    return { files: [], oversized };
  }
  return { files, oversized };
}
