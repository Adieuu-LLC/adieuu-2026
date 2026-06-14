import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Checkbox, Dialog, Portal, Select, createListCollection } from '@ark-ui/react';
import type { AdminSubscriptionOverrideItem, SubscriptionOverrideInput } from '@adieuu/shared';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { Icon } from '../../icons/Icon';

type SubscriptionTier = 'access' | 'insider';

export interface SubscriptionOverridesModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  effective: string[];
  overrides: AdminSubscriptionOverrideItem[];
  loading?: boolean;
  onAdd: (input: SubscriptionOverrideInput) => Promise<boolean>;
  onUpdate: (index: number, input: SubscriptionOverrideInput) => Promise<boolean>;
  onRemove: (index: number) => Promise<boolean>;
}

const DEFAULT_DURATION = '12';

function overrideToFormState(override: AdminSubscriptionOverrideItem): {
  tier: SubscriptionTier;
  lifetime: boolean;
  duration: string;
} {
  if (!override.expiresAt) {
    return { tier: override.tier as SubscriptionTier, lifetime: true, duration: DEFAULT_DURATION };
  }
  const months = Math.max(
    1,
    Math.round((new Date(override.expiresAt).getTime() - Date.now()) / (30 * 24 * 60 * 60 * 1000)),
  );
  return { tier: override.tier as SubscriptionTier, lifetime: false, duration: String(months) };
}

function buildInput(tier: SubscriptionTier, lifetime: boolean, duration: string): SubscriptionOverrideInput {
  return {
    tier,
    ...(lifetime ? {} : { durationMonths: parseInt(duration, 10) || 12 }),
  };
}

interface OverrideFormFieldsProps {
  tier: SubscriptionTier;
  onTierChange: (tier: SubscriptionTier) => void;
  lifetime: boolean;
  onLifetimeChange: (lifetime: boolean) => void;
  duration: string;
  onDurationChange: (duration: string) => void;
  disabled?: boolean;
  tierCollection: ReturnType<typeof createListCollection<{ value: SubscriptionTier; label: string }>>;
}

function OverrideFormFields({
  tier,
  onTierChange,
  lifetime,
  onLifetimeChange,
  duration,
  onDurationChange,
  disabled,
  tierCollection,
}: OverrideFormFieldsProps) {
  const { t } = useTranslation();

  return (
    <div className="admin-subscription-form">
      <div className="input-wrapper">
        <label className="input-label">{t('admin.users.modals.tier')}</label>
        <Select.Root
          collection={tierCollection}
          value={[tier]}
          onValueChange={(details) => {
            const next = details.value[0] as SubscriptionTier | undefined;
            if (next) onTierChange(next);
          }}
          disabled={disabled}
          positioning={{ sameWidth: true }}
        >
          <Select.Control className="report-select-control">
            <Select.Trigger className="report-select-trigger">
              <Select.ValueText placeholder={t('admin.users.modals.tier')} />
              <Select.Indicator className="report-select-indicator">
                <Icon name="chevronDown" size="xs" />
              </Select.Indicator>
            </Select.Trigger>
          </Select.Control>
          <Portal>
            <Select.Positioner>
              <Select.Content className="report-select-content">
                {tierCollection.items.map((item) => (
                  <Select.Item key={item.value} item={item} className="report-select-item">
                    <Select.ItemText>{item.label}</Select.ItemText>
                    <Select.ItemIndicator className="report-select-item-indicator">
                      <Icon name="check" size="xs" />
                    </Select.ItemIndicator>
                  </Select.Item>
                ))}
              </Select.Content>
            </Select.Positioner>
          </Portal>
        </Select.Root>
      </div>

      <Checkbox.Root
        checked={lifetime}
        onCheckedChange={(e) => onLifetimeChange(e.checked === true)}
        disabled={disabled}
        className="admin-checkbox"
      >
        <Checkbox.Control className="admin-checkbox-control" />
        <Checkbox.Label className="admin-checkbox-label">
          {t('admin.users.modals.lifetime')}
        </Checkbox.Label>
        <Checkbox.HiddenInput />
      </Checkbox.Root>

      {!lifetime && (
        <Input
          type="number"
          min={1}
          max={120}
          label={t('admin.users.modals.durationMonths')}
          value={duration}
          onChange={(e) => onDurationChange(e.target.value)}
          disabled={disabled}
          inputSize="sm"
        />
      )}
    </div>
  );
}

