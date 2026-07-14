/**
 * Create-a-Space flow.
 *
 * Walks the owner through name → URL (live availability) → visibility → an
 * optional end-to-end-encryption step. When E2EE is enabled the client picks
 * (or creates) a Community Cipher, generates the Space `_id` up front, builds a
 * blind-relay `cipherCheck` bound to that id, and submits it with the create
 * call — the server never sees Cipher entropy or keys. On success the local
 * `spaceId → cipherId` link is persisted so the Space view can find its Cipher.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  createApiClient,
  isReservedSpaceSlug,
  SPACE_SLUG_PATTERN,
  SPACE_SLUG_MIN_LENGTH,
  SPACE_SLUG_MAX_LENGTH,
  SPACE_NAME_MAX_LENGTH,
  SPACE_DESCRIPTION_MAX_LENGTH,
  SPACE_VISIBILITY_VALUES,
  type SpaceVisibility,
  type CipherCheck,
} from '@adieuu/shared';
import { createTextEntropy } from '@adieuu/crypto';
import { useAppConfig } from '../../config';
import { useIdentity } from '../../hooks/useIdentity';
import { useCipherStore } from '../../hooks/useCipherStore';
import {
  generateSpaceId,
  createSpaceCipherCheck,
  registerSpaceCipherLink,
} from '../../services/spaceCipherService';
import { emitSpacesChanged } from '../../services/spacesMembershipEvents';
import { useToast } from '../../components/Toast';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Input } from '../../components/Input';
import { Alert } from '../../components/Alert';
import '../../styles/_spaces.scss';

const SLUG_DEBOUNCE_MS = 400;

type SlugState = 'idle' | 'invalid' | 'checking' | 'available' | 'taken';
type CipherSource = 'existing' | 'new';

interface EntropyRow {
  id: string;
  value: string;
}

/** Normalizes free text into a candidate slug (lowercase, hyphenated). */
function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SPACE_SLUG_MAX_LENGTH);
}

/**
 * Normalizes what the user types directly into the URL field. Unlike `slugify`,
 * this preserves a single trailing hyphen so a hyphen can be typed mid-word
 * (e.g. "1-2"): stripping the trailing hyphen on every keystroke would make it
 * impossible to type one. Leading and repeated hyphens are still collapsed since
 * they can never form a valid slug.
 */
function normalizeSlugInput(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+/, '')
    .replace(/-{2,}/g, '-')
    .slice(0, SPACE_SLUG_MAX_LENGTH);
}

/** Whether a slug satisfies the shared length + pattern constraints. */
function isSlugShapeValid(slug: string): boolean {
  return (
    slug.length >= SPACE_SLUG_MIN_LENGTH &&
    slug.length <= SPACE_SLUG_MAX_LENGTH &&
    SPACE_SLUG_PATTERN.test(slug)
  );
}

