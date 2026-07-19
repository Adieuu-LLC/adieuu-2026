import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { createElement } from 'react';
import { act } from 'react';
import { GlobalWindow } from 'happy-dom';
import { createRoot } from 'react-dom/client';
import * as sharedActual from '@adieuu/shared';
import { deriveCommunityCipher, createTextEntropy, type CommunityCipher } from '@adieuu/crypto';
import { mockNavigate, resetReactRouterDomMock } from '../../test/react-router-dom-mock';
import { resetReactI18nextMock, setMockTranslate } from '../../test/react-i18next-mock';
import {
  verifySpaceCipherCheck,
  getSpaceCipherLink,
  clearSpaceCipherState,
  registerSpaceCipherLink,
} from '../../services/spaceCipherService';

setMockTranslate((key) => key);

let mockIdentityStatus = 'logged_in';

mock.module('../../config', () => ({
  useAppConfig: () => ({ apiBaseUrl: 'http://localhost:3000' }),
}));

const mockCreate = mock(
  (_params: Record<string, unknown>) =>
    Promise.resolve({ success: true, data: {} }) as Promise<{
      success: boolean;
      data?: Record<string, unknown>;
      error?: { code: string; message: string };
    }>,
);

const mockCheckSlug = mock(
  (_slug: string) =>
    Promise.resolve({ success: true, data: { available: true } }) as Promise<{
      success: boolean;
      data?: { available: boolean };
      error?: { code: string; message: string };
    }>,
);

mock.module('@adieuu/shared', () => ({
  ...sharedActual,
  createApiClient: () => ({
    spaces: { create: mockCreate, checkSlugAvailability: mockCheckSlug },
  }),
}));

mock.module('../../hooks/useIdentity', () => ({
  useIdentity: () => ({ status: mockIdentityStatus }),
}));

// Mutable cipher-store surface consumed by the create flow.
let mockCiphers: Array<{ id: string; name: string; shortId: string }> = [];
let mockCipherKeys: Record<string, CommunityCipher> = {};
const mockCreateCipher = mock(
  (_input: unknown) =>
    Promise.resolve({ success: true, cipher: { id: 'new-cipher' } }) as Promise<{
      success: boolean;
      cipher?: { id: string };
      error?: string;
    }>,
);
const mockBookmarkSpaceCipher = mock(async (id: string, spaceId: string) => {
  registerSpaceCipherLink(spaceId, id);
  return { success: true };
});
let mockEncryptionAvailable = true;

mock.module('../../hooks/useCipherStore', () => ({
  useCipherStore: () => ({
    ciphers: mockCiphers,
    getCipherKey: (id: string) => mockCipherKeys[id] ?? null,
    createCipher: mockCreateCipher,
    bookmarkSpaceCipher: mockBookmarkSpaceCipher,
    encryptionAvailable: mockEncryptionAvailable,
  }),
}));

const toastSuccess = mock((_title: string) => {});
const toastError = mock((_title: string) => {});

mock.module('../../components/Toast', () => ({
  useToast: () => ({
    success: toastSuccess,
    error: toastError,
    info: mock(() => {}),
    warning: mock(() => {}),
    toast: mock(() => {}),
    message: mock(() => {}),
  }),
}));

const { CreateSpace } = await import('./CreateSpace');

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
  resetReactRouterDomMock();
  clearSpaceCipherState();
  mockIdentityStatus = 'logged_in';
  mockCreate.mockClear();
  mockCheckSlug.mockClear();
  mockCreateCipher.mockClear();
  mockBookmarkSpaceCipher.mockClear();
  toastSuccess.mockClear();
  toastError.mockClear();
  mockCiphers = [];
  mockCipherKeys = {};
  mockEncryptionAvailable = true;
  mockCheckSlug.mockImplementation(() =>
    Promise.resolve({ success: true, data: { available: true } }),
  );
  // Echo the caller-provided id/slug so the returned Space matches the payload.
  mockCreate.mockImplementation((params: Record<string, unknown>) =>
    Promise.resolve({
      success: true,
      data: {
        id: (params.id as string) ?? 'server-id',
        slug: params.slug as string,
        name: params.name as string,
      },
    }),
  );

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

async function renderCreate() {
  const container = happy.document.createElement('div');
  happy.document.body.appendChild(container);
  const root = createRoot(container as unknown as Element);
  await act(async () => {
    root.render(createElement(CreateSpace));
    await new Promise((r) => setTimeout(r, 0));
  });
  return { root, container };
}

