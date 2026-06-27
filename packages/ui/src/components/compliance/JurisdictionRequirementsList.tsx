import { useMemo, useState } from 'react';
import { Accordion } from '@ark-ui/react';
import { useTranslation } from 'react-i18next';
import type { PublicJurisdictionRequirement } from '@adieuu/shared';
import { Icon } from '../../icons/Icon';
import { Input } from '../Input';
import { Spinner } from '../Spinner';
import { JurisdictionRequirementCard } from './JurisdictionRequirementCard';

export interface JurisdictionRequirementsListProps {
  rows: PublicJurisdictionRequirement[];
  loading?: boolean;
  error?: boolean;
  showFilter?: boolean;
  layout?: 'accordion' | 'flat';
  emptyMessageKey?: string;
}

function groupByRegion(rows: PublicJurisdictionRequirement[]): Map<string, PublicJurisdictionRequirement[]> {
  const groups = new Map<string, PublicJurisdictionRequirement[]>();
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

function matchesFilter(row: PublicJurisdictionRequirement, query: string): boolean {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;
  return (
    row.jurisdictionName.toLowerCase().includes(normalized)
    || row.jurisdiction.toLowerCase().includes(normalized)
    || row.region.toLowerCase().includes(normalized)
  );
}

export function JurisdictionRequirementsList({
  rows,
  loading = false,
  error = false,
  showFilter = false,
  layout = 'accordion',
  emptyMessageKey = 'compliance.jurisdictionRequirement.empty',
}: JurisdictionRequirementsListProps) {
  const { t } = useTranslation();
  const [filterQuery, setFilterQuery] = useState('');

  const filteredRows = useMemo(
    () => rows.filter((row) => matchesFilter(row, filterQuery)),
    [filterQuery, rows],
  );

  const groupedRows = useMemo(() => groupByRegion(filteredRows), [filteredRows]);

  if (loading) {
    return (
      <div className="loading-container jurisdiction-requirements-list__loading">
        <Spinner size="md" />
      </div>
    );
  }

  if (error) {
    return (
      <p className="account-detail-muted jurisdiction-requirements-list__message">
        {t('compliance.jurisdictionRequirement.loadError')}
      </p>
    );
  }

  if (rows.length === 0) {
    return (
      <p className="account-detail-muted jurisdiction-requirements-list__message">
        {t(emptyMessageKey)}
      </p>
    );
  }

  return (
    <div className="jurisdiction-requirements-list">
      {showFilter && (
        <Input
          className="jurisdiction-requirements-list__filter"
          type="search"
          value={filterQuery}
          onChange={(event) => setFilterQuery(event.target.value)}
          placeholder={t('compliance.jurisdictionRequirement.filterPlaceholder')}
          aria-label={t('compliance.jurisdictionRequirement.filterLabel')}
        />
      )}

      {filteredRows.length === 0 && (
        <p className="account-detail-muted jurisdiction-requirements-list__message">
          {t('compliance.jurisdictionRequirement.noFilterResults')}
        </p>
      )}

      {[...groupedRows.entries()].map(([region, regionRows]) => (
        <section key={region} className="jurisdiction-requirements-list__region">
          <h4 className="jurisdiction-requirements-list__region-title">{region}</h4>
          {layout === 'flat' ? (
            <div className="jurisdiction-requirements-list__flat">
              {regionRows.map((row) => (
                <JurisdictionRequirementCard key={row.jurisdiction} row={row} />
              ))}
            </div>
          ) : (
            <Accordion.Root multiple collapsible className="jurisdiction-requirements-list__accordion">
              {regionRows.map((row) => (
                <Accordion.Item
                  key={row.jurisdiction}
                  value={row.jurisdiction}
                  className="jurisdiction-requirements-list__item"
                >
                  <Accordion.ItemTrigger className="jurisdiction-requirements-list__trigger">
                    <span className="jurisdiction-requirements-list__trigger-label">
                      {row.jurisdictionName}
                      <span className="account-detail-muted jurisdiction-requirements-list__trigger-code">
                        {row.jurisdiction}
                      </span>
                    </span>
                    <Accordion.ItemIndicator className="jurisdiction-requirements-list__indicator">
                      <Icon name="chevronDown" />
                    </Accordion.ItemIndicator>
                  </Accordion.ItemTrigger>
                  <Accordion.ItemContent className="jurisdiction-requirements-list__content">
                    <JurisdictionRequirementCard row={row} />
                  </Accordion.ItemContent>
                </Accordion.Item>
              ))}
            </Accordion.Root>
          )}
        </section>
      ))}
    </div>
  );
}
