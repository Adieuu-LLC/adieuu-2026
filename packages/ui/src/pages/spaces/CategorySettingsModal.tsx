/**
 * Modal to create or edit a Space channel category (name, role ACL, encryption).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Dialog, Portal } from '@ark-ui/react';
import { useTranslation } from 'react-i18next';
import {
  createApiClient,
  type CipherCheck,
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
import { useCipherStore } from '../../hooks/useCipherStore';
import {
  createSpaceCipherCheck,
  getCategoryCipherLink,
  getSpaceCipherLink,
  registerCategoryCipherLink,
} from '../../services/spaceCipherService';
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
import type { CipherSource, EntropyRow } from './SpaceCipherFormFields';
import { resolveSpaceCipherSelection } from './resolveSpaceCipherSelection';
import { ChannelSettingsEncryption } from './ChannelSettingsEncryption';
import { ChannelRoleMultiselect } from './ChannelRoleMultiselect';

export interface CategorySettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  space: PublicSpace;
  heldRoleIds: readonly string[];
  canManageEncryption?: boolean;
  category?: PublicSpaceChannelCategory | null;
  /** When creating, nest under this category. */
  parentCategoryId?: string | null;
  /** Prefill ACL when creating (e.g. inherit from parent category). */
  initialAllowedRoleIds?: readonly string[] | null;
  /** Prefill content Cipher when creating (e.g. inherit from parent). */
  initialCipherCheck?: CipherCheck | null;
  onCreated?: (category: PublicSpaceChannelCategory) => void;
  onUpdated?: (category: PublicSpaceChannelCategory) => void;
}

type ResolvedEncryption =
  | { kind: 'unchanged' }
  | { kind: 'off' }
  | { kind: 'on'; cipherCheck: CipherCheck; localCipherId: string };

