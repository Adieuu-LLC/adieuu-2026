/**
 * Device Information Utilities
 *
 * Provides functions to detect and generate device information
 * for device registration and management.
 *
 * @module services/deviceInfo
 */

/**
 * Detected browser name.
 */
type BrowserName = 'Chrome' | 'Firefox' | 'Safari' | 'Edge' | 'Opera' | 'Brave' | 'Unknown Browser';

/**
 * Detected operating system.
 */
type OSName = 'Windows' | 'macOS' | 'Linux' | 'iOS' | 'Android' | 'Unknown OS';

/**
 * Device information.
 */
export interface DeviceInfo {
  browser: BrowserName;
  os: OSName;
  deviceType: 'desktop' | 'mobile' | 'tablet';
}

/**
 * Detects the browser from the user agent string.
 */
function detectBrowser(): BrowserName {
  if (typeof navigator === 'undefined') return 'Unknown Browser';

  const ua = navigator.userAgent;

  // Check for Brave (has to be first as it also contains Chrome)
  if ((navigator as { brave?: { isBrave?: () => Promise<boolean> } }).brave?.isBrave) {
    return 'Brave';
  }

  // Check for Edge (before Chrome as Edge contains Chrome in UA)
  if (ua.includes('Edg/') || ua.includes('Edge/')) {
    return 'Edge';
  }

  // Check for Opera (before Chrome as Opera contains Chrome in UA)
  if (ua.includes('OPR/') || ua.includes('Opera/')) {
    return 'Opera';
  }

  // Check for Chrome
  if (ua.includes('Chrome/') && !ua.includes('Chromium/')) {
    return 'Chrome';
  }

  // Check for Firefox
  if (ua.includes('Firefox/')) {
    return 'Firefox';
  }

  // Check for Safari (after Chrome/Edge/Opera as they may contain Safari)
  if (ua.includes('Safari/') && !ua.includes('Chrome/')) {
    return 'Safari';
  }

  return 'Unknown Browser';
}

/**
 * Detects the operating system from the user agent string.
 */
function detectOS(): OSName {
  if (typeof navigator === 'undefined') return 'Unknown OS';

  const ua = navigator.userAgent;
  const platform = navigator.platform || '';

  // iOS detection
  if (/iPad|iPhone|iPod/.test(ua) || (platform === 'MacIntel' && navigator.maxTouchPoints > 1)) {
    return 'iOS';
  }

  // Android detection
  if (ua.includes('Android')) {
    return 'Android';
  }

  // macOS detection
  if (platform.includes('Mac') || ua.includes('Macintosh')) {
    return 'macOS';
  }

  // Windows detection
  if (platform.includes('Win') || ua.includes('Windows')) {
    return 'Windows';
  }

  // Linux detection
  if (platform.includes('Linux') || ua.includes('Linux')) {
    return 'Linux';
  }

  return 'Unknown OS';
}

/**
 * Detects the device type (desktop, mobile, or tablet).
 */
function detectDeviceType(): 'desktop' | 'mobile' | 'tablet' {
  if (typeof navigator === 'undefined') return 'desktop';

  const ua = navigator.userAgent;

  // Check for tablets first
  if (/iPad|Android(?!.*Mobile)|Tablet/i.test(ua)) {
    return 'tablet';
  }

  // Check for mobile devices
  if (/iPhone|iPod|Android.*Mobile|webOS|BlackBerry|IEMobile|Opera Mini/i.test(ua)) {
    return 'mobile';
  }

  return 'desktop';
}

/**
 * Gets device information.
 */
export function getDeviceInfo(): DeviceInfo {
  return {
    browser: detectBrowser(),
    os: detectOS(),
    deviceType: detectDeviceType(),
  };
}

/**
 * Generates a human-readable device name based on detected information.
 *
 * @returns A name like "Chrome on Windows" or "Safari on iOS"
 */
export function generateDeviceName(): string {
  const info = getDeviceInfo();
  return `${info.browser} on ${info.os}`;
}

/**
 * Generates a unique device ID.
 *
 * Uses crypto.randomUUID() if available, otherwise falls back to
 * a random hex string.
 *
 * @returns A unique device ID string
 */
export function generateDeviceId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  // Fallback for environments without randomUUID
  const bytes = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }

  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Gets or creates a persistent device ID for this browser.
 *
 * The device ID is stored in localStorage and reused across sessions.
 * This ensures the same device is recognized across page reloads.
 *
 * @returns The persistent device ID
 */
export function getOrCreateDeviceId(): string {
  const STORAGE_KEY = 'adieuu-device-id';

  if (typeof localStorage === 'undefined') {
    return generateDeviceId();
  }

  let deviceId = localStorage.getItem(STORAGE_KEY);
  if (!deviceId) {
    deviceId = generateDeviceId();
    localStorage.setItem(STORAGE_KEY, deviceId);
  }

  return deviceId;
}
