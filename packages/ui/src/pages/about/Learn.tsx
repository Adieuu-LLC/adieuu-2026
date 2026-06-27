import { useTranslation } from 'react-i18next';
import { LearnContent } from '../../components/LearnContent';
import { Icon } from '../../icons/Icon';
import { useHistoryNavigation } from '../../navigation/useHistoryNavigation';

export function AboutLearn() {
  const { t } = useTranslation();
  const { canGoBack, goBack } = useHistoryNavigation();

  return (
    <div className="page-content">
      <div className="container">
        <div className="page-header learn-page-header">
          {canGoBack ? (
            <button type="button" className="page-back-link" onClick={goBack}>
              <Icon name="arrowLeft" size="sm" />
              {t('home.learn.goBack')}
            </button>
          ) : null}
          <h1 className="page-title">{t('home.learn.title')}</h1>
        </div>
        <LearnContent />
      </div>
    </div>
  );
}
