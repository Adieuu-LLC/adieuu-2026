import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { Card } from './Card';
import { Button } from './Button';
import { Spinner } from './Spinner';
import { Tooltip } from './Tooltip';
import { Icon } from '../icons/Icon';
import { useTourContext, useTourProgress } from '../hooks/useTourContext';
import { useIdentityModal } from '../hooks/useIdentityModal';
import { JurisdictionRequirementDisclosure } from './compliance/JurisdictionRequirementDisclosure';
import type { AccountProgress, AccountProgressStep } from '../hooks/useHomeProgress';

function StepCheckMark({ done }: { done: boolean }) {
  return (
    <span
      className={`action-step-check ${done ? 'action-step-check-done' : ''}`}
      aria-hidden
    >
      <Icon name={done ? 'check' : 'circle'} />
    </span>
  );
}

function VerifyAgeDescription({ progress }: { progress: AccountProgress }) {
  const { t } = useTranslation();

  if (progress.aliasGateRequiredReason === 'abusive_ip') {
    return (
      <p className="action-step-description">
        {t('compliance.ageVerification.abusiveIpReason')}
      </p>
    );
  }

  if (progress.canSkipAvWithUpgrade) {
    return (
      <p className="action-step-description">
        {t('home.account.steps.verifyAge.descriptionFreeCanSkip')}
      </p>
    );
  }

  if (progress.aliasGateJurisdiction && !progress.canSkipAvWithUpgrade) {
    return (
      <p className="action-step-description">
        {t('home.account.steps.verifyAge.descriptionJurisdictionRequired')}
      </p>
    );
  }

  return (
    <p className="action-step-description">
      {t('home.account.steps.verifyAge.description')}
    </p>
  );
}

function createAliasDisabledTooltip(progress: AccountProgress, t: (key: string) => string): string {
  if (!progress.hasSubscription) {
    return t('home.account.steps.createAlias.subscribeFirstTooltip');
  }
  if (progress.avStepRelevant && progress.avStatus !== 'verified') {
    return t('home.account.steps.createAlias.verifyAgeFirstTooltip');
  }
  return t('home.account.steps.createAlias.subscribeFirstTooltip');
}

