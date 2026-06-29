import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { resetReactI18nextMock, setMockTranslate } from '../../test/react-i18next-mock';
import { mockNavigate, resetReactRouterDomMock } from '../../test/react-router-dom-mock';

setMockTranslate((key) => key);

mock.module('../../config', () => ({
  useAppConfig: () => ({ apiBaseUrl: 'http://localhost:3000' }),
}));

const mockRequestDeletion = mock(() => Promise.resolve({ success: true }));
const mockConfirmDeletion = mock(() => Promise.resolve({ success: true }));

mock.module('@adieuu/shared', () => ({
  createApiClient: () => ({
    accountData: {
      requestDeletion: mockRequestDeletion,
      confirmDeletion: mockConfirmDeletion,
    },
  }),
}));

mock.module('../../components/ConfirmDialog', () => ({
  ConfirmDialog: ({ open, title, children, ...props }: any) =>
    open ? (
      <div data-testid="confirm-dialog" data-title={title}>
        {children}
      </div>
    ) : null,
}));

mock.module('../../components/OtpInput', () => ({
  OtpInput: ({ value }: any) => <input data-testid="otp-input" value={value} />,
}));

mock.module('../../components/Button', () => ({
  Button: ({ children, onClick, disabled, className, ...props }: any) => (
    <button data-testid="button" className={className} disabled={disabled}>
      {children}
    </button>
  ),
}));

const { DeleteAccountPanel } = await import('./DeleteAccountPanel');

describe('DeleteAccountPanel', () => {
  beforeEach(() => {
    resetReactI18nextMock();
    resetReactRouterDomMock();
    mockRequestDeletion.mockClear();
    mockConfirmDeletion.mockClear();
  });

  test('renders delete button in idle state', () => {
    const html = renderToStaticMarkup(<DeleteAccountPanel />);

    expect(html).toContain('account.security.deleteAccount.deleteButton');
    expect(html).toContain('btn-danger');
  });

  test('renders warning card with i18n text', () => {
    const html = renderToStaticMarkup(<DeleteAccountPanel />);

    expect(html).toContain('delete-account-warning-card');
    expect(html).toContain('account.security.deleteAccount.warning');
    expect(html).toContain('account.security.deleteAccount.warningRemoveContent');
  });

  test('renders panel title and description', () => {
    const html = renderToStaticMarkup(<DeleteAccountPanel />);

    expect(html).toContain('account.security.deleteAccount.title');
    expect(html).toContain('account.security.deleteAccount.description');
  });

  test('does not render OTP input in idle state', () => {
    const html = renderToStaticMarkup(<DeleteAccountPanel />);

    expect(html).not.toContain('data-testid="otp-input"');
    expect(html).not.toContain('delete-account-otp');
  });

  test('does not render confirm dialog in idle state', () => {
    const html = renderToStaticMarkup(<DeleteAccountPanel />);

    expect(html).not.toContain('data-testid="confirm-dialog"');
  });
});
