import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Card } from './Card';
import { Button } from './Button';
import { Spinner } from './Spinner';
import { useTourContext } from '../hooks/useTourContext';
import { useOnboardingStatus } from '../hooks/useOnboardingStatus';

function CheckIcon({ done }: { done: boolean }) {
  return (
    <span
      className={`onboarding-check-icon ${done ? 'onboarding-check-icon-done' : 'onboarding-check-icon-todo'}`}
      aria-hidden
    >
      {done ? (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path
            d="M20 6L9 17l-5-5"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ) : (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
        </svg>
      )}
    </span>
  );
}

export function OnboardingChecklist() {
  const { t } = useTranslation();
  const tour = useTourContext();
  const { items, loading } = useOnboardingStatus();

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
              !item.disabled && (item.id === 'tour' || !item.completed);

            return (
              <li
                key={item.id}
                className={`onboarding-checklist-item ${item.completed ? 'onboarding-checklist-item-done' : ''} ${item.disabled ? 'onboarding-checklist-item-disabled' : ''}`}
              >
                <CheckIcon done={item.completed} />
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
                      {item.id === 'mfa' && (
                        <Link to="/account/security" className="btn btn-secondary btn-sm">
                          {t('home.onboarding.items.mfa.action')}
                        </Link>
                      )}
                      {item.id === 'verify' && (
                        <Link to="/account/overview" className="btn btn-secondary btn-sm">
                          {t('home.onboarding.items.verify.action')}
                        </Link>
                      )}
                      {item.id === 'alias' && (
                        <Link to="/identity/profile" className="btn btn-secondary btn-sm">
                          {t('home.onboarding.items.alias.action')}
                        </Link>
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
