import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Card } from './Card';
import { Button } from './Button';
import { Spinner } from './Spinner';
import { useTourContext, useAppearanceTour } from '../hooks/useTourContext';
import { useOnboardingStatus } from '../hooks/useOnboardingStatus';
import { useIdentity } from '../hooks/useIdentity';
import { Icon } from '../icons/Icon';

function OnboardingCheckMark({ done }: { done: boolean }) {
  return (
    <span
      className={`onboarding-check-icon ${done ? 'onboarding-check-icon-done' : 'onboarding-check-icon-todo'}`}
      aria-hidden
    >
      <Icon name={done ? 'check' : 'circle'} />
    </span>
  );
}

export function OnboardingChecklist() {
  const { t } = useTranslation();
  const tour = useTourContext();
  const appearanceTour = useAppearanceTour();
  const { items, loading } = useOnboardingStatus();
  const { status: identityStatus } = useIdentity();
  const hideAccountLinks = identityStatus === 'logged_in';

  return (
    <Card variant="elevated" className="onboarding-checklist">
      <div className="onboarding-checklist-header">
        <h2 className="onboarding-checklist-title">{t('home.onboarding.title')}</h2>
        <p className="onboarding-checklist-subtitle">{t('home.onboarding.subtitle')}</p>
      </div>

      {loading ? (
        <div className="onboarding-checklist-loading">
          <Spinner />
          <span>{t('home.onboarding.loading')}</span>
        </div>
      ) : (
        <ul className="onboarding-checklist-items">
          {items.map((item) => {
            const title = t(`home.onboarding.items.${item.id}.title`);
            const description = t(`home.onboarding.items.${item.id}.description`);
            const showActions =
              !item.disabled && (item.id === 'tour' || item.id === 'appearance' || !item.completed);

            return (
              <li
                key={item.id}
                className={`onboarding-checklist-item ${item.completed ? 'onboarding-checklist-item-done' : ''} ${item.disabled ? 'onboarding-checklist-item-disabled' : ''}`}
              >
                <OnboardingCheckMark done={item.completed} />
                <div className="onboarding-checklist-item-body">
                  <div className="onboarding-checklist-item-heading">
                    <span className="onboarding-checklist-item-title">{title}</span>
                    {item.disabled && (
                      <span className="onboarding-checklist-badge">{t('home.onboarding.badgeComingSoon')}</span>
                    )}
                  </div>
                  <p className="onboarding-checklist-item-description">{description}</p>
                  {showActions && (
                    <div className="onboarding-checklist-item-actions">
                      {item.id === 'tour' && (
                        <Button variant="secondary" size="sm" type="button" onClick={() => tour.start()}>
                          {item.completed
                            ? t('home.onboarding.items.tour.actionRetake')
                            : t('home.onboarding.items.tour.action')}
                        </Button>
                      )}
                      {item.id === 'mfa' && !hideAccountLinks && (
                        <Link to="/account/security" className="btn btn-secondary btn-sm">
                          {t('home.onboarding.items.mfa.action')}
                        </Link>
                      )}
                      {item.id === 'verify' && !hideAccountLinks && (
                        <Link to="/account/overview" className="btn btn-secondary btn-sm">
                          {t('home.onboarding.items.verify.action')}
                        </Link>
                      )}
                      {item.id === 'alias' && (
                        <Link to="/identity/profile" className="btn btn-secondary btn-sm">
                          {t('home.onboarding.items.alias.action')}
                        </Link>
                      )}
                      {item.id === 'appearance' && (
                        <Button variant="secondary" size="sm" type="button" onClick={() => appearanceTour.start()}>
                          {item.completed
                            ? t('home.onboarding.items.appearance.actionRetake')
                            : t('home.onboarding.items.appearance.action')}
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
