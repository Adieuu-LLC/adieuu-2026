/**
 * Modal to create or edit a Space text channel (name, role ACL, encryption).
 */

import {
  type CipherCheck,
  type CreateSpaceChannelParams,
  createApiClient,
  type PublicSpace,
  type PublicSpaceChannel,
  type PublicSpaceChannelCategory,
  type PublicSpaceRole,
  type SpaceChannelType,
  type UpdateSpaceChannelParams,
} from '@adieuu/shared';
import { Dialog, Portal } from '@ark-ui/react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/Button';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Input } from '../../components/Input';
import { useToast } from '../../components/Toast';
import { useAppConfig } from '../../config';
import { useCipherStore } from '../../hooks/useCipherStore';
import {
  getCategoryCipherLink,
  getChannelCipherLink,
  getSpaceCipherLink,
  registerChannelCipherLink,
} from '../../services/spaceCipherService';
import { ChannelRoleMultiselect } from './ChannelRoleMultiselect';
import { ChannelSettingsEncryption } from './ChannelSettingsEncryption';
import {
  actorTopRolePosition,
  roleIdsForAclPicker,
  rolesAtOrBelowHierarchy,
} from './channelRoleHierarchy';
import type { CipherSource, EntropyRow } from './SpaceCipherFormFields';
import {
  encryptSpaceMetadataField,
  resolveChannelDisplayName,
} from './spaceMetadataCipher';
import {
  ancestorForceFlags,
  resolveParentCipherCheck,
  resolveParentRoleIds,
} from './spaceSettingsInherit';
import {
  type ResolvedChannelEncryption,
  useChannelEncryptionPayload,
} from './useChannelEncryptionPayload';
import { useSpaceCipher } from './useSpaceCipher';

export interface ChannelSettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  space: PublicSpace;
  heldRoleIds: readonly string[];
  canManageChannels?: boolean;
  canManageEncryption?: boolean;
  channel?: PublicSpaceChannel | null;
  /** All categories in the Space (for parent / force resolution). */
  categories?: readonly PublicSpaceChannelCategory[];
  /** When creating, place the channel in this category (inherits ACL if roles not overridden). */
  categoryId?: string | null;
  /** Prefill role ACL when creating (e.g. inherited from a category). */
  initialAllowedRoleIds?: readonly string[] | null;
  /** Prefill content Cipher when creating (e.g. inherited from a category). */
  initialCipherCheck?: CipherCheck | null;
  onCreated?: (channel: PublicSpaceChannel) => void;
  onUpdated?: (channel: PublicSpaceChannel) => void;
}

type ResolvedEncryption = ResolvedChannelEncryption;

