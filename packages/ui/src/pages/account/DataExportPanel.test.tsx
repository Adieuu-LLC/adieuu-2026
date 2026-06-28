import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { resetReactI18nextMock, setMockTranslate } from '../../test/react-i18next-mock';

setMockTranslate((key) => key);

mock.module('../../config', () => ({
  useAppConfig: () => ({ apiBaseUrl: 'http://localhost:3000' }),
}));

const mockGetDataExport = mock(() =>
  Promise.resolve({ success: true, data: { account: {}, exportedAt: '2024-01-01' } }),
);

mock.module('@adieuu/shared', () => ({
  createApiClient: () => ({
    accountData: {
      getDataExport: mockGetDataExport,
    },
  }),
}));

mock.module('../../components/Button', () => ({
  Button: ({ children, onClick, disabled, className, ...props }: any) => (
    <button data-testid="button" className={className} disabled={disabled}>
      {children}
    </button>
  ),
}));

mock.module('../../components/Spinner', () => ({
  Spinner: ({ size }: any) => <span data-testid="spinner" data-size={size} />,
}));

const { DataExportPanel } = await import('./DataExportPanel');

describe('DataExportPanel', () => {
  beforeEach(() => {
    resetReactI18nextMock();
    mockGetDataExport.mockClear();
  });

  test('renders loading state initially', () => {
    const html = renderToStaticMarkup(<DataExportPanel />);

    expect(html).toContain('data-testid="spinner"');
    expect(html).toContain('data-export-loading');
  });

  test('renders loading text from i18n', () => {
    const html = renderToStaticMarkup(<DataExportPanel />);

    expect(html).toContain('account.security.dataExport.loading');
  });

  test('does not render data viewer in loading state', () => {
    const html = renderToStaticMarkup(<DataExportPanel />);

    expect(html).not.toContain('data-export-viewer');
    expect(html).not.toContain('data-export-header');
  });

  test('does not render error state initially', () => {
    const html = renderToStaticMarkup(<DataExportPanel />);

    expect(html).not.toContain('data-export-error');
  });
});
