import { SECURITY_LEVEL_CONFIG, type ForwardSecrecyConfig } from '../../services/preKeyService';
import { formatRotationInterval } from './conversationUtils';

export type ForwardSecrecyUiLabels = {
  rotationLabel: string;
  readableWindow: string;
  tooltip: string;
};

/**
 * Human-readable FS policy strings for message list tooltips (matches prior ConversationView copy).
 */
export function buildForwardSecrecyUiLabels(fsConfig: ForwardSecrecyConfig): ForwardSecrecyUiLabels {
  const levelConfig = SECURITY_LEVEL_CONFIG[fsConfig.securityLevel];
  const rotationLabel = formatRotationInterval(levelConfig.spkRotationIntervalMs);
  const hardDeleteLabel = formatRotationInterval(levelConfig.hardDeleteCapMs);
  const policy = fsConfig.spkDeletionPolicy;
  let readableWindow: string;
  let tooltip: string;

  if (policy === 'immediate') {
    readableWindow = rotationLabel;
    tooltip = `Forward secrecy enabled. Keys rotate every ${rotationLabel} and are deleted immediately. Message becomes unreadable after key rotation${fsConfig.clearCacheOnRotation ? ' (local cache is also cleared)' : ' unless locally cached'}.`;
  } else if (policy === 'timed') {
    readableWindow = rotationLabel;
    tooltip = `Forward secrecy enabled. Keys rotate every ${rotationLabel} and retired keys are deleted on the same timer. Readable for up to ~${rotationLabel} after key rotation${fsConfig.clearCacheOnRotation ? ' (local cache is also cleared)' : ' unless locally cached'}.`;
  } else {
    readableWindow = hardDeleteLabel;
    tooltip = `Forward secrecy enabled. Keys rotate every ${rotationLabel}. Retired keys are kept for up to ${hardDeleteLabel} before deletion. Readable for up to ~${hardDeleteLabel}${fsConfig.clearCacheOnRotation ? ' (local cache is also cleared on rotation)' : ''}.`;
  }

  return { rotationLabel, readableWindow, tooltip };
}
