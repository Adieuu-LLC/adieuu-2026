/**
 * Estimates UTF-8 byte length of JSON bodies for POST /api/dm/messages.
 * Uses @adieuu/crypto KEY_SIZES for ML-KEM / Ed25519 dimensions; field strings
 * are synthetic placeholders matching base64 lengths.
 *
 * Run: bun run scripts/dm-send-message-body-size-estimate.ts
 */

import { KEY_SIZES } from '@adieuu/crypto';
import { DEFAULT_MAX_REQUEST_BODY_BYTES } from '@adieuu/shared';

function b64CharCount(rawByteLength: number): number {
  return Math.ceil(rawByteLength / 3) * 4;
}

function b64Placeholder(rawByteLength: number): string {
  return 'B'.repeat(b64CharCount(rawByteLength));
}

const OID = '0'.repeat(24);
const UUID = '00000000-0000-4000-8000-000000000001';
const CONV = 'a'.repeat(64);
const CLIENT_MSG = '1730000000000-abcdef12';

type Profile = 'default' | 'cnsa2';
type Pre = 'otpk' | 'spk';

function buildWrappedKey(
  profile: Profile,
  pre: Pre,
  deviceSuffix: number
): Record<string, string> {
  const kem = profile === 'cnsa2' ? KEY_SIZES['ML-KEM-1024'] : KEY_SIZES['ML-KEM-768'];
  const kemCtBytes = kem.ciphertext;

  const base: Record<string, string> = {
    identityId: OID,
    deviceId: `00000000-0000-4000-8000-${String(deviceSuffix).padStart(12, '0')}`,
    ephemeralPublicKey: b64Placeholder(KEY_SIZES.x25519.publicKey),
    kemCiphertext: b64Placeholder(kemCtBytes),
    wrappedSessionKey: b64Placeholder(48),
    wrappingNonce: b64Placeholder(12),
    preKeyType: pre,
  };

  if (pre === 'otpk') {
    base.oneTimePreKeyId = UUID;
    base.signedPreKeyId = '00000000-0000-4000-8000-000000000002';
    base.oneTimeKemCiphertext = b64Placeholder(kemCtBytes);
  } else {
    base.signedPreKeyId = '00000000-0000-4000-8000-000000000002';
  }

  return base;
}

function buildSendMessagePayload(
  deviceCount: number,
  profile: Profile,
  pre: Pre,
  plaintextUtf8Bytes: number
): Record<string, unknown> {
  const wrappedKeys = Array.from({ length: deviceCount }, (_, i) =>
    buildWrappedKey(profile, pre, i)
  );

  return {
    conversationId: CONV,
    toIdentityId: OID,
    encryptedSenderId: b64Placeholder(48),
    ciphertext: b64Placeholder(plaintextUtf8Bytes + 16),
    nonce: b64Placeholder(12),
    wrappedKeys,
    signature: b64Placeholder(KEY_SIZES.ed25519.signature),
    cryptoProfile: profile,
    clientMessageId: CLIENT_MSG,
  };
}

type Scenario = {
  name: string;
  devices: number;
  profile: Profile;
  pre: Pre;
  plaintextUtf8Bytes: number;
};

const scenarios: Scenario[] = [
  {
    name: 'minimal (1 device, spk, tiny text)',
    devices: 1,
    profile: 'default',
    pre: 'spk',
    plaintextUtf8Bytes: 16,
  },
  {
    name: 'typical DM (2 devices, otpk, ~2 KiB plaintext)',
    devices: 2,
    profile: 'default',
    pre: 'otpk',
    plaintextUtf8Bytes: 2048,
  },
  {
    name: 'multi-device (8 devices, otpk, ~16 KiB plaintext)',
    devices: 8,
    profile: 'default',
    pre: 'otpk',
    plaintextUtf8Bytes: 16384,
  },
  {
    name: 'heavy (12 devices, otpk, ~64 KiB plaintext)',
    devices: 12,
    profile: 'default',
    pre: 'otpk',
    plaintextUtf8Bytes: 65536,
  },
  {
    name: 'CNSA2 + large text (4 devices, otpk, ~32 KiB plaintext)',
    devices: 4,
    profile: 'cnsa2',
    pre: 'otpk',
    plaintextUtf8Bytes: 32768,
  },
];

console.log('DM send-message JSON body size estimates (UTF-8 bytes)\n');
console.log(
  'Assumptions: ciphertext field = base64(ciphertext||tag); nonce separate (12 B); wrapped keys use hybrid fields from KEY_SIZES.\n'
);

const rows: { name: string; bytes: number; kb: string }[] = [];

for (const s of scenarios) {
  const payload = buildSendMessagePayload(s.devices, s.profile, s.pre, s.plaintextUtf8Bytes);
  const json = JSON.stringify(payload);
  const bytes = Buffer.byteLength(json, 'utf8');
  rows.push({ name: s.name, bytes, kb: (bytes / 1024).toFixed(1) });
  console.log(`${s.name}`);
  console.log(`  ${bytes.toLocaleString()} bytes (${(bytes / 1024).toFixed(1)} KiB)\n`);
}

const maxRow = rows.reduce((a, b) => (a.bytes > b.bytes ? a : b));
console.log(`Largest scenario in this table: ${maxRow.bytes.toLocaleString()} bytes (${maxRow.kb} KiB)`);

const suggestedCap = 256 * 1024;
console.log(`\nCompare: DEFAULT_MAX_REQUEST_BODY_BYTES (router/WAF default) = ${DEFAULT_MAX_REQUEST_BODY_BYTES.toLocaleString()} (${(DEFAULT_MAX_REQUEST_BODY_BYTES / 1024).toFixed(0)} KiB)`);
console.log(`Illustrative looser cap (e.g. many-device + large paste): ${suggestedCap.toLocaleString()} (${suggestedCap / 1024} KiB)`);

if (maxRow.bytes > DEFAULT_MAX_REQUEST_BODY_BYTES) {
  console.log(
    `\nNote: "${maxRow.name}" (${maxRow.kb} KiB) exceeds the default ${DEFAULT_MAX_REQUEST_BODY_BYTES / 1024} KiB cap — raise api_max_request_body_bytes or cap plaintext / devices per message.`
  );
}

// POST /api/identity/:id/e2e/initialize — schema maxima from identity controller (zod)
console.log('\n---\n');
console.log('Identity E2E initialize (POST /api/identity/:id/e2e/initialize), schema max string lengths:\n');
const e2eInitializeMax = {
  signingPublicKey: 'S'.repeat(200),
  preferredCryptoProfile: 'default',
  device: {
    deviceId: '00000000-0000-4000-8000-000000000001',
    name: 'N'.repeat(100),
    ecdhPublicKey: 'E'.repeat(200),
    kemPublicKey: 'K'.repeat(2000),
  },
  bundle: {
    encryptedBundle: 'B'.repeat(8000),
    salt: 's'.repeat(64),
    nonce: 'n'.repeat(64),
  },
};
const e2eJson = JSON.stringify(e2eInitializeMax);
const e2eBytes = Buffer.byteLength(e2eJson, 'utf8');
console.log(`  At zod maxima: ${e2eBytes.toLocaleString()} bytes (${(e2eBytes / 1024).toFixed(1)} KiB)`);
console.log(
  '  (Your ~8750-byte request was slightly above the managed WAF 8 KiB rule; the configured API body cap is ample for this endpoint.)'
);
