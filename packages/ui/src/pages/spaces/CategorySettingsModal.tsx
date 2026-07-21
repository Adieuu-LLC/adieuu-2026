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
import {
  ancestorForceFlags,
  resolveParentCipherCheck,
  resolveParentRoleIds,
} from './spaceSettingsInherit';

export interface CategorySettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  space: PublicSpace;
  heldRoleIds: readonly string[];
  canManageEncryption?: boolean;
  category?: PublicSpaceChannelCategory | null;
  /** All categories in the Space (for parent / force resolution). */
  categories?: readonly PublicSpaceChannelCategory[];
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
  categories = [],
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
  const [inheritAcl, setInheritAcl] = useState(true);
  const [inheritCipher, setInheritCipher] = useState(true);
  const [forceChildrenAcl, setForceChildrenAcl] = useState(false);
  const [forceChildrenCipher, setForceChildrenCipher] = useState(false);
  const [cipherSource, setCipherSource] = useState<CipherSource>('existing');
  const [selectedCipherId, setSelectedCipherId] = useState('');
  const [newCipherName, setNewCipherName] = useState('');
  const [entropyRows, setEntropyRows] = useState<EntropyRow[]>([{ id: '1', value: '' }]);
  const [loadingRoles, setLoadingRoles] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const categoriesById = useMemo(
    () => new Map(categories.map((c) => [c.id, c])),
    [categories],
  );
  const effectiveParentId = isEdit
    ? (category?.parentCategoryId ?? null)
    : parentCategoryId;
  const parentCategory = effectiveParentId
    ? (categoriesById.get(effectiveParentId) ?? null)
    : null;
  const forceInfo = useMemo(
    () => ancestorForceFlags(effectiveParentId, categoriesById),
    [effectiveParentId, categoriesById],
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
      setSelectedRoleIds(new Set(resolveParentRoleIds(parentCategory, roleList)));
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

  // Keep role/encryption previews in sync while Inherit is on (including after
  // roles finish loading, or when the user re-checks Inherit).
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
      setInheritAcl(category.inheritAllowedRoleIds || forceInfo.forceAcl);
      setInheritCipher(category.inheritCipherCheck || forceInfo.forceCipher);
      setForceChildrenAcl(category.forceChildrenAcl);
      setForceChildrenCipher(category.forceChildrenCipher);
    } else {
      setName('');
      setInheritAcl(true);
      setInheritCipher(true);
      setForceChildrenAcl(false);
      setForceChildrenCipher(false);
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
      } else if (category.inheritAllowedRoleIds || forceInfo.forceAcl) {
        setSelectedRoleIds(new Set(resolveParentRoleIds(parentCategory, list)));
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
    forceInfo.forceAcl,
    forceInfo.forceCipher,
    parentCategory,
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
    if (inheritCipher || forceInfo.forceCipher) {
      // Server materializes from parent when inheritCipherCheck is true.
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
    inheritCipher,
    forceInfo.forceCipher,
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
      if (!inheritCipher && !forceInfo.forceCipher) {
        if (encResolved.value.kind === 'off') {
          encryptionFields.encrypt = false;
        } else if (encResolved.value.kind === 'on') {
          encryptionFields.encrypt = true;
          encryptionFields.cipherCheck = encResolved.value.cipherCheck;
        }
      }

      const inheritFields = {
        inheritAllowedRoleIds: inheritAcl || forceInfo.forceAcl,
        inheritCipherCheck: inheritCipher || forceInfo.forceCipher,
        forceChildrenAcl,
        forceChildrenCipher,
      };

      if (isEdit && category) {
        const body: UpdateSpaceChannelCategoryParams = {
          ...nameFields,
          ...(inheritAcl || forceInfo.forceAcl
            ? {}
            : { allowedRoleIds: [...selectedRoleIds] }),
          ...encryptionFields,
          ...inheritFields,
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
        ...(inheritAcl || forceInfo.forceAcl
          ? {}
          : { allowedRoleIds: [...selectedRoleIds] }),
        ...(parentCategoryId ? { parentCategoryId } : {}),
        ...encryptionFields,
        ...inheritFields,
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
    inheritAcl,
    inheritCipher,
    forceChildrenAcl,
    forceChildrenCipher,
    forceInfo.forceAcl,
    forceInfo.forceCipher,
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
            <div className="confirm-dialog-body create-channel-modal-body">
              <label className="create-channel-field">
                <span className="create-channel-field-label">
                  {t('spaces.createCategory.nameLabel')}
                </span>
                <Input
                  inputSize="sm"
                  placeholder={t('spaces.createCategory.namePlaceholder')}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={submitting}
                  autoFocus
                />
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
                  inheritFromParent={inheritCipher}
                  onInheritFromParentChange={handleInheritCipherChange}
                  forcedByName={forceCipherName}
                />
              )}
              <fieldset className="create-channel-force-children" disabled={submitting}>
                <legend className="create-channel-field-label">
                  {t('spaces.createCategory.forceChildrenLabel')}
                </legend>
                <p className="create-channel-field-hint">
                  {t('spaces.createCategory.forceChildrenHint')}
                </p>
                <div className="create-channel-force-children-options">
                  <label className="create-channel-inherit">
                    <input
                      type="checkbox"
                      checked={forceChildrenAcl}
                      onChange={(e) => setForceChildrenAcl(e.target.checked)}
                    />
                    <span className="create-channel-field-label">
                      {t('spaces.createCategory.forceChildrenAcl')}
                    </span>
                  </label>
                  <label className="create-channel-inherit">
                    <input
                      type="checkbox"
                      checked={forceChildrenCipher}
                      onChange={(e) => setForceChildrenCipher(e.target.checked)}
                      disabled={!canManageEncryption}
                    />
                    <span className="create-channel-field-label">
                      {t('spaces.createCategory.forceChildrenCipher')}
                    </span>
                  </label>
                </div>
              </fieldset>
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
