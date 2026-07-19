/**
 * Create-a-Space flow.
 *
 * Walks the owner through name → URL (live availability) → visibility → optional
 * Cipher association (content E2EE and/or cipher-required join). When a Cipher
 * is associated the client builds a blind-relay `cipherCheck` bound to a
 * client-generated Space id. On success the Space is bookmarked on the Cipher.
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
import { useAppConfig } from '../../config';
import { useIdentity } from '../../hooks/useIdentity';
import { useCipherStore } from '../../hooks/useCipherStore';
import { generateSpaceId, createSpaceCipherCheck } from '../../services/spaceCipherService';
import { emitSpacesChanged } from '../../services/spacesMembershipEvents';
import { useToast } from '../../components/Toast';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Input } from '../../components/Input';
import { Alert } from '../../components/Alert';
import {
  SpaceCipherFormFields,
  type CipherSource,
  type EntropyRow,
} from './SpaceCipherFormFields';
import { resolveSpaceCipherSelection } from './resolveSpaceCipherSelection';
import '../../styles/_spaces.scss';

const SLUG_DEBOUNCE_MS = 400;

type SlugState = 'idle' | 'invalid' | 'checking' | 'available' | 'taken';

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
 * this preserves a single trailing hyphen so a hyphen can be typed mid-word.
 */
function normalizeSlugInput(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+/, '')
    .replace(/-{2,}/g, '-')
    .slice(0, SPACE_SLUG_MAX_LENGTH);
}

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

  const { ciphers, getCipherKey, createCipher, bookmarkSpaceCipher, encryptionAvailable } =
    useCipherStore();

  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [slugState, setSlugState] = useState<SlugState>('idle');
  const [description, setDescription] = useState('');
  const [visibility, setVisibility] = useState<SpaceVisibility>('public');
  const [allowFreeMembers, setAllowFreeMembers] = useState(false);

  const [encrypt, setEncrypt] = useState(false);
  const [cipherRequired, setCipherRequired] = useState(false);
  const [cipherSource, setCipherSource] = useState<CipherSource>('existing');
  const [selectedCipherId, setSelectedCipherId] = useState('');
  const [newCipherName, setNewCipherName] = useState('');
  const [entropyRows, setEntropyRows] = useState<EntropyRow[]>([{ id: '1', value: '' }]);

  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const slugCheckSeq = useRef(0);
  const slugRef = useRef(slug);
  useEffect(() => {
    slugRef.current = slug;
  }, [slug]);

  const canUseCipher = visibility !== 'public';
  const wantsE2ee = encrypt && canUseCipher;
  const wantsCipherRequired = cipherRequired && canUseCipher;
  const needsCipher = wantsE2ee || wantsCipherRequired;

  useEffect(() => {
    if (!canUseCipher) {
      if (encrypt) setEncrypt(false);
      if (cipherRequired) setCipherRequired(false);
    }
  }, [canUseCipher, encrypt, cipherRequired]);

  useEffect(() => {
    if (!slugTouched) setSlug(slugify(name));
  }, [name, slugTouched]);

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
          if (seq !== slugCheckSeq.current) return;
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

  const mapCreateError = useCallback(
    (code: string | undefined, message: string | undefined, submittedSlug: string): string => {
      switch (code) {
        case 'TIER_REQUIRED':
          return t('spaces.create.errors.tierRequired');
        case 'SLUG_TAKEN':
        case 'SLUG_RESERVED':
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

      const submittedSlug = slug;
      let cipherCheck: CipherCheck | undefined;
      let spaceId: string | undefined;
      let cipherLocalId: string | undefined;

      if (needsCipher) {
        if (!encryptionAvailable) {
          setFormError(t('spaces.create.errors.cipherRequired'));
          return;
        }
        setSubmitting(true);
        const resolved = await resolveSpaceCipherSelection({
          cipherSource,
          selectedCipherId,
          getCipherKey,
          entropyRows,
          createCipher,
          newCipherName,
          fallbackName: name.trim(),
          errors: {
            cipherRequired: t('spaces.create.errors.cipherRequired'),
            entropyRequired: t('spaces.create.errors.entropyRequired'),
            createFailed: t('spaces.create.errors.createFailed'),
          },
        });
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
          e2ee: wantsE2ee,
          cipherRequired: wantsCipherRequired,
        });

        if (res.success && res.data) {
          const created = res.data;
          if (cipherLocalId) {
            await bookmarkSpaceCipher(cipherLocalId, created.id);
          }
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
      needsCipher,
      encryptionAvailable,
      cipherSource,
      selectedCipherId,
      getCipherKey,
      entropyRows,
      createCipher,
      newCipherName,
      api,
      slug,
      description,
      visibility,
      allowFreeMembers,
      wantsE2ee,
      wantsCipherRequired,
      bookmarkSpaceCipher,
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
                  checked={encrypt}
                  onChange={(e) => {
                    const on = e.target.checked;
                    setEncrypt(on);
                    if (on) setCipherRequired(true);
                  }}
                  disabled={submitting || !canUseCipher}
                />
                <span className="space-create-checkbox-body">
                  <span className="space-create-radio-title">
                    {t('spaces.create.encryptionToggle')}
                  </span>
                  <span className="space-create-radio-desc">
                    {canUseCipher
                      ? t('spaces.create.encryptionHint')
                      : t('spaces.create.encryptionPublicNote')}
                  </span>
                </span>
              </label>

              <label className="space-create-checkbox">
                <input
                  id="space-cipher-required"
                  type="checkbox"
                  checked={cipherRequired}
                  onChange={(e) => setCipherRequired(e.target.checked)}
                  disabled={submitting || !canUseCipher}
                />
                <span className="space-create-checkbox-body">
                  <span className="space-create-radio-title">
                    {t('spaces.create.cipherRequiredToggle')}
                  </span>
                  <span className="space-create-radio-desc">
                    {canUseCipher
                      ? t('spaces.create.cipherRequiredHint')
                      : t('spaces.create.encryptionPublicNote')}
                  </span>
                </span>
              </label>

              {needsCipher && !encryptionAvailable && (
                <Alert variant="warning" className="space-create-encryption-warning">
                  {t('spaces.create.encryptionUnavailable')}
                </Alert>
              )}

              {needsCipher && encryptionAvailable && (
                <SpaceCipherFormFields
                  idPrefix="create-cipher"
                  cipherSource={cipherSource}
                  onCipherSourceChange={setCipherSource}
                  ciphers={ciphers}
                  selectedCipherId={selectedCipherId}
                  onSelectedCipherIdChange={setSelectedCipherId}
                  newCipherName={newCipherName}
                  onNewCipherNameChange={setNewCipherName}
                  entropyRows={entropyRows}
                  onEntropyRowChange={(id, value) =>
                    setEntropyRows((rows) =>
                      rows.map((r) => (r.id === id ? { ...r, value } : r)),
                    )
                  }
                  onAddEntropyRow={() =>
                    setEntropyRows((rows) => [
                      ...rows,
                      { id: `${Date.now()}-${rows.length}`, value: '' },
                    ])
                  }
                  onRemoveEntropyRow={(id) =>
                    setEntropyRows((rows) =>
                      rows.length <= 1 ? rows : rows.filter((r) => r.id !== id),
                    )
                  }
                  disabled={submitting}
                />
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
