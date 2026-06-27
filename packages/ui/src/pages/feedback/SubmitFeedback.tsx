import { useCallback, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { createApiClient } from '@adieuu/shared';
import { useAppConfig } from '../../config';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Alert } from '../../components/Alert';
import { FeedbackSubmitConfirmationModal } from '../../components/FeedbackSubmitConfirmationModal';
import {
  FeedbackSubmitForm,
  type FeedbackSubmitFormValues,
} from '../../components/feedback/FeedbackSubmitForm';
import { SessionLockedPage } from '../../components/SessionLockedPage';
import { useIdentity } from '../../hooks/useIdentity';
import { useFeedbackParticipation } from '../../hooks/useFeedbackParticipation';

export function SubmitFeedback() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const returnTo = searchParams.get('returnTo');
  const { apiBaseUrl } = useAppConfig();
  const { status: identityStatus } = useIdentity();
  const { canParticipate, requireIdentitySession } = useFeedbackParticipation();
  const api = useMemo(() => createApiClient({ baseUrl: apiBaseUrl }), [apiBaseUrl]);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingValues, setPendingValues] = useState<FeedbackSubmitFormValues | null>(null);

  const cancelTarget = returnTo && returnTo.startsWith('/') ? returnTo : '/feedback';

  const handleFormSubmit = useCallback((values: FeedbackSubmitFormValues) => {
    setPendingValues(values);
    setConfirmOpen(true);
  }, []);

  const handleConfirmSubmit = useCallback(async () => {
    if (!pendingValues) return;

    setSubmitting(true);
    setError(null);

    try {
      const res = await api.feedback.createPost(pendingValues);

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
  }, [api, navigate, pendingValues, t]);

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
          <FeedbackSubmitForm
            submitting={submitting}
            onSubmit={handleFormSubmit}
            onCancel={() => navigate(cancelTarget)}
          />
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
