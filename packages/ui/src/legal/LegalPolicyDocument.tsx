import { useCallback, useEffect, useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { SectionNav, type NavSection } from '../components/SectionNav';
import { Icon } from '../icons/Icon';
import { enhanceLegalExternalLinks } from './LegalExternalLink';

export interface LegalPolicySection {
  id: string;
  title: string;
  content: ReactNode;
}

interface LegalPolicyDocumentProps {
  sections: LegalPolicySection[];
  highContrast?: boolean;
  onToggleHighContrast?: () => void;
}

export function LegalPolicyDocument({
  sections,
  highContrast = false,
  onToggleHighContrast,
}: LegalPolicyDocumentProps) {
  const { t } = useTranslation();
  const sectionRefs = useRef<Map<string, HTMLElement>>(new Map());

  const setSectionRef = useCallback((id: string, el: HTMLElement | null) => {
    if (el) {
      sectionRefs.current.set(id, el);
    } else {
      sectionRefs.current.delete(id);
    }
  }, []);

  const navSections: NavSection[] = sections.map(({ id, title }) => ({
    id,
    label: title,
  }));

  useEffect(() => {
    const hash = window.location.hash.replace(/^#/, '');
    if (!hash || !sections.some((section) => section.id === hash)) {
      return;
    }

    const el = sectionRefs.current.get(hash);
    if (!el) return;

    requestAnimationFrame(() => {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }, [sections]);

  return (
    <div className={`legal-policy-layout${highContrast ? ' legal-policy-high-contrast' : ''}`}>
      <div className="legal-policy-toc">
        <button
          type="button"
          className={`legal-policy-contrast-toggle${highContrast ? ' legal-policy-contrast-toggle--active' : ''}`}
          onClick={onToggleHighContrast}
          aria-pressed={highContrast}
        >
          <Icon name="eye" size="sm" />
          <span>{t('legal.highContrast')}</span>
        </button>
        <SectionNav
          sections={navSections}
          sectionRefs={sectionRefs}
          ariaLabel={t('legal.tableOfContents')}
          syncHash
        />
      </div>

      <div className="legal-policy-sections">
        {sections.map((section, index) => (
          <section
            key={section.id}
            id={section.id}
            ref={(el) => setSectionRef(section.id, el)}
            data-section={section.id}
            className="legal-policy-section"
          >
            {index > 0 ? <hr className="legal-policy-section-divider" /> : null}
            <h2 className="legal-policy-section-title">{section.title}</h2>
            <div className="legal-policy-section-body">
              {enhanceLegalExternalLinks(section.content)}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
