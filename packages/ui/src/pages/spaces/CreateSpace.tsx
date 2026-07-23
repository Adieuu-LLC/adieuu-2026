/**
 * Create-a-Space wizard (Visibility → About → Encryption).
 *
 * Visibility comes first so About can omit the custom URL for Hidden Spaces
 * (those route by ObjectId hex). When a Cipher is associated the client builds
 * a blind-relay `cipherCheck` bound to a client-generated Space id, encrypts
 * structural metadata seed payloads when e2ee is on, and optionally encrypts
 * name/description when `encryptIdentity` is on.
 */

import type { CommunityCipher } from '@adieuu/crypto';
import {
  type CipherCheck,
  type CreateSpaceParams,
  createApiClient,
  isReservedSpaceSlug,
  SPACE_SLUG_MAX_LENGTH,
  SPACE_SLUG_MIN_LENGTH,
  SPACE_SLUG_PATTERN,
  type SpaceVisibility,
} from '@adieuu/shared';
import { Steps } from '@ark-ui/react/steps';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { Alert } from '../../components/Alert';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Spinner } from '../../components/Spinner';
import { useToast } from '../../components/Toast';
import { useAppConfig } from '../../config';
import { useAuth } from '../../hooks/useAuth';
import { useCipherStore } from '../../hooks/useCipherStore';
import { useIdentity } from '../../hooks/useIdentity';
import { createSpaceCipherCheck, generateSpaceId } from '../../services/spaceCipherService';
import { emitSpacesChanged } from '../../services/spacesMembershipEvents';
import { CreateSpaceAboutStep, type SlugState } from './CreateSpaceAboutStep';
import { CreateSpaceEncryptionStep } from './CreateSpaceEncryptionStep';
import { CreateSpaceVisibilityStep } from './CreateSpaceVisibilityStep';
import { resolveSpaceCipherSelection } from './resolveSpaceCipherSelection';
import type {
  CipherSource,
  EntropyRow,
} from './SpaceCipherFormFields';
import {
  buildEncryptedSpaceSeed,
  encryptSpaceMetadataField,
  resolveSpaceDisplayName,
} from './spaceMetadataCipher';
import '../../styles/_spaces.scss';

