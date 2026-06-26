import type { App } from 'electron';

export function registerWillNavigateGuard(
  app: App,
  options: { isDev: boolean; customScheme: string },
): void {
  app.on('web-contents-created', (_, contents) => {
    contents.on('will-navigate', (event, navigationUrl) => {
      const parsedUrl = new URL(navigationUrl);

      if (parsedUrl.protocol === `${options.customScheme}:`) {
        return;
      }

      const envHosts = process.env.ADIEUU_ALLOWED_NAVIGATION_HOSTS;
      const ALLOWED_NAVIGATION_HOSTS: readonly string[] = options.isDev
        ? ['localhost', '127.0.0.1']
        : envHosts
          ? ['localhost', '127.0.0.1', ...envHosts.split(',').map((h) => h.trim()).filter(Boolean)]
          : [
              'localhost',
              '127.0.0.1',
              'adieuu.com',
              'api.adieuu.com',
              'media.adieuu.com',
              'downloads.adieuu.com',
            ];

      const allowed = ALLOWED_NAVIGATION_HOSTS.includes(parsedUrl.hostname);

      // Intentionally do not allow-list hosts such as checkout.stripe.com: payment
      // flows must use shell.openExternal (see app:open-external-url) so they run
      // in the system browser, not inside this window.
      if (!allowed) {
        event.preventDefault();
      }
    });
  });
}