function PrimaryStepAction({
  step,
  progress,
}: {
  step: AccountProgressStep;
  progress: AccountProgress;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { openIdentityModal } = useIdentityModal();

  if (step.completed && step.id !== 'subscribe') return null;

  switch (step.id) {
    case 'subscribe':
      if (progress.isFreeTier) {
        return (
          <>
            <Link to="/account/subscription" className="btn btn-primary btn-sm">
              {t('home.account.steps.subscribe.action')}
            </Link>
            <Link
              to="/account/subscription/manage"
              state={{ scrollToPromo: true }}
              className="btn btn-secondary btn-sm"
            >
              {t('home.account.steps.subscribe.promoAction')}
            </Link>
          </>
        );
      }
      return null;
    case 'verifyAge':
      if (step.disabled) {
        return (
          <Tooltip
            content={t('home.account.steps.verifyAge.subscribeFirstTooltip')}
            position="top"
          >
            <span className="action-step-disabled-action" aria-disabled="true">
              <Button variant="primary" size="sm" type="button" disabled>
                {t('home.account.steps.verifyAge.action')}
              </Button>
            </span>
          </Tooltip>
        );
      }
      return (
        <Button variant="primary" size="sm" type="button" onClick={() => navigate('/account/age-verification')}>
          {t('home.account.steps.verifyAge.action')}
        </Button>
      );
    case 'createAlias':
      if (step.disabled) {
        return (
          <Tooltip
            content={createAliasDisabledTooltip(progress, t)}
            position="top"
          >
            <span className="action-step-disabled-action" aria-disabled="true">
              <Button variant="primary" size="sm" type="button" disabled>
                {t('home.account.steps.createAlias.action')}
              </Button>
            </span>
          </Tooltip>
        );
      }
      return (
        <Button variant="primary" size="sm" type="button" onClick={() => openIdentityModal()}>
          {t('home.account.steps.createAlias.action')}
        </Button>
      );
    case 'sendFirstMessage':
      if (step.disabled) {
        return (
          <Tooltip
            content={t('home.account.steps.sendFirstMessage.createAliasFirstTooltip')}
            position="top"
          >
            <span className="action-step-disabled-action" aria-disabled="true">
              <Button variant="primary" size="sm" type="button" disabled>
                {t('home.account.steps.sendFirstMessage.action')}
              </Button>
            </span>
          </Tooltip>
        );
      }
      return (
        <Button variant="primary" size="sm" type="button" onClick={() => openIdentityModal()}>
          {t('home.account.steps.sendFirstMessage.action')}
        </Button>
      );
    default:
      return null;
  }
}

function TourStepContent({ stepId, completed }: { stepId: string; completed: boolean }) {
  const { t } = useTranslation();
  const tourProgress = useTourProgress();

  if (stepId === 'tour' && !completed && tourProgress.started && tourProgress.nextStepTitle) {
    return (
      <>
        <span className="action-step-title">
          {t('home.account.secondary.tour.titleContinue')}
        </span>
        <p className="action-step-description">
          {t('home.account.secondary.tour.descriptionContinue', {
            nextStep: tourProgress.nextStepTitle,
          })}
        </p>
      </>
    );
  }

  return (
    <>
      <span className="action-step-title">
        {t(`home.account.secondary.${stepId}.title`)}
      </span>
      <p className="action-step-description">
        {t(`home.account.secondary.${stepId}.description`)}
      </p>
    </>
  );
}

function SecondaryStepAction({ step }: { step: AccountProgressStep }) {
  const { t } = useTranslation();
  const tour = useTourContext();
  const tourProgress = useTourProgress();

  switch (step.id) {
    case 'tour': {
      const canResume = !step.completed && tourProgress.started && tourProgress.nextStepId;
      return (
        <Button
          variant="secondary"
          size="sm"
          type="button"
          onClick={() => {
            if (canResume && tourProgress.nextStepId) {
              tour.start(tourProgress.nextStepId);
            } else {
              tour.start();
            }
          }}
        >
          {step.completed
            ? t('home.account.secondary.tour.actionRetake')
            : canResume
              ? t('home.account.secondary.tour.actionContinue')
              : t('home.account.secondary.tour.action')}
        </Button>
      );
    }
    case 'mfa':
      if (step.completed) return null;
      return (
        <Link to="/account/authentication" className="btn btn-secondary btn-sm">
          {t('home.account.secondary.mfa.action')}
        </Link>
      );
    case 'verify':
      if (step.completed) return null;
      return (
        <Link to="/account" className="btn btn-secondary btn-sm">
          {t('home.account.secondary.verify.action')}
        </Link>
      );
    default:
      return null;
  }
}

interface AccountActionStepsProps {
  progress: AccountProgress;
}

export function AccountActionSteps({ progress }: AccountActionStepsProps) {
  const { t } = useTranslation();

  if (progress.loading) {
    return (
      <Card variant="elevated" className="action-steps">
        <div className="action-steps-loading">
          <Spinner />
          <span>{t('home.loading')}</span>
        </div>
      </Card>
    );
  }

  if (progress.allComplete) {
    return (
      <Card variant="elevated" className="action-steps">
        <div className="action-steps-section">
          <h3 className="action-steps-section-title">{t('home.account.allComplete.title')}</h3>
          <p className="action-steps-section-subtitle">{t('home.account.allComplete.subtitle')}</p>
          <ul className="action-steps-quick-links">
            <li>
              <Link to="/identity/profile" className="btn btn-primary">
                {t('home.account.allComplete.aliasLogin')}
              </Link>
              <p className="action-steps-quick-link-hint">{t('home.account.allComplete.aliasLoginHint')}</p>
            </li>
            <li>
              <Link to="/account/overview" className="btn btn-secondary">
                {t('home.account.allComplete.accountOverview')}
              </Link>
            </li>
            <li>
              <Link to="/account/authentication" className="btn btn-secondary">
                {t('home.account.allComplete.security')}
              </Link>
            </li>
            <li>
              <Link to="/account/subscription" className="btn btn-secondary">
                {t('home.account.allComplete.subscription')}
              </Link>
            </li>
          </ul>
        </div>
      </Card>
    );
  }

  return (
    <Card variant="elevated" className="action-steps" data-tour="get-started">
      <div className="action-steps-section">
        <h3 className="action-steps-section-title">{t('home.account.sectionPrimary')}</h3>
        <p className="action-steps-section-subtitle">{t('home.account.sectionPrimarySubtitle')}</p>
        <ul className="action-steps-list">
          {progress.primarySteps.map((step) => (
            <li
              key={step.id}
              className={`action-step-item ${step.completed ? 'action-step-item-done' : ''} ${step.disabled ? 'action-step-item-disabled' : ''}`}
            >
              <StepCheckMark done={step.completed} />
              <div className="action-step-body">
                <span className="action-step-title">
                  {step.id === 'subscribe' && !progress.isFreeTier
                    ? t('home.account.steps.subscribe.titlePaid')
                    : t(`home.account.steps.${step.id}.title`)}
                </span>
                {step.id === 'verifyAge' ? (
                  <>
                    <VerifyAgeDescription progress={progress} />
                    <JurisdictionRequirementDisclosure
                      rows={progress.jurisdictionReqs}
                      loading={progress.jurisdictionReqsLoading}
                      primaryJurisdiction={progress.aliasGateJurisdiction}
                    />
                  </>
                ) : step.id === 'subscribe' && !progress.isFreeTier ? (
                  <p className="action-step-description">
                    {t('home.account.steps.subscribe.descriptionPaid')}
                  </p>
                ) : (
                  <p className="action-step-description">
                    {t(`home.account.steps.${step.id}.description`)}
                  </p>
                )}
                <div className="action-step-actions">
                  <PrimaryStepAction step={step} progress={progress} />
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="action-steps-section action-steps-section-secondary">
        <h3 className="action-steps-section-title">{t('home.account.sectionSecondary')}</h3>
        <ul className="action-steps-list">
          {progress.secondarySteps.map((step) => (
            <li
              key={step.id}
              className={`action-step-item ${step.completed ? 'action-step-item-done' : ''}`}
            >
              <StepCheckMark done={step.completed} />
              <div className="action-step-body">
                <TourStepContent stepId={step.id} completed={step.completed} />
                <div className="action-step-actions">
                  <SecondaryStepAction step={step} />
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}
