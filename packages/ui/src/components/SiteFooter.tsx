import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getFooterLegalLinks, getLegalPolicyPath } from '../legal/policies';

function isFullScreenRoute(pathname: string): boolean {
  if (pathname === '/conversations' || pathname.startsWith('/conversations/')) return true;
  if (/^\/s\/[^/]+\/c\//.test(pathname)) return true;
  return false;
}

export function SiteFooter() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const year = new Date().getFullYear();
  const footerLinks = getFooterLegalLinks();

  if (isFullScreenRoute(pathname)) {
    return null;
  }

  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <span className="site-footer-copyright">{t('footer.copyright', { year })}</span>
        <nav className="site-footer-nav" aria-label="Legal">
          {footerLinks.map((policy, index) => (
            <span key={policy.slug} className="site-footer-nav-item">
              {index > 0 ? <span className="site-footer-separator" aria-hidden="true">·</span> : null}
              <Link to={getLegalPolicyPath(policy.slug)} className="site-footer-link">
                {policy.title}
              </Link>
            </span>
          ))}
        </nav>
      </div>
    </footer>
  );
}
