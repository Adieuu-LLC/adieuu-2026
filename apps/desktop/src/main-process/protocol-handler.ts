import path from 'path';
import { pathToFileURL } from 'url';
import { net, protocol } from 'electron';

export function registerProtocolHandler(
  customScheme: string,
  rendererDir: string,
): void {
  protocol.handle(customScheme, (request) => {
    const url = new URL(request.url);
    let filePath = decodeURIComponent(url.pathname);
    if (filePath === '/' || filePath === '') {
      filePath = '/index.html';
    }

    const resolved = path.resolve(path.join(rendererDir, filePath));

    if (!resolved.startsWith(rendererDir)) {
      return new Response('Forbidden', { status: 403 });
    }

    return net.fetch(pathToFileURL(resolved).href);
  });
}
