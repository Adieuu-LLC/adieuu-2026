import { useTranslation } from 'react-i18next';
import { LearnContent } from '../../components/LearnContent';

export function AboutLearn() {
  const { t } = useTranslation();

  return (
    <div className="page-content">
      <div className="container">
        <div className="page-header">
          <h1 className="page-title">{t('home.learn.title')}</h1>
        </div>
        <LearnContent />
      </div>
    </div>
  );
}