export function CreateSpace() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const toast = useToast();
  const { apiBaseUrl } = useAppConfig();
  const { status: identityStatus } = useIdentity();
  const isLoggedIn = identityStatus === 'logged_in';
  const api = useMemo(() => createApiClient({ baseUrl: apiBaseUrl }), [apiBaseUrl]);

  const { ciphers, getCipherKey, createCipher, updateCipher, encryptionAvailable } =
    useCipherStore();

  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [slugState, setSlugState] = useState<SlugState>('idle');
  const [description, setDescription] = useState('');
  const [visibility, setVisibility] = useState<SpaceVisibility>('public');
  const [allowFreeMembers, setAllowFreeMembers] = useState(false);

  const [encrypt, setEncrypt] = useState(false);
  const [cipherSource, setCipherSource] = useState<CipherSource>('existing');
  const [selectedCipherId, setSelectedCipherId] = useState('');
  const [newCipherName, setNewCipherName] = useState('');
  const [entropyRows, setEntropyRows] = useState<EntropyRow[]>([{ id: '1', value: '' }]);

  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const slugCheckSeq = useRef(0);
  // Tracks the latest slug so an async create response can tell whether the slug
  // it was submitted with is still the one shown before flagging it taken.
  const slugRef = useRef(slug);
  useEffect(() => {
    slugRef.current = slug;
  }, [slug]);

  // Public Spaces can never be encrypted; drop the encryption step when public.
  const canEncrypt = visibility !== 'public';
  const wantsEncryption = encrypt && canEncrypt;

  useEffect(() => {
    if (!canEncrypt && encrypt) setEncrypt(false);
  }, [canEncrypt, encrypt]);

  // Keep the slug in sync with the name until the user edits the slug directly.
  useEffect(() => {
    if (!slugTouched) setSlug(slugify(name));
  }, [name, slugTouched]);

  // Live slug availability: local shape/reserved checks first, then the API.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (slug.length === 0) {
      setSlugState('idle');
      return;
    }
    if (!isSlugShapeValid(slug)) {
      setSlugState('invalid');
      return;
    }
    // Reserved slugs are surfaced as simply unavailable — no reason to explain
    // the distinction to the user or spend an API round-trip on them.
    if (isReservedSpaceSlug(slug)) {
      setSlugState('taken');
      return;
    }

    setSlugState('checking');
    const seq = ++slugCheckSeq.current;
    debounceRef.current = setTimeout(() => {
      void api.spaces
        .checkSlugAvailability(slug)
        .then((res) => {
          if (seq !== slugCheckSeq.current) return; // stale
          if (res.success && res.data) {
            setSlugState(res.data.available ? 'available' : 'taken');
          } else {
            setSlugState('idle');
          }
        })
        .catch(() => {
          if (seq === slugCheckSeq.current) setSlugState('idle');
        });
    }, SLUG_DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [api, slug]);

  const addEntropyRow = useCallback(() => {
    setEntropyRows((prev) => [...prev, { id: `${Date.now()}-${prev.length}`, value: '' }]);
  }, []);

  const removeEntropyRow = useCallback((id: string) => {
    setEntropyRows((prev) => (prev.length <= 1 ? prev : prev.filter((r) => r.id !== id)));
  }, []);

  const updateEntropyRow = useCallback((id: string, value: string) => {
    setEntropyRows((prev) => prev.map((r) => (r.id === id ? { ...r, value } : r)));
  }, []);

  const slugStatusMessage = (): { text: string; tone: 'ok' | 'error' | 'muted' } | null => {
    switch (slugState) {
      case 'checking':
        return { text: t('spaces.create.slugChecking'), tone: 'muted' };
      case 'available':
        return { text: t('spaces.create.slugAvailable'), tone: 'ok' };
      case 'taken':
        return { text: t('spaces.create.slugTaken'), tone: 'error' };
      case 'invalid':
        return { text: t('spaces.create.slugInvalid'), tone: 'error' };
      default:
        return null;
    }
  };

  /** Resolves the Cipher (and its local id) to bind to an E2EE Space. */
  const resolveCipher = useCallback(async (): Promise<
    { localId: string; cipher: NonNullable<ReturnType<typeof getCipherKey>> } | { error: string }
  > => {
    if (cipherSource === 'existing') {
      if (!selectedCipherId) return { error: t('spaces.create.errors.cipherRequired') };
      const cipher = getCipherKey(selectedCipherId);
      if (!cipher) return { error: t('spaces.create.errors.cipherRequired') };
      return { localId: selectedCipherId, cipher };
    }

    // New Cipher: derive from the entered secret phrases.
    const pieces = entropyRows
      .filter((r) => r.value.trim().length > 0)
      .map((r, idx) => createTextEntropy(r.value.trim(), `Phrase ${idx + 1}`));
    if (pieces.length === 0) return { error: t('spaces.create.errors.entropyRequired') };

    const result = await createCipher({
      name: newCipherName.trim() || name.trim() || 'Space Cipher',
      entropyPieces: pieces,
    });
    if (!result.success || !result.cipher) {
      return { error: result.error ?? t('spaces.create.errors.createFailed') };
    }
    const cipher = getCipherKey(result.cipher.id);
    if (!cipher) return { error: t('spaces.create.errors.createFailed') };
    return { localId: result.cipher.id, cipher };
  }, [
    cipherSource,
    selectedCipherId,
    getCipherKey,
    entropyRows,
    createCipher,
    newCipherName,
    name,
    t,
  ]);

  const mapCreateError = useCallback(
    (code: string | undefined, message: string | undefined, submittedSlug: string): string => {
      switch (code) {
        case 'TIER_REQUIRED':
          return t('spaces.create.errors.tierRequired');
        case 'SLUG_TAKEN':
        case 'SLUG_RESERVED':
          // Only mark the field taken if the user hasn't since edited the slug.
          if (submittedSlug === slugRef.current) setSlugState('taken');
          return t('spaces.create.errors.slugUnavailable');
        default:
          return message ?? t('spaces.create.errors.createFailed');
      }
    },
    [t],
  );

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (submitting) return;
      setFormError(null);

      if (!name.trim()) {
        setFormError(t('spaces.create.errors.nameRequired'));
        return;
      }
      if (slugState !== 'available') {
        setFormError(t('spaces.create.errors.slugUnavailable'));
        return;
      }

      // Snapshot the slug this request is for; the E2EE flow awaits, during which
      // the user could edit the slug.
      const submittedSlug = slug;

      let cipherCheck: CipherCheck | undefined;
      let spaceId: string | undefined;
      let cipherLocalId: string | undefined;

      if (wantsEncryption) {
        if (!encryptionAvailable) {
          setFormError(t('spaces.create.errors.cipherRequired'));
          return;
        }
        setSubmitting(true);
        const resolved = await resolveCipher();
        if ('error' in resolved) {
          setFormError(resolved.error);
          setSubmitting(false);
          return;
        }
        spaceId = generateSpaceId();
        try {
          cipherCheck = await createSpaceCipherCheck(resolved.cipher, spaceId);
        } catch {
          setFormError(t('spaces.create.errors.createFailed'));
          setSubmitting(false);
          return;
        }
        cipherLocalId = resolved.localId;
      } else {
        setSubmitting(true);
      }

      try {
        const res = await api.spaces.create({
          slug: submittedSlug,
          name: name.trim(),
          ...(description.trim() ? { description: description.trim() } : {}),
          visibility,
          allowFreeMembers,
          ...(spaceId ? { id: spaceId } : {}),
          ...(cipherCheck ? { cipherCheck } : {}),
        });

        if (res.success && res.data) {
          const created = res.data;
          if (cipherLocalId) {
            // Persist + hydrate the local spaceId → cipher link.
            registerSpaceCipherLink(created.id, cipherLocalId);
            await updateCipher(cipherLocalId, { spaceId: created.id });
          }
          // Let the sidebar (and any membership-aware view) show it immediately.
          emitSpacesChanged();
          toast.success(t('spaces.joinSuccess', { name: created.name }));
          navigate(`/s/${created.slug}`);
          return;
        }

        setFormError(mapCreateError(res.error?.code, res.error?.message, submittedSlug));
      } catch {
        setFormError(t('spaces.create.errors.createFailed'));
      } finally {
        setSubmitting(false);
      }
    },
    [
      submitting,
      name,
      slugState,
      wantsEncryption,
      encryptionAvailable,
      resolveCipher,
      api,
      slug,
      description,
      visibility,
      allowFreeMembers,
      updateCipher,
      toast,
      navigate,
      mapCreateError,
      t,
    ],
  );

  if (!isLoggedIn) {
    return (
      <div className="page-content">
        <div className="container">
          <div className="page-header">
            <h1 className="page-title">{t('spaces.create.title')}</h1>
          </div>
          <Card variant="elevated" className="spaces-state">
            <p className="spaces-state-heading">{t('spaces.signInHeading')}</p>
            <p className="spaces-state-body">{t('spaces.signInBody')}</p>
            <Link to="/identity/profile" className="btn btn-primary btn-md">
              {t('spaces.signInCta')}
            </Link>
          </Card>
        </div>
      </div>
    );
  }

  const status = slugStatusMessage();

  return (
    <div className="page-content">
      <div className="container">
        <div className="page-header">
          <h1 className="page-title">{t('spaces.create.title')}</h1>
          <p className="page-subtitle">{t('spaces.create.subtitle')}</p>
        </div>

        <Card variant="elevated" className="space-create-card">
          <form className="space-create-form" onSubmit={handleSubmit} noValidate>
            {formError && (
              <Alert variant="error" className="space-create-error">
                {formError}
              </Alert>
            )}

            <Input
              id="space-name"
              label={t('spaces.create.nameLabel')}
              hint={t('spaces.create.nameHint')}
              value={name}
              maxLength={SPACE_NAME_MAX_LENGTH}
              placeholder={t('spaces.create.namePlaceholder')}
              onChange={(e) => setName(e.target.value)}
              disabled={submitting}
              autoFocus
            />

            <div className="form-group">
              <Input
                id="space-slug"
                label={t('spaces.create.slugLabel')}
                hint={t('spaces.create.slugHint')}
                value={slug}
                maxLength={SPACE_SLUG_MAX_LENGTH}
                onChange={(e) => {
                  setSlugTouched(true);
                  setSlug(normalizeSlugInput(e.target.value));
                }}
                disabled={submitting}
              />
              {status && (
                <p
                  className={`space-create-slug-status space-create-slug-status--${status.tone}`}
                  role="status"
                  aria-live="polite"
                >
                  {status.text}
                </p>
              )}
            </div>

            <div className="form-group">
              <label htmlFor="space-description" className="input-label">
                {t('spaces.create.descriptionLabel')}{' '}
                <span className="form-optional">{t('spaces.create.optional')}</span>
              </label>
              <textarea
                id="space-description"
                className="input space-create-textarea"
                value={description}
                maxLength={SPACE_DESCRIPTION_MAX_LENGTH}
                placeholder={t('spaces.create.descriptionPlaceholder')}
                onChange={(e) => setDescription(e.target.value)}
                disabled={submitting}
                rows={3}
              />
            </div>

            <fieldset className="form-group space-create-fieldset" disabled={submitting}>
              <legend className="input-label">{t('spaces.create.visibilityLabel')}</legend>
              {SPACE_VISIBILITY_VALUES.map((value) => (
                <label key={value} className="space-create-radio">
                  <input
                    type="radio"
                    name="space-visibility"
                    value={value}
                    checked={visibility === value}
                    onChange={() => setVisibility(value)}
                  />
                  <span className="space-create-radio-body">
                    <span className="space-create-radio-title">
                      {t(`spaces.visibility.${value}`)}
                    </span>
                    <span className="space-create-radio-desc">
                      {t(
                        value === 'public'
                          ? 'spaces.create.visibilityPublicDesc'
                          : value === 'listed'
                            ? 'spaces.create.visibilityListedDesc'
                            : 'spaces.create.visibilityHiddenDesc',
                      )}
                    </span>
                  </span>
                </label>
              ))}
            </fieldset>

            <label className="space-create-checkbox">
              <input
                id="space-allow-free"
                type="checkbox"
                checked={allowFreeMembers}
                onChange={(e) => setAllowFreeMembers(e.target.checked)}
                disabled={submitting}
              />
              <span className="space-create-checkbox-body">
                <span className="space-create-radio-title">
                  {t('spaces.create.allowFreeMembersLabel')}
                </span>
                <span className="space-create-radio-desc">
                  {t('spaces.create.allowFreeMembersHint')}
                </span>
              </span>
            </label>

            <div className="space-create-encryption">
              <label className="space-create-checkbox">
                <input
                  id="space-encrypt"
                  type="checkbox"
                  checked={wantsEncryption}
                  onChange={(e) => setEncrypt(e.target.checked)}
                  disabled={submitting || !canEncrypt}
                />
                <span className="space-create-checkbox-body">
                  <span className="space-create-radio-title">
                    {t('spaces.create.encryptionToggle')}
                  </span>
                  <span className="space-create-radio-desc">
                    {canEncrypt
                      ? t('spaces.create.encryptionHint')
                      : t('spaces.create.encryptionPublicNote')}
                  </span>
                </span>
              </label>

              {wantsEncryption && !encryptionAvailable && (
                <Alert variant="warning" className="space-create-encryption-warning">
                  {t('spaces.create.encryptionUnavailable')}
                </Alert>
              )}

              {wantsEncryption && encryptionAvailable && (
                <div className="space-create-cipher">
                  <fieldset className="form-group space-create-fieldset" disabled={submitting}>
                    <legend className="input-label sr-only">
                      {t('spaces.create.cipherSelectLabel')}
                    </legend>
                    <label className="space-create-radio-inline">
                      <input
                        type="radio"
                        name="cipher-source"
                        value="existing"
                        checked={cipherSource === 'existing'}
                        onChange={() => setCipherSource('existing')}
                      />
                      <span>{t('spaces.create.cipherSourceExisting')}</span>
                    </label>
                    <label className="space-create-radio-inline">
                      <input
                        type="radio"
                        name="cipher-source"
                        value="new"
                        checked={cipherSource === 'new'}
                        onChange={() => setCipherSource('new')}
                      />
                      <span>{t('spaces.create.cipherSourceNew')}</span>
                    </label>
                  </fieldset>

                  {cipherSource === 'existing' &&
                    (ciphers.length === 0 ? (
                      <p className="space-create-hint">{t('spaces.create.noCiphers')}</p>
                    ) : (
                      <div className="form-group">
                        <label htmlFor="space-cipher-select" className="input-label">
                          {t('spaces.create.cipherSelectLabel')}
                        </label>
                        <select
                          id="space-cipher-select"
                          className="input"
                          value={selectedCipherId}
                          onChange={(e) => setSelectedCipherId(e.target.value)}
                          disabled={submitting}
                        >
                          <option value="">
                            {t('spaces.create.cipherSelectPlaceholder')}
                          </option>
                          {ciphers.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name} ({c.shortId})
                            </option>
                          ))}
                        </select>
                      </div>
                    ))}

                  {cipherSource === 'new' && (
                    <>
                      <Input
                        id="space-new-cipher-name"
                        label={t('spaces.create.newCipherNameLabel')}
                        value={newCipherName}
                        placeholder={t('spaces.create.newCipherNamePlaceholder')}
                        onChange={(e) => setNewCipherName(e.target.value)}
                        disabled={submitting}
                      />
                      <div className="form-group">
                        <span className="input-label">{t('spaces.create.entropyLabel')}</span>
                        <p className="space-create-hint">{t('spaces.create.entropyHint')}</p>
                        <div className="space-create-entropy-rows">
                          {entropyRows.map((row, index) => (
                            <div key={row.id} className="space-create-entropy-row">
                              <Input
                                id={`space-entropy-${row.id}`}
                                label={`${t('spaces.create.entropyLabel')} ${index + 1}`}
                                hideLabel
                                value={row.value}
                                placeholder={t('spaces.create.entropyPlaceholder')}
                                onChange={(e) => updateEntropyRow(row.id, e.target.value)}
                                disabled={submitting}
                              />
                              {entropyRows.length > 1 && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  aria-label={t('spaces.create.removePhrase')}
                                  onClick={() => removeEntropyRow(row.id)}
                                  disabled={submitting}
                                >
                                  &times;
                                </Button>
                              )}
                            </div>
                          ))}
                        </div>
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={addEntropyRow}
                          disabled={submitting}
                        >
                          {t('spaces.create.addPhrase')}
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>

            <div className="space-create-actions">
              <Link to="/spaces" className="btn btn-secondary btn-md">
                {t('spaces.create.cancel')}
              </Link>
              <Button type="submit" variant="primary" disabled={submitting}>
                {submitting ? t('spaces.create.submitting') : t('spaces.create.submit')}
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </div>
  );
}