export function CategorySettingsModal({
  open,
  onOpenChange,
  space,
  heldRoleIds,
  canManageEncryption = false,
  category = null,
  parentCategoryId = null,
  initialAllowedRoleIds = null,
  initialCipherCheck = null,
  onCreated,
  onUpdated,
}: CategorySettingsModalProps) {
  const { t } = useTranslation();
  const { apiBaseUrl } = useAppConfig();
  const api = useMemo(() => createApiClient({ baseUrl: apiBaseUrl }), [apiBaseUrl]);
  const toast = useToast();
  const { spaceCipher } = useSpaceCipher(space.id);
  const {
    ciphers,
    getCipherKey,
    createCipher,
    encryptionAvailable,
  } = useCipherStore();
  const isEdit = !!category;

  const [name, setName] = useState('');
  const [roles, setRoles] = useState<PublicSpaceRole[]>([]);
  const [selectedRoleIds, setSelectedRoleIds] = useState<Set<string>>(new Set());
  const [encrypt, setEncrypt] = useState(false);
  const [storedCipherCheck, setStoredCipherCheck] = useState<CipherCheck | null>(null);
  const [cipherSource, setCipherSource] = useState<CipherSource>('existing');
  const [selectedCipherId, setSelectedCipherId] = useState('');
  const [newCipherName, setNewCipherName] = useState('');
  const [entropyRows, setEntropyRows] = useState<EntropyRow[]>([{ id: '1', value: '' }]);
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
    setCipherSource('existing');
    setNewCipherName('');
    setEntropyRows([{ id: '1', value: '' }]);
    const linked = category
      ? (getCategoryCipherLink(category.id) ?? getSpaceCipherLink(space.id) ?? '')
      : (getSpaceCipherLink(space.id) ?? '');
    setSelectedCipherId(linked);

    if (category) {
      setName(
        resolveChannelDisplayName(category, spaceCipher, {
          encryptedChannel: '',
        }),
      );
      setSelectedRoleIds(new Set(category.allowedRoleIds));
      const hasCipher = !!category.cipherCheck;
      setEncrypt(hasCipher || !!space.e2ee);
      setStoredCipherCheck(category.cipherCheck ?? null);
    } else {
      setName('');
      setSelectedRoleIds(
        initialAllowedRoleIds?.length ? new Set(initialAllowedRoleIds) : new Set(),
      );
      const seedCipher = initialCipherCheck ?? null;
      setEncrypt(!!seedCipher || !!space.e2ee);
      setStoredCipherCheck(seedCipher);
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
  }, [
    open,
    api,
    space.id,
    space.e2ee,
    category,
    spaceCipher,
    initialAllowedRoleIds,
    initialCipherCheck,
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

  const initialLinkedCipherId = useMemo(() => {
    if (!category) return getSpaceCipherLink(space.id);
    return getCategoryCipherLink(category.id) ?? getSpaceCipherLink(space.id);
  }, [category, space.id]);

  const encryptionSelectionChanged = useCallback((): boolean => {
    if (!encrypt) return !!storedCipherCheck;
    // Create: leave unset so the API inherits parent category (then Space),
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
      return !(storedCipherCheck || space.e2ee || space.cipherCheck);
    }
    if (!storedCipherCheck) return true;
    if (cipherSource === 'new') return true;
    if (cipherSource === 'existing') {
      if (selectedCipherId) return selectedCipherId !== initialLinkedCipherId;
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

  const resolveEncryptionPayload = useCallback(async (): Promise<
    | { ok: true; value: ResolvedEncryption }
    | { ok: false; error: string }
  > => {
    if (!canManageEncryption) {
      return { ok: true, value: { kind: 'unchanged' } };
    }
    if (!encrypt) {
      return {
        ok: true,
        value: storedCipherCheck ? { kind: 'off' } : { kind: 'unchanged' },
      };
    }
    if (!encryptionSelectionChanged()) {
      return { ok: true, value: { kind: 'unchanged' } };
    }
    if (!encryptionAvailable) {
      return { ok: false, error: t('spaces.create.errors.cipherRequired') };
    }
    if (cipherSource === 'existing' && !selectedCipherId && space.cipherCheck) {
      return {
        ok: true,
        value: {
          kind: 'on',
          cipherCheck: space.cipherCheck,
          localCipherId: getSpaceCipherLink(space.id) ?? '',
        },
      };
    }
    if (
      cipherSource === 'existing' &&
      !selectedCipherId &&
      initialCipherCheck &&
      !isEdit
    ) {
      return {
        ok: true,
        value: {
          kind: 'on',
          cipherCheck: initialCipherCheck,
          localCipherId: '',
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
      fallbackName: name.trim() || space.name || 'Category Cipher',
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
        },
      };
    } catch {
      return { ok: false, error: t('spaces.create.errors.createFailed') };
    }
  }, [
    canManageEncryption,
    encrypt,
    storedCipherCheck,
    encryptionSelectionChanged,
    encryptionAvailable,
    cipherSource,
    selectedCipherId,
    space.cipherCheck,
    space.id,
    space.name,
    initialCipherCheck,
    isEdit,
    getCipherKey,
    entropyRows,
    createCipher,
    newCipherName,
    name,
    t,
  ]);

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

    const encResolved = await resolveEncryptionPayload();
    if (!encResolved.ok) {
      setSubmitting(false);
      toast.error(encResolved.error);
      return;
    }

    try {
      const encryptionFields: Pick<
        CreateSpaceChannelCategoryParams,
        'encrypt' | 'cipherCheck'
      > = {};
      if (encResolved.value.kind === 'off') {
        encryptionFields.encrypt = false;
      } else if (encResolved.value.kind === 'on') {
        encryptionFields.encrypt = true;
        encryptionFields.cipherCheck = encResolved.value.cipherCheck;
      }

      if (isEdit && category) {
        const body: UpdateSpaceChannelCategoryParams = {
          ...nameFields,
          allowedRoleIds: [...selectedRoleIds],
          ...encryptionFields,
        };
        const res = await api.spaces.updateCategory(space.id, category.id, body);
        if (res.success && res.data?.category) {
          if (encResolved.value.kind === 'on' && encResolved.value.localCipherId) {
            registerCategoryCipherLink(res.data.category.id, encResolved.value.localCipherId);
          }
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
        ...encryptionFields,
      };
      const res = await api.spaces.createCategory(space.id, body);
      if (res.success && res.data?.category) {
        if (encResolved.value.kind === 'on' && encResolved.value.localCipherId) {
          registerCategoryCipherLink(res.data.category.id, encResolved.value.localCipherId);
        }
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
    resolveEncryptionPayload,
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
                  idPrefix="category-settings-cipher"
                  label={t('spaces.createCategory.encryptLabel')}
                  hint={
                    space.e2ee
                      ? t('spaces.createCategory.encryptSpaceE2eeHint')
                      : t('spaces.createCategory.encryptHint')
                  }
                />
              )}
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
