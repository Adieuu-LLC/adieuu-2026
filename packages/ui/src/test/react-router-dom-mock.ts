/**
 * Comprehensive react-router-dom mock shared by all UI test files.
 *
 * Bun runs every test file in a single process, so multiple calls to
 * mock.module('react-router-dom', ...) with different shapes cause
 * stale-cache conflicts (e.g. one test mocks { useNavigate }, another mocks
 * { useSearchParams }, and whichever loaded second leaves the other test
 * looking at a mock that no longer has the export it imports).
 *
 * react-router-dom v7's CJS dist/index.js only statically annotates
 * HydratedRouter / RouterProvider; the rest are added at runtime via
 * __reExport(require('react-router')), which Bun's CJS-to-ESM static export
 * detection does not pick up — so any import of useNavigate / useSearchParams
 * MUST go through this mock when tests run together.
 *
 * This module is the single source of truth: it calls mock.module exactly
 * once with every export any test file might need. Test files import the
 * individual mock objects to customise or inspect them.
 */
import { mock } from 'bun:test';
import { createElement, type ReactNode } from 'react';

// ---------------------------------------------------------------------------
// Mutable state for test inspection / configuration
// ---------------------------------------------------------------------------

/** Spy invoked when components call useNavigate()(...). Tests may `mockClear()`. */
export const mockNavigate = mock((_to: string | number, _options?: unknown) => {});

let _searchParams = new URLSearchParams();
let _pathname = '/';

/** Replace the URLSearchParams returned by useSearchParams(). */
export function setMockSearchParams(params: URLSearchParams | string): void {
  _searchParams = typeof params === 'string' ? new URLSearchParams(params) : params;
}

/** Replace the pathname returned by useLocation(). */
export function setMockPathname(pathname: string): void {
  _pathname = pathname;
}

/** Reset state between tests (call from beforeEach). */
export function resetReactRouterDomMock(): void {
  mockNavigate.mockClear();
  _searchParams = new URLSearchParams();
  _pathname = '/';
}

// ---------------------------------------------------------------------------
// Register the mock — called exactly once when this module is first imported
// ---------------------------------------------------------------------------

mock.module('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  useSearchParams: (): [URLSearchParams, (next: URLSearchParams) => void] => [
    _searchParams,
    (next) => {
      _searchParams = next;
    },
  ],
  useLocation: () => ({
    pathname: _pathname,
    search: '',
    hash: '',
    state: null,
    key: 'default',
  }),
  Link: ({
    to,
    children,
    className,
    ...rest
  }: {
    to: string;
    children?: ReactNode;
    className?: string;
  }) => createElement('a', { href: to, className, ...rest }, children),
}));
