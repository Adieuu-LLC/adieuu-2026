import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Checkbox, Dialog, Portal, Select, createListCollection } from '@ark-ui/react';
import {
  createApiClient,
  type PublicPromoCode,
  type PublicPromoRedemption,
  type SubscriptionTierId,
  type PromoCodeAudience,
} from '@adieuu/shared';
import { useAppConfig } from '../../config';
import { Button } from '../../components/Button';
import { Icon } from '../../icons/Icon';
import {
  EMPTY_PROMO_FORM,
  codeToForm,
  formToCreateParams,
  formToUpdateParams,
  formatGrantsSummary,
  formatUsesSummary,
  formatValiditySummary,
  validatePromoForm,
  type PromoCodeFormState,
  type PromoFormValidationError,
} from './promo-code-form';

const LIST_LIMIT = 100;

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function AdminPromoCodes() {
  const { t } = useTranslation();
  const { apiBaseUrl } = useAppConfig();
  const api = useMemo(() => createApiClient({ baseUrl: apiBaseUrl }), [apiBaseUrl]);

  const [codes, setCodes] = useState<PublicPromoCode[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [form, setForm] = useState<PromoCodeFormState>(EMPTY_PROMO_FORM);
  const [editingShortcode, setEditingShortcode] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);

  const [deletingShortcode, setDeletingShortcode] = useState<string | null>(null);

  const [redemptionsOpen, setRedemptionsOpen] = useState(false);
  const [redemptionsShortcode, setRedemptionsShortcode] = useState<string | null>(null);
  const [redemptions, setRedemptions] = useState<PublicPromoRedemption[]>([]);
  const [redemptionsTotal, setRedemptionsTotal] = useState(0);
  const [redemptionsPage, setRedemptionsPage] = useState(0);
  const [redemptionsLoading, setRedemptionsLoading] = useState(false);
  const [redemptionsError, setRedemptionsError] = useState<string | null>(null);

  const tierCollection = useMemo(
    () =>
      createListCollection({
        items: [
          { value: 'access' as const, label: t('admin.promoCodes.tierAccess') },
          { value: 'insider' as const, label: t('admin.promoCodes.tierInsider') },
        ],
      }),
    [t],
  );

  const audienceCollection = useMemo(
    () =>
      createListCollection({
        items: [
          { value: 'all' as const, label: t('admin.promoCodes.audienceAll') },
          { value: 'first_time' as const, label: t('admin.promoCodes.audienceFirstTime') },
          { value: 'unsubscribed' as const, label: t('admin.promoCodes.audienceUnsubscribed') },
        ],
      }),
    [t],
  );

  const load = useCallback(async (pageToLoad = page) => {
    setLoading(true);
    setLoadError(null);
    const res = await api.promoCode.listAdmin({
      limit: LIST_LIMIT,
      offset: pageToLoad * LIST_LIMIT,
    });
    if (res.success && res.data) {
      setCodes(res.data.codes);
      setTotal(res.data.total);
    } else {
      setLoadError(t('admin.promoCodes.loadError'));
      setCodes([]);
      setTotal(0);
    }
    setLoading(false);
  }, [api, page, t]);

  useEffect(() => {
    void load(page);
  }, [load, page]);

  const totalPages = Math.max(1, Math.ceil(total / LIST_LIMIT));
  const pageStart = total === 0 ? 0 : page * LIST_LIMIT + 1;
  const pageEnd = Math.min((page + 1) * LIST_LIMIT, total);
  const isFirstPage = page === 0;
  const isLastPage = total === 0 || page >= totalPages - 1;

  const loadRedemptions = useCallback(
    async (shortcode: string, pageToLoad: number) => {
      setRedemptionsLoading(true);
      setRedemptionsError(null);
      const res = await api.promoCode.listRedemptionsAdmin(shortcode, {
        limit: LIST_LIMIT,
        offset: pageToLoad * LIST_LIMIT,
      });
      if (res.success && res.data) {
        setRedemptions(res.data.redemptions);
        setRedemptionsTotal(res.data.total);
      } else {
        setRedemptionsError(t('admin.promoCodes.redemptionsLoadError'));
        setRedemptions([]);
        setRedemptionsTotal(0);
      }
      setRedemptionsLoading(false);
    },
    [api, t],
  );

  useEffect(() => {
    if (!redemptionsOpen || !redemptionsShortcode) return;
    void loadRedemptions(redemptionsShortcode, redemptionsPage);
  }, [redemptionsOpen, redemptionsShortcode, redemptionsPage, loadRedemptions]);

  const redemptionsTotalPages = Math.max(1, Math.ceil(redemptionsTotal / LIST_LIMIT));
  const redemptionsPageStart =
    redemptionsTotal === 0 ? 0 : redemptionsPage * LIST_LIMIT + 1;
  const redemptionsPageEnd = Math.min((redemptionsPage + 1) * LIST_LIMIT, redemptionsTotal);
  const redemptionsIsFirstPage = redemptionsPage === 0;
  const redemptionsIsLastPage =
    redemptionsTotal === 0 || redemptionsPage >= redemptionsTotalPages - 1;

  const resetForm = () => {
    setForm(EMPTY_PROMO_FORM);
    setEditingShortcode(null);
    setSaveError(null);
    setSaveSuccess(null);
  };

  const startEdit = (code: PublicPromoCode) => {
    setEditingShortcode(code.shortcode);
    setForm(codeToForm(code));
    setSaveError(null);
    setSaveSuccess(null);
  };

  const validationMessage = (error: PromoFormValidationError): string => {
    switch (error) {
      case 'shortcodeRequired':
        return t('admin.promoCodes.validation.shortcodeRequired');
      case 'shortcodeInvalid':
        return t('admin.promoCodes.validation.shortcodeInvalid');
      case 'durationInvalid':
        return t('admin.promoCodes.validation.durationInvalid');
      case 'maxUsesInvalid':
        return t('admin.promoCodes.validation.maxUsesInvalid');
      case 'validityRangeInvalid':
        return t('admin.promoCodes.validation.validityRangeInvalid');
      default:
        return t('admin.promoCodes.saveError');
    }
  };

  const saveCode = async () => {
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(null);

    const validation = validatePromoForm(form, { requireShortcode: !editingShortcode });
    if (validation) {
      setSaveError(validationMessage(validation));
      setSaving(false);
      return;
    }

    const res = editingShortcode
      ? await api.promoCode.updateAdmin(editingShortcode, formToUpdateParams(form))
      : await api.promoCode.createAdmin(formToCreateParams(form));

    if (res.success) {
      setSaveSuccess(
        editingShortcode
          ? t('admin.promoCodes.updateSuccess')
          : t('admin.promoCodes.createSuccess'),
      );
      resetForm();
      setPage(0);
      await load(0);
    } else {
      setSaveError(t('admin.promoCodes.saveError'));
    }
    setSaving(false);
  };

  const deleteCode = async (shortcode: string) => {
    if (editingShortcode === shortcode) return;
    if (!window.confirm(t('admin.promoCodes.deleteConfirm', { shortcode }))) return;

    setDeletingShortcode(shortcode);
    const res = await api.promoCode.deleteAdmin(shortcode);
    if (res.success) {
      setPage(0);
      await load(0);
    } else {
      window.alert(t('admin.promoCodes.deleteError'));
    }
    setDeletingShortcode(null);
  };

  const openRedemptions = (shortcode: string) => {
    setRedemptionsShortcode(shortcode);
    setRedemptionsPage(0);
    setRedemptions([]);
    setRedemptionsTotal(0);
    setRedemptionsError(null);
    setRedemptionsOpen(true);
  };

  const closeRedemptions = () => {
    setRedemptionsOpen(false);
    setRedemptionsShortcode(null);
    setRedemptions([]);
    setRedemptionsTotal(0);
    setRedemptionsPage(0);
    setRedemptionsError(null);
  };

  const grantLabels = useMemo(
    () => ({
      subscription: (tier: string, months: number) =>
        t('admin.promoCodes.grantSubscriptionSummary', { tier, months }),
      none: t('admin.promoCodes.grantsNone'),
    }),
    [t],
  );

  const usesLabels = useMemo(
    () => ({
      unlimited: t('admin.promoCodes.unlimited'),
    }),
    [t],
  );

  const validityLabels = useMemo(
    () => ({
      always: t('admin.promoCodes.validityAlways'),
      openStart: t('admin.promoCodes.noStart'),
      openEnd: t('admin.promoCodes.noEnd'),
    }),
    [t],
  );

  return (
    <div className="page-content admin-page admin-promo-codes">
      <div className="page-header">
        <h1 className="page-title">{t('admin.promoCodes.title')}</h1>
        <p className="page-subtitle">{t('admin.promoCodes.subtitle')}</p>
      </div>

      {loadError && (
        <div className="admin-promo-codes__message admin-promo-codes__message--error">
          <p>{loadError}</p>
          <Button variant="secondary" size="sm" onClick={() => void load(page)}>
            {t('common.retry')}
          </Button>
        </div>
      )}

      {loading ? (
        <div className="admin-loading">
          <div className="spinner spinner-lg" />
        </div>
      ) : (
        <>
          {total > 0 && (
            <p className="admin-hint admin-promo-codes__pagination-hint">
              {t('admin.promoCodes.showingCount', { start: pageStart, end: pageEnd, total })}
            </p>
          )}

          {codes.length === 0 ? (
            <p className="admin-hint">{t('admin.promoCodes.empty')}</p>
          ) : (
            <div className="admin-table-wrap admin-promo-codes__table-wrap">
              <table className="admin-table admin-promo-codes__table">
                <thead>
                  <tr>
                    <th>{t('admin.promoCodes.table.shortcode')}</th>
                    <th>{t('admin.promoCodes.table.description')}</th>
                    <th>{t('admin.promoCodes.table.grants')}</th>
                    <th>{t('admin.promoCodes.table.uses')}</th>
                    <th>{t('admin.promoCodes.table.validity')}</th>
                    <th>{t('admin.promoCodes.table.jurisdictions')}</th>
                    <th>{t('admin.promoCodes.table.audience')}</th>
                    <th>{t('admin.promoCodes.table.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {codes.map((code) => (
                    <tr key={code.shortcode}>
                      <td className="admin-mono">{code.shortcode}</td>
                      <td>{code.description || '—'}</td>
                      <td>{formatGrantsSummary(code, grantLabels)}</td>
                      <td>{formatUsesSummary(code, usesLabels)}</td>
                      <td>{formatValiditySummary(code, validityLabels, formatDateTime)}</td>
                      <td>
                        {code.jurisdictions.length
                          ? t('admin.promoCodes.jurisdictionCount', {
                              count: code.jurisdictions.length,
                            })
                          : t('admin.promoCodes.jurisdictionsAll')}
                      </td>
                      <td>
                        {code.audience === 'first_time'
                          ? t('admin.promoCodes.audienceFirstTime')
                          : code.audience === 'unsubscribed'
                            ? t('admin.promoCodes.audienceUnsubscribed')
                            : t('admin.promoCodes.audienceAll')}
                      </td>
                      <td>
                        <div className="admin-promo-codes__row-actions">
                          <Button variant="secondary" size="sm" onClick={() => startEdit(code)}>
                            {t('admin.promoCodes.edit')}
                          </Button>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => openRedemptions(code.shortcode)}
                          >
                            {t('admin.promoCodes.viewRedemptions')}
                          </Button>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => void deleteCode(code.shortcode)}
                            disabled={deletingShortcode === code.shortcode}
                          >
                            {t('admin.promoCodes.delete')}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {total > LIST_LIMIT && (
            <div className="admin-promo-codes__pagination">
              <Button
                variant="secondary"
                size="sm"
                disabled={isFirstPage || loading}
                onClick={() => setPage(0)}
              >
                {t('admin.promoCodes.firstPage')}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={isFirstPage || loading}
                onClick={() => setPage((current) => current - 1)}
              >
                {t('admin.promoCodes.prevPage')}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={isLastPage || loading}
                onClick={() => setPage((current) => current + 1)}
              >
                {t('admin.promoCodes.nextPage')}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={isLastPage || loading}
                onClick={() => setPage(totalPages - 1)}
              >
                {t('admin.promoCodes.lastPage')}
              </Button>
            </div>
          )}

          <div className="admin-promo-codes__form">
            <h2 className="admin-promo-codes__subtitle">
              {editingShortcode
                ? t('admin.promoCodes.editTitle', { shortcode: editingShortcode })
                : t('admin.promoCodes.addTitle')}
            </h2>

            <div className="admin-promo-codes__form-grid">
              <label className="admin-promo-codes__field">
                <span className="admin-field-label">{t('admin.promoCodes.form.shortcode')}</span>
                <input
                  className="admin-input"
                  value={form.shortcode}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, shortcode: e.target.value.toLowerCase() }))
                  }
                  disabled={editingShortcode !== null || saving}
                  maxLength={32}
                  spellCheck={false}
                  placeholder="welcome-access"
                />
              </label>

              <label className="admin-promo-codes__field admin-promo-codes__field--wide">
                <span className="admin-field-label">{t('admin.promoCodes.form.description')}</span>
                <textarea
                  className="admin-input admin-promo-codes__textarea"
                  value={form.description}
                  onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                  disabled={saving}
                  rows={2}
                  maxLength={512}
                />
              </label>

              <div className="admin-promo-codes__field admin-promo-codes__field--wide">
                <Checkbox.Root
                  checked={form.grantSubscription}
                  onCheckedChange={(e) =>
                    setForm((prev) => ({ ...prev, grantSubscription: e.checked === true }))
                  }
                  disabled={saving}
                  className="admin-promo-codes__checkbox"
                >
                  <Checkbox.Control className="admin-promo-codes__checkbox-control" />
                  <Checkbox.Label className="admin-promo-codes__checkbox-label">
                    {t('admin.promoCodes.form.grantSubscription')}
                  </Checkbox.Label>
                  <Checkbox.HiddenInput />
                </Checkbox.Root>

                {form.grantSubscription && (
                  <div className="admin-promo-codes__subscription-fields">
                    <div className="input-wrapper">
                      <label className="input-label">{t('admin.promoCodes.form.tier')}</label>
                      <Select.Root
                        collection={tierCollection}
                        value={[form.subscriptionTier]}
                        onValueChange={(details) => {
                          const next = details.value[0] as SubscriptionTierId | undefined;
                          if (next) {
                            setForm((prev) => ({ ...prev, subscriptionTier: next }));
                          }
                        }}
                        disabled={saving}
                        positioning={{ sameWidth: true }}
                      >
                        <Select.Control className="report-select-control">
                          <Select.Trigger className="report-select-trigger">
                            <Select.ValueText placeholder={t('admin.promoCodes.form.tier')} />
                            <Select.Indicator className="report-select-indicator">
                              <Icon name="chevronDown" size="xs" />
                            </Select.Indicator>
                          </Select.Trigger>
                        </Select.Control>
                        <Portal>
                          <Select.Positioner>
                            <Select.Content className="report-select-content">
                              {tierCollection.items.map((item) => (
                                <Select.Item
                                  key={item.value}
                                  item={item}
                                  className="report-select-item"
                                >
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

                    <label className="admin-promo-codes__field">
                      <span className="admin-field-label">
                        {t('admin.promoCodes.form.durationMonths')}
                      </span>
                      <input
                        className="admin-input"
                        type="number"
                        min={1}
                        max={120}
                        value={form.subscriptionDurationMonths}
                        onChange={(e) =>
                          setForm((prev) => ({
                            ...prev,
                            subscriptionDurationMonths: e.target.value,
                          }))
                        }
                        disabled={saving}
                      />
                    </label>
                  </div>
                )}
              </div>

              <label className="admin-promo-codes__field admin-promo-codes__field--wide">
                <span className="admin-field-label">{t('admin.promoCodes.form.entitlements')}</span>
                <textarea
                  className="admin-input admin-promo-codes__textarea"
                  value={form.entitlements}
                  onChange={(e) => setForm((prev) => ({ ...prev, entitlements: e.target.value }))}
                  disabled={saving}
                  rows={2}
                  placeholder="vanguard, founder"
                />
              </label>

              <label className="admin-promo-codes__field">
                <span className="admin-field-label">{t('admin.promoCodes.form.requiredCodes')}</span>
                <input
                  className="admin-input"
                  value={form.requiredCodes}
                  onChange={(e) => setForm((prev) => ({ ...prev, requiredCodes: e.target.value }))}
                  disabled={saving}
                  spellCheck={false}
                  placeholder="beta-access"
                />
              </label>

              <label className="admin-promo-codes__field">
                <span className="admin-field-label">
                  {t('admin.promoCodes.form.incompatibleCodes')}
                </span>
                <input
                  className="admin-input"
                  value={form.incompatibleCodes}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, incompatibleCodes: e.target.value }))
                  }
                  disabled={saving}
                  spellCheck={false}
                  placeholder="staff-access"
                />
              </label>

              <div className="admin-promo-codes__field">
                <Checkbox.Root
                  checked={form.unlimitedUses}
                  onCheckedChange={(e) =>
                    setForm((prev) => ({ ...prev, unlimitedUses: e.checked === true }))
                  }
                  disabled={saving}
                  className="admin-promo-codes__checkbox"
                >
                  <Checkbox.Control className="admin-promo-codes__checkbox-control" />
                  <Checkbox.Label className="admin-promo-codes__checkbox-label">
                    {t('admin.promoCodes.form.unlimitedUses')}
                  </Checkbox.Label>
                  <Checkbox.HiddenInput />
                </Checkbox.Root>

                {!form.unlimitedUses && (
                  <label className="admin-promo-codes__field">
                    <span className="admin-field-label">{t('admin.promoCodes.form.maxUses')}</span>
                    <input
                      className="admin-input"
                      type="number"
                      min={1}
                      value={form.maxUses}
                      onChange={(e) => setForm((prev) => ({ ...prev, maxUses: e.target.value }))}
                      disabled={saving}
                    />
                  </label>
                )}
              </div>

              <label className="admin-promo-codes__field admin-promo-codes__field--wide">
                <span className="admin-field-label">{t('admin.promoCodes.form.jurisdictions')}</span>
                <input
                  className="admin-input"
                  value={form.jurisdictions}
                  onChange={(e) => setForm((prev) => ({ ...prev, jurisdictions: e.target.value }))}
                  disabled={saving}
                  spellCheck={false}
                  placeholder="US-TN, GB"
                />
              </label>

              <div className="admin-promo-codes__field admin-promo-codes__field--wide">
                <div className="input-wrapper">
                  <label className="input-label">{t('admin.promoCodes.form.audience')}</label>
                  <Select.Root
                    collection={audienceCollection}
                    value={[form.audience]}
                    onValueChange={(details) => {
                      const next = details.value[0] as PromoCodeAudience | undefined;
                      if (next) {
                        setForm((prev) => ({ ...prev, audience: next }));
                      }
                    }}
                    disabled={saving}
                    positioning={{ sameWidth: true }}
                  >
                    <Select.Control className="report-select-control">
                      <Select.Trigger className="report-select-trigger">
                        <Select.ValueText placeholder={t('admin.promoCodes.form.audience')} />
                        <Select.Indicator className="report-select-indicator">
                          <Icon name="chevronDown" size="xs" />
                        </Select.Indicator>
                      </Select.Trigger>
                    </Select.Control>
                    <Portal>
                      <Select.Positioner>
                        <Select.Content className="report-select-content">
                          {audienceCollection.items.map((item) => (
                            <Select.Item
                              key={item.value}
                              item={item}
                              className="report-select-item"
                            >
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
              </div>

              <label className="admin-promo-codes__field">
                <span className="admin-field-label">{t('admin.promoCodes.form.validFrom')}</span>
                <input
                  className="admin-input"
                  type="datetime-local"
                  value={form.validFrom}
                  onChange={(e) => setForm((prev) => ({ ...prev, validFrom: e.target.value }))}
                  disabled={saving}
                />
              </label>

              <label className="admin-promo-codes__field">
                <span className="admin-field-label">{t('admin.promoCodes.form.validTo')}</span>
                <input
                  className="admin-input"
                  type="datetime-local"
                  value={form.validTo}
                  onChange={(e) => setForm((prev) => ({ ...prev, validTo: e.target.value }))}
                  disabled={saving}
                />
              </label>
            </div>

            <div className="admin-promo-codes__form-actions">
              <Button variant="primary" onClick={() => void saveCode()} disabled={saving}>
                {editingShortcode
                  ? t('admin.promoCodes.update')
                  : t('admin.promoCodes.add')}
              </Button>
              {editingShortcode && (
                <Button variant="secondary" onClick={resetForm} disabled={saving}>
                  {t('admin.promoCodes.cancelEdit')}
                </Button>
              )}
            </div>

            {saveError && <p className="admin-inline-error">{saveError}</p>}
            {saveSuccess && <p className="admin-inline-success">{saveSuccess}</p>}
          </div>
        </>
      )}

      <Dialog.Root
        open={redemptionsOpen}
        onOpenChange={(e) => {
          if (!e.open) closeRedemptions();
        }}
      >
        <Portal>
          <Dialog.Backdrop className="confirm-dialog-backdrop" />
          <Dialog.Positioner className="confirm-dialog-positioner">
            <Dialog.Content className="confirm-dialog-content admin-promo-codes__dialog">
              <div className="confirm-dialog-header">
                <Dialog.Title className="confirm-dialog-title">
                  {t('admin.promoCodes.redemptionsTitle', { shortcode: redemptionsShortcode ?? '' })}
                </Dialog.Title>
                <Dialog.Description className="confirm-dialog-description">
                  {t('admin.promoCodes.redemptionsSubtitle')}
                </Dialog.Description>
              </div>

              <div className="confirm-dialog-body admin-promo-codes__dialog-body">
                {redemptionsLoading ? (
                  <div className="admin-loading">
                    <div className="spinner spinner-lg" />
                  </div>
                ) : redemptionsError ? (
                  <p className="admin-inline-error">{redemptionsError}</p>
                ) : redemptions.length === 0 ? (
                  <p className="admin-hint">{t('admin.promoCodes.redemptionsEmpty')}</p>
                ) : (
                  <>
                    {redemptionsTotal > 0 && (
                      <p className="admin-hint admin-promo-codes__pagination-hint">
                        {t('admin.promoCodes.showingCount', {
                          start: redemptionsPageStart,
                          end: redemptionsPageEnd,
                          total: redemptionsTotal,
                        })}
                      </p>
                    )}
                    <div className="admin-table-wrap">
                      <table className="admin-table admin-promo-codes__redemptions-table">
                        <thead>
                          <tr>
                            <th>{t('admin.promoCodes.redemptions.userId')}</th>
                            <th>{t('admin.promoCodes.redemptions.redeemedAt')}</th>
                            <th>{t('admin.promoCodes.redemptions.grantsApplied')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {redemptions.map((row) => (
                            <tr key={row.id}>
                              <td>
                                <Link
                                  to={`/admin/users/${row.userId}`}
                                  className="admin-promo-codes__user-link"
                                >
                                  {row.userId}
                                </Link>
                              </td>
                              <td>{formatDateTime(row.redeemedAt)}</td>
                              <td>
                                {[
                                  row.subscriptionOverrideApplied
                                    ? t('admin.promoCodes.redemptions.subscriptionGrant', {
                                        tier: row.subscriptionOverrideApplied.tier,
                                        date: formatDateTime(
                                          row.subscriptionOverrideApplied.expiresAt,
                                        ),
                                      })
                                    : null,
                                  row.entitlementsApplied.length
                                    ? row.entitlementsApplied.join(', ')
                                    : null,
                                ]
                                  .filter(Boolean)
                                  .join(' · ') || '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {redemptionsTotal > LIST_LIMIT && (
                      <div className="admin-promo-codes__pagination">
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={redemptionsIsFirstPage || redemptionsLoading}
                          onClick={() => setRedemptionsPage(0)}
                        >
                          {t('admin.promoCodes.firstPage')}
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={redemptionsIsFirstPage || redemptionsLoading}
                          onClick={() => setRedemptionsPage((current) => current - 1)}
                        >
                          {t('admin.promoCodes.prevPage')}
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={redemptionsIsLastPage || redemptionsLoading}
                          onClick={() => setRedemptionsPage((current) => current + 1)}
                        >
                          {t('admin.promoCodes.nextPage')}
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={redemptionsIsLastPage || redemptionsLoading}
                          onClick={() => setRedemptionsPage(redemptionsTotalPages - 1)}
                        >
                          {t('admin.promoCodes.lastPage')}
                        </Button>
                      </div>
                    )}
                  </>
                )}
              </div>

              <div className="confirm-dialog-footer">
                <Button variant="secondary" onClick={closeRedemptions}>
                  {t('common.close')}
                </Button>
              </div>
            </Dialog.Content>
          </Dialog.Positioner>
        </Portal>
      </Dialog.Root>
    </div>
  );
}
