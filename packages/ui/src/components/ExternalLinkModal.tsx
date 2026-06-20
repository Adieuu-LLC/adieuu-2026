/**
 * Modal shown when a user clicks an external link in a message.
 *
 * Warns the user that the link is external, flags tracking parameters,
 * and offers options to trust the domain or all links going forward.
 *
 * @module components/ExternalLinkModal
 */

import { useState } from 'react';
import { Dialog, Portal, Checkbox } from '@ark-ui/react';
import { useTranslation } from 'react-i18next';
import { Button } from './Button';
import {
  detectTrackingParams,
  stripTrackingParams,
  extractDomain,
} from '../utils/urlParsing';
import { trustDomain, setTrustAllLinks } from '../hooks/useExternalLinkPreferences';
import { loadEmbedPreference, saveEmbedPreference } from '../hooks/useEmbedPreference';

export interface ExternalLinkModalProps {
  href: string | null;
  onClose: () => void;
  identityId?: string;
}

export function ExternalLinkModal({ href, onClose, identityId }: ExternalLinkModalProps) {
  const { t } = useTranslation();
  const [hideDomain, setHideDomain] = useState(false);
  const [hideAll, setHideAll] = useState(false);

  if (!href) return null;

  const domain = extractDomain(href);
  const trackingParams = detectTrackingParams(href);
  const hasTrackers = trackingParams.length > 0;
  const cleanHref = hasTrackers ? stripTrackingParams(href) : href;

  function openLink(url: string) {
    if (hideAll) {
      setTrustAllLinks(true);
    } else if (hideDomain && domain) {
      trustDomain(domain);
      if (identityId) {
        const pref = loadEmbedPreference(identityId);
        if (pref.mode === 'allowlist') {
          const normalized = domain.replace(/^www\./, '').toLowerCase();
          if (!pref.allowlist.includes(normalized)) {
            saveEmbedPreference(identityId, {
              ...pref,
              allowlist: [...pref.allowlist, normalized],
            });
          }
        }
      }
    }
    window.open(url, '_blank', 'noopener,noreferrer');
    onClose();
  }

  return (
    <Dialog.Root open onOpenChange={(e) => { if (!e.open) onClose(); }}>
      <Portal>
        <Dialog.Backdrop className="external-link-modal-backdrop" />
        <Dialog.Positioner className="external-link-modal-positioner">
          <Dialog.Content className="external-link-modal-content">
            <div className="external-link-modal-header">
              <Dialog.Title className="external-link-modal-title">
                {t('conversations.externalLink.title', 'External Link')}
              </Dialog.Title>
            </div>

            <div className="external-link-modal-body">
              <Dialog.Description className="external-link-modal-description">
                {t(
                  'conversations.externalLink.description',
                  'You are about to open a link that will take you outside of Adieuu. Please verify you trust this destination before continuing.',
                )}
              </Dialog.Description>

              <div className="external-link-modal-url-display">
                <span className="external-link-modal-url-label">
                  {t('conversations.externalLink.destination', 'Destination')}
                </span>
                <code className="external-link-modal-url">{href}</code>
              </div>

              {hasTrackers && (
                <div className="external-link-modal-tracking-warning">
                  <span className="external-link-modal-tracking-icon" aria-hidden="true">
                    &#9888;
                  </span>
                  <div className="external-link-modal-tracking-body">
                    <strong>
                      {t(
                        'conversations.externalLink.trackingDetected',
                        'Tracking parameters detected',
                      )}
                    </strong>
                    <p>
                      {t(
                        'conversations.externalLink.trackingHint',
                        'This URL contains parameters commonly used for cross-site tracking ({{params}}). You can open the link without them to reduce fingerprinting.',
                        { params: trackingParams.join(', ') },
                      )}
                    </p>
                  </div>
                </div>
              )}

              <div className="external-link-modal-options">
                <Checkbox.Root
                  checked={hideDomain}
                  onCheckedChange={(e) => {
                    setHideDomain(e.checked === true);
                    if (e.checked === true) setHideAll(false);
                  }}
                  className="external-link-modal-checkbox"
                >
                  <Checkbox.Control className="external-link-modal-checkbox-control" />
                  <Checkbox.Label className="external-link-modal-checkbox-label">
                    {t(
                      'conversations.externalLink.trustDomain',
                      'Don\'t warn me again for {{domain}}',
                      { domain: domain ?? href },
                    )}
                  </Checkbox.Label>
                  <Checkbox.HiddenInput />
                </Checkbox.Root>

                <Checkbox.Root
                  checked={hideAll}
                  onCheckedChange={(e) => {
                    setHideAll(e.checked === true);
                    if (e.checked === true) setHideDomain(false);
                  }}
                  className="external-link-modal-checkbox"
                >
                  <Checkbox.Control className="external-link-modal-checkbox-control" />
                  <Checkbox.Label className="external-link-modal-checkbox-label">
                    {t(
                      'conversations.externalLink.trustAll',
                      'Don\'t warn me for any external links',
                    )}
                  </Checkbox.Label>
                  <Checkbox.HiddenInput />
                </Checkbox.Root>
              </div>
            </div>

            <div className="external-link-modal-footer">
              <Button variant="secondary" onClick={onClose}>
                {t('common.cancel', 'Cancel')}
              </Button>

              {hasTrackers && (
                <Button
                  variant="secondary"
                  className="external-link-modal-btn-clean"
                  onClick={() => openLink(cleanHref)}
                >
                  {t(
                    'conversations.externalLink.openClean',
                    'Open without tracking',
                  )}
                </Button>
              )}

              <Button variant="primary" onClick={() => openLink(href)}>
                {t(
                  'conversations.externalLink.openConfirm',
                  'Acknowledge & Open',
                )}
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}
