import { protocol } from 'electron';

export function getCustomScheme(isPackaged: boolean): string {
  return isPackaged ? 'adieuu' : 'adieuu-dev';
}

export function registerPrivilegedCustomScheme(customScheme: string): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: customScheme,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true,
        stream: true,
      },
    },
  ]);
}
