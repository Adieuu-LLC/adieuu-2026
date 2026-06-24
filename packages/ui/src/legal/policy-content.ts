/**
 * Lazy registry for legal policy content components.
 *
 * Each policy's (lengthy) content lives in its own chunk and is only fetched
 * when that specific policy page is viewed. The lazy components are created once
 * at module scope so repeated lookups return a stable reference (creating them
 * per-render would remount and re-fetch on every render).
 */

import { lazy, type ComponentType } from 'react';
import type { LegalPolicyContentProps } from './policies';

type LegalContentComponent = ComponentType<LegalPolicyContentProps>;

const CONTENT_BY_SLUG: Record<string, LegalContentComponent> = {
  tos: lazy(() => import('./content/tos').then((m) => ({ default: m.TermsOfServiceContent }))),
  privacy: lazy(() =>
    import('./content/privacy').then((m) => ({ default: m.PrivacyPolicyContent })),
  ),
  'acceptable-use': lazy(() =>
    import('./content/acceptable-use').then((m) => ({ default: m.AcceptableUsePolicyContent })),
  ),
  'paid-services': lazy(() =>
    import('./content/paid-services').then((m) => ({ default: m.PaidServicesTermsContent })),
  ),
};

export function getLegalPolicyContent(slug: string): LegalContentComponent | undefined {
  return CONTENT_BY_SLUG[slug];
}
