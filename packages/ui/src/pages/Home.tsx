import { useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { usePlatform } from '../hooks/usePlatform';
import { useAuth } from '../hooks/useAuth';
import { useHomeProgress } from '../hooks/useHomeProgress';
import { Tabs, TabList, TabTrigger, TabContent } from '../components/Tabs';
import { AccountActionSteps } from '../components/AccountActionSteps';
import { IdentityActionSteps } from '../components/IdentityActionSteps';

export function Home() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const platform = usePlatform();
  const { status } = useAuth();
  const progress = useHomeProgress();

  const isIdentityMode = status === 'identity_mode';

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

  const handleTabChange = useCallback(
    (tab: string) => {
      if (tab === 'learn') {
        void navigate('/about/learn');
      }
    },
    [navigate],
  );

  return (
    <div className="page-content">
      <div className="container">
        <div className="page-header">
          <h1 className="page-title">{t('home.title')}</h1>
          <p className="page-subtitle">
            {isIdentityMode
              ? t('home.subtitleIdentity')
              : t('home.subtitle', { platform })}
          </p>
        </div>

        <Tabs value="welcome" onValueChange={handleTabChange} className="home-tabs">
          <TabList>
            <TabTrigger value="welcome">{t('home.tabs.welcome')}</TabTrigger>
            <TabTrigger value="learn">{t('home.tabs.learn')}</TabTrigger>
          </TabList>
          <TabContent value="welcome">
            {progress.mode === 'identity'
              ? <IdentityActionSteps progress={progress} />
              : <AccountActionSteps progress={progress} />}
          </TabContent>
        </Tabs>
      </div>
    </div>
  );
}
