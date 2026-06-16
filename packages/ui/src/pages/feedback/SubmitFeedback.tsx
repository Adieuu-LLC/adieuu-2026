import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  FEEDBACK_CATEGORIES,
  MAX_FEEDBACK_ATTACHMENTS,
  MAX_FEEDBACK_BODY_LENGTH,
  MAX_FEEDBACK_TITLE_LENGTH,
  createApiClient,
  type FeedbackCategory,
} from '@adieuu/shared';
import { Select, Portal, Checkbox, createListCollection } from '@ark-ui/react';
import { useAppConfig } from '../../config';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Input } from '../../components/Input';
import { Alert } from '../../components/Alert';
import { useAuth } from '../../hooks/useAuth';
import {
  FeedbackAttachmentUploader,
  type FeedbackAttachmentItem,
} from '../../components/FeedbackAttachmentUploader';
import { FeedbackSubmitConfirmationModal } from '../../components/FeedbackSubmitConfirmationModal';
import { SessionLockedPage } from '../../components/SessionLockedPage';
import { useIdentity } from '../../hooks/useIdentity';
import { useFeedbackParticipation } from '../../hooks/useFeedbackParticipation';

export function SubmitFeedback() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { apiBaseUrl } = useAppConfig();
  const { status: identityStatus } = useIdentity();
  const { canParticipate, requireIdentitySession } = useFeedbackParticipation();
  const { session } = useAuth();
  const api = useMemo(() => createApiClient({ baseUrl: apiBaseUrl }), [apiBaseUrl]);
  const isStaff = session?.isPlatformAdmin === true || session?.isPlatformModerator === true;

  const [category, setCategory] = useState<FeedbackCategory | ''>('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [attachments, setAttachments] = useState<FeedbackAttachmentItem[]>([]);
  const [isOfficial, setIsOfficial] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const descriptionRemaining = MAX_FEEDBACK_BODY_LENGTH - description.length;
  const titleRemaining = MAX_FEEDBACK_TITLE_LENGTH - title.length;

  const categoryCollection = useMemo(
    () =>
      createListCollection({
        items: FEEDBACK_CATEGORIES.map((c) => ({
          value: c,
          label: t(`feedback.categories.${c}`),
        })),
      }),
    [t],
  );

  const canSubmit =
    category !== '' &&
    title.trim().length > 0 &&
    description.trim().length > 0 &&
    title.length <= MAX_FEEDBACK_TITLE_LENGTH &&
    description.length <= MAX_FEEDBACK_BODY_LENGTH &&
    attachments.length <= MAX_FEEDBACK_ATTACHMENTS;

  const handleFormSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!canSubmit || !category) return;
      setConfirmOpen(true);
    },
    [canSubmit, category],
  );

  const handleConfirmSubmit = useCallback(async () => {
    if (!canSubmit || !category) return;

    setSubmitting(true);
    setError(null);

    try {
      const res = await api.feedback.createPost({
        category,
        title: title.trim(),
        description: description.trim(),
        attachmentMediaIds: attachments.map((a) => a.mediaId),
        ...(isOfficial ? { isOfficial: true } : {}),
      });

      if (res.success && res.data) {
        setConfirmOpen(false);
        navigate(`/feedback/${res.data.postId}`);
        return;
      }

      if (res.error?.code === 'RATE_LIMITED') {
        setError(t('common.rateLimited', 'Rate limit exceeded. Please try again later.'));
      } else {
        setError(t('feedback.submitError'));
      }
    } catch (err) {
      console.error('[SubmitFeedback] createPost failed', err);
      setError(t('feedback.submitError'));
    } finally {
      setSubmitting(false);
    }
  }, [api, attachments, canSubmit, category, description, isOfficial, navigate, t, title]);

  if (identityStatus === 'locked') {
    return <SessionLockedPage titleI18nKey="feedback.newPost" />;
  }

  if (!canParticipate) {
    return (
      <div className="page-content feedback-page">
        <div className="container">
          <div className="page-header">
            <h1 className="page-title">{t('feedback.newPost')}</h1>
          </div>
          <Card variant="elevated">
            <Alert variant="info">{t('feedback.loginToParticipate')}</Alert>
            <div className="feedback-participation-prompt">
              <Button type="button" variant="primary" onClick={requireIdentitySession}>
                {t('identity.loginButton')}
              </Button>
              <Button type="button" variant="secondary" onClick={() => navigate('/feedback')}>
                {t('common.back')}
              </Button>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="page-content feedback-page">
      <div className="container">
        <div className="page-header">
          <h1 className="page-title">{t('feedback.newPost')}</h1>
          <p className="page-subtitle">{t('feedback.dailyLimitHint')}</p>
        </div>

        {error && <Alert variant="error">{error}</Alert>}

        <Card variant="elevated">
          <form onSubmit={handleFormSubmit} className="admin-form">
            <div className="admin-form-group">
              <label className="input-label">{t('feedback.form.category')}</label>
              <Select.Root
                collection={categoryCollection}
                value={category ? [category] : []}
                onValueChange={(d) => setCategory((d.value[0] as FeedbackCategory) ?? '')}
              >
                <Select.Control className="report-select-control">
                  <Select.Trigger className="report-select-trigger">
                    <Select.ValueText placeholder={t('feedback.form.categoryPlaceholder')} />
                  </Select.Trigger>
                </Select.Control>
                <Portal>
                  <Select.Positioner>
                    <Select.Content className="report-select-content">
                      {categoryCollection.items.map((item) => (
                        <Select.Item key={item.value} item={item} className="report-select-item">
                          <Select.ItemText>{item.label}</Select.ItemText>
                        </Select.Item>
                      ))}
                    </Select.Content>
                  </Select.Positioner>
                </Portal>
              </Select.Root>
            </div>

            <Input
              label={t('feedback.form.title')}
              value={title}
              onChange={(e) => setTitle(e.target.value.slice(0, MAX_FEEDBACK_TITLE_LENGTH))}
              placeholder={t('feedback.form.titlePlaceholder')}
              hint={t('feedback.form.charsRemaining', { count: titleRemaining })}
            />

            <div className="admin-form-group">
              <label className="input-label" htmlFor="feedback-description">
                {t('feedback.form.description')}
              </label>
              <textarea
                id="feedback-description"
                className="input textarea"
                value={description}
                onChange={(e) => setDescription(e.target.value.slice(0, MAX_FEEDBACK_BODY_LENGTH))}
                placeholder={t('feedback.form.descriptionPlaceholder')}
                rows={8}
              />
              <p className="input-hint">
                {t('feedback.form.charsRemaining', { count: descriptionRemaining })}
              </p>
            </div>

            <FeedbackAttachmentUploader
              attachments={attachments}
              onChange={setAttachments}
              disabled={submitting}
            />

            {isStaff && (
              <Checkbox.Root
                checked={isOfficial}
                onCheckedChange={(e) => setIsOfficial(e.checked === true)}
                className="feedback-official-checkbox"
              >
                <Checkbox.Control className="fs-checkbox-control" />
                <Checkbox.Label className="fs-checkbox-label">
                  <span className="fs-checkbox-title">{t('feedback.form.markOfficial')}</span>
                  <span className="fs-checkbox-hint">{t('feedback.form.markOfficialHint')}</span>
                </Checkbox.Label>
                <Checkbox.HiddenInput />
              </Checkbox.Root>
            )}

            <div className="admin-action-bar">
              <Button type="button" variant="secondary" onClick={() => navigate('/feedback')}>
                {t('common.cancel')}
              </Button>
              <Button type="submit" disabled={!canSubmit || submitting}>
                {t('feedback.form.submit')}
              </Button>
            </div>
          </form>
        </Card>
      </div>

      <FeedbackSubmitConfirmationModal
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        onConfirm={() => void handleConfirmSubmit()}
        loading={submitting}
      />
    </div>
  );
}
