import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { setMockTranslate } from '../../test/react-i18next-mock';

/* ---- Mocks ---- */

setMockTranslate((key, fallback) => {
  if (typeof fallback === 'string') return fallback;
  return key;
});

mock.module('../../icons/Icon', () => ({
  Icon: ({ name }: { name: string }) => <span data-icon={name} />,
}));

mock.module('../../components/Card', () => ({
  Card: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  ),
}));

mock.module('../../components/Alert', () => ({
  Alert: ({ children }: { children: React.ReactNode }) => <div className="alert">{children}</div>,
}));

mock.module('../../components/Button', () => ({
  Button: ({ children, disabled, onClick, variant, className, type, size, ...rest }: any) => (
    <button disabled={disabled} onClick={onClick} data-variant={variant} className={className} type={type} data-size={size} {...rest}>
      {children}
    </button>
  ),
}));

mock.module('../../components/ConfirmDialog', () => ({
  ConfirmDialog: ({ open, title, description, confirmLabel, variant }: any) =>
    open ? (
      <div data-testid="confirm-dialog" data-variant={variant}>
        <p data-testid="confirm-title">{title}</p>
        <p data-testid="confirm-description">{description}</p>
        <button data-testid="confirm-button" type="button">{confirmLabel}</button>
      </div>
    ) : null,
}));

mock.module('@ark-ui/react', () => ({
  Dialog: {
    Root: ({ children, open }: any) => (open ? <div data-dialog="root">{children}</div> : null),
    Backdrop: () => <div data-dialog="backdrop" />,
    Positioner: ({ children }: any) => <div data-dialog="positioner">{children}</div>,
    Content: ({ children, className }: any) => <div className={className}>{children}</div>,
    Title: ({ children }: any) => <h2>{children}</h2>,
  },
  Portal: ({ children }: any) => <div data-portal>{children}</div>,
}));

let mockIdentityStatus = 'logged_in';
let mockIdentityId: string | undefined = 'id-123';
mock.module('../../hooks/useIdentity', () => ({
  useIdentity: () => ({
    status: mockIdentityStatus,
    identity: mockIdentityId ? { id: mockIdentityId } : undefined,
  }),
}));

let mockEmojis: Array<{
  id: string;
  identityId: string;
  shortcode: string;
  name: string;
  cdnUrl: string;
  animated: boolean;
  createdAt: string;
}> = [];
let mockLimit = 25;
let mockUsed = 0;
const mockRefresh = mock(async () => {});
const mockCreateEmoji = mock(async () => null as any);
const mockUpdateEmoji = mock(async () => null as any);
const mockDeleteEmoji = mock(async () => true);

mock.module('../../hooks/useCustomEmojis', () => ({
  useCustomEmojis: () => ({
    emojis: mockEmojis,
    limit: mockLimit,
    used: mockUsed,
    loading: false,
    error: null,
    refresh: mockRefresh,
    createEmoji: mockCreateEmoji,
    updateEmoji: mockUpdateEmoji,
    deleteEmoji: mockDeleteEmoji,
  }),
}));

let mockUploadState = 'idle';
let mockUploadMediaId: string | null = null;
let mockUploadError: string | null = null;
const mockUpload = mock(async () => {});
const mockResetUpload = mock(() => {});
mock.module('../../hooks/useMediaUpload', () => ({
  useMediaUpload: () => ({
    upload: mockUpload,
    reset: mockResetUpload,
    state: mockUploadState,
    uploadStatus: null,
    progress: 50,
    error: mockUploadError,
    mediaId: mockUploadMediaId,
    cdnUrl: null,
  }),
}));

mock.module('../../config', () => ({
  useAppConfig: () => ({ apiBaseUrl: '', chatWsUrl: '', externalLinkBase: '', platform: 'web' }),
}));

mock.module('@adieuu/shared', () => ({
  CUSTOM_EMOJI_SHORTCODE_BODY_RE: /^[a-z0-9_-]+$/,
  filenameToShortcode: (name: string) => name.replace(/\.[^.]+$/, '').toLowerCase(),
  filenameToDisplayName: (name: string) => name.replace(/\.[^.]+$/, ''),
}));

