import { ObjectId } from "mongodb";

/**
 * Validates that a string is a valid MongoDB ObjectId
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