export function ChannelSettingsModal({
  open,
  onOpenChange,
  space,
  heldRoleIds,
  canManageChannels = true,
  canManageEncryption = false,
  channel = null,
  categories = [],
  categoryId = null,
  initialAllowedRoleIds = null,
  initialCipherCheck: seedCipherCheck = null,
  onCreated,
  onUpdated,
}: ChannelSettingsModalProps) {
  const { t } = useTranslation();
  const { apiBaseUrl } = useAppConfig();
  const api = useMemo(() => createApiClient({ baseUrl: apiBaseUrl }), [apiBaseUrl]);
  const toast = useToast();
  const { spaceCipher } = useSpaceCipher(space.id);
  const {
    ciphers,
    getCipherKey,
    createCipher,
    bookmarkSpaceCipher,
    encryptionAvailable,
  } = useCipherStore();
  const isEdit = !!channel;

  const [name, setName] = useState('');
  const [channelType, setChannelType] = useState<SpaceChannelType>('text');
  const [roles, setRoles] = useState<PublicSpaceRole[]>([]);
  const [selectedRoleIds, setSelectedRoleIds] = useState<Set<string>>(new Set());
  const [encrypt, setEncrypt] = useState(false);
  const [storedCipherCheck, setStoredCipherCheck] = useState<CipherCheck | null>(null);
  const [inheritAcl, setInheritAcl] = useState(true);
  const [inheritCipher, setInheritCipher] = useState(true);
  const [cipherSource, setCipherSource] = useState<CipherSource>('existing');
  const [selectedCipherId, setSelectedCipherId] = useState('');
  const [newCipherName, setNewCipherName] = useState('');
  const [entropyRows, setEntropyRows] = useState<EntropyRow[]>([{ id: '1', value: '' }]);
  const [loadingRoles, setLoadingRoles] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [cipherConfirmOpen, setCipherConfirmOpen] = useState(false);
  const [pendingEncryption, setPendingEncryption] = useState<Extract<
    ResolvedEncryption,
    { kind: 'on' }
  > | null>(null);

  const categoriesById = useMemo(
    () => new Map(categories.map((c) => [c.id, c])),
    [categories],
  );
  const effectiveCategoryId = isEdit ? (channel?.categoryId ?? null) : categoryId;
  const parentCategory = effectiveCategoryId
    ? (categoriesById.get(effectiveCategoryId) ?? null)
    : null;
  const forceInfo = useMemo(
    () => ancestorForceFlags(effectiveCategoryId, categoriesById),
    [effectiveCategoryId, categoriesById],
  );
  const forceAclName = forceInfo.forceAclBy
    ? resolveChannelDisplayName(forceInfo.forceAclBy, spaceCipher, {
        encryptedChannel: t('spaces.encryptedChannelPlaceholder'),
      })
    : null;
  const forceCipherName = forceInfo.forceCipherBy
    ? resolveChannelDisplayName(forceInfo.forceCipherBy, spaceCipher, {
        encryptedChannel: t('spaces.encryptedChannelPlaceholder'),
      })
    : null;

  const selectableRoles = useMemo(() => {
    const top = actorTopRolePosition(heldRoleIds, roles);
    if (top === null) return [];
    return rolesAtOrBelowHierarchy(roles, top).sort((a, b) => a.position - b.position);
  }, [heldRoleIds, roles]);

  const applyParentAcl = useCallback(
    (roleList: readonly PublicSpaceRole[]) => {
      setSelectedRoleIds(
        new Set(roleIdsForAclPicker(resolveParentRoleIds(parentCategory, roleList), roleList)),
      );
    },
    [parentCategory],
  );

  const applyParentCipher = useCallback(() => {
    const parentCipher = resolveParentCipherCheck(space, parentCategory);
    setEncrypt(!!parentCipher);
    setStoredCipherCheck(parentCipher);
    setCipherSource('existing');
    setNewCipherName('');
    setEntropyRows([{ id: '1', value: '' }]);
    const linked = parentCategory
      ? (getCategoryCipherLink(parentCategory.id) ?? getSpaceCipherLink(space.id) ?? '')
      : (getSpaceCipherLink(space.id) ?? '');
    setSelectedCipherId(parentCipher ? linked : '');
  }, [space, parentCategory]);

  // Keep role/encryption previews in sync while Inherit is on.
  useEffect(() => {
    if (!open || !inheritAcl || roles.length === 0) return;
    applyParentAcl(roles);
  }, [open, inheritAcl, roles, applyParentAcl]);

  useEffect(() => {
    if (!open || !inheritCipher) return;
    applyParentCipher();
  }, [open, inheritCipher, applyParentCipher]);

  useEffect(() => {
    if (!open) return;
    setSubmitting(false);
    setCipherConfirmOpen(false);
    setCipherSource('existing');
    setNewCipherName('');
    setEntropyRows([{ id: '1', value: '' }]);
    const linked = getSpaceCipherLink(space.id) ?? '';
    setSelectedCipherId(linked);

    if (channel) {
      setName(
        resolveChannelDisplayName(channel, spaceCipher, {
          encryptedChannel: '',
        }),
      );
      setChannelType(channel.type);
      const hasChannelCipher = !!channel.cipherCheck;
      setEncrypt(hasChannelCipher || !!space.e2ee);
      setStoredCipherCheck(channel.cipherCheck ?? null);
      // Stripped once roles load; placeholder until then.
      setSelectedRoleIds(new Set(channel.allowedRoleIds));
      setInheritAcl(channel.inheritAllowedRoleIds || forceInfo.forceAcl);
      setInheritCipher(channel.inheritCipherCheck || forceInfo.forceCipher);
    } else {
      setName('');
      setChannelType('text');
      setInheritAcl(true);
      setInheritCipher(true);
      const seedCipher = seedCipherCheck ?? null;
      setEncrypt(!!seedCipher || !!space.e2ee);
      setStoredCipherCheck(seedCipher);
      setSelectedRoleIds(new Set());
    }

    let cancelled = false;
    if (canManageChannels) {
      setLoadingRoles(true);
      void api.spaces.listRoles(space.id).then((res) => {
        if (cancelled) return;
        setLoadingRoles(false);
        if (!res.success || !res.data?.roles) {
          setRoles([]);
          if (!channel) setSelectedRoleIds(new Set());
          return;
        }
        const list = res.data.roles;
        setRoles(list);
        if (!channel) {
          if (initialAllowedRoleIds && initialAllowedRoleIds.length > 0) {
            setSelectedRoleIds(new Set(roleIdsForAclPicker(initialAllowedRoleIds, list)));
          } else {
            applyParentAcl(list);
          }
        } else if (channel.inheritAllowedRoleIds || forceInfo.forceAcl) {
          applyParentAcl(list);
        } else {
          setSelectedRoleIds(new Set(roleIdsForAclPicker(channel.allowedRoleIds, list)));
        }
      });
    } else {
      setLoadingRoles(false);
      setRoles([]);
    }
    return () => {
      cancelled = true;
    };
  }, [
    open,
    api,
    space.id,
    space.e2ee,
    channel,
    spaceCipher,
    canManageChannels,
    initialAllowedRoleIds,
    seedCipherCheck,
    forceInfo.forceAcl,
    forceInfo.forceCipher,
    applyParentAcl,
  ]);

  const toggleRole = useCallback((roleId: string) => {
    setSelectedRoleIds((prev) => {
      const next = new Set(prev);
      if (next.has(roleId)) next.delete(roleId);
      else next.add(roleId);
      return next;
    });
  }, []);

  const onEntropyRowChange = useCallback((id: string, value: string) => {
    setEntropyRows((rows) => rows.map((r) => (r.id === id ? { ...r, value } : r)));
  }, []);
  const onAddEntropyRow = useCallback(() => {
    setEntropyRows((rows) => [...rows, { id: `${Date.now()}`, value: '' }]);
  }, []);
  const onRemoveEntropyRow = useCallback((id: string) => {
    setEntropyRows((rows) => (rows.length <= 1 ? rows : rows.filter((r) => r.id !== id)));
  }, []);

  const buildNameFields = useCallback(
    (trimmed: string): Pick<
      CreateSpaceChannelParams,
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

  const initialLinkedCipherId = useMemo(() => {
    if (!channel) return getSpaceCipherLink(space.id);
    return getChannelCipherLink(channel.id) ?? getSpaceCipherLink(space.id);
  }, [channel, space.id]);

  const encryptionSelectionChanged = useCallback((): boolean => {
    if (!encrypt) return !!storedCipherCheck;
    // Create: leave unset so the API inherits category (then Space) defaults,
    // unless the user explicitly picks/creates a Cipher.
    if (!isEdit) {
      if (cipherSource === 'new') return true;
      if (
        cipherSource === 'existing' &&
        selectedCipherId &&
        selectedCipherId !== (getSpaceCipherLink(space.id) ?? '')
      ) {
        return true;
      }
      // Inheritance can supply a challenge — otherwise resolve the picker.
      return !(storedCipherCheck || space.e2ee || space.cipherCheck);
    }
    if (!storedCipherCheck) return true;
    if (cipherSource === 'new') return true;
    if (cipherSource === 'existing') {
      if (selectedCipherId) return selectedCipherId !== initialLinkedCipherId;
      // Inherit Space challenge — changed only when channel wasn't already on it.
      return !(
        space.cipherCheck &&
        storedCipherCheck.knownValue === space.cipherCheck.knownValue &&
        storedCipherCheck.nonce === space.cipherCheck.nonce
      );
    }
    return true;
  }, [
    encrypt,
    isEdit,
    storedCipherCheck,
    cipherSource,
    selectedCipherId,
    initialLinkedCipherId,
    space.cipherCheck,
    space.e2ee,
    space.id,
  ]);

  const resolveEncryptionPayload = useChannelEncryptionPayload({
    inheritCipher,
    forceCipher: forceInfo.forceCipher,
    encrypt,
    storedCipherCheck,
    encryptionSelectionChanged,
    encryptionAvailable,
    cipherSource,
    selectedCipherId,
    space,
    getCipherKey,
    entropyRows,
    createCipher,
    newCipherName,
    name,
    isEdit,
  });

  const handleInheritAclChange = useCallback(
    (value: boolean) => {
      setInheritAcl(value);
      if (value) applyParentAcl(roles);
    },
    [applyParentAcl, roles],
  );

  const handleInheritCipherChange = useCallback(
    (value: boolean) => {
      setInheritCipher(value);
      if (value) applyParentCipher();
    },
    [applyParentCipher],
  );

  const performSave = useCallback(async (resolvedEnc: ResolvedEncryption | null) => {
    const trimmed = name.trim();
    if (submitting) return;
    if (canManageChannels && !trimmed) return;

    setSubmitting(true);

    let nameFields: ReturnType<typeof buildNameFields> = {};
    if (canManageChannels) {
      nameFields = buildNameFields(trimmed);
      if (!nameFields) {
        setSubmitting(false);
        toast.error(
          t(isEdit ? 'spaces.editChannel.error' : 'spaces.createChannel.error'),
        );
        return;
      }
    }

    const effectiveInheritAcl = inheritAcl || forceInfo.forceAcl;
    const effectiveInheritCipher = inheritCipher || forceInfo.forceCipher;

    let encryption:
      | { encrypt: boolean; cipherCheck?: CipherCheck }
      | undefined;
    let localCipherId = '';
    if (canManageEncryption && resolvedEnc && !effectiveInheritCipher) {
      if (resolvedEnc.kind === 'off') {
        encryption = { encrypt: false };
      } else if (resolvedEnc.kind === 'on') {
        encryption = { encrypt: true, cipherCheck: resolvedEnc.cipherCheck };
        localCipherId = resolvedEnc.localCipherId;
      }
    }

    try {
      if (isEdit && channel) {
        const body: UpdateSpaceChannelParams = {
          ...(canManageChannels
            ? {
                ...nameFields,
                ...(effectiveInheritAcl ? {} : { allowedRoleIds: [...selectedRoleIds] }),
                inheritAllowedRoleIds: effectiveInheritAcl,
              }
            : {}),
          ...(canManageEncryption
            ? {
                ...(encryption ?? {}),
                inheritCipherCheck: effectiveInheritCipher,
              }
            : {}),
        };
        if (Object.keys(body).length === 0) {
          onOpenChange(false);
          return;
        }
        const res = await api.spaces.updateChannel(space.id, channel.id, body);
        if (res.success && res.data?.channel) {
          if (localCipherId) {
            registerChannelCipherLink(channel.id, localCipherId);
            if (!getSpaceCipherLink(space.id)) {
              await bookmarkSpaceCipher(localCipherId, space.id);
            }
          }
          onUpdated?.(res.data.channel);
          onOpenChange(false);
        } else {
          toast.error(t('spaces.editChannel.error'));
        }
        return;
      }

      const createEncryption =
        effectiveInheritCipher
          ? undefined
          : (encryption ??
            (canManageEncryption
              ? encrypt
                ? undefined
                : { encrypt: false as const }
              : undefined));
      const body: CreateSpaceChannelParams = {
        type: channelType,
        ...nameFields,
        ...(effectiveInheritAcl ? {} : { allowedRoleIds: [...selectedRoleIds] }),
        inheritAllowedRoleIds: effectiveInheritAcl,
        inheritCipherCheck: effectiveInheritCipher,
        ...(categoryId ? { categoryId } : {}),
        ...(createEncryption ?? {}),
      };
      const res = await api.spaces.createChannel(space.id, body);
      if (res.success && res.data?.channel) {
        const created = res.data.channel;
        if (localCipherId) {
          registerChannelCipherLink(created.id, localCipherId);
          if (!getSpaceCipherLink(space.id)) {
            await bookmarkSpaceCipher(localCipherId, space.id);
          }
        }
        onCreated?.(created);
        onOpenChange(false);
      } else {
        toast.error(t('spaces.createChannel.error'));
      }
    } finally {
      setSubmitting(false);
      setCipherConfirmOpen(false);
      setPendingEncryption(null);
    }
  }, [
    name,
    channelType,
    submitting,
    canManageChannels,
    canManageEncryption,
    buildNameFields,
    isEdit,
    channel,
    categoryId,
    selectedRoleIds,
    inheritAcl,
    inheritCipher,
    forceInfo.forceAcl,
    forceInfo.forceCipher,
    encrypt,
    api,
    space.id,
    bookmarkSpaceCipher,
    onCreated,
    onUpdated,
    onOpenChange,
    toast,
    t,
  ]);

  const handleSubmit = useCallback(async () => {
    if (!canManageEncryption) {
      await performSave(null);
      return;
    }

    const enc = await resolveEncryptionPayload();
    if (!enc.ok) {
      toast.error(enc.error);
      return;
    }
    if (enc.value.kind === 'on' && enc.value.needsConfirm) {
      setPendingEncryption(enc.value);
      setCipherConfirmOpen(true);
      return;
    }
    await performSave(enc.value);
  }, [canManageEncryption, resolveEncryptionPayload, performSave, toast]);

  const i18n = isEdit ? 'spaces.editChannel' : 'spaces.createChannel';
  const canSubmit =
    !submitting &&
    (canManageChannels ? !!name.trim() : canManageEncryption) &&
    (canManageChannels || canManageEncryption);

  return (
    <>
      <Dialog.Root
        open={open}
        onOpenChange={(e) => onOpenChange(e.open)}
        closeOnInteractOutside={!submitting && !cipherConfirmOpen}
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

              <div className="confirm-dialog-body create-channel-modal-body">
                {canManageChannels && (
                  <>
                    <div className="create-channel-field">
                      <span className="create-channel-field-label">
                        {t('spaces.createChannel.nameLabel')}
                      </span>
                      <Input
                        inputSize="sm"
                        aria-label={t('spaces.createChannel.nameLabel')}
                        placeholder={t('spaces.createChannel.namePlaceholder')}
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        disabled={submitting}
                        autoFocus
                      />
                    </div>

                    <label className="create-channel-field">
                      <span className="create-channel-field-label">
                        {t('spaces.createChannel.typeLabel')}
                      </span>
                      <select
                        className="create-channel-type-select"
                        value={isEdit ? (channel?.type ?? 'text') : channelType}
                        disabled={isEdit || submitting}
                        onChange={(e) =>
                          setChannelType(e.target.value as SpaceChannelType)
                        }
                        aria-label={t('spaces.createChannel.typeLabel')}
                      >
                        <option value="text">{t('spaces.createChannel.typeText')}</option>
                        <option value="voice">{t('spaces.createChannel.typeVoice')}</option>
                      </select>
                    </label>

                    <ChannelRoleMultiselect
                      roles={selectableRoles}
                      catalogRoles={roles}
                      selectedRoleIds={selectedRoleIds}
                      onToggle={toggleRole}
                      spaceCipher={spaceCipher}
                      disabled={submitting}
                      loading={loadingRoles}
                      inheritFromParent={inheritAcl}
                      onInheritFromParentChange={handleInheritAclChange}
                      forcedByName={forceAclName}
                    />
                  </>
                )}

                {canManageEncryption && (
                  <ChannelSettingsEncryption
                    encrypt={encrypt}
                    onEncryptChange={setEncrypt}
                    encryptionAvailable={encryptionAvailable}
                    spaceE2ee={!!space.e2ee}
                    cipherSource={cipherSource}
                    onCipherSourceChange={setCipherSource}
                    ciphers={ciphers}
                    selectedCipherId={selectedCipherId}
                    onSelectedCipherIdChange={setSelectedCipherId}
                    newCipherName={newCipherName}
                    onNewCipherNameChange={setNewCipherName}
                    entropyRows={entropyRows}
                    onEntropyRowChange={onEntropyRowChange}
                    onAddEntropyRow={onAddEntropyRow}
                    onRemoveEntropyRow={onRemoveEntropyRow}
                    disabled={submitting}
                    inheritFromParent={inheritCipher}
                    onInheritFromParentChange={handleInheritCipherChange}
                    forcedByName={forceCipherName}
                  />
                )}
              </div>

              <div className="confirm-dialog-footer">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => onOpenChange(false)}
                  disabled={submitting}
                >
                  {t('spaces.createChannel.cancel')}
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => void handleSubmit()}
                  disabled={!canSubmit}
                >
                  {isEdit
                    ? submitting
                      ? t('spaces.editChannel.saving')
                      : t('spaces.editChannel.save')
                    : submitting
                      ? t('spaces.createChannel.creating')
                      : t('spaces.createChannel.create')}
                </Button>
              </div>
            </Dialog.Content>
          </Dialog.Positioner>
        </Portal>
      </Dialog.Root>

      <ConfirmDialog
        open={cipherConfirmOpen}
        onOpenChange={setCipherConfirmOpen}
        title={t('spaces.editChannel.cipherChangeTitle')}
        description={t('spaces.editChannel.cipherChangeWarning')}
        confirmLabel={t('spaces.editChannel.cipherChangeConfirm')}
        cancelLabel={t('spaces.createChannel.cancel')}
        variant="warning"
        loading={submitting}
        onConfirm={() => void performSave(pendingEncryption)}
      />
    </>
  );
}
