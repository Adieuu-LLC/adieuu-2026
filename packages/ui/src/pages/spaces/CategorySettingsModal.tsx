/**
 * Modal to create or edit a Space channel category (name + role ACL).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Dialog, Portal } from '@ark-ui/react';
import { useTranslation } from 'react-i18next';
import {
  createApiClient,
  type CreateSpaceChannelCategoryParams,
  type PublicSpace,
  type PublicSpaceChannelCategory,
  type PublicSpaceRole,
  type UpdateSpaceChannelCategoryParams,
} from '@adieuu/shared';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { useAppConfig } from '../../config';
import { useToast } from '../../components/Toast';
import { useSpaceCipher } from './useSpaceCipher';
import {
  encryptSpaceMetadataField,
  resolveChannelDisplayName,
} from './spaceMetadataCipher';
import {
  actorTopRolePosition,
  findEveryoneRole,
  rolesAtOrBelowHierarchy,
} from './channelRoleHierarchy';
import { ChannelRoleMultiselect } from './ChannelRoleMultiselect';

export interface CategorySettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  space: PublicSpace;
  heldRoleIds: readonly string[];
  category?: PublicSpaceChannelCategory | null;
  /** When creating, nest under this category. */
  parentCategoryId?: string | null;
  /** Prefill ACL when creating (e.g. inherit from parent category). */
  initialAllowedRoleIds?: readonly string[] | null;
  onCreated?: (category: PublicSpaceChannelCategory) => void;
  onUpdated?: (category: PublicSpaceChannelCategory) => void;
}

