import type { ComparisonFeatureKey } from './types';

/**
 * One or more 1-based indices into `account.subscription.comparison.footnotes`.
 * Use a single number for one footnote, or an array for several (e.g. `[1, 3]`).
 */
export type ComparisonFeatureFootnoteRef = number | readonly number[];

/**
 * Maps comparison feature rows to footnote indices. Sync with locale footnote strings.
 */
export const COMPARISON_FEATURE_FOOTNOTE_INDEX: Partial<
  Record<ComparisonFeatureKey, ComparisonFeatureFootnoteRef>
> = {
  featureVote: 1,
  designAchievement: 1,
  whaleWall: 1,
  callBiWeekly: [2],
  callMonthly: [1,2],
};

/** Resolved, ordered 1-based footnote indices for a feature (invalid entries omitted). */
export function footnoteIndicesForFeature(featureKey: ComparisonFeatureKey): number[] {
  const raw = COMPARISON_FEATURE_FOOTNOTE_INDEX[featureKey];
  if (raw == null) return [];
  const list = typeof raw === 'number' ? [raw] : [...raw];
  const out: number[] = [];
  const seen = new Set<number>();
  for (const n of list) {
    if (typeof n === 'number' && n >= 1 && Number.isInteger(n) && !seen.has(n)) {
      seen.add(n);
      out.push(n);
    }
  }
  return out;
}
