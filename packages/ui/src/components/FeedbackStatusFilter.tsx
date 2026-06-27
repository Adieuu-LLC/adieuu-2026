import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Checkbox, Popover, Portal } from '@ark-ui/react';
import {
  FEEDBACK_STATUSES,
  getFeedbackListDefaultStatuses,
  type FeedbackStatus,
} from '@adieuu/shared';
import { Button } from './Button';
import { Icon } from '../icons/Icon';

interface FeedbackStatusFilterProps {
  value: FeedbackStatus[];
  onChange: (statuses: FeedbackStatus[]) => void;
}

function arraysEqual(a: FeedbackStatus[], b: FeedbackStatus[]): boolean {
  if (a.length !== b.length) return false;
  const setA = new Set(a);
  return b.every((item) => setA.has(item));
}

export function FeedbackStatusFilter({ value, onChange }: FeedbackStatusFilterProps) {
  const { t } = useTranslation();

  const label = useMemo(() => {
    let valueLabel: string;
    if (value.length === 0) {
      valueLabel = t('feedback.filterStatusNone');
    } else if (value.length === FEEDBACK_STATUSES.length) {
      valueLabel = t('feedback.filterStatusAll');
    } else if (arraysEqual(value, getFeedbackListDefaultStatuses())) {
      valueLabel = t('feedback.filterStatusDefault');
    } else if (value.length === 1) {
      valueLabel = t(`feedback.statuses.${value[0]}`);
    } else {
      valueLabel = t('feedback.filterStatusCount', { count: value.length });
    }
    return t('feedback.filterStatusWithValue', { value: valueLabel });
  }, [t, value]);

  const toggleStatus = (status: FeedbackStatus, checked: boolean) => {
    onChange(
      checked ? [...value, status] : value.filter((entry) => entry !== status),
    );
  };

  return (
    <Popover.Root positioning={{ placement: 'bottom-start', sameWidth: true }}>
      <div className="report-select-control feedback-status-filter-root">
        <Popover.Trigger className="report-select-trigger feedback-filter-trigger feedback-status-filter-trigger">
        <span className="feedback-status-filter-label">{label}</span>
        <Icon name="chevronDown" size="xs" />
      </Popover.Trigger>
      </div>
      <Portal>
        <Popover.Positioner>
          <Popover.Content className="feedback-status-filter-popover">
            <div className="feedback-status-filter-options">
              {FEEDBACK_STATUSES.map((status) => (
                <Checkbox.Root
                  key={status}
                  checked={value.includes(status)}
                  onCheckedChange={(details) => toggleStatus(status, details.checked === true)}
                  className="feedback-status-filter-option"
                >
                  <Checkbox.Control className="fs-checkbox-control" />
                  <Checkbox.Label className="fs-checkbox-label">
                    <span className="fs-checkbox-title">{t(`feedback.statuses.${status}`)}</span>
                  </Checkbox.Label>
                  <Checkbox.HiddenInput />
                </Checkbox.Root>
              ))}
            </div>
            <div className="feedback-status-filter-actions">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onChange([...FEEDBACK_STATUSES])}
              >
                {t('feedback.filterStatusSelectAll')}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onChange(getFeedbackListDefaultStatuses())}
              >
                {t('feedback.filterStatusReset')}
              </Button>
            </div>
          </Popover.Content>
        </Popover.Positioner>
      </Portal>
    </Popover.Root>
  );
}
