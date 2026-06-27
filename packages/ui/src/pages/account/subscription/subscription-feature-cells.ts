import type { ComparisonColumnId } from './types';
import { COMPARISON_TIER_FEATURE_SETS } from './types';

export type FeatureVariablesMap = Partial<
  Record<string, Partial<Record<ComparisonColumnId, string | number>>>
>;

export function parseSubscriptionFeatureVariables(raw: unknown): FeatureVariablesMap {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {};
  }
  const out: FeatureVariablesMap = {};
  for (const [featureKey, tierMap] of Object.entries(raw)) {
    if (!tierMap || typeof tierMap !== 'object' || Array.isArray(tierMap)) continue;
    const perTier: Partial<Record<ComparisonColumnId, string | number>> = {};
    for (const col of ['access', 'insider', 'vanguard', 'founder'] as const) {
      const v = (tierMap as Record<string, unknown>)[col];
      if (typeof v === 'string' || typeof v === 'number') {
        perTier[col] = v;
      }
    }
    if (Object.keys(perTier).length > 0) {
      out[featureKey] = perTier;
    }
  }
  return out;
}

export interface SubscriptionFeatureCellModel {
  kind: 'variable';
  displayValue: string;
}

export interface SubscriptionFeatureCellBinary {
  kind: 'binary';
  included: boolean;
}

export type SubscriptionFeatureCell = SubscriptionFeatureCellModel | SubscriptionFeatureCellBinary;

export function getSubscriptionFeatureCell(
  featureKey: string,
  columnId: ComparisonColumnId,
  featureVariables: FeatureVariablesMap,
): SubscriptionFeatureCell {
  const variable = featureVariables[featureKey]?.[columnId];
  if (variable !== undefined) {
    return { kind: 'variable', displayValue: String(variable) };
  }
  const included = COMPARISON_TIER_FEATURE_SETS[columnId].has(featureKey);
  return { kind: 'binary', included };
}

/** Plain-text suffix for card / list bullets (label is translated separately). */
export function formatVariableFeatureSuffix(
  featureKey: string,
  columnId: ComparisonColumnId,
  featureVariables: FeatureVariablesMap,
): string | null {
  const variable = featureVariables[featureKey]?.[columnId];
  if (variable === undefined) return null;
  return String(variable);
}
