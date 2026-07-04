// Main pages
export { Home } from './Home';
export { Download } from './Download';
export { Search } from './Search';

// Auth pages
export { Login, Verify } from './auth';

// Account pages
export {
  AccountOverviewContent,
  AccountSecurity,
  AccountSettings,
  ThemeBrowser,
} from './account';

// Identity pages
export {
  IdentityAppearance,
  IdentityCiphers,
  IdentityDevices,
  IdentityPrivacy,
  IdentityProfile,
} from './identity';

// Utility pages
export { ServiceStatus } from './ServiceStatus';

// NOTE: Admin pages are intentionally NOT re-exported here. They pull in heavy
// dependencies (recharts) and are consumed only via App.tsx's lazy
// `import('../pages/admin')`. Re-exporting them through this barrel (which is
// transitively reachable from the eager UI entry) would force that bundle into
// the initial download. Import admin pages directly from '../pages/admin'.