const SLUG_DEBOUNCE_MS = 400;
const STEP_COUNT = 3;

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
  const { session } = useAuth();
  const { status: identityStatus } = useIdentity();
  const isLoggedIn = identityStatus === 'logged_in';
  const isPlatformAdmin = session?.isPlatformAdmin === true;
  const api = useMemo(() => createApiClient({ baseUrl: apiBaseUrl }), [apiBaseUrl]);

  const { ciphers, getCipherKey, createCipher, bookmarkSpaceCipher, encryptionAvailable } =
    useCipherStore();

  const [creationPolicy, setCreationPolicy] = useState<'loading' | 'enabled' | 'disabled'>(
    'loading',
  );
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [slugState, setSlugState] = useState<SlugState>('idle');
  const [description, setDescription] = useState('');
  const [visibility, setVisibility] = useState<SpaceVisibility>('public');
  const [allowFreeMembers, setAllowFreeMembers] = useState(false);

  const [encrypt, setEncrypt] = useState(false);
  const [encryptIdentity, setEncryptIdentity] = useState(false);
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

  const isHidden = visibility === 'hidden';
  const canUseCipher = visibility !== 'public';
  const wantsE2ee = encrypt && canUseCipher;
  const wantsEncryptIdentity = encryptIdentity && wantsE2ee;
  const wantsCipherRequired = cipherRequired && canUseCipher;
  const needsCipher = wantsE2ee || wantsCipherRequired;

  const stepItems = useMemo(
    () => [
      { title: t('spaces.create.stepVisibility') },
      { title: t('spaces.create.stepAbout') },
      { title: t('spaces.create.stepEncryption') },
    ],
    [t],
  );

  useEffect(() => {
    if (!isLoggedIn) {
      setCreationPolicy('loading');
      return;
    }
    if (isPlatformAdmin) {
      setCreationPolicy('enabled');
      return;
    }
    let cancelled = false;
    setCreationPolicy('loading');
    void api.spaces.getCreationEnabled().then((res) => {
      if (cancelled) return;
      setCreationPolicy(res.success && res.data?.enabled === true ? 'enabled' : 'disabled');
    });
    return () => {
      cancelled = true;
    };
  }, [isLoggedIn, isPlatformAdmin, api]);

  useEffect(() => {
    if (!canUseCipher) {
      if (encrypt) setEncrypt(false);
      if (encryptIdentity) setEncryptIdentity(false);
      if (cipherRequired) setCipherRequired(false);
    }
  }, [canUseCipher, encrypt, encryptIdentity, cipherRequired]);

  useEffect(() => {
    if (!encrypt && encryptIdentity) setEncryptIdentity(false);
  }, [encrypt, encryptIdentity]);

  useEffect(() => {
    if (isHidden) return;
    if (!slugTouched) setSlug(slugify(name));
  }, [name, slugTouched, isHidden]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (isHidden) {
      setSlugState('idle');
      return;
    }

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
  }, [api, slug, isHidden]);

  const slugStatusMessage = (): { text: string; tone: 'ok' | 'error' | 'muted' } | null => {
    if (isHidden) return null;
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

  const isVisibilityValid = true;
  const isAboutValid =
    name.trim().length > 0 && (isHidden || slugState === 'available');
  const isEncryptionValid =
    !needsCipher ||
    (encryptionAvailable &&
      (cipherSource === 'existing'
        ? !!selectedCipherId
        : entropyRows.some((r) => r.value.trim().length > 0)));

  const isStepValid = useCallback(
    (index: number) => {
      if (index === 0) return isVisibilityValid;
      if (index === 1) return isAboutValid;
      if (index === 2) return isEncryptionValid;
      return true;
    },
    [isAboutValid, isVisibilityValid, isEncryptionValid],
  );

  const mapCreateError = useCallback(
    (code: string | undefined, message: string | undefined, submittedSlug: string): string => {
      switch (code) {
        case 'TIER_REQUIRED':
          return t('spaces.create.errors.tierRequired');
        case 'SPACE_CREATION_DISABLED':
          return t('spaces.create.errors.creationDisabled');
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

  const handleCreate = useCallback(async () => {
    if (submitting) return;
    setFormError(null);

    if (!name.trim()) {
      setFormError(t('spaces.create.errors.nameRequired'));
      setStep(1);
      return;
    }
    if (!isHidden && slugState !== 'available') {
      setFormError(t('spaces.create.errors.slugUnavailable'));
      setStep(1);
      return;
    }

    let cipherCheck: CipherCheck | undefined;
    let spaceId: string | undefined;
    let cipherLocalId: string | undefined;
    let resolvedCipher: CommunityCipher | null = null;

    // Hidden Spaces always bind routing to a client-generated ObjectId.
    // Cipher-associated Spaces also need a client id for the challenge salt.
    const needsClientId = isHidden || needsCipher;

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
      resolvedCipher = resolved.cipher;
    } else if (needsClientId) {
      setSubmitting(true);
      spaceId = generateSpaceId();
    } else {
      setSubmitting(true);
    }

    const submittedSlug = isHidden ? (spaceId as string) : slug;

    try {
      const params: CreateSpaceParams = {
        visibility,
        allowFreeMembers,
        e2ee: wantsE2ee,
        encryptIdentity: wantsEncryptIdentity,
        cipherRequired: wantsCipherRequired,
        ...(spaceId ? { id: spaceId } : {}),
        ...(cipherCheck ? { cipherCheck } : {}),
        ...(!isHidden ? { slug: submittedSlug } : { slug: spaceId }),
      };

      if (wantsE2ee && resolvedCipher) {
        params.encryptedSeed = buildEncryptedSpaceSeed(resolvedCipher);
      }

      if (wantsEncryptIdentity && resolvedCipher) {
        const encName = encryptSpaceMetadataField(resolvedCipher, name.trim());
        params.encryptedName = encName.encryptedName;
        params.nameNonce = encName.nameNonce;
        params.cipherId = encName.cipherId;
        if (description.trim()) {
          const encDesc = encryptSpaceMetadataField(resolvedCipher, description.trim());
          params.encryptedDescription = encDesc.encryptedName;
          params.descriptionNonce = encDesc.nameNonce;
        }
      } else {
        params.name = name.trim();
        if (description.trim()) params.description = description.trim();
      }

      const res = await api.spaces.create(params);

      if (res.success && res.data) {
        const created = res.data;
        if (cipherLocalId) {
          await bookmarkSpaceCipher(cipherLocalId, created.id);
        }
        emitSpacesChanged();
        const toastName = resolveSpaceDisplayName(created, resolvedCipher, {
          encryptedSpace: t('spaces.encryptedSpacePlaceholder'),
        });
        toast.success(t('spaces.joinSuccess', { name: toastName }));
        navigate(`/s/${created.slug}`);
        return;
      }

      setFormError(mapCreateError(res.error?.code, res.error?.message, submittedSlug));
    } catch {
      setFormError(t('spaces.create.errors.createFailed'));
    } finally {
      setSubmitting(false);
    }
  }, [
    submitting,
    name,
    slugState,
    isHidden,
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
    wantsEncryptIdentity,
    wantsCipherRequired,
    bookmarkSpaceCipher,
    toast,
    navigate,
    mapCreateError,
    t,
  ]);

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

  if (creationPolicy === 'loading') {
    return (
      <div className="page-content">
        <div className="container">
          <div className="page-header">
            <h1 className="page-title">{t('spaces.create.title')}</h1>
          </div>
          <div className="spaces-loading">
            <Spinner size="lg" />
          </div>
        </div>
      </div>
    );
  }

  if (creationPolicy === 'disabled') {
    return (
      <div className="page-content">
        <div className="container">
          <div className="page-header">
            <h1 className="page-title">{t('spaces.create.title')}</h1>
          </div>
          <Card variant="elevated" className="spaces-state">
            <p className="spaces-state-heading">{t('spaces.create.disabled.heading')}</p>
            <p className="spaces-state-body">{t('spaces.create.disabled.body')}</p>
            <Link to="/spaces" className="btn btn-secondary btn-md">
              {t('spaces.create.disabled.back')}
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
          {formError && (
            <Alert variant="error" className="space-create-error">
              {formError}
            </Alert>
          )}

          <Steps.Root
            className="space-create-steps"
            count={STEP_COUNT}
            step={step}
            onStepChange={(details) => {
              // Ark `linear` mode ignores header trigger clicks entirely, so we
              // keep non-linear triggers and only allow backwards (or same)
              // jumps plus one-step forward when the current step is valid.
              const next = details.step;
              if (next <= step) {
                setStep(next);
                return;
              }
              if (next === step + 1 && isStepValid(step)) {
                setStep(next);
              }
            }}
            orientation="horizontal"
          >
            <Steps.List className="space-create-steps-list">
              {stepItems.map((item, index) => (
                <Steps.Item className="space-create-steps-item" key={item.title} index={index}>
                  <Steps.Trigger className="space-create-steps-trigger" type="button">
                    <Steps.Indicator className="space-create-steps-indicator">
                      {index + 1}
                    </Steps.Indicator>
                    <span className="space-create-steps-title">{item.title}</span>
                  </Steps.Trigger>
                  <Steps.Separator className="space-create-steps-separator" />
                </Steps.Item>
              ))}
            </Steps.List>

            <Steps.Content className="space-create-steps-content" index={0}>
              <CreateSpaceVisibilityStep
                visibility={visibility}
                onVisibilityChange={setVisibility}
                disabled={submitting}
              />
            </Steps.Content>

            <Steps.Content className="space-create-steps-content" index={1}>
              <CreateSpaceAboutStep
                visibility={visibility}
                name={name}
                onNameChange={setName}
                slug={slug}
                onSlugChange={(value) => {
                  setSlugTouched(true);
                  setSlug(normalizeSlugInput(value));
                }}
                slugStatus={status}
                description={description}
                onDescriptionChange={setDescription}
                allowFreeMembers={allowFreeMembers}
                onAllowFreeMembersChange={setAllowFreeMembers}
                disabled={submitting}
              />
            </Steps.Content>

            <Steps.Content className="space-create-steps-content" index={2}>
              <CreateSpaceEncryptionStep
                visibility={visibility}
                canUseCipher={canUseCipher}
                encrypt={encrypt}
                onEncryptChange={(on) => {
                  setEncrypt(on);
                  if (on) setCipherRequired(true);
                }}
                encryptIdentity={encryptIdentity}
                onEncryptIdentityChange={setEncryptIdentity}
                cipherRequired={cipherRequired}
                onCipherRequiredChange={setCipherRequired}
                needsCipher={needsCipher}
                encryptionAvailable={encryptionAvailable}
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
            </Steps.Content>

            <div className="space-create-actions">
              <Link to="/spaces" className="btn btn-secondary btn-md">
                {t('spaces.create.cancel')}
              </Link>
              <div className="space-create-actions-nav">
                {step > 0 && (
                  <Steps.PrevTrigger className="btn btn-secondary btn-md" type="button">
                    {t('spaces.create.back')}
                  </Steps.PrevTrigger>
                )}
                {step < STEP_COUNT - 1 ? (
                  <Steps.NextTrigger
                    className="btn btn-primary btn-md"
                    type="button"
                    disabled={!isStepValid(step) || submitting}
                  >
                    {t('spaces.create.next')}
                  </Steps.NextTrigger>
                ) : (
                  <Button
                    type="button"
                    variant="primary"
                    disabled={submitting || !isEncryptionValid}
                    onClick={() => void handleCreate()}
                  >
                    {submitting ? t('spaces.create.submitting') : t('spaces.create.submit')}
                  </Button>
                )}
              </div>
            </div>
          </Steps.Root>
        </Card>
      </div>
    </div>
  );
}
