/**
 * Opens a Stripe-hosted URL. Desktop uses `openExternal` (system browser);
 * web uses same-tab navigation to preserve existing behaviour.
 */
export async function openCheckoutOrPortalUrl(
  url: string,
  openExternal?: (u: string) => Promise<void>,
): Promise<void> {
  if (openExternal) {
    await openExternal(url);
  } else {
    window.location.href = url;
  }
}
