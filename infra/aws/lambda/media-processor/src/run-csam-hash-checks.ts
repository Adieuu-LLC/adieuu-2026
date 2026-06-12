import type { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { checkNcmecHashes, checkArachnidShield } from './csam-hash-check';
import type { CsamMatch } from './csam-types';

export interface RunCsamHashChecksDeps {
  ncmecHashTable: string;
  arachnidCreds: { username: string; password: string } | null;
  dynamodb: DynamoDBClient;
  onNcmecError?: (message: string) => void;
  onArachnidError?: (message: string) => void;
}

export const NO_CSAM_PROVIDERS_ERROR =
  'CSAM hash checks required but no providers configured (NCMEC_HASH_TABLE / ARACHNID_SECRET_ARN)';

/**
 * Run all available CSAM hash checks against the image bytes.
 * Returns all matches found — the DB writer decides which to act on.
 * Throws when no providers are configured (fail closed).
 */
export async function runCsamHashChecks(
  imageBytes: Uint8Array,
  deps: RunCsamHashChecksDeps,
): Promise<CsamMatch[]> {
  const allMatches: CsamMatch[] = [];
  const providerConfigured = Boolean(deps.ncmecHashTable) || deps.arachnidCreds !== null;

  if (deps.ncmecHashTable) {
    try {
      const ncmecMatches = await checkNcmecHashes(imageBytes, deps.ncmecHashTable, deps.dynamodb);
      allMatches.push(...ncmecMatches);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      deps.onNcmecError?.(message);
    }
  }

  if (deps.arachnidCreds) {
    try {
      const arachnidMatches = await checkArachnidShield(imageBytes, deps.arachnidCreds);
      allMatches.push(...arachnidMatches);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      deps.onArachnidError?.(message);
    }
  }

  if (!providerConfigured) {
    throw new Error(NO_CSAM_PROVIDERS_ERROR);
  }

  return allMatches;
}
