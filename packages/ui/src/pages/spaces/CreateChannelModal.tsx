/**
 * Create-channel modal — thin wrapper around {@link ChannelSettingsModal}.
 */

import type { PublicSpace, PublicSpaceChannel } from '@adieuu/shared';
import { ChannelSettingsModal } from './ChannelSettingsModal';

export interface CreateChannelModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  space: PublicSpace;
  heldRoleIds: readonly string[];
  onCreated: (channel: PublicSpaceChannel) => void;
}

export function CreateChannelModal(props: CreateChannelModalProps) {
  return <ChannelSettingsModal {...props} />;
}
