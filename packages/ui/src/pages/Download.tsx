import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { Spinner } from '../components/Spinner';
import { Icon } from '../icons/Icon';
import { useReleases, type ReleaseDownload } from '../hooks/useReleases';

type OsKey = 'windows' | 'mac' | 'linux';

function detectUserOs(): OsKey | null {
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes('win')) return 'windows';
  if (ua.includes('mac')) return 'mac';
  if (ua.includes('linux')) return 'linux';
  return null;
}

const FORMAT_LABELS: Record<string, string> = {
  nsis: 'formatNsis',
  dmg: 'formatDmg',
  zip: 'formatZip',
  AppImage: 'formatAppImage',
  deb: 'formatDeb',
  rpm: 'formatRpm',
};

const OS_ICON: Record<OsKey, string> = {
  windows: 'desktop',
  mac: 'desktop',
  linux: 'desktop',
};

function OsDownloadSection({
  osKey,
  files,
  isRecommended,
}: {
  osKey: OsKey;
  files: ReleaseDownload[];
  isRecommended: boolean;
}) {
  const { t } = useTranslation();
  const osLabel = t(`download.os${osKey.charAt(0).toUpperCase() + osKey.slice(1)}`);

  if (files.length === 0) return null;

  return (
    <div className={`download-os-section${isRecommended ? ' download-os-recommended' : ''}`}>
      <div className="download-os-header">
        <Icon name={OS_ICON[osKey]} />
        <h3 className="download-os-name">{osLabel}</h3>
        {isRecommended && (
          <span className="download-os-badge">{t('download.recommendedForYou')}</span>
        )}
      </div>
      <div className="download-os-links">
        {files.map((file) => {
          const labelKey = FORMAT_LABELS[file.format] ?? file.format;
          const label = labelKey.startsWith('format')
            ? t(`download.${labelKey}`)
            : file.format;

          return (
            <a
              key={file.filename}
              href={file.url}
              className="download-file-link"
              download
              rel="noopener noreferrer"
            >
              <Icon name="download" />
              <span className="download-file-label">{label}</span>
              {file.arch && <span className="download-file-arch">{file.arch}</span>}
            </a>
          );
        })}
      </div>
    </div>
  );
}

export function Download() {
  const { t } = useTranslation();
  const { latest, loading, error } = useReleases();
  const userOs = useMemo(detectUserOs, []);

  const osOrder: OsKey[] = useMemo(() => {
    const base: OsKey[] = ['windows', 'mac', 'linux'];
    if (!userOs) return base;
    return [userOs, ...base.filter((k) => k !== userOs)];
  }, [userOs]);

  const formattedDate = useMemo(() => {
    if (!latest?.date) return null;
    try {
      return new Intl.DateTimeFormat(undefined, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }).format(new Date(latest.date));
    } catch {
      return null;
    }
  }, [latest?.date]);

  return (
    <div className="page-content">
      <div className="container">
        <div className="page-header">
          <h1 className="page-title">{t('download.title')}</h1>
          <p className="page-subtitle">{t('download.subtitle')}</p>
        </div>

        <Card variant="elevated" className="slide-up download-page-card">
          <h2 className="download-page-card-title">{t('download.benefitsTitle')}</h2>
          <ul className="download-page-list">
            <li>{t('download.benefitNotifications')}</li>
            <li>{t('download.benefitSounds')}</li>
            <li>{t('download.benefitNative')}</li>
            <li>{t('download.benefitReliableAudio')}</li>
            <li>{t('download.benefitKeyStorage')}</li>
            <li>{t('download.benefitDedicatedWindow')}</li>
          </ul>
        </Card>

        <Card variant="elevated" className="slide-up download-page-card">
          <h2 className="download-page-card-title">{t('download.limitationsTitle')}</h2>
          <ul className="download-page-list">
            <li>{t('download.limitationTab')}</li>
            <li>{t('download.limitationAutoplay')}</li>
            <li>{t('download.limitationIndexedDb')}</li>
            <li>{t('download.limitationNoTray')}</li>
          </ul>
        </Card>

        <Card variant="elevated" className="slide-up download-page-card">
          <h2 className="download-page-card-title">{t('download.linksTitle')}</h2>

          {loading && (
            <div className="download-loading">
              <Spinner size="md" />
              <span>{t('download.linksLoading')}</span>
            </div>
          )}

          {error && !loading && (
            <div className="download-error">
              <p>{t('download.linksError')}</p>
              <Button
                className="btn btn-secondary btn-sm"
                onClick={() => window.location.reload()}
              >
                {t('download.linksRetry')}
              </Button>
            </div>
          )}

          {!loading && !error && !latest && (
            <p className="download-page-placeholder">{t('download.linksNone')}</p>
          )}

          {!loading && !error && latest && (
            <>
              <div className="download-version-header">
                <p className="download-page-version">
                  {t('download.versionLabel', { version: latest.version })}
                </p>
                {formattedDate && (
                  <p className="download-page-date">
                    {t('download.releaseDate', { date: formattedDate })}
                  </p>
                )}
              </div>

              <div className="download-os-grid">
                {osOrder.map((osKey) => (
                  <OsDownloadSection
                    key={osKey}
                    osKey={osKey}
                    files={latest.downloads[osKey] ?? []}
                    isRecommended={osKey === userOs}
                  />
                ))}
              </div>

              <div className="download-meta-links">
                <a
                  href={latest.github}
                  className="download-meta-link"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {t('download.viewOnGitHub')}
                </a>
                <a
                  href={latest.sboms}
                  className="download-meta-link"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {t('download.viewSboms')}
                </a>
              </div>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
