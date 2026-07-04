import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Card } from './Card';
import { Button } from './Button';
import { Spinner } from './Spinner';
import { Icon } from '../icons/Icon';
import type { AppIconName } from '../icons/appIcons';
import type { IdentityProgress, AccountProgressStep } from '../hooks/useHomeProgress';

const STAT_ENTRIES: { key: keyof IdentityProgress['stats']; icon: AppIconName }[] = [
  { key: 'conversations', icon: 'message' },
  { key: 'friends', icon: 'users' },
  { key: 'messages', icon: 'send' },
  { key: 'achievements', icon: 'trophy' },
];

function StatsOverview({ stats }: { stats: IdentityProgress['stats'] }) {
  const { t } = useTranslation();

  return (
    <div className="stats-overview">
      {STAT_ENTRIES.map(({ key, icon }) => (
        <div key={key} className="stats-tile">
          <Icon name={icon} className="stats-tile-icon" />
          <span className="stats-tile-value">{stats[key].toLocaleString()}</span>
          <span className="stats-tile-label">{t(`home.identity.stats.${key}`)}</span>
        </div>
      ))}
    </div>
  );
}

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

function PrimaryStepAction({ step }: { step: AccountProgressStep }) {
  const { t } = useTranslation();

  if (step.disabled) return null;

  switch (step.id) {
    case 'addFriend':
      if (step.completed) return null;
      return (
        <Link to="/friends" className="btn btn-primary btn-sm">
          {t('home.identity.steps.addFriend.action')}
        </Link>
      );
    case 'startConversation':
      return (
        <Link to="/conversations/new" className="btn btn-secondary btn-sm">
          {t('home.identity.steps.startConversation.action')}
        </Link>
      );
    default:
      return null;
  }
}

function SecondaryLink({ step }: { step: AccountProgressStep }) {
  const { t } = useTranslation();

  switch (step.id) {
    case 'appearance':
      return (
        <Link to="/account/appearance" className="btn btn-secondary btn-sm">
          {t('home.identity.secondary.appearance.action')}
        </Link>
      );
    case 'editProfile':
      return (
        <Link to="/identity/profile" className="btn btn-secondary btn-sm">
          {t('home.identity.secondary.editProfile.action')}
        </Link>
      );
    default:
      return null;
  }
}

interface IdentityActionStepsProps {
  progress: IdentityProgress;
}

export function IdentityActionSteps({ progress }: IdentityActionStepsProps) {
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

  return (
    <Card variant="elevated" className="action-steps">
      <div className="action-steps-section">
        <h3 className="action-steps-section-title">{t('home.identity.sectionStats')}</h3>
        <StatsOverview stats={progress.stats} />
      </div>

      <div className="action-steps-section">
        <h3 className="action-steps-section-title">{t('home.identity.sectionPrimary')}</h3>
        <ul className="action-steps-list">
          {progress.primarySteps.map((step) => (
            <li
              key={step.id}
              className={`action-step-item ${step.completed ? 'action-step-item-done' : ''} ${step.disabled ? 'action-step-item-disabled' : ''}`}
            >
              <StepCheckMark done={step.completed} />
              <div className="action-step-body">
                <div className="action-step-heading">
                  <span className="action-step-title">
                    {t(`home.identity.steps.${step.id}.title`)}
                  </span>
                  {step.disabled && (
                    <span className="action-step-badge">{t('home.badgeComingSoon')}</span>
                  )}
                </div>
                <p className="action-step-description">
                  {t(`home.identity.steps.${step.id}.description`)}
                </p>
                <div className="action-step-actions">
                  <PrimaryStepAction step={step} />
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="action-steps-section action-steps-section-secondary">
        <h3 className="action-steps-section-title">{t('home.identity.sectionSecondary')}</h3>
        <ul className="action-steps-list">
          {progress.secondarySteps.map((step) => (
            <li key={step.id} className="action-step-item">
              <div className="action-step-body">
                <span className="action-step-title">
                  {t(`home.identity.secondary.${step.id}.title`)}
                </span>
                <p className="action-step-description">
                  {t(`home.identity.secondary.${step.id}.description`)}
                </p>
                <div className="action-step-actions">
                  <SecondaryLink step={step} />
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}
