/**
 * CSAM hash detection: two-tier checking.
 *
 * Tier 1 (NCMEC): MD5 + SHA1 exact-match lookup in DynamoDB.
 * Tier 2 (Arachnid Shield): PDQ perceptual hash sent via HTTPS to the
 *   Arachnid Shield scan_pdq endpoint. ONLY the hash is transmitted —
 *   image bytes NEVER leave our infrastructure.
 *
 * The processor runs all available checks and returns every match found.
 * The DB writer applies the platform-setting policy to decide which to act on.
 */

import { createHash } from 'node:crypto';
import {
  DynamoDBClient,
  GetItemCommand,
} from '@aws-sdk/client-dynamodb';
import type { CsamMatch } from './csam-types';

interface ArachnidCredentials {
  username: string;
  password: string;
}

const ARACHNID_API_BASE = 'https://shield.projectarachnid.com/v1';

/**
 * Tier 1: check MD5 and SHA1 against the local NCMEC hash table in DynamoDB.
 */
export async function checkNcmecHashes(
  imageBytes: Uint8Array,
  tableName: string,
  dynamodb: DynamoDBClient,
): Promise<CsamMatch[]> {
  const matches: CsamMatch[] = [];

  const md5 = createHash('md5').update(imageBytes).digest('hex');
  const sha1 = createHash('sha1').update(imageBytes).digest('hex');

  const md5Result = await dynamodb.send(new GetItemCommand({
    TableName: tableName,
    Key: { hashValue: { S: md5 }, hashType: { S: 'MD5' } },
  }));
  if (md5Result.Item) {
    matches.push({
      source: 'ncmec',
      hashType: 'MD5',
      matchedHash: md5,
      matchType: 'exact',
      classification: 'csam',
      matchDetails: {
        ncmecEntryId: md5Result.Item.ncmecEntryId?.S,
        ncmecSource: md5Result.Item.source?.S,
      },
    });
    return matches;
  }

  const sha1Result = await dynamodb.send(new GetItemCommand({
    TableName: tableName,
    Key: { hashValue: { S: sha1 }, hashType: { S: 'SHA1' } },
  }));
  if (sha1Result.Item) {
    matches.push({
      source: 'ncmec',
      hashType: 'SHA1',
      matchedHash: sha1,
      matchType: 'exact',
      classification: 'csam',
      matchDetails: {
        ncmecEntryId: sha1Result.Item.ncmecEntryId?.S,
        ncmecSource: sha1Result.Item.source?.S,
      },
    });
  }

  return matches;
}

interface ArachnidPdqHashResult {
  classification?: string;
  match_type?: string;
  near_match_details?: {
    sha1_base32?: string;
    sha256_hex?: string;
    classification?: string;
    timestamp?: number;
  };
}

interface ArachnidPdqResponse {
  scanned_hashes: Record<string, ArachnidPdqHashResult>;
}

/**
 * Tier 2: compute PDQ hash and check against Arachnid Shield's database.
 * ONLY the 256-bit PDQ hash (base64-encoded) is sent over HTTPS.
 * Image bytes NEVER leave our infrastructure.
 */
export async function checkArachnidShield(
  imageBytes: Uint8Array,
  credentials: ArachnidCredentials,
): Promise<CsamMatch[]> {
  const matches: CsamMatch[] = [];

  const pdqHash = await computePdqHash(imageBytes);
  if (!pdqHash) return matches;

  const authHeader = 'Basic ' + Buffer.from(
    `${credentials.username}:${credentials.password}`
  ).toString('base64');

  const response = await fetch(`${ARACHNID_API_BASE}/pdq`, {
    method: 'POST',
    headers: {
      'Authorization': authHeader,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify([pdqHash]),
  });

  if (!response.ok) {
    throw new Error(
      `Arachnid Shield API returned ${response.status}: ${await response.text().catch(() => 'no body')}`
    );
  }

  const data = await response.json() as ArachnidPdqResponse;
  const result = data.scanned_hashes?.[pdqHash];

  if (result?.classification === 'csam') {
    matches.push({
      source: 'arachnid_shield',
      hashType: 'PDQ',
      matchedHash: pdqHash,
      matchType: result.match_type === 'near' ? 'near' : 'exact',
      classification: 'csam',
      matchDetails: result.near_match_details
        ? { ...result.near_match_details }
        : undefined,
    });
  }

  return matches;
}

/**
 * Compute a PDQ perceptual hash from image bytes.
 *
 * PDQ is a 256-bit DCT-based perceptual hash by Meta. This implementation
 * uses sharp for image preprocessing (resize to 64x64, greyscale) and a
 * simplified DCT to produce a binary hash. For production, consider a native
 * WASM or C++ binding for Meta's reference implementation.
 *
 * Returns base64-encoded 32-byte hash, or null if the image cannot be processed.
 */
async function computePdqHash(imageBytes: Uint8Array): Promise<string | null> {
  try {
    const sharp = (await import('sharp')).default;

    const { data, info } = await sharp(Buffer.from(imageBytes))
      .greyscale()
      .resize(64, 64, { fit: 'fill' })
      .raw()
      .toBuffer({ resolveWithObject: true });

    if (info.width !== 64 || info.height !== 64) return null;

    const pixels = new Float64Array(64 * 64);
    for (let i = 0; i < 64 * 64; i++) {
      pixels[i] = data[i]! / 255.0;
    }

    const dctMatrix = computeDct64(pixels);

    const hash = new Uint8Array(32);
    const median = computeMedian(dctMatrix, 64);

    let bitIndex = 0;
    for (let i = 0; i < 16; i++) {
      for (let j = 0; j < 16; j++) {
        if (i === 0 && j === 0) continue;
        if (bitIndex >= 256) break;
        const val = dctMatrix[i * 64 + j]!;
        if (val > median) {
          hash[Math.floor(bitIndex / 8)] |= (1 << (7 - (bitIndex % 8)));
        }
        bitIndex++;
      }
    }

    return Buffer.from(hash).toString('base64');
  } catch {
    return null;
  }
}

function computeDct64(pixels: Float64Array): Float64Array {
  const N = 64;
  const result = new Float64Array(N * N);
  const cosTable = new Float64Array(N * N);

  for (let k = 0; k < N; k++) {
    for (let n = 0; n < N; n++) {
      cosTable[k * N + n] = Math.cos((Math.PI * (2 * n + 1) * k) / (2 * N));
    }
  }

  const temp = new Float64Array(N * N);
  for (let row = 0; row < N; row++) {
    for (let k = 0; k < N; k++) {
      let sum = 0;
      for (let n = 0; n < N; n++) {
        sum += pixels[row * N + n]! * cosTable[k * N + n]!;
      }
      temp[row * N + k] = sum;
    }
  }

  for (let col = 0; col < N; col++) {
    for (let k = 0; k < N; k++) {
      let sum = 0;
      for (let n = 0; n < N; n++) {
        sum += temp[n * N + col]! * cosTable[k * N + n]!;
      }
      result[k * N + col] = sum;
    }
  }

  return result;
}

function computeMedian(dctMatrix: Float64Array, N: number): number {
  const values: number[] = [];
  for (let i = 0; i < 16; i++) {
    for (let j = 0; j < 16; j++) {
      if (i === 0 && j === 0) continue;
      values.push(dctMatrix[i * N + j]!);
    }
  }
  values.sort((a, b) => a - b);
  const mid = Math.floor(values.length / 2);
  return values.length % 2 === 0
    ? (values[mid - 1]! + values[mid]!) / 2
    : values[mid]!;
}
