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

      const ALLOWED_NAVIGATION_HOSTS: readonly string[] = options.isDev
        ? ['localhost', '127.0.0.1']
        : [
            'localhost',
            '127.0.0.1',
            'adieuu.com',
            'api.adieuu.com',
            'media.adieuu.com',
            'downloads.adieuu.com',
          ];

      const allowed = ALLOWED_NAVIGATION_HOSTS.includes(parsedUrl.hostname);

      if (!allowed) {
        event.preventDefault();
      }
    });
  });
}
