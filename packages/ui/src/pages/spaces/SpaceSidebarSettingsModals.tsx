/**
 * Create/edit channel + category settings modals for the Space sidebar.
 */

import type {
  CipherCheck,
  PublicSpace,
  PublicSpaceChannel,
  PublicSpaceChannelCategory,
} from '@adieuu/shared';
import { ChannelSettingsModal } from './ChannelSettingsModal';
import { CategorySettingsModal } from './CategorySettingsModal';

export interface SpaceSidebarSettingsModalsProps {
  space: PublicSpace;
  heldRoleIds: readonly string[];
  canManageChannels: boolean;
  canManageEncryption: boolean;
  categories: readonly PublicSpaceChannelCategory[];
  createChannelOpen: boolean;
  onCreateChannelOpenChange: (open: boolean) => void;
  createChannelCategoryId: string | null;
  inheritRoleIds: readonly string[] | null;
  inheritChannelCipherCheck: CipherCheck | null;
  onChannelCreated: (channel: PublicSpaceChannel) => void;
  editingChannel: PublicSpaceChannel | null;
  onEditingChannelChange: (channel: PublicSpaceChannel | null) => void;
  onChannelUpdated: (channel: PublicSpaceChannel) => void;
  createCategoryOpen: boolean;
  onCreateCategoryOpenChange: (open: boolean) => void;
  createCategoryParentId: string | null;
  createCategoryParent: PublicSpaceChannelCategory | null;
  onCategoryCreated: (category: PublicSpaceChannelCategory) => void;
  editingCategory: PublicSpaceChannelCategory | null;
  onEditingCategoryChange: (category: PublicSpaceChannelCategory | null) => void;
  onCategoryUpdated: (category: PublicSpaceChannelCategory) => void;
}

export function SpaceSidebarSettingsModals({
  space,
  heldRoleIds,
  canManageChannels,
  canManageEncryption,
  categories,
  createChannelOpen,
  onCreateChannelOpenChange,
  createChannelCategoryId,
  inheritRoleIds,
  inheritChannelCipherCheck,
  onChannelCreated,
  editingChannel,
  onEditingChannelChange,
  onChannelUpdated,
  createCategoryOpen,
  onCreateCategoryOpenChange,
  createCategoryParentId,
  createCategoryParent,
  onCategoryCreated,
  editingCategory,
  onEditingCategoryChange,
  onCategoryUpdated,
}: SpaceSidebarSettingsModalsProps) {
  return (
    <>
      {createChannelOpen && (
        <ChannelSettingsModal
          open={createChannelOpen}
          onOpenChange={onCreateChannelOpenChange}
          space={space}
          heldRoleIds={heldRoleIds}
          canManageChannels={canManageChannels}
          canManageEncryption={canManageEncryption}
          categories={categories}
          categoryId={createChannelCategoryId}
          initialAllowedRoleIds={inheritRoleIds}
          initialCipherCheck={inheritChannelCipherCheck}
          onCreated={onChannelCreated}
        />
      )}

      {editingChannel && (
        <ChannelSettingsModal
          open={!!editingChannel}
          onOpenChange={(open) => {
            if (!open) onEditingChannelChange(null);
          }}
          space={space}
          heldRoleIds={heldRoleIds}
          canManageChannels={canManageChannels}
          canManageEncryption={canManageEncryption}
          categories={categories}
          channel={editingChannel}
          onUpdated={onChannelUpdated}
        />
      )}

      {createCategoryOpen && (
        <CategorySettingsModal
          open={createCategoryOpen}
          onOpenChange={(open) => {
            onCreateCategoryOpenChange(open);
          }}
          space={space}
          heldRoleIds={heldRoleIds}
          canManageEncryption={canManageEncryption}
          categories={categories}
          parentCategoryId={createCategoryParentId}
          initialAllowedRoleIds={createCategoryParent?.allowedRoleIds ?? null}
          initialCipherCheck={createCategoryParent?.cipherCheck ?? null}
          onCreated={onCategoryCreated}
        />
      )}

      {editingCategory && (
        <CategorySettingsModal
          open={!!editingCategory}
          onOpenChange={(open) => {
            if (!open) onEditingCategoryChange(null);
          }}
          space={space}
          heldRoleIds={heldRoleIds}
          canManageEncryption={canManageEncryption}
          categories={categories}
          category={editingCategory}
          onUpdated={onCategoryUpdated}
        />
      )}
    </>
  );
}
