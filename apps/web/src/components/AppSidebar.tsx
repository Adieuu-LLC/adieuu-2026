import { useLocation, useNavigate, Link } from 'react-router-dom';
import {
  Sidebar,
  SidebarItem,
  SidebarSubItem,
  SidebarDivider,
  SidebarSection,
  Logo,
  Button,
  HomeIcon,
  InfoIcon,
  SettingsIcon,
  ShieldIcon,
  KeyIcon,
  LogoutIcon,
} from '@chadder/ui';
import { useAuth } from '../hooks/useAuth';

/**
 * Main application sidebar with navigation links.
 * Wraps the Sidebar component with app-specific navigation items.
 */
export function AppSidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { logout } = useAuth();

  const handleLogout = async () => {
    await logout();
    navigate('/auth/login');
  };

  const isActive = (path: string) => location.pathname === path;

  return (
    <Sidebar
      header={<Logo size="sm" />}
      footer={
        <Button
          variant="ghost"
          size="sm"
          onClick={handleLogout}
          className="sidebar-logout-btn"
        >
          <LogoutIcon />
          <span className="sidebar-logout-label">Logout</span>
        </Button>
      }
    >
      <SidebarSection label="Main">
        <Link to="/" style={{ textDecoration: 'none' }}>
          <SidebarItem
            icon={<HomeIcon />}
            label="Home"
            isActive={isActive('/')}
          />
        </Link>
        <Link to="/about" style={{ textDecoration: 'none' }}>
          <SidebarItem
            icon={<InfoIcon />}
            label="About"
            isActive={isActive('/about')}
          />
        </Link>
      </SidebarSection>

      <SidebarDivider />

      <SidebarSection label="Settings">
        <SidebarItem
          icon={<SettingsIcon />}
          label="Preferences"
        >
          <SidebarSubItem label="General" />
          <SidebarSubItem label="Notifications" />
          <SidebarSubItem label="Appearance" />
        </SidebarItem>
        <SidebarItem
          icon={<ShieldIcon />}
          label="Privacy & Security"
        >
          <SidebarSubItem label="Privacy" />
          <SidebarSubItem label="Blocked Users" />
        </SidebarItem>
        <SidebarItem
          icon={<KeyIcon />}
          label="Encryption Keys"
        />
      </SidebarSection>
    </Sidebar>
  );
}
