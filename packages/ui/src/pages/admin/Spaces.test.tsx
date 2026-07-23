import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import * as sharedActual from '@adieuu/shared';
import { PLATFORM_SETTING_KEYS } from '@adieuu/shared';
import { GlobalWindow } from 'happy-dom';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { resetReactI18nextMock, setMockTranslate } from '../../test/react-i18next-mock';

setMockTranslate((key) => key);

const mockGetPlatformSettings = mock(
  () =>
    Promise.resolve({
      success: true,
      data: [
        {
          key: PLATFORM_SETTING_KEYS.SPACE_CREATION_ENABLED,
          valueType: 'boolean',
          value: false,
          updatedAt: '2024-01-01T00:00:00.000Z',
          createdAt: '2024-01-01T00:00:00.000Z',
        },
      ],
    }) as Promise<{
      success: boolean;
      data?: Array<{
        key: string;
        valueType: string;
        value: unknown;
        updatedAt: string;
        createdAt: string;
      }>;
    }>,
);

const mockPutPlatformSetting = mock(
  (_key: string, _body: unknown) =>
    Promise.resolve({ success: true, data: {} }) as Promise<{ success: boolean; data?: unknown }>,
);

mock.module('../../config', () => ({
  useAppConfig: () => ({ apiBaseUrl: 'http://localhost:3000' }),
}));

mock.module('@adieuu/shared', () => ({
  ...sharedActual,
  createApiClient: () => ({
    admin: {
      getPlatformSettings: mockGetPlatformSettings,
      putPlatformSetting: mockPutPlatformSetting,
    },
  }),
}));

const { AdminSpaces } = await import('./Spaces');

type G = typeof globalThis & {
  window?: GlobalWindow & typeof globalThis;
  document?: Document;
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};

let happy: GlobalWindow;
let prevWindow: typeof globalThis.window;
let prevDocument: typeof globalThis.document;

beforeEach(() => {
  resetReactI18nextMock();
  setMockTranslate((key) => key);
  mockGetPlatformSettings.mockClear();
  mockPutPlatformSetting.mockClear();
  mockGetPlatformSettings.mockImplementation(() =>
    Promise.resolve({
      success: true,
      data: [
        {
          key: PLATFORM_SETTING_KEYS.SPACE_CREATION_ENABLED,
          valueType: 'boolean',
          value: false,
          updatedAt: '2024-01-01T00:00:00.000Z',
          createdAt: '2024-01-01T00:00:00.000Z',
        },
      ],
    }),
  );
  mockPutPlatformSetting.mockImplementation(() => Promise.resolve({ success: true, data: {} }));

  const g = globalThis as G;
  prevWindow = g.window;
  prevDocument = g.document;
  happy = new GlobalWindow({ url: 'https://example.test/' });
  g.IS_REACT_ACT_ENVIRONMENT = true;
  g.window = happy as unknown as GlobalWindow & typeof globalThis;
  g.document = happy.document;
});

afterEach(async () => {
  await new Promise((r) => setTimeout(r, 0));
  happy?.close();
  const g = globalThis as G;
  delete g.IS_REACT_ACT_ENVIRONMENT;
  g.window = prevWindow;
  g.document = prevDocument;
});

function reactProps(el: Element): Record<string, (e: unknown) => void> | null {
  const key = Object.keys(el).find((k) => k.startsWith('__reactProps$'));
  return key ? ((el as never)[key] as Record<string, (e: unknown) => void>) : null;
}

async function renderPage() {
  const container = happy.document.createElement('div');
  happy.document.body.appendChild(container);
  const root = createRoot(container as unknown as Element);
  await act(async () => {
    root.render(createElement(AdminSpaces));
    await new Promise((r) => setTimeout(r, 0));
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
  return { root, container };
}

describe('AdminSpaces', () => {
  it('loads the creation toggle and saves the setting', async () => {
    const { root, container } = await renderPage();

    expect(mockGetPlatformSettings).toHaveBeenCalled();
    expect(happy.document.body.textContent).toContain('admin.spaces.title');
    expect(happy.document.body.textContent).toContain('admin.spaces.creationEnabled');

    const checkbox = happy.document.querySelector('input[type="checkbox"]') as HTMLInputElement | null;
    expect(checkbox).not.toBeNull();
    expect(checkbox!.checked).toBe(false);

    await act(async () => {
      checkbox!.checked = true;
      reactProps(checkbox!)?.onChange?.({ target: checkbox!, currentTarget: checkbox! });
      await new Promise((r) => setTimeout(r, 0));
    });

    const saveBtn = [...happy.document.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('admin.spaces.save'),
    );
    expect(saveBtn).toBeDefined();

    await act(async () => {
      reactProps(saveBtn!)?.onClick?.({
        preventDefault() {},
        stopPropagation() {},
        target: saveBtn!,
        currentTarget: saveBtn!,
      });
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(mockPutPlatformSetting).toHaveBeenCalledWith(
      PLATFORM_SETTING_KEYS.SPACE_CREATION_ENABLED,
      expect.objectContaining({
        valueType: 'boolean',
        value: true,
      }),
    );

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it('shows a load error when settings fail to load', async () => {
    mockGetPlatformSettings.mockImplementation(() =>
      Promise.resolve({ success: false }),
    );
    const { root, container } = await renderPage();

    expect(happy.document.body.textContent).toContain('admin.spaces.loadError');

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });
});
