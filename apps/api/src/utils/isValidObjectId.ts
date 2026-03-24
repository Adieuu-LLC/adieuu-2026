import { ObjectId } from 'mongodb';

/**
 * Returns true if `id` is a 24-character hex string that {@link ObjectId} accepts.
 * Use when validating route params, stored IDs, or mixed string/ObjectId values.
 */
export function isValidObjectId(id: string): boolean {
  if (!id || id.length !== 24) return false;
  try {
    new ObjectId(id);
    return true;
  } catch {
    return false;
  }
}

export default isValidObjectId;
