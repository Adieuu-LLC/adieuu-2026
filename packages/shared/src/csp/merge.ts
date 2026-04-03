/**
 * Merges multiple CSP directive sets into one, deduplicating values per directive.
 *
 * @module csp/merge
 */

import type { CspDirectives } from './types';

/**
 * Union all directives from the supplied manifests.
 *
 * For each directive name, the resulting array contains every unique value
 * present in any of the inputs, preserving first-seen order.
 */
export function mergeCspManifests(...manifests: CspDirectives[]): CspDirectives {
  const merged: CspDirectives = {};

  for (const manifest of manifests) {
    for (const [directive, values] of Object.entries(manifest)) {
      const existing = merged[directive] ?? [];
      for (const value of values) {
        if (!existing.includes(value)) {
          existing.push(value);
        }
      }
      merged[directive] = existing;
    }
  }

  return merged;
}