export function SubscriptionOverridesModal({
  open,
  onOpenChange,
  effective,
  overrides,
  loading = false,
  onAdd,
  onUpdate,
  onRemove,
}: SubscriptionOverridesModalProps) {
  const { t } = useTranslation();

  const [addTier, setAddTier] = useState<SubscriptionTier>('access');
  const [addLifetime, setAddLifetime] = useState(false);
  const [addDuration, setAddDuration] = useState(DEFAULT_DURATION);

  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editTier, setEditTier] = useState<SubscriptionTier>('access');
  const [editLifetime, setEditLifetime] = useState(false);
  const [editDuration, setEditDuration] = useState(DEFAULT_DURATION);

  const tierCollection = useMemo(
    () =>
      createListCollection({
        items: [
          { value: 'access' as const, label: t('admin.users.modals.tierAccess') },
          { value: 'insider' as const, label: t('admin.users.modals.tierInsider') },
        ],
      }),
    [t],
  );

  const resetAddForm = useCallback(() => {
    setAddTier('access');
    setAddLifetime(false);
    setAddDuration(DEFAULT_DURATION);
  }, []);

  const resetEditForm = useCallback(() => {
    setEditingIndex(null);
    setEditTier('access');
    setEditLifetime(false);
    setEditDuration(DEFAULT_DURATION);
  }, []);

  const handleClose = useCallback(() => {
    resetAddForm();
    resetEditForm();
    onOpenChange(false);
  }, [onOpenChange, resetAddForm, resetEditForm]);

  const handleStartEdit = (index: number, override: AdminSubscriptionOverrideItem) => {
    const form = overrideToFormState(override);
    setEditingIndex(index);
    setEditTier(form.tier);
    setEditLifetime(form.lifetime);
    setEditDuration(form.duration);
  };

  const handleAdd = async () => {
    const ok = await onAdd(buildInput(addTier, addLifetime, addDuration));
    if (ok) resetAddForm();
  };

  const handleUpdate = async () => {
    if (editingIndex === null) return;
    const ok = await onUpdate(editingIndex, buildInput(editTier, editLifetime, editDuration));
    if (ok) resetEditForm();
  };

  const formatOverrideSummary = (override: AdminSubscriptionOverrideItem) => {
    if (!override.expiresAt) return t('admin.users.modals.lifetime');
    return t('admin.users.modals.expiresOn', {
      date: new Date(override.expiresAt).toLocaleDateString(),
    });
  };

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(e) => {
        if (!e.open) handleClose();
      }}
      closeOnInteractOutside={!loading}
    >
      <Portal>
        <Dialog.Backdrop className="confirm-dialog-backdrop" />
        <Dialog.Positioner className="confirm-dialog-positioner">
          <Dialog.Content className="confirm-dialog-content admin-subscription-modal">
            <div className="confirm-dialog-header">
              <Dialog.Title className="confirm-dialog-title">
                {t('admin.users.modals.subscriptionsTitle')}
              </Dialog.Title>
              <Dialog.Description className="confirm-dialog-description">
                {t('admin.users.modals.subscriptionsSubtitle')}
              </Dialog.Description>
            </div>

            <div className="confirm-dialog-body admin-subscription-modal-body">
              <div className="admin-subscription-summary">
                <span className="admin-subscription-summary-label">
                  {t('admin.users.modals.subscriptionsEffective')}
                </span>
                <div className="admin-subscription-badges">
                  {effective.length > 0 ? (
                    effective.map((tier) => (
                      <span key={tier} className="admin-badge admin-badge--success">
                        {tier}
                      </span>
                    ))
                  ) : (
                    <span className="admin-empty-inline">—</span>
                  )}
                </div>
              </div>

              <section className="admin-subscription-section" aria-labelledby="subscription-overrides-list">
                <h4 id="subscription-overrides-list" className="admin-subscription-section-title">
                  {t('admin.users.modals.subscriptionsExisting')}
                </h4>
                {overrides.length > 0 ? (
                  <ul className="admin-subscription-override-list">
                    {overrides.map((override, index) => (
                      <li
                        key={`${override.tier}-${override.expiresAt ?? 'lifetime'}-${index}`}
                        className={`admin-subscription-override-row${editingIndex === index ? ' admin-subscription-override-row--active' : ''}`}
                      >
                        <div className="admin-subscription-override-meta">
                          <span className="admin-subscription-override-tier">{override.tier}</span>
                          <span className="admin-subscription-override-expiry">
                            {formatOverrideSummary(override)}
                          </span>
                        </div>
                        <div className="admin-subscription-override-actions">
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => handleStartEdit(index, override)}
                            disabled={loading || editingIndex === index}
                          >
                            {t('common.edit')}
                          </Button>
                          <Button
                            size="sm"
                            className="btn-danger"
                            onClick={() => void onRemove(index)}
                            disabled={loading}
                          >
                            {t('common.remove')}
                          </Button>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="admin-empty-inline">{t('admin.users.modals.subscriptionsNoOverrides')}</p>
                )}
              </section>

              {editingIndex !== null && (
                <section
                  className="admin-subscription-panel admin-subscription-panel--edit"
                  aria-labelledby="subscription-edit-panel"
                >
                  <div className="admin-subscription-panel-header">
                    <h4 id="subscription-edit-panel" className="admin-subscription-panel-title">
                      {t('admin.users.modals.subscriptionsEditSection')}
                    </h4>
                    <span className="admin-subscription-panel-badge">
                      #{editingIndex + 1}
                    </span>
                  </div>
                  <OverrideFormFields
                    tier={editTier}
                    onTierChange={setEditTier}
                    lifetime={editLifetime}
                    onLifetimeChange={setEditLifetime}
                    duration={editDuration}
                    onDurationChange={setEditDuration}
                    disabled={loading}
                    tierCollection={tierCollection}
                  />
                  <div className="admin-subscription-panel-actions">
                    <Button size="sm" onClick={() => void handleUpdate()} disabled={loading}>
                      {t('admin.users.modals.subscriptionsUpdate')}
                    </Button>
                    <Button size="sm" variant="secondary" onClick={resetEditForm} disabled={loading}>
                      {t('admin.users.modals.subscriptionsCancelEdit')}
                    </Button>
                  </div>
                </section>
              )}

              {editingIndex === null && (
                <section
                  className="admin-subscription-panel admin-subscription-panel--add"
                  aria-labelledby="subscription-add-panel"
                >
                  <h4 id="subscription-add-panel" className="admin-subscription-panel-title">
                    {t('admin.users.modals.subscriptionsAddSection')}
                  </h4>
                  <p className="admin-subscription-panel-hint">
                    {t('admin.users.modals.subscriptionsAddHint')}
                  </p>
                  <OverrideFormFields
                    tier={addTier}
                    onTierChange={setAddTier}
                    lifetime={addLifetime}
                    onLifetimeChange={setAddLifetime}
                    duration={addDuration}
                    onDurationChange={setAddDuration}
                    disabled={loading}
                    tierCollection={tierCollection}
                  />
                  <div className="admin-subscription-panel-actions">
                    <Button size="sm" onClick={() => void handleAdd()} disabled={loading}>
                      {t('admin.users.modals.subscriptionsAdd')}
                    </Button>
                  </div>
                </section>
              )}
            </div>

            <div className="confirm-dialog-footer">
              <Button variant="secondary" onClick={handleClose} disabled={loading}>
                {t('common.close')}
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}