const { IdentityCustomEmojis } = await import('./CustomEmojis');

/* ---- Helpers ---- */

function makeEmoji(overrides: Partial<typeof mockEmojis[0]> = {}) {
  return {
    id: 'e-' + Math.random().toString(36).slice(2, 8),
    identityId: 'id-123',
    shortcode: 'test_emoji',
    name: 'Test Emoji',
    cdnUrl: 'https://cdn.example.com/emoji.png',
    animated: false,
    createdAt: '2026-01-15T12:00:00Z',
    ...overrides,
  };
}

/* ---- Tests ---- */

describe('IdentityCustomEmojis', () => {
  beforeEach(() => {
    mockIdentityStatus = 'logged_in';
    mockIdentityId = 'id-123';
    mockEmojis = [];
    mockLimit = 25;
    mockUsed = 0;
    mockRefresh.mockClear();
    mockCreateEmoji.mockClear();
    mockUploadState = 'idle';
    mockUploadMediaId = null;
    mockUploadError = null;
    mockUpload.mockClear();
    mockResetUpload.mockClear();
  });

  describe('Sorting', () => {
    test('renders sort controls when 2+ emojis exist', () => {
      mockEmojis = [
        makeEmoji({ id: 'e1', name: 'Banana', shortcode: 'banana', createdAt: '2026-01-10T00:00:00Z' }),
        makeEmoji({ id: 'e2', name: 'Apple', shortcode: 'apple', createdAt: '2026-01-15T00:00:00Z' }),
      ];
      const html = renderToStaticMarkup(<IdentityCustomEmojis />);
      expect(html).toContain('custom-emoji-sort-controls');
      expect(html).toContain('emoji-sort');
    });

    test('does not render sort controls with 0 or 1 emoji', () => {
      mockEmojis = [makeEmoji({ id: 'e1' })];
      const html = renderToStaticMarkup(<IdentityCustomEmojis />);
      expect(html).not.toContain('custom-emoji-sort-controls');
    });

    test('has sort options for name, shortcode, and recently uploaded', () => {
      mockEmojis = [
        makeEmoji({ id: 'e1', name: 'Banana' }),
        makeEmoji({ id: 'e2', name: 'Apple' }),
      ];
      const html = renderToStaticMarkup(<IdentityCustomEmojis />);
      expect(html).toContain('value="name"');
      expect(html).toContain('value="shortcode"');
      expect(html).toContain('value="recent"');
    });

    test('default sort is alphabetical by name', () => {
      mockEmojis = [
        makeEmoji({ id: 'e1', name: 'Zebra', shortcode: 'zebra' }),
        makeEmoji({ id: 'e2', name: 'Apple', shortcode: 'apple' }),
        makeEmoji({ id: 'e3', name: 'Mango', shortcode: 'mango' }),
      ];
      const html = renderToStaticMarkup(<IdentityCustomEmojis />);
      const appleIdx = html.indexOf('Apple');
      const mangoIdx = html.indexOf('Mango');
      const zebraIdx = html.indexOf('Zebra');
      expect(appleIdx).toBeLessThan(mangoIdx);
      expect(mangoIdx).toBeLessThan(zebraIdx);
    });
  });

  describe('Upload modal footer states', () => {
    test('renders Add Emojis button', () => {
      const html = renderToStaticMarkup(<IdentityCustomEmojis />);
      expect(html).toContain('Add Emojis');
    });

    test('disables Add Emojis when at limit', () => {
      mockUsed = 25;
      mockLimit = 25;
      const html = renderToStaticMarkup(<IdentityCustomEmojis />);
      expect(html).toContain('disabled=""');
      expect(html).toContain('You have reached your custom emoji limit');
    });
  });

  describe('Locked and logged out states', () => {
    test('shows locked warning when identity is locked', () => {
      mockIdentityStatus = 'locked';
      const html = renderToStaticMarkup(<IdentityCustomEmojis />);
      expect(html).toContain('ciphers.sessionLocked');
    });

    test('shows logged-out warning when not logged in', () => {
      mockIdentityStatus = 'logged_out';
      const html = renderToStaticMarkup(<IdentityCustomEmojis />);
      expect(html).toContain('ciphers.notLoggedIn');
    });
  });
});
