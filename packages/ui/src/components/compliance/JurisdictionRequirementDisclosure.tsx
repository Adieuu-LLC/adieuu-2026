import { useMemo } from 'react';
import { Accordion } from '@ark-ui/react';
import { useTranslation } from 'react-i18next';
import type { PublicJurisdictionRequirement } from '@adieuu/shared';
import { Icon } from '../../icons/Icon';
import { Spinner } from '../Spinner';
import { JurisdictionRequirementCard } from './JurisdictionRequirementCard';

export interface JurisdictionRequirementDisclosureProps {
  rows: PublicJurisdictionRequirement[];
  loading?: boolean;
  primaryJurisdiction?: string;
}

function sortRows(
  rows: PublicJurisdictionRequirement[],
  primaryJurisdiction?: string,
): PublicJurisdictionRequirement[] {
  if (!primaryJurisdiction) return rows;
  const primary = primaryJurisdiction.trim().toUpperCase();
  return [...rows].sort((a, b) => {
    const aMatch = a.jurisdiction.toUpperCase() === primary ? 0 : 1;
    const bMatch = b.jurisdiction.toUpperCase() === primary ? 0 : 1;
    if (aMatch !== bMatch) return aMatch - bMatch;
    return a.jurisdictionName.localeCompare(b.jurisdictionName);
  });
}

export function JurisdictionRequirementDisclosure({
  rows,
  loading = false,
  primaryJurisdiction,
}: JurisdictionRequirementDisclosureProps) {
  const { t } = useTranslation();
  const sortedRows = useMemo(
    () => sortRows(rows, primaryJurisdiction),
    [primaryJurisdiction, rows],
  );

  return (
    <Accordion.Root
      collapsible
      multiple
      defaultValue={[]}
      className="jurisdiction-requirement-disclosure"
    >
      <Accordion.Item value="requirements" className="jurisdiction-requirement-disclosure__item">
        <Accordion.ItemTrigger
          type="button"
          className="jurisdiction-requirement-disclosure__trigger"
        >
          <span>{t('home.account.steps.verifyAge.disclosureTitle')}</span>
          <Accordion.ItemIndicator className="jurisdiction-requirement-disclosure__indicator">
            <Icon name="chevronDown" />
          </Accordion.ItemIndicator>
        </Accordion.ItemTrigger>
        <Accordion.ItemContent className="jurisdiction-requirement-disclosure__content">
          {loading ? (
            <div className="jurisdiction-requirement-disclosure__loading">
              <Spinner size="sm" />
            </div>
          ) : sortedRows.length === 0 ? (
            <p className="account-detail-muted jurisdiction-requirement-disclosure__empty">
              {t('compliance.jurisdictionRequirement.empty')}
            </p>
          ) : (
            <div className="jurisdiction-requirement-disclosure__cards">
              {sortedRows.map((row) => (
                <JurisdictionRequirementCard key={row.jurisdiction} row={row} compact />
              ))}
            </div>
          )}
        </Accordion.ItemContent>
      </Accordion.Item>

      <Accordion.Item value="how-verifications-work" className="jurisdiction-requirement-disclosure__item">
        <Accordion.ItemTrigger
          type="button"
          className="jurisdiction-requirement-disclosure__trigger"
        >
          <span>{t('home.account.steps.verifyAge.verificationExplainerTitle')}</span>
          <Accordion.ItemIndicator className="jurisdiction-requirement-disclosure__indicator">
            <Icon name="chevronDown" />
          </Accordion.ItemIndicator>
        </Accordion.ItemTrigger>
        <Accordion.ItemContent className="jurisdiction-requirement-disclosure__content">
          <p className="action-step-description jurisdiction-requirement-disclosure__body">
            {t('home.account.steps.verifyAge.aliasPrivacy')}
          </p>
          <p className="action-step-description jurisdiction-requirement-disclosure__body" style={{marginTop: '10px'}}>
            {t('home.account.steps.verifyAge.aliasPrivacy2')}
          </p><p className="action-step-description jurisdiction-requirement-disclosure__body" style={{marginTop: '10px'}}>
            {t('home.account.steps.verifyAge.aliasPrivacy3')}
          </p>
        </Accordion.ItemContent>
      </Accordion.Item>
    </Accordion.Root>
  );
}
