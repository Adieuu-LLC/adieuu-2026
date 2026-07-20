/**
 * Modal to create or edit a Space text channel (name, role ACL, encryption).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Dialog, Portal } from '@ark-ui/react';
import { useTranslation } from 'react-i18next';
import {
  createApiClient,
  type CipherCheck,
  type CreateSpaceChannelParams,
  type PublicSpace,
  type PublicSpaceChannel,
  type PublicSpaceRole,
  type UpdateSpaceChannelParams,
} from '@adieuu/shared';
import { Button } from '../../components/Button';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Input } from '../../components/Input';
import { useAppConfig } from '../../config';
import { useToast } from '../../components/Toast';
import { useCipherStore } from '../../hooks/useCipherStore';
import {
  createSpaceCipherCheck,
  getChannelCipherLink,
  getSpaceCipherLink,
  registerChannelCipherLink,
} from '../../services/spaceCipherService';
import { useSpaceCipher } from './useSpaceCipher';
import {
  encryptSpaceMetadataField,
  resolveChannelDisplayName,
  resolveRoleDisplayName,
} from './spaceMetadataCipher';
import {
  actorTopRolePosition,
  findEveryoneRole,
  rolesAtOrBelowHierarchy,
} from './channelRoleHierarchy';
import type { CipherSource, EntropyRow } from './SpaceCipherFormFields';
import { resolveSpaceCipherSelection } from './resolveSpaceCipherSelection';
import { ChannelSettingsEncryption } from './ChannelSettingsEncryption';

export interface ChannelSettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  space: PublicSpace;
  heldRoleIds: readonly string[];
  canManageChannels?: boolean;
  canManageEncryption?: boolean;
  channel?: PublicSpaceChannel | null;
  onCreated?: (channel: PublicSpaceChannel) => void;
  onUpdated?: (channel: PublicSpaceChannel) => void;
}

type ResolvedEncryption =
  | { kind: 'unchanged' }
  | { kind: 'off' }
  | { kind: 'on'; cipherCheck: CipherCheck; localCipherId: string; needsConfirm: boolean };

export function ChannelSettingsModal({
  open,
  onOpenChange,
  space,
  heldRoleIds,
  canManageChannels = true,
  canManageEncryption = false,
  channel = null,
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
  const [roles, setRoles] = useState<PublicSpaceRole[]>([]);
  const [selectedRoleIds, setSelectedRoleIds] = useState<Set<string>>(new Set());
  const [encrypt, setEncrypt] = useState(false);
  const [initialCipherCheck, setInitialCipherCheck] = useState<CipherCheck | null>(null);
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

  const selectableRoles = useMemo(() => {
    const top = actorTopRolePosition(heldRoleIds, roles);
    if (top === null) return [];
    return rolesAtOrBelowHierarchy(roles, top).sort((a, b) => a.position - b.position);
  }, [heldRoleIds, roles]);

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
      const hasChannelCipher = !!channel.cipherCheck;
      setEncrypt(hasChannelCipher || !!space.e2ee);
      setInitialCipherCheck(channel.cipherCheck ?? null);
      setSelectedRoleIds(new Set(channel.allowedRoleIds));
    } else {
      setName('');
      setEncrypt(!!space.e2ee);
      setInitialCipherCheck(null);
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
          const everyone = findEveryoneRole(list);
          setSelectedRoleIds(everyone ? new Set([everyone.id]) : new Set());
        }
      });
    } else {
      setLoadingRoles(false);
      setRoles([]);
    }
    return () => {
      cancelled = true;
    };
  }, [open, api, space.id, space.e2ee, channel, spaceCipher, canManageChannels]);

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
    if (!encrypt) return !!initialCipherCheck;
    if (!initialCipherCheck) return true;
    if (cipherSource === 'new') return true;
    if (cipherSource === 'existing') {
      if (selectedCipherId) return selectedCipherId !== initialLinkedCipherId;
      // Inherit Space challenge — changed only when channel wasn't already on it.
      return !(
        space.cipherCheck &&
        initialCipherCheck.knownValue === space.cipherCheck.knownValue &&
        initialCipherCheck.nonce === space.cipherCheck.nonce
      );
    }
    return true;
  }, [
    encrypt,
    initialCipherCheck,
    cipherSource,
    selectedCipherId,
    initialLinkedCipherId,
    space.cipherCheck,
  ]);

  const resolveEncryptionPayload = useCallback(async (): Promise<
    | { ok: true; value: ResolvedEncryption }
    | { ok: false; error: string }
  > => {
    if (!encrypt) {
      return {
        ok: true,
        value: initialCipherCheck ? { kind: 'off' } : { kind: 'unchanged' },
      };
    }

    if (!encryptionSelectionChanged()) {
      return { ok: true, value: { kind: 'unchanged' } };
    }

    if (!encryptionAvailable) {
      return { ok: false, error: t('spaces.create.errors.cipherRequired') };
    }

    // Prefer an explicit picker selection; otherwise inherit the Space challenge.
    if (cipherSource === 'existing' && !selectedCipherId && space.cipherCheck) {
      return {
        ok: true,
        value: {
          kind: 'on',
          cipherCheck: space.cipherCheck,
          localCipherId: getSpaceCipherLink(space.id) ?? '',
          needsConfirm: true,
        },
      };
    }

    const resolved = await resolveSpaceCipherSelection({
      cipherSource,
      selectedCipherId,
      getCipherKey,
      entropyRows,
      createCipher,
      newCipherName,
      fallbackName: name.trim() || space.name || 'Channel Cipher',
      errors: {
        cipherRequired: t('spaces.create.errors.cipherRequired'),
        entropyRequired: t('spaces.create.errors.entropyRequired'),
        createFailed: t('spaces.create.errors.createFailed'),
      },
    });
    if ('error' in resolved) return { ok: false, error: resolved.error };

    try {
      const cipherCheck = await createSpaceCipherCheck(resolved.cipher, space.id);
      return {
        ok: true,
        value: {
          kind: 'on',
          cipherCheck,
          localCipherId: resolved.localId,
          needsConfirm: true,
        },
      };
    } catch {
      return { ok: false, error: t('spaces.create.errors.createFailed') };
    }
  }, [
    encrypt,
    initialCipherCheck,
    encryptionSelectionChanged,
    encryptionAvailable,
    cipherSource,
    selectedCipherId,
    space.cipherCheck,
    space.e2ee,
    space.id,
    space.name,
    getCipherKey,
    entropyRows,
    createCipher,
    newCipherName,
    name,
    t,
  ]);

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

    let encryption:
      | { encrypt: boolean; cipherCheck?: CipherCheck }
      | undefined;
    let localCipherId = '';
    if (canManageEncryption && resolvedEnc) {
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
            ? { ...nameFields, allowedRoleIds: [...selectedRoleIds] }
            : {}),
          ...(encryption ?? {}),
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

      // Create always sends encryption intent when the actor can manage it.
      const createEncryption =
        encryption ??
        (canManageEncryption
          ? encrypt
            ? undefined // unresolved "unchanged" while encrypting shouldn't happen on create
            : { encrypt: false as const }
          : undefined);
      const body: CreateSpaceChannelParams = {
        type: 'text',
        ...nameFields,
        allowedRoleIds: [...selectedRoleIds],
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
    submitting,
    canManageChannels,
    canManageEncryption,
    buildNameFields,
    isEdit,
    channel,
    selectedRoleIds,
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
                    <label className="create-channel-field">
                      <span className="create-channel-field-label">
                        {t('spaces.createChannel.nameLabel')}
                      </span>
                      <Input
                        inputSize="sm"
                        placeholder={t('spaces.createChannel.namePlaceholder')}
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        disabled={submitting}
                        autoFocus
                      />
                    </label>

                    <label className="create-channel-field">
                      <span className="create-channel-field-label">
                        {t('spaces.createChannel.typeLabel')}
                      </span>
                      <select
                        className="create-channel-type-select"
                        value="text"
                        disabled
                        aria-label={t('spaces.createChannel.typeLabel')}
                      >
                        <option value="text">{t('spaces.createChannel.typeText')}</option>
                      </select>
                    </label>

                    <fieldset
                      className="create-channel-roles"
                      disabled={loadingRoles || submitting}
                    >
                      <legend className="create-channel-field-label">
                        {t('spaces.createChannel.rolesLabel')}
                      </legend>
                      <p className="create-channel-field-hint">
                        {t('spaces.createChannel.rolesHint')}
                      </p>
                      <ul className="create-channel-role-list">
                        {selectableRoles.map((role) => {
                          const label = resolveRoleDisplayName(role, spaceCipher, {
                            encryptedRole: t('spaces.encryptedRolePlaceholder'),
                          });
                          return (
                            <li key={role.id}>
                              <label className="create-channel-role-option">
                                <input
                                  type="checkbox"
                                  checked={selectedRoleIds.has(role.id)}
                                  onChange={() => toggleRole(role.id)}
                                />
                                <span
                                  className="create-channel-role-swatch"
                                  style={{ backgroundColor: role.color }}
                                  aria-hidden
                                />
                                <span>{label}</span>
                              </label>
                            </li>
                          );
                        })}
                      </ul>
                    </fieldset>
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
