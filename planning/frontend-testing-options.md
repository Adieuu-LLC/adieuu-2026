# Frontend Testing — Current State and Options

This note captures where FE-related tests live today and options for expanding them (component tests, E2E, CI). **No implementation is prescribed here**—use this when we pick an approach.

---

## Current inventory (snapshot)

### Where UI code lives

| Location | Role |
|----------|------|
| `packages/ui` | Shared React app: components, hooks, pages, services. |
| `apps/web` | Vite shell; composes `@adieuu/ui`. |
| `apps/desktop` | Electron shell; same UI package. |

### Runners and tooling

| Package | Test command | Stack |
|---------|----------------|------|
| `packages/ui` | `pnpm --filter @adieuu/ui test` | **Bun** (`bun test`), preload `src/test.setup.ts` with **fake-indexeddb**. Assertions: `bun:test`. |
| `apps/web` | *(none)* | No `test` script in `package.json`. |
| `apps/desktop` | *(none)* | No `test` script. |
| `apps/api` | `bun test` | Bun (API routes/controllers—not FE). |
| `apps/chat` | `vitest run` | **Vitest** (chat service; not React UI). |

There is **no** `@testing-library/react`, **no** Jest, **no** Vitest in `packages/ui`, and **no** Playwright/Cypress in the repo today.

### What we already test well in `packages/ui`

- **Services**: crypto/message/reaction/key storage, etc. (`*.test.ts`).
- **Pure helpers / rules**: e.g. composer text limits, DM notification rules, reaction grouping.
- **Hooks** that can be exercised without a full tree (or with light setup).
- **IndexedDB-heavy paths** are partially covered; a subset is also run via **`pnpm test:fs`** (forward-secrecy regression).

**Gap:** little or no **React component** testing (mounting trees, user events, a11y). Emoji/composer behavior is partly covered via **extracted pure helpers** next to `MessageComposer`.

### CI vs local

- Root **`pnpm test`** runs **`turbo run test`** (packages that define `test` are included **locally**).
- **GitHub Actions** today runs **`bun test` inside `apps/api`**, plus **targeted** suites (`test:security`, `test:fs`). There is **no dedicated job** that runs the **full** `packages/ui` test suite—so most UI tests may not run on every PR unless we add a step or fold them into an existing job.

---

## Options to expand FE tests

### Option A — Stay on Bun + add component testing

- Add **`@testing-library/react`** (and optionally **`@testing-library/user-event`**).
- Add a DOM implementation: **`happy-dom`** or **`jsdom`** (Bun can run these for React tests).
- Keep **`bun:test`**; extend **`test.setup.ts`** as needed (e.g. cleanup after each test).
- **Pros:** One runner in `packages/ui`, minimal stack change, matches current patterns.  
- **Cons:** Team must agree on **how to wrap** providers (`Router`, `i18n`, `PlatformProvider`, etc.) in test helpers.

### Option B — Introduce Vitest in `packages/ui`

- Aligns with **`apps/chat`** and common Vite-era tooling; strong DX for React.
- **Pros:** Familiar ecosystem, good watch mode and plugins.  
- **Cons:** **Two** test runners in the monorepo (Bun + Vitest) unless other packages migrate later.

### Option C — E2E (e.g. Playwright)

- Target **`apps/web`** first; desktop later if needed (heavier setup).
- **Pros:** Catches routing, real layout, notifications, WS in ways unit tests do not.  
- **Cons:** Slower, more CI cost and flake management; complements—not replaces—unit/component tests.

### Option D — CI: run the full `@adieuu/ui` suite

- Add a pipeline step such as **`pnpm --filter @adieuu/ui test`** after building UI dependencies.
- Optionally split **fast** unit tests vs **slow** E2E into separate jobs later.

### Layering strategy (recommended shape)

| Layer | Purpose |
|-------|--------|
| **Unit / pure** | Services, crypto, helpers, hook logic with minimal mocks (current strength). |
| **Component / integration** | RTL + DOM env; a few critical flows (login shell, composer, conversation list). |
| **E2E** | Smoke + critical paths only; keep the suite small and stable. |

**Practical default when we implement:** Option **A** + Option **D**, then add **C** selectively once component tests exist.

---

## Follow-ups when we implement

- [ ] Choose A vs B for component tests (and document provider wrappers).
- [ ] Add CI job (or extend an existing job) for full `packages/ui` tests.
- [ ] Decide whether to add Playwright and where it runs (PR vs nightly).
- [ ] Optionally align `apps/web` with a `test` script that delegates to `packages/ui` or runs E2E only.

---

*Last updated: planning pass (no code changes in this step).*
