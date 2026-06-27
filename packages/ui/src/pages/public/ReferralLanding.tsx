import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { createApiClient, storePendingReferralCode } from '@adieuu/shared';
import { AuthLayout } from '../../components/AuthLayout';
import { BorderGlow } from '../../components/BorderGlow';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { Alert } from '../../components/Alert';
import { Spinner } from '../../components/Spinner';
import { LegalAgreementNotice } from '../../components/LegalAgreementNotice';
import { Icon } from '../../icons/Icon';
import { useAppConfig } from '../../config';

/** Matches `BorderGlow` intro sequence end (delay 2500ms + fade 1500ms). */
const REFERRAL_BORDER_GLOW_INTRO_MS = 4100;

function getCssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function hexToHsl(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return '0 0 50';
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return `${Math.round(h * 360)} ${Math.round(s * 100)} ${Math.round(l * 100)}`;
}

function useReferralBorderGlowTheme() {
  const [theme, setTheme] = useState({
    primary: '#22d3ee',
    secondary: '#38bdf8',
    bgElevated: '#1a1a2e',
  });

  useEffect(() => {
    setTheme({
      primary: getCssVar('--color-accent-primary') || '#22d3ee',
      secondary: getCssVar('--color-accent-secondary') || '#38bdf8',
      bgElevated: getCssVar('--color-bg-elevated') || '#1a1a2e',
    });
  }, []);

  return theme;
}

function useAnimatedContentHeight(deps: unknown[]) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number>();
  const hasMeasured = useRef(false);

  useLayoutEffect(() => {
    const node = contentRef.current;
    if (!node) return;

    const measure = () => node.scrollHeight;

    const observer = new ResizeObserver(() => {
      setHeight(measure());
    });
    observer.observe(node);

    if (!hasMeasured.current) {
      hasMeasured.current = true;
      setHeight(measure());
    } else {
      requestAnimationFrame(() => {
        setHeight(measure());
      });
    }

    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-measure when rendered content changes
  }, deps);

  return { contentRef, height };
}

export function ReferralLanding() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { code: rawCode = '' } = useParams<{ code: string }>();
  const { apiBaseUrl } = useAppConfig();
  const api = useMemo(() => createApiClient({ baseUrl: apiBaseUrl }), [apiBaseUrl]);
  const glowTheme = useReferralBorderGlowTheme();

  const [loading, setLoading] = useState(true);
  const [valid, setValid] = useState(false);
  const [customMessage, setCustomMessage] = useState<string | undefined>();
  const [glowIntro, setGlowIntro] = useState(true);

  useEffect(() => {
    const id = window.setTimeout(() => setGlowIntro(false), REFERRAL_BORDER_GLOW_INTRO_MS);
    return () => window.clearTimeout(id);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const response = await api.referral.getLanding(rawCode);
        if (cancelled) return;

        if (!response.success || !response.data?.valid) {
          setValid(false);
          setCustomMessage(undefined);
          return;
        }

        setValid(true);
        setCustomMessage(response.data.customMessage);
      } catch {
        if (cancelled) return;
        setValid(false);
        setCustomMessage(undefined);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [api, rawCode]);

  const handleAccept = () => {
    const normalized = rawCode.trim().toLowerCase();
    storePendingReferralCode(normalized);
    navigate(`/auth/login?ref=${encodeURIComponent(normalized)}`);
  };

  const handleDecline = () => {
    navigate('/auth/login');
  };

  const glowColors = useMemo(
    () => [glowTheme.primary, glowTheme.secondary, glowTheme.primary] as const,
    [glowTheme],
  );
  const glowColorHsl = useMemo(() => hexToHsl(glowTheme.primary), [glowTheme.primary]);
  const { contentRef, height: contentHeight } = useAnimatedContentHeight([loading, valid, customMessage]);

  return (
    <AuthLayout
      title={t('account.referral.landing.title')}
      subtitle={valid ? t('account.referral.landing.subtitleValid') : t('account.referral.landing.subtitleInvalid')}
    >
      <BorderGlow
        className="referral-landing-glow slide-up"
        animated={glowIntro}
        colors={[...glowColors]}
        glowColor={glowColorHsl}
        backgroundColor={glowTheme.bgElevated}
        borderRadius={12}
        glowRadius={28}
        glowIntensity={0.72}
        fillOpacity={0.3}
      >
        <Card variant="elevated" className="referral-landing-card">
          <div
            className="referral-landing-content-shell"
            style={contentHeight !== undefined ? { height: contentHeight } : undefined}
          >
            <div ref={contentRef} className="referral-landing-content">
              {loading && (
                <div className="referral-landing-loading">
                  <Spinner />
                </div>
              )}

              {!loading && !valid && (
                <>
                  <Alert variant="error">{t('account.referral.landing.invalid')}</Alert>
                  <div className="referral-landing-invalid-actions">
                    <Button type="button" onClick={handleDecline}>
                      {t('account.referral.landing.continueWithout')}
                    </Button>
                  </div>
                </>
              )}

              {!loading && valid && (
                <>
                  {customMessage && (
                    <div className="referral-landing-custom-message">
                      <p className="text-muted referral-landing-custom-message-label">
                        {t('account.referral.landing.customMessageLabel')}
                      </p>
                      <blockquote className="referral-landing-custom-message-quote">{customMessage}</blockquote>
                    </div>
                  )}

                  <div className="referral-landing-actions">
                    <Button type="button" onClick={handleAccept}>
                      {t('account.referral.landing.accept')}
                    </Button>
                    <Button type="button" variant="ghost" onClick={handleDecline}>
                      {t('account.referral.landing.decline')}
                    </Button>
                  </div>

                  <LegalAgreementNotice variant="compact" className="referral-landing-legal-notice" />

                  <ul className="text-muted referral-landing-privacy-notes">
                    <li>{t('account.referral.landing.privacyNote.optional')}</li>
                    <li>{t('account.referral.landing.privacyNote.later')}</li>
                    <li>{t('account.referral.landing.privacyNote.credit')}</li>
                  </ul>
                </>
              )}

              {!loading && (
                <p className="referral-landing-back">
                  <Link to="/" className="referral-landing-back-link">
                    <Icon name="arrowLeft" size="sm" />
                    {t('account.referral.landing.backHome')}
                  </Link>
                </p>
              )}
            </div>
          </div>
        </Card>
      </BorderGlow>
    </AuthLayout>
  );
}
