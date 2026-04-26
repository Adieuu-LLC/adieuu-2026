import { shell } from 'electron';

/**
 * Opens an https URL in the system default browser.
 * Rejects other schemes to avoid open-redirect / protocol smuggling.
 */
export async function openExternalHttpsUrl(
  url: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (typeof url !== 'string' || url.length === 0) {
    return { ok: false, error: 'Invalid URL' };
  }
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') {
      return { ok: false, error: 'Only https URLs are allowed' };
    }
    await shell.openExternal(url);
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg || 'Failed to open URL' };
  }
}
