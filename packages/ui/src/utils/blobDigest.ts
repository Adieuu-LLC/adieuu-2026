/**
 * Lowercase hex SHA-256 of a Blob (Web Crypto).
 */
export async function sha256HexLower(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
