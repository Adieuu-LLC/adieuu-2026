import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
// Importing the shared mock guarantees it is registered even if Bun's preload
// ordering means another test file is processed first.
import { resetReactRouterDomMock } from '../../test/react-router-dom-mock';

let mockContext: {
  status: string;
  downloadProgress: { percent: number; transferred: number; total: number } | null;
  installing: boolean;
};

mock.module('../../hooks/useUpdateContext', () => ({
  useUpdateContext: () => mockContext,
}));

mock.module('../../hooks/usePlatform', () => ({
  usePlatform: () => 'desktop',
}));

const closeMobile = mock(() => {});
mock.module('../../components/Sidebar', () => ({
  useSidebar: () => ({ closeMobile }),
}));

mock.module('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const map: Record<string, string> = {
        'sidebar.update.available': 'Update Available',
        'sidebar.update.downloading': 'Downloading Update',
        'sidebar.update.install': 'Install Update',
        'sidebar.update.restartWeb': 'Restart to Update',
        'sidebar.update.error': 'Update issue',
      };
      return map[key] ?? key;
    },
  }),
}));

mock.module('../../icons/Icon', () => ({
  Icon: ({ name }: { name: string }) => <span data-testid={`icon-${name}`} />,
}));

const { SidebarUpdateNav } = await import('./SidebarUpdateNav');

describe('SidebarUpdateNav', () => {
  beforeEach(() => {
    resetReactRouterDomMock();
    closeMobile.mockClear();
  });

  test('renders nothing when resolver hides (up-to-date)', () => {
    mockContext = {
      status: 'up-to-date',
      downloadProgress: null,
      installing: false,
    };
    const html = renderToStaticMarkup(<SidebarUpdateNav />);
    expect(html).toBe('');
  });

  test('renders label and download icon when update is available', () => {
    mockContext = {
      status: 'available',
      downloadProgress: null,
      installing: false,
    };
    const html = renderToStaticMarkup(<SidebarUpdateNav />);
    expect(html).toContain('sidebar-update-nav-row');
    expect(html).toContain('Update Available');
    expect(html).toContain('sidebar-update-nav-btn');
  });

  test('renders progress bar when downloading', () => {
    mockContext = {
      status: 'downloading',
      downloadProgress: { percent: 33, transferred: 3, total: 9 },
      installing: false,
    };
    const html = renderToStaticMarkup(<SidebarUpdateNav />);
    expect(html).toContain('Downloading Update');
    expect(html).toContain('progress-bar');
  });
});
