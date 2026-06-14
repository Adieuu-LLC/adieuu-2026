import { useMemo } from 'react';
import { Accordion } from '@ark-ui/react';
import { useTranslation } from 'react-i18next';
import {
  mergeEffectiveAvJurisdictions,
  type EffectiveAvJurisdiction,
  type PublicJurisdictionRequirement,
} from '@adieuu/shared';
import { Icon } from '../../icons/Icon';
import { Spinner } from '../../components/Spinner';

export interface EffectiveAvJurisdictionsPanelProps {
  requiredMode: string;
  adminOverrides: string[];
  catalogRows: PublicJurisdictionRequirement[];
  enrichedOverrideRows: PublicJurisdictionRequirement[];
  loading?: boolean;
  error?: boolean;
}

function groupByRegion(rows: EffectiveAvJurisdiction[]): Map<string, EffectiveAvJurisdiction[]> {
  const groups = new Map<string, EffectiveAvJurisdiction[]>();
  for (const row of rows) {
    const existing = groups.get(row.region);
    if (existing) {
      existing.push(row);
    } else {
      groups.set(row.region, [row]);
    }
  }
  return groups;
}

export function EffectiveAvJurisdictionsPanel({
  requiredMode,
  adminOverrides,
  catalogRows,
  enrichedOverrideRows,
  loading = false,
  error = false,
}: EffectiveAvJurisdictionsPanelProps) {
  const { t } = useTranslation();

  const effectiveRows = useMemo(
    () => mergeEffectiveAvJurisdictions(catalogRows, adminOverrides, enrichedOverrideRows),
    [adminOverrides, catalogRows, enrichedOverrideRows],
  );

  const groupedRows = useMemo(() => groupByRegion(effectiveRows), [effectiveRows]);
  const isAllMode = requiredMode === 'all';

  const headerLabel = isAllMode
    ? t('compliance.admin.effectiveJurisdictionsAllModeTitle')
    : t('compliance.admin.effectiveJurisdictionsTitle', { count: effectiveRows.length });

  return (
    <Accordion.Root collapsible defaultValue={[]} className="admin-av-jurisdictions-accordion">
      <Accordion.Item value="effective-jurisdictions" className="admin-av-jurisdictions-accordion__item">
        <Accordion.ItemTrigger className="admin-av-jurisdictions-accordion__trigger" type="button">
          <span>{headerLabel}</span>
          <Accordion.ItemIndicator className="admin-av-jurisdictions-accordion__indicator">
            <Icon name="chevronDown" />
          </Accordion.ItemIndicator>
        </Accordion.ItemTrigger>
        <Accordion.ItemContent className="admin-av-jurisdictions-accordion__content">
          {loading ? (
            <div className="admin-av-jurisdictions-accordion__loading">
              <Spinner size="sm" />
            </div>
          ) : error ? (
            <p className="admin-hint admin-av-jurisdictions-accordion__error">
              {t('compliance.admin.effectiveJurisdictionsLoadError')}
            </p>
          ) : isAllMode ? (
            <p className="admin-hint">{t('compliance.admin.effectiveJurisdictionsAllModeDescription')}</p>
          ) : effectiveRows.length === 0 ? (
            <p className="admin-hint">{t('compliance.admin.effectiveJurisdictionsEmpty')}</p>
          ) : (
            <div className="admin-av-jurisdictions-list">
              {[...groupedRows.entries()].map(([region, regionRows]) => (
                <section key={region} className="admin-av-jurisdictions-list__region">
                  <h4 className="admin-av-jurisdictions-list__region-title">{region}</h4>
                  <ul className="admin-av-jurisdictions-list__items">
                    {regionRows.map((row) => (
                      <li key={row.jurisdiction} className="admin-av-jurisdictions-list__item">
                        <span className="admin-av-jurisdictions-list__name">{row.jurisdictionName}</span>
                        <span className="admin-mono admin-av-jurisdictions-list__code">{row.jurisdiction}</span>
                        {row.source === 'admin' && (
                          <span className="admin-av-jurisdictions-list__badge">
                            {t('compliance.admin.effectiveJurisdictionsSourceAdmin')}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </Accordion.ItemContent>
      </Accordion.Item>
    </Accordion.Root>
  );
}
