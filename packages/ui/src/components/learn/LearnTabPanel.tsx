import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Accordion, Select, Portal, createListCollection } from '@ark-ui/react';
import { useTranslation } from 'react-i18next';
import { Icon } from '../../icons/Icon';
import { LearnJurisdictionCatalog } from './LearnJurisdictionCatalog';
import type { ExpandedByCategory, LearnCategory, LearnTabId } from './types';

export interface LearnTabPanelProps {
  tabId: LearnTabId;
  categories: Record<string, LearnCategory>;
  expandedByCategory: ExpandedByCategory;
  highlightedSectionId?: string | null;
  onExpandedChange: (categoryId: string, value: string[]) => void;
  onCopyPermalink: (hash: string) => void;
}

export function LearnTabPanel({
  tabId,
  categories,
  expandedByCategory,
  highlightedSectionId = null,
  onExpandedChange,
  onCopyPermalink,
}: LearnTabPanelProps) {
  const { t } = useTranslation();

  const categoryEntries = useMemo(() => Object.entries(categories), [categories]);

  const collection = useMemo(
    () =>
      createListCollection({
        items: categoryEntries.map(([id, cat]) => ({ value: id, label: cat.label })),
      }),
    [categoryEntries],
  );

  const headingRefs = useRef<Map<string, HTMLHeadingElement>>(new Map());
  const [activeCategory, setActiveCategory] = useState(
    () => categoryEntries[0]?.[0] ?? '',
  );

  const scrollToCategory = useCallback((id: string) => {
    const el = headingRefs.current.get(id);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    history.replaceState(null, '', `${window.location.pathname}${window.location.search}#${id}`);
  }, []);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const id = entry.target.getAttribute('data-category');
            if (id) setActiveCategory(id);
          }
        }
      },
      { rootMargin: '-10% 0px -70% 0px', threshold: 0 },
    );

    for (const el of headingRefs.current.values()) {
      observer.observe(el);
    }

    return () => observer.disconnect();
  }, [categoryEntries, tabId]);

  const setHeadingRef = useCallback((id: string, el: HTMLHeadingElement | null) => {
    if (el) {
      headingRefs.current.set(id, el);
    } else {
      headingRefs.current.delete(id);
    }
  }, []);

  const handleSelectChange = useCallback(
    (details: { value: string[] }) => {
      const next = details.value[0];
      if (next) scrollToCategory(next);
    },
    [scrollToCategory],
  );

  if (categoryEntries.length === 0) return null;

  const activeLabel =
    categoryEntries.find(([id]) => id === activeCategory)?.[1].label ?? '';

  return (
    <div className="learn-layout">
      <nav className="learn-category-nav" aria-label={t('home.learn.title')}>
        <ul className="learn-category-list">
          {categoryEntries.map(([catId, cat]) => (
            <li key={catId}>
              <button
                type="button"
                className={`learn-category-btn${activeCategory === catId ? ' learn-category-btn--active' : ''}`}
                onClick={() => scrollToCategory(catId)}
              >
                {cat.label}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <div className="learn-category-select-wrapper">
        <Select.Root
          collection={collection}
          value={[activeCategory]}
          onValueChange={handleSelectChange}
          positioning={{ sameWidth: true }}
        >
          <Select.Control className="learn-category-select-control">
            <Select.Trigger className="learn-category-select-trigger">
              <Select.ValueText>{activeLabel}</Select.ValueText>
              <Select.Indicator className="learn-category-select-indicator">
                <Icon name="chevronDown" size="xs" />
              </Select.Indicator>
            </Select.Trigger>
          </Select.Control>

          <Portal>
            <Select.Positioner>
              <Select.Content className="learn-category-select-content">
                {collection.items.map((item) => (
                  <Select.Item
                    key={item.value}
                    item={item}
                    className="learn-category-select-item"
                  >
                    <Select.ItemText>{item.label}</Select.ItemText>
                    <Select.ItemIndicator className="learn-category-select-check">
                      <Icon name="check" size="xs" />
                    </Select.ItemIndicator>
                  </Select.Item>
                ))}
              </Select.Content>
            </Select.Positioner>
          </Portal>
        </Select.Root>
      </div>

      <div className="learn-content">
        {categoryEntries.map(([catId, cat]) => (
          <section key={catId} className="learn-category-group">
            <h3
              id={catId}
              className="learn-category-heading"
              ref={(el) => setHeadingRef(catId, el)}
              data-category={catId}
            >
              {cat.label}
              <button
                type="button"
                className="learn-permalink-btn"
                aria-label={t('home.learn.copyLink')}
                onClick={() => void onCopyPermalink(catId)}
              >
                <Icon name="link" size="xs" />
              </button>
            </h3>

            <Accordion.Root
              multiple
              collapsible
              value={expandedByCategory[catId] ?? []}
              onValueChange={(details) => onExpandedChange(catId, details.value)}
            >
              {Object.entries(cat.sections).map(([sectionId, section]) => {
                const sectionElementId = `${catId}-${sectionId}`;
                const isHighlighted = highlightedSectionId === sectionElementId;

                return (
                <Accordion.Item
                  key={sectionId}
                  value={sectionId}
                  id={sectionElementId}
                  className={`learn-content-item${isHighlighted ? ' learn-content-item--highlight' : ''}`}
                >
                  <Accordion.ItemTrigger className="learn-content-trigger">
                    <span className="learn-content-trigger-label">
                      {section.title}
                    </span>
                    <Accordion.ItemIndicator className="learn-content-indicator">
                      <Icon name="chevronDown" />
                    </Accordion.ItemIndicator>
                  </Accordion.ItemTrigger>
                  <Accordion.ItemContent className="learn-content-body">
                    <p>{section.content}</p>
                    {section.variant === 'jurisdictionCatalog' && (
                      <LearnJurisdictionCatalog />
                    )}
                    <button
                      type="button"
                      className="learn-permalink-btn learn-permalink-btn--section"
                      onClick={() => void onCopyPermalink(`${catId}-${sectionId}`)}
                    >
                      <Icon name="link" size="xs" />
                      {t('home.learn.permalinkLabel')}
                    </button>
                  </Accordion.ItemContent>
                </Accordion.Item>
                );
              })}
            </Accordion.Root>
          </section>
        ))}
      </div>
    </div>
  );
}
