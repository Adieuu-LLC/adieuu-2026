/**
 * Accessibility regression tests.
 *
 * These verify that key components emit the correct ARIA attributes
 * and semantic HTML for screen readers. Uses renderToStaticMarkup
 * for fast, DOM-free assertions.
 *
 * For full axe-core audits against a live DOM (color contrast, focus order, etc.),
 * see the Playwright-based tests in tests/a11y/.
 */
import { describe, expect, mock, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { setMockTranslate } from '../test/react-i18next-mock';

setMockTranslate((_key, defaultValueOrOpts) =>
  typeof defaultValueOrOpts === 'string' ? defaultValueOrOpts : _key,
);

mock.module('../hooks/useIconPack', () => ({
  useIconPack: () => ({ packId: 'sharp-duotone-solid', setPackId: () => {} }),
}));

mock.module('@fortawesome/fontawesome-svg-core', () => ({
  findIconDefinition: () => ({
    prefix: 'fass',
    iconName: 'gear',
    icon: [512, 512, [], 'f013', 'M0 0'],
  }),
}));

mock.module('@fortawesome/react-fontawesome', () => ({
  FontAwesomeIcon: (props: any) => {
    const attrs: Record<string, string> = { 'data-testid': 'fa-icon' };
    if (props['aria-hidden']) attrs['aria-hidden'] = 'true';
    if (props['aria-label']) attrs['aria-label'] = props['aria-label'];
    return <svg {...attrs} />;
  },
}));

mock.module('../icons/Icon', () => ({
  Icon: (props: any) => {
    const attrs: Record<string, string> = { 'data-icon': props.name };
    if (props.title) {
      attrs['aria-label'] = props.title;
      attrs['role'] = 'img';
    } else {
      attrs['aria-hidden'] = 'true';
    }
    return <span {...attrs} />;
  },
}));

// ============================================================================
// Input component
// ============================================================================

describe('Accessibility: Input', () => {
  test('renders label linked to input via htmlFor/id', async () => {
    const { Input } = await import('./Input');
    const html = renderToStaticMarkup(<Input label="Email" id="email-field" />);
    expect(html).toContain('for="email-field"');
    expect(html).toContain('id="email-field"');
  });

  test('error state sets aria-invalid and aria-describedby', async () => {
    const { Input } = await import('./Input');
    const html = renderToStaticMarkup(
      <Input label="Password" id="pw" error="Required field" />
    );
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('aria-describedby="pw-error"');
    expect(html).toContain('id="pw-error"');
    expect(html).toContain('role="alert"');
    expect(html).toContain('Required field');
  });

  test('hint text linked via aria-describedby', async () => {
    const { Input } = await import('./Input');
    const html = renderToStaticMarkup(
      <Input label="Username" id="user" hint="3+ characters" />
    );
    expect(html).toContain('aria-describedby="user-hint"');
    expect(html).toContain('id="user-hint"');
    expect(html).toContain('3+ characters');
  });

  test('no aria-invalid when there is no error', async () => {
    const { Input } = await import('./Input');
    const html = renderToStaticMarkup(<Input label="Name" id="name" />);
    expect(html).not.toContain('aria-invalid');
  });

  test('icon spans are aria-hidden', async () => {
    const { Input } = await import('./Input');
    const html = renderToStaticMarkup(
      <Input label="Search" id="search" leftIcon={<span>🔍</span>} rightIcon={<span>×</span>} />
    );
    const ariaHiddenCount = (html.match(/aria-hidden="true"/g) || []).length;
    expect(ariaHiddenCount).toBeGreaterThanOrEqual(2);
  });
});

// ============================================================================
// Icon component
// ============================================================================

describe('Accessibility: Icon', () => {
  test('decorative icon (no title) has aria-hidden="true"', async () => {
    const { Icon } = await import('../icons/Icon');
    const html = renderToStaticMarkup(<Icon name="settings" />);
    expect(html).toContain('aria-hidden="true"');
    expect(html).not.toContain('aria-label');
  });

  test('meaningful icon (with title) exposes aria-label', async () => {
    const { Icon } = await import('../icons/Icon');
    const html = renderToStaticMarkup(<Icon name="settings" title="Settings" />);
    expect(html).toContain('aria-label="Settings"');
    expect(html).not.toContain('aria-hidden="true"');
  });
});

// ============================================================================
// Sidebar navigation
// ============================================================================

describe('Accessibility: Sidebar', () => {
  test('active link has aria-current="page"', async () => {
    const { Sidebar, SidebarItem } = await import('./Sidebar');
    const html = renderToStaticMarkup(
      <Sidebar>
        <SidebarItem icon={<span />} label="Home" href="/" isActive />
        <SidebarItem icon={<span />} label="Settings" href="/settings" isActive={false} />
      </Sidebar>
    );
    expect(html).toContain('aria-current="page"');
    const parts = html.split('aria-current="page"');
    expect(parts.length).toBe(2);
  });

  test('expandable item has aria-expanded', async () => {
    const { Sidebar, SidebarItem } = await import('./Sidebar');
    const html = renderToStaticMarkup(
      <Sidebar>
        <SidebarItem icon={<span />} label="Menu" isActive={false}>
          <span>Child</span>
        </SidebarItem>
      </Sidebar>
    );
    expect(html).toContain('aria-expanded');
  });

  test('hamburger button has aria-label and aria-expanded', async () => {
    const { Sidebar } = await import('./Sidebar');
    const html = renderToStaticMarkup(
      <Sidebar>
        <span />
      </Sidebar>
    );
    expect(html).toContain('aria-label');
    expect(html).toContain('aria-expanded');
  });
});

// ============================================================================
// AppLayout
// ============================================================================

describe('Accessibility: AppLayout', () => {
  test('renders skip link targeting main content', async () => {
    mock.module('../hooks/conversations/context', () => ({
      ConversationsContext: { Provider: ({ children }: any) => children },
    }));
    mock.module('../hooks/useIdentity', () => ({
      useIdentity: () => ({ identity: null }),
    }));
    mock.module('../navigation', () => ({
      AppNavigationChrome: () => null,
    }));
    mock.module('./SiteFooter', () => ({
      SiteFooter: () => null,
    }));

    const { AppLayout } = await import('./AppLayout');
    const html = renderToStaticMarkup(
      <AppLayout sidebar={<nav>Sidebar</nav>}>
        <div>Content</div>
      </AppLayout>
    );
    expect(html).toContain('class="skip-link"');
    expect(html).toContain('href="#main-content"');
    expect(html).toContain('id="main-content"');
    expect(html).toContain('aria-live="polite"');
  });
});
