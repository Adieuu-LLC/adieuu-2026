import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { usePlatform } from '../hooks/usePlatform';
import { OnboardingChecklist } from '../components/OnboardingChecklist';

export function Home() {
  const { t } = useTranslation();
  const platform = usePlatform();

  useEffect(() => {
    if (platform !== 'desktop') return;
    const electronWindow = (
      window as Window & {
        electron?: { window?: { saveBoundsIfChanged?: () => Promise<void> } };
      }
    ).electron?.window;
    const save = electronWindow?.saveBoundsIfChanged;
    if (typeof save !== 'function') return;
    void save();
  }, [platform]);

  return (
    <div className="page-content">
      <div className="container">
        <div className="page-header">
          <h1 className="page-title">{t('home.title')}</h1>
          <p className="page-subtitle">
            {t('home.subtitle', { platform })}
          </p>
        </div>

        <OnboardingChecklist />
      </div>
    </div>
  );
}
