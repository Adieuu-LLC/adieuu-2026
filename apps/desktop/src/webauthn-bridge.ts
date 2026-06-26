/**
 * WebAuthn IPC bridge for the packaged desktop app.
 *
 * The production desktop renderer loads from `adieuu://app`, a custom protocol
 * whose hostname (`app`) does not match the production RP ID (`adieuu.com`).
 * Chromium therefore rejects `navigator.credentials.create/get` with a
 * SecurityError before the authenticator prompt ever appears.
 *
 * This module works around the mismatch by running the WebAuthn ceremony inside
 * a hidden BrowserWindow whose document origin *is* the production web app
 * (`https://app.adieuu.com`). The main process injects a self-contained script
 * via `webContents.executeJavaScript`; no JS is loaded from the remote page.
 *
 * The hidden window is created lazily on first use and cached for reuse.
 */

import { BrowserWindow } from 'electron';

// ---------------------------------------------------------------------------
// Bridge page URL — served as a static file from the web app's S3/CloudFront.
// The page itself is intentionally empty; we only need the correct origin.
// ---------------------------------------------------------------------------

const BRIDGE_ORIGIN = 'https://app.adieuu.com';
const BRIDGE_URL = `${BRIDGE_ORIGIN}/webauthn-bridge.html`;
const PAGE_LOAD_TIMEOUT_MS = 15_000;

// ---------------------------------------------------------------------------
// Conversion helpers injected into the hidden window.
// Kept as a single string template so the entire ceremony runs in one
// `executeJavaScript` call with no external dependencies.
// ---------------------------------------------------------------------------

const CONVERSION_HELPERS = /* js */ `
function __b64url2buf(b64url) {
  var b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  var pad = b64.length % 4;
  if (pad) b64 += '='.repeat(4 - pad);
  var bin = atob(b64);
  var bytes = new Uint8Array(bin.length);
  for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}
function __buf2b64url(buf) {
  var bytes = new Uint8Array(buf);
  var bin = '';
  for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\\+/g, '-').replace(/\\//g, '_').replace(/=+$/, '');
}
`;

// ---------------------------------------------------------------------------
// Scripts injected via executeJavaScript
// ---------------------------------------------------------------------------

function buildCreateScript(optionsJSON: unknown): string {
  const opts = JSON.stringify(optionsJSON);
  return `(async function() {
    ${CONVERSION_HELPERS}
    var opts = ${opts};
    var publicKey = Object.assign({}, opts, {
      challenge: __b64url2buf(opts.challenge),
      user: Object.assign({}, opts.user, { id: __b64url2buf(opts.user.id) })
    });
    if (opts.excludeCredentials) {
      publicKey.excludeCredentials = opts.excludeCredentials.map(function(c) {
        return Object.assign({}, c, { id: __b64url2buf(c.id) });
      });
    }
    var cred = await navigator.credentials.create({ publicKey: publicKey });
    var resp = {
      clientDataJSON:    __buf2b64url(cred.response.clientDataJSON),
      attestationObject: __buf2b64url(cred.response.attestationObject)
    };
    if (typeof cred.response.getTransports === 'function') {
      resp.transports = cred.response.getTransports();
    }
    if (typeof cred.response.getPublicKey === 'function') {
      var pk = cred.response.getPublicKey();
      if (pk) resp.publicKey = __buf2b64url(pk);
    }
    if (typeof cred.response.getAuthenticatorData === 'function') {
      resp.authenticatorData = __buf2b64url(cred.response.getAuthenticatorData());
    }
    if (typeof cred.response.getPublicKeyAlgorithm === 'function') {
      resp.publicKeyAlgorithm = cred.response.getPublicKeyAlgorithm();
    }
    return {
      id:       cred.id,
      rawId:    __buf2b64url(cred.rawId),
      type:     cred.type,
      response: resp,
      clientExtensionResults:  cred.getClientExtensionResults(),
      authenticatorAttachment: cred.authenticatorAttachment || undefined
    };
  })()`;
}

function buildGetScript(optionsJSON: unknown): string {
  const opts = JSON.stringify(optionsJSON);
  return `(async function() {
    ${CONVERSION_HELPERS}
    var opts = ${opts};
    var publicKey = Object.assign({}, opts, {
      challenge: __b64url2buf(opts.challenge)
    });
    if (opts.allowCredentials) {
      publicKey.allowCredentials = opts.allowCredentials.map(function(c) {
        return Object.assign({}, c, { id: __b64url2buf(c.id) });
      });
    }
    var cred = await navigator.credentials.get({ publicKey: publicKey });
    var resp = {
      clientDataJSON:    __buf2b64url(cred.response.clientDataJSON),
      authenticatorData: __buf2b64url(cred.response.authenticatorData),
      signature:         __buf2b64url(cred.response.signature)
    };
    if (cred.response.userHandle) {
      resp.userHandle = __buf2b64url(cred.response.userHandle);
    }
    return {
      id:       cred.id,
      rawId:    __buf2b64url(cred.rawId),
      type:     cred.type,
      response: resp,
      clientExtensionResults:  cred.getClientExtensionResults(),
      authenticatorAttachment: cred.authenticatorAttachment || undefined
    };
  })()`;
}

// ---------------------------------------------------------------------------
// Hidden BrowserWindow management
// ---------------------------------------------------------------------------

let bridgeWindow: BrowserWindow | null = null;
let bridgeReady: Promise<void> | null = null;

function ensureBridgeWindow(): Promise<void> {
  if (bridgeWindow && !bridgeWindow.isDestroyed()) {
    return bridgeReady!;
  }

  bridgeWindow = new BrowserWindow({
    show: false,
    width: 1,
    height: 1,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  bridgeWindow.on('closed', () => {
    bridgeWindow = null;
    bridgeReady = null;
  });

  bridgeReady = new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('WebAuthn bridge page load timed out'));
    }, PAGE_LOAD_TIMEOUT_MS);

    bridgeWindow!.webContents.once('did-finish-load', () => {
      clearTimeout(timer);
      resolve();
    });

    bridgeWindow!.webContents.once('did-fail-load', (_event, code, desc) => {
      clearTimeout(timer);
      reject(new Error(`WebAuthn bridge page failed to load: ${desc} (${code})`));
    });

    bridgeWindow!.loadURL(BRIDGE_URL).catch((err) => {
      clearTimeout(timer);
      reject(err);
    });
  });

  return bridgeReady;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface WebAuthnIpcResult {
  success: true;
  credential: unknown;
}

export interface WebAuthnIpcError {
  success: false;
  name: string;
  message: string;
}

export type WebAuthnIpcResponse = WebAuthnIpcResult | WebAuthnIpcError;

export async function createCredential(optionsJSON: unknown): Promise<WebAuthnIpcResponse> {
  try {
    await ensureBridgeWindow();
    const credential = await bridgeWindow!.webContents.executeJavaScript(
      buildCreateScript(optionsJSON),
    );
    return { success: true, credential };
  } catch (err) {
    return {
      success: false,
      name: err instanceof Error ? err.name : 'Error',
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function getCredential(optionsJSON: unknown): Promise<WebAuthnIpcResponse> {
  try {
    await ensureBridgeWindow();
    const credential = await bridgeWindow!.webContents.executeJavaScript(
      buildGetScript(optionsJSON),
    );
    return { success: true, credential };
  } catch (err) {
    return {
      success: false,
      name: err instanceof Error ? err.name : 'Error',
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

export function destroyBridgeWindow(): void {
  if (bridgeWindow && !bridgeWindow.isDestroyed()) {
    bridgeWindow.destroy();
  }
  bridgeWindow = null;
  bridgeReady = null;
}
