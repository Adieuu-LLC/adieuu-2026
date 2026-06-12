/**
 * Test setup for media-processor Lambda.
 * Provides safe env var defaults so modules can be imported without crashing.
 */

process.env.NCMEC_HASH_TABLE ??= 'test-ncmec-hashes';
process.env.EVIDENCE_BUCKET ??= 'test-csam-evidence';
