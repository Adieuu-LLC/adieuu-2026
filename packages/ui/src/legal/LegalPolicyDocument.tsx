import { useCallback, useEffect, useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { SectionNav, type NavSection } from '../components/SectionNav';

export interface LegalPolicySection {
  id: string;
  title: string;
  content: ReactNode;
}

interface LegalPolicyDocumentProps {
  sections: LegalPolicySection[];
}

export function LegalPolicyDocument({ sections }: LegalPolicyDocumentProps) {
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
    <div className="legal-policy-layout">
      <div className="legal-policy-toc">
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
            <div className="legal-policy-section-body">{section.content}</div>
          </section>
        ))}
      </div>
    </div>
  );
}