async function tick(ms: number) {
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });
}

/**
 * Sets a value on a controlled input by calling the prototype-level setter,
 * bypassing React's instance-level value tracker.
 */
function setNativeValue(el: Element, value: string) {
  let proto: object | null = Object.getPrototypeOf(el);
  while (proto) {
    const desc = Object.getOwnPropertyDescriptor(proto, 'value');
    if (desc?.set) {
      desc.set.call(el, value);
      return;
    }
    proto = Object.getPrototypeOf(proto);
  }
}

/**
 * React attaches the element's props to the DOM node under a random
 * `__reactProps$*` key. Driving handlers through it is more reliable than
 * dispatching synthetic events into happy-dom's delegated React listeners.
 */
function reactProps(el: Element): Record<string, (e: unknown) => void> | null {
  const key = Object.keys(el).find((k) => k.startsWith('__reactProps$'));
  return key ? ((el as never)[key] as Record<string, (e: unknown) => void>) : null;
}

async function typeInput(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  await act(async () => {
    setNativeValue(el, value);
    reactProps(el)?.onChange?.({ target: el, currentTarget: el });
    await new Promise((r) => setTimeout(r, 0));
  });
}

async function selectValue(el: HTMLSelectElement, value: string) {
  await act(async () => {
    setNativeValue(el, value);
    el.dispatchEvent(new happy.window.Event('change', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 0));
  });
}

async function check(el: HTMLInputElement) {
  await act(async () => {
    el.checked = true;
    reactProps(el)?.onChange?.({ target: el, currentTarget: el });
    await new Promise((r) => setTimeout(r, 0));
  });
}

async function clickButton(el: Element) {
  await act(async () => {
    reactProps(el)?.onClick?.({
      preventDefault() {},
      stopPropagation() {},
      target: el,
      currentTarget: el,
    });
    await new Promise((r) => setTimeout(r, 0));
  });
}

async function submitForm() {
  const btn = [...happy.document.querySelectorAll('button')].find(
    (b) => b.getAttribute('type') === 'submit',
  ) as HTMLButtonElement;
  await act(async () => {
    btn.click();
    await new Promise((r) => setTimeout(r, 0));
  });
}

function byId<T extends Element = HTMLElement>(id: string): T {
  return happy.document.getElementById(id) as unknown as T;
}

async function waitFor(cond: () => boolean, timeout = 3000) {
  const start = Date.now();
  while (!cond() && Date.now() - start < timeout) {
    await tick(20);
  }
}

