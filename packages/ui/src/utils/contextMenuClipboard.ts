/**
 * Clipboard and save helpers for custom context menus (message row, composer, global).
 */

export async function copyPlainTextToClipboard(text: string): Promise<boolean> {
  try {
    if (!text || !navigator.clipboard?.writeText) {
      return false;
    }
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export async function readPlainTextFromClipboard(): Promise<string | null> {
  try {
    if (!navigator.clipboard?.readText) {
      return null;
    }
    return await navigator.clipboard.readText();
  } catch {
    return null;
  }
}

/** Copy image to system clipboard; may fail in Firefox or on opaque / cross-origin fetches. */
export async function copyImageUrlToSystemClipboard(objectOrRemoteUrl: string): Promise<boolean> {
  try {
    if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') {
      return false;
    }
    const r = await fetch(objectOrRemoteUrl);
    if (!r.ok) {
      return false;
    }
    const blob = await r.blob();
    if (blob.size === 0) {
      return false;
    }
    const declared =
      blob.type && blob.type !== 'application/octet-stream' && blob.type !== ''
        ? blob.type
        : objectOrRemoteUrl.toLowerCase().match(/\.(webp)($|\?)/)
          ? 'image/webp'
          : 'image/png';
    await navigator.clipboard.write([new ClipboardItem({ [declared]: blob })]);
    return true;
  } catch {
    return false;
  }
}

/**
 * Fetches a URL and saves bytes via the platform `saveFile` (picker on capable browsers, else download).
 */
export async function downloadUrlWithSaveFile(
  objectOrRemoteUrl: string,
  suggestedName: string,
  saveFile: (data: Uint8Array, name: string) => Promise<boolean>,
): Promise<boolean> {
  const r = await fetch(objectOrRemoteUrl);
  if (!r.ok) {
    return false;
  }
  const buf = new Uint8Array(await r.arrayBuffer());
  return saveFile(buf, suggestedName);
}
