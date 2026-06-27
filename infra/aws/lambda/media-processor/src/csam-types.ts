export interface CsamMatch {
  source: 'ncmec' | 'arachnid_shield';
  hashType: string;
  matchedHash: string;
  matchType: 'exact' | 'near';
  classification: string;
  matchDetails?: Record<string, unknown>;
}