describe('CreateSpace flow', () => {
  it('shows a sign-in prompt and does not call the API when not signed in', async () => {
    mockIdentityStatus = 'logged_out';
    const { root, container } = await renderCreate();

    expect(happy.document.body.textContent).toContain('spaces.signInHeading');
    expect(mockCheckSlug).not.toHaveBeenCalled();

    await act(async () => root.unmount());
    container.remove();
  });

  it('renders the create form with name and URL fields', async () => {
    const { root, container } = await renderCreate();

    expect(byId('space-name')).toBeTruthy();
    expect(byId('space-slug')).toBeTruthy();
    expect(happy.document.body.textContent).toContain('spaces.create.title');

    await act(async () => root.unmount());
    container.remove();
  });

  it('derives a slug from the name and reports availability', async () => {
    const { root, container } = await renderCreate();

    await typeInput(byId<HTMLInputElement>('space-name'), 'My Cool Space');
    expect(byId<HTMLInputElement>('space-slug').value).toBe('my-cool-space');

    await waitFor(() => happy.document.body.textContent?.includes('spaces.create.slugAvailable') ?? false);
    expect(mockCheckSlug).toHaveBeenCalledWith('my-cool-space');
    expect(happy.document.body.textContent).toContain('spaces.create.slugAvailable');

    await act(async () => root.unmount());
    container.remove();
  });

  it('reports a taken slug', async () => {
    mockCheckSlug.mockImplementation(() =>
      Promise.resolve({ success: true, data: { available: false } }),
    );
    const { root, container } = await renderCreate();

    await typeInput(byId<HTMLInputElement>('space-slug'), 'occupied');
    await waitFor(() => happy.document.body.textContent?.includes('spaces.create.slugTaken') ?? false);
    expect(happy.document.body.textContent).toContain('spaces.create.slugTaken');

    await act(async () => root.unmount());
    container.remove();
  });

  it('shows a reserved slug as simply unavailable without hitting the API', async () => {
    const { root, container } = await renderCreate();

    await typeInput(byId<HTMLInputElement>('space-slug'), 'admin');
    await tick(50);

    expect(happy.document.body.textContent).toContain('spaces.create.slugTaken');
    expect(happy.document.body.textContent).not.toContain('spaces.create.slugReserved');
    expect(mockCheckSlug).not.toHaveBeenCalled();

    await act(async () => root.unmount());
    container.remove();
  });

  it('flags an invalid (too short) slug', async () => {
    const { root, container } = await renderCreate();

    await typeInput(byId<HTMLInputElement>('space-slug'), 'ab');
    await tick(50);

    expect(happy.document.body.textContent).toContain('spaces.create.slugInvalid');
    expect(mockCheckSlug).not.toHaveBeenCalled();

    await act(async () => root.unmount());
    container.remove();
  });

  it('preserves a trailing hyphen so hyphens can be typed mid-word', async () => {
    const { root, container } = await renderCreate();

    // Typing "1-" must keep the hyphen (previously it was stripped, making it
    // impossible to type e.g. "1-2" left-to-right).
    await typeInput(byId<HTMLInputElement>('space-slug'), '1-');
    expect(byId<HTMLInputElement>('space-slug').value).toBe('1-');

    await typeInput(byId<HTMLInputElement>('space-slug'), '1-2');
    expect(byId<HTMLInputElement>('space-slug').value).toBe('1-2');

    await act(async () => root.unmount());
    container.remove();
  });

  it('blocks submit with a missing name', async () => {
    const { root, container } = await renderCreate();

    await submitForm();
    expect(happy.document.body.textContent).toContain('spaces.create.errors.nameRequired');
    expect(mockCreate).not.toHaveBeenCalled();

    await act(async () => root.unmount());
    container.remove();
  });

  it('creates a non-encrypted public Space and navigates to it', async () => {
    const { root, container } = await renderCreate();

    await typeInput(byId<HTMLInputElement>('space-name'), 'Open Space');
    await waitFor(() => happy.document.body.textContent?.includes('spaces.create.slugAvailable') ?? false);

    await submitForm();
    await waitFor(() => mockNavigate.mock.calls.length > 0);

    expect(mockCreate).toHaveBeenCalledTimes(1);
    const params = mockCreate.mock.calls[0]![0] as Record<string, unknown>;
    expect(params.slug).toBe('open-space');
    expect(params.visibility).toBe('public');
    expect(params.id).toBeUndefined();
    expect(params.cipherCheck).toBeUndefined();
    expect(mockNavigate).toHaveBeenCalledWith('/s/open-space');
    expect(toastSuccess).toHaveBeenCalled();

    await act(async () => root.unmount());
    container.remove();
  });

  it('maps the paid-gate error onto a friendly message', async () => {
    mockCreate.mockImplementation(() =>
      Promise.resolve({ success: false, error: { code: 'TIER_REQUIRED', message: 'paid only' } }),
    );
    const { root, container } = await renderCreate();

    await typeInput(byId<HTMLInputElement>('space-name'), 'Paid Space');
    await waitFor(() => happy.document.body.textContent?.includes('spaces.create.slugAvailable') ?? false);

    await submitForm();
    await waitFor(() => happy.document.body.textContent?.includes('spaces.create.errors.tierRequired') ?? false);

    expect(happy.document.body.textContent).toContain('spaces.create.errors.tierRequired');
    expect(mockNavigate).not.toHaveBeenCalled();

    await act(async () => root.unmount());
    container.remove();
  });

  it('binds an existing Cipher into an E2EE Space with a valid cipherCheck + local link', async () => {
    const cipher = deriveCommunityCipher([createTextEntropy('existing space secret')]);
    mockCiphers = [{ id: 'c1', name: 'My Key', shortId: 'abc123' }];
    mockCipherKeys = { c1: cipher };

    const { root, container } = await renderCreate();

    await typeInput(byId<HTMLInputElement>('space-name'), 'Secret Space');
    await waitFor(() => happy.document.body.textContent?.includes('spaces.create.slugAvailable') ?? false);

    await check(happy.document.querySelector('input[type=radio][value=listed]')!);
    await check(byId<HTMLInputElement>('space-encrypt'));
    await selectValue(byId<HTMLSelectElement>('create-cipher-select'), 'c1');

    await submitForm();
    await waitFor(() => mockNavigate.mock.calls.length > 0);

    expect(mockCreate).toHaveBeenCalledTimes(1);
    const params = mockCreate.mock.calls[0]![0] as Record<string, unknown>;
    expect(params.visibility).toBe('listed');
    expect(typeof params.id).toBe('string');
    expect((params.id as string).length).toBe(24);
    expect(params.cipherCheck).toBeDefined();
    expect(params.e2ee).toBe(true);
    expect(params.cipherRequired).toBe(true);

    // The uploaded challenge must decrypt with the bound Cipher.
    const valid = await verifySpaceCipherCheck(cipher, params.id as string, params.cipherCheck as never);
    expect(valid).toBe(true);

    // Local spaceId -> cipher bookmark is registered + persisted.
    expect(getSpaceCipherLink(params.id as string)).toBe('c1');
    expect(mockBookmarkSpaceCipher).toHaveBeenCalledWith('c1', params.id);
    expect(mockNavigate).toHaveBeenCalledWith('/s/secret-space');

    await act(async () => root.unmount());
    container.remove();
  });

  it('creates a new Cipher for an E2EE Space with a valid cipherCheck + local link', async () => {
    const cipher = deriveCommunityCipher([createTextEntropy('brand new secret')]);
    mockCipherKeys = { 'new-cipher': cipher };
    mockCreateCipher.mockImplementation(() =>
      Promise.resolve({ success: true, cipher: { id: 'new-cipher' } }),
    );

    const { root, container } = await renderCreate();

    await typeInput(byId<HTMLInputElement>('space-name'), 'Fresh Space');
    await waitFor(() => happy.document.body.textContent?.includes('spaces.create.slugAvailable') ?? false);

    await check(happy.document.querySelector('input[type=radio][value=listed]')!);
    await check(byId<HTMLInputElement>('space-encrypt'));
    await check(
      happy.document.querySelector('input[type=radio][name=create-cipher-source][value=new]')!,
    );

    await typeInput(byId<HTMLInputElement>('create-cipher-new-name'), 'Fresh Key');
    const entropyInput = happy.document.querySelector(
      'input[id^="create-cipher-entropy-"]',
    ) as HTMLInputElement;
    await typeInput(entropyInput, 'a secret phrase');

    await submitForm();
    await waitFor(() => mockNavigate.mock.calls.length > 0);

    expect(mockCreateCipher).toHaveBeenCalledTimes(1);
    expect(mockCreate).toHaveBeenCalledTimes(1);
    const params = mockCreate.mock.calls[0]![0] as Record<string, unknown>;
    expect(params.cipherCheck).toBeDefined();
    expect(params.e2ee).toBe(true);
    expect(params.cipherRequired).toBe(true);

    const valid = await verifySpaceCipherCheck(cipher, params.id as string, params.cipherCheck as never);
    expect(valid).toBe(true);

    expect(getSpaceCipherLink(params.id as string)).toBe('new-cipher');
    expect(mockBookmarkSpaceCipher).toHaveBeenCalledWith('new-cipher', params.id);
    expect(mockNavigate).toHaveBeenCalledWith('/s/fresh-space');

    await act(async () => root.unmount());
    container.remove();
  });

  it('creates a gate-only Space (cipherRequired without e2ee)', async () => {
    const cipher = deriveCommunityCipher([createTextEntropy('gate only secret')]);
    mockCiphers = [{ id: 'c1', name: 'My Key', shortId: 'abc123' }];
    mockCipherKeys = { c1: cipher };

    const { root, container } = await renderCreate();

    await typeInput(byId<HTMLInputElement>('space-name'), 'Gated Space');
    await waitFor(() => happy.document.body.textContent?.includes('spaces.create.slugAvailable') ?? false);

    await check(happy.document.querySelector('input[type=radio][value=listed]')!);
    await check(byId<HTMLInputElement>('space-cipher-required'));
    await selectValue(byId<HTMLSelectElement>('create-cipher-select'), 'c1');

    await submitForm();
    await waitFor(() => mockNavigate.mock.calls.length > 0);

    const params = mockCreate.mock.calls[0]![0] as Record<string, unknown>;
    expect(params.cipherCheck).toBeDefined();
    expect(params.e2ee).toBe(false);
    expect(params.cipherRequired).toBe(true);
    expect(mockBookmarkSpaceCipher).toHaveBeenCalledWith('c1', params.id);

    await act(async () => root.unmount());
    container.remove();
  });
});
