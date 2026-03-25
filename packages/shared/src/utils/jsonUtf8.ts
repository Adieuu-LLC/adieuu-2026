/**
 * UTF-8 byte length of JSON.stringify(value), matching how fetch sends application/json bodies.
 */
export function jsonUtf8ByteLength(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).length;
}