export function CategorySettingsModal({
  open,
  onOpenChange,
  space,
  heldRoleIds,
  category = null,
  parentCategoryId = null,
  initialAllowedRoleIds = null,
  onCreated,
  onUpdated,
}: CategorySettingsModalProps) {
  const { t } = useTranslation();
  const { apiBaseUrl } = useAppConfig();
  const api = useMemo(() => createApiClient({ baseUrl: apiBaseUrl }), [apiBaseUrl]);
  const toast = useToast();
  const { spaceCipher } = useSpaceCipher(space.id);
  const isEdit = !!category;

  const [name, setName] = useState('');
  const [roles, setRoles] = useState<PublicSpaceRole[]>([]);
  const [selectedRoleIds, setSelectedRoleIds] = useState<Set<string>>(new Set());
  const [loadingRoles, setLoadingRoles] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const selectableRoles = useMemo(() => {
    const top = actorTopRolePosition(heldRoleIds, roles);
    if (top === null) return [];
    return rolesAtOrBelowHierarchy(roles, top).sort((a, b) => a.position - b.position);
  }, [heldRoleIds, roles]);

  useEffect(() => {
    if (!open) return;
    setSubmitting(false);

    if (category) {
      setName(
        resolveChannelDisplayName(category, spaceCipher, {
          encryptedChannel: '',
        }),
      );
      setSelectedRoleIds(new Set(category.allowedRoleIds));
    } else {
      setName('');
      setSelectedRoleIds(
        initialAllowedRoleIds?.length ? new Set(initialAllowedRoleIds) : new Set(),
      );
    }

    let cancelled = false;
    setLoadingRoles(true);
    void api.spaces.listRoles(space.id).then((res) => {
      if (cancelled) return;
      setLoadingRoles(false);
      if (!res.success || !res.data?.roles) {
        setRoles([]);
        if (!category && !initialAllowedRoleIds?.length) setSelectedRoleIds(new Set());
        return;
      }
      const list = res.data.roles;
      setRoles(list);
      if (!category) {
        if (initialAllowedRoleIds?.length) {
          setSelectedRoleIds(new Set(initialAllowedRoleIds));
          return;
        }
        const everyone = findEveryoneRole(list);
        setSelectedRoleIds(everyone ? new Set([everyone.id]) : new Set());
      }
    });
    return () => {
      cancelled = true;
    };
  }, [open, api, space.id, category, spaceCipher, initialAllowedRoleIds]);

  const toggleRole = useCallback((roleId: string) => {
    setSelectedRoleIds((prev) => {
      const next = new Set(prev);
      if (next.has(roleId)) next.delete(roleId);
      else next.add(roleId);
      return next;
    });
  }, []);

  const buildNameFields = useCallback(
    (trimmed: string): Pick<
      CreateSpaceChannelCategoryParams,
      'name' | 'encryptedName' | 'nameNonce' | 'cipherId'
    > | null => {
      if (space.e2ee) {
        if (!spaceCipher) return null;
        return encryptSpaceMetadataField(spaceCipher, trimmed);
      }
      return { name: trimmed };
    },
    [space.e2ee, spaceCipher],
  );

  const handleSubmit = useCallback(async () => {
    const trimmed = name.trim();
    if (submitting || !trimmed) return;
    setSubmitting(true);

    const nameFields = buildNameFields(trimmed);
    if (!nameFields) {
      setSubmitting(false);
      toast.error(
        t(isEdit ? 'spaces.editCategory.error' : 'spaces.createCategory.error'),
      );
      return;
    }

    try {
      if (isEdit && category) {
        const body: UpdateSpaceChannelCategoryParams = {
          ...nameFields,
          allowedRoleIds: [...selectedRoleIds],
        };
        const res = await api.spaces.updateCategory(space.id, category.id, body);
        if (res.success && res.data?.category) {
          onUpdated?.(res.data.category);
          onOpenChange(false);
        } else {
          toast.error(t('spaces.editCategory.error'));
        }
        return;
      }

      const body: CreateSpaceChannelCategoryParams = {
        ...nameFields,
        allowedRoleIds: [...selectedRoleIds],
        ...(parentCategoryId ? { parentCategoryId } : {}),
      };
      const res = await api.spaces.createCategory(space.id, body);
      if (res.success && res.data?.category) {
        onCreated?.(res.data.category);
        onOpenChange(false);
      } else {
        toast.error(t('spaces.createCategory.error'));
      }
    } finally {
      setSubmitting(false);
    }
  }, [
    name,
    submitting,
    buildNameFields,
    isEdit,
    category,
    parentCategoryId,
    selectedRoleIds,
    api,
    space.id,
    onUpdated,
    onCreated,
    onOpenChange,
    toast,
    t,
  ]);

  const i18n = isEdit ? 'spaces.editCategory' : 'spaces.createCategory';

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(d) => onOpenChange(d.open)}
      closeOnInteractOutside={!submitting}
    >
      <Portal>
        <Dialog.Backdrop className="confirm-dialog-backdrop" />
        <Dialog.Positioner className="confirm-dialog-positioner">
          <Dialog.Content className="confirm-dialog-content confirm-dialog-md create-channel-modal">
            <div className="confirm-dialog-header">
              <Dialog.Title className="confirm-dialog-title">
                {t(`${i18n}.title`)}
              </Dialog.Title>
            </div>
            <div className="create-channel-modal-body">
              <div className="create-channel-field">
                <Input
                  label={t('spaces.createCategory.nameLabel')}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t('spaces.createCategory.namePlaceholder')}
                  inputSize="sm"
                  disabled={submitting}
                  autoFocus
                />
              </div>
              <ChannelRoleMultiselect
                roles={selectableRoles}
                selectedRoleIds={selectedRoleIds}
                onToggle={toggleRole}
                spaceCipher={spaceCipher}
                disabled={submitting}
                loading={loadingRoles}
              />
            </div>
            <div className="confirm-dialog-actions">
              <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={submitting}>
                {t('spaces.createChannel.cancel')}
              </Button>
              <Button
                variant="primary"
                onClick={() => void handleSubmit()}
                disabled={submitting || !name.trim()}
              >
                {submitting
                  ? t(isEdit ? 'spaces.editCategory.saving' : 'spaces.createCategory.creating')
                  : t(isEdit ? 'spaces.editCategory.save' : 'spaces.createCategory.create')}
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}
