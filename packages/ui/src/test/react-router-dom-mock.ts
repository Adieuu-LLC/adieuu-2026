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
import type { PathMatch } from 'react-router';

// ---------------------------------------------------------------------------
// Mutable state for test inspection / configuration
// ---------------------------------------------------------------------------

/** Spy invoked when components call useNavigate()(...). Tests may `mockClear()`. */
export const mockNavigate = mock((_to: string | number, _options?: unknown) => {});

let _searchParams = new URLSearchParams();
let _pathname = '/';
let _params: Record<string, string> = {};
let _matchResult: PathMatch<string> | null = null;

/** Mutable location object for easy test manipulation. */
export const mockLocation = { pathname: '/' };

/** Replace the URLSearchParams returned by useSearchParams(). */
export function setMockSearchParams(params: URLSearchParams | string): void {
  _searchParams = typeof params === 'string' ? new URLSearchParams(params) : params;
}

/** Replace the pathname returned by useLocation(). */
export function setMockPathname(pathname: string): void {
  _pathname = pathname;
  mockLocation.pathname = pathname;
}

/** Replace the route params returned by useParams(). */
export function setMockParams(params: Record<string, string>): void {
  _params = params;
}

/** Replace the value returned by useMatch(). */
export function setMockMatch(match: PathMatch<string> | null): void {
  _matchResult = match;
}

/** Reset state between tests (call from beforeEach). */
export function resetReactRouterDomMock(): void {
  mockNavigate.mockClear();
  _searchParams = new URLSearchParams();
  _pathname = '/';
  _params = {};
  _matchResult = null;
  mockLocation.pathname = '/';
}

type LinkTo =
  | string
  | {
      pathname?: string;
      search?: string;
      hash?: string;
    };

function linkToHref(to: LinkTo): string {
  if (typeof to === 'string') return to;
  const pathname = to.pathname ?? '';
  const search = to.search ?? '';
  const hash = to.hash ?? '';
  return `${pathname}${search}${hash}`;
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
    pathname: mockLocation.pathname,
    search: '',
    hash: '',
    state: null,
    key: 'default',
  }),
  useParams: () => _params,
  useMatch: () => _matchResult,
  useNavigationType: () => 'PUSH',
  Navigate: ({ to, replace }: { to: string; replace?: boolean }) =>
    createElement('div', {
      'data-testid': 'rr-navigate',
      'data-to': String(to),
      'data-replace': replace ? 'true' : 'false',
    }),
  Outlet: () => null,
  Link: ({
    to,
    children,
    className,
    ...rest
  }: {
    to: LinkTo;
    children?: ReactNode;
    className?: string;
  }) => createElement('a', { href: linkToHref(to), className, ...rest }, children),
  NavLink: ({
    to,
    children,
    className,
    ...rest
  }: {
    to: LinkTo;
    children?: ReactNode;
    className?: string | ((args: { isActive: boolean; isPending: boolean }) => string);
  }) => {
    const href = linkToHref(to);
    const isActive = _pathname === href;
    const resolvedClassName =
      typeof className === 'function'
        ? className({ isActive, isPending: false })
        : className;
    return createElement('a', { href, className: resolvedClassName, ...rest }, children);
  },
}));
