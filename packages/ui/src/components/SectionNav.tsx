import { useCallback, useEffect, useMemo, useState } from 'react';
import { Select, Portal, createListCollection } from '@ark-ui/react';
import { Icon } from '../icons/Icon';

export interface NavSection {
  id: string;
  label: string;
}

interface SectionNavProps {
  sections: NavSection[];
  sectionRefs: React.RefObject<Map<string, HTMLElement>>;
  ariaLabel: string;
  /** When true, updates the URL hash when navigating to a section */
  syncHash?: boolean;
}

export function SectionNav({ sections, sectionRefs, ariaLabel, syncHash = false }: SectionNavProps) {
  const [activeSection, setActiveSection] = useState(
    () => sections[0]?.id ?? '',
  );

  const collection = useMemo(
    () =>
      createListCollection({
        items: sections.map((s) => ({ value: s.id, label: s.label })),
      }),
    [sections],
  );

  useEffect(() => {
    const refs = sectionRefs.current;
    if (!refs) return;

    const observer = new IntersectionObserver(
      (entries) => {
        let topmost: IntersectionObserverEntry | null = null;
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          if (!topmost || entry.boundingClientRect.top < topmost.boundingClientRect.top) {
            topmost = entry;
          }
        }
        if (topmost) {
          const id = topmost.target.getAttribute('data-section');
          if (id) setActiveSection(id);
        }
      },
      { rootMargin: '-10% 0px -70% 0px', threshold: 0 },
    );

    for (const el of refs.values()) {
      observer.observe(el);
    }

    return () => observer.disconnect();
  }, [sections, sectionRefs]);

  const scrollToSection = useCallback((id: string) => {
    const el = sectionRefs.current?.get(id);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (syncHash) {
      history.replaceState(null, '', `#${id}`);
    }
  }, [sectionRefs, syncHash]);

  const handleSelectChange = useCallback(
    (details: { value: string[] }) => {
      const next = details.value[0];
      if (next) scrollToSection(next);
    },
    [scrollToSection],
  );

  const activeLabel = sections.find((s) => s.id === activeSection)?.label ?? '';

  return (
    <>
      <nav className="appearance-section-nav" aria-label={ariaLabel}>
        <ul className="appearance-section-list">
          {sections.map((section) => (
            <li key={section.id}>
              <button
                type="button"
                className={`appearance-section-btn${activeSection === section.id ? ' appearance-section-btn--active' : ''}`}
                onClick={() => scrollToSection(section.id)}
              >
                {section.label}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <div className="appearance-section-select-wrapper">
        <Select.Root
          collection={collection}
          value={[activeSection]}
          onValueChange={handleSelectChange}
          positioning={{ sameWidth: true }}
        >
          <Select.Control className="appearance-section-select-control">
            <Select.Trigger className="appearance-section-select-trigger">
              <Select.ValueText>{activeLabel}</Select.ValueText>
              <Select.Indicator className="appearance-section-select-indicator">
                <Icon name="chevronDown" size="xs" />
              </Select.Indicator>
            </Select.Trigger>
          </Select.Control>

          <Portal>
            <Select.Positioner>
              <Select.Content className="appearance-section-select-content">
                {collection.items.map((item) => (
                  <Select.Item
                    key={item.value}
                    item={item}
                    className="appearance-section-select-item"
                  >
                    <Select.ItemText>{item.label}</Select.ItemText>
                    <Select.ItemIndicator className="appearance-section-select-check">
                      <Icon name="check" size="xs" />
                    </Select.ItemIndicator>
                  </Select.Item>
                ))}
              </Select.Content>
            </Select.Positioner>
          </Portal>
        </Select.Root>
      </div>
    </>
  );
}
