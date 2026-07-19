import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useSidebar } from '../../components/Sidebar';
import { Logo } from '../../components/Logo';

export function SidebarLogo() {
  const { t } = useTranslation();
  const { isExpanded } = useSidebar();

  return (
    <Link to="/" className="app-logo-link" aria-label={t('nav.home')}>
      <Logo size="sm" variant={isExpanded ? 'full' : 'icon'} />
    </Link>
  );
}
