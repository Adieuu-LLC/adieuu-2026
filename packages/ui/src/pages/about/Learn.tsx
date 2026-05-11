import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LearnContent } from '../../components/LearnContent';

function scrollToHash(hash: string) {
  if (!hash) return;
  const id = hash.replace(/^#/, '');
  if (!id) return;
  requestAnimationFrame(() => {
    const el = document.getElementById(id);
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

export function AboutLearn() {
  const { t } = useTranslation();
  const { hash } = useLocation();

  useEffect(() => {
    scrollToHash(hash);
  }, [hash]);

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
