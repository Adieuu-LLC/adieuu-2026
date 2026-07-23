import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  createApiClient,
  type SiteAnnouncement,
  type CreateSiteAnnouncementBody,
} from '@adieuu/shared';
import { useAppConfig } from '../../config';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';

interface FormState {
  message: string;
  title: string;
  ctaLabel: string;
  ctaUrl: string;
  highPriority: boolean;
  dismissable: boolean;
  showAfter: string;
  showUntil: string;
}

const EMPTY_FORM: FormState = {
  message: '',
  title: '',
  ctaLabel: '',
  ctaUrl: '',
  highPriority: false,
  dismissable: true,
  showAfter: '',
  showUntil: '',
};

function announcementToForm(a: SiteAnnouncement): FormState {
  return {
    message: a.message,
    title: a.title ?? '',
    ctaLabel: a.ctaLabel ?? '',
    ctaUrl: a.ctaUrl ?? '',
    highPriority: a.highPriority,
    dismissable: a.dismissable,
    showAfter: a.showAfter ? toDatetimeLocal(a.showAfter) : '',
    showUntil: a.showUntil ? toDatetimeLocal(a.showUntil) : '',
  };
}

function toDatetimeLocal(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formToBody(form: FormState): CreateSiteAnnouncementBody {
  return {
    message: form.message,
    title: form.title || undefined,
    ctaLabel: form.ctaLabel || undefined,
    ctaUrl: form.ctaUrl || undefined,
    highPriority: form.highPriority,
    dismissable: form.dismissable,
    showAfter: form.showAfter ? new Date(form.showAfter).toISOString() : undefined,
    showUntil: form.showUntil ? new Date(form.showUntil).toISOString() : undefined,
  };
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function AdminAnnouncements() {
  const { t } = useTranslation();
  const { apiBaseUrl } = useAppConfig();
  const api = useMemo(() => createApiClient({ baseUrl: apiBaseUrl }), [apiBaseUrl]);

  const [announcements, setAnnouncements] = useState<SiteAnnouncement[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    setLoadError(null);

    const res = await api.admin.listAnnouncements();
    if (!res.success || !res.data) {
      setLoadError(t('admin.announcements.loadError'));
      if (!opts?.silent) setLoading(false);
      return;
    }

    setAnnouncements(res.data.announcements);
    if (!opts?.silent) setLoading(false);
  }, [api, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleToggleActive = async (id: string, active: boolean) => {
    const res = await api.admin.toggleAnnouncementActive(id, active);
    if (res.success) {
      await load({ silent: true });
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t('admin.announcements.deleteConfirm'))) return;
    const res = await api.admin.deleteAnnouncement(id);
    if (res.success) {
      if (editingId === id) {
        setEditingId(null);
        setForm(EMPTY_FORM);
      }
      await load({ silent: true });
    }
  };

  const handleEdit = (a: SiteAnnouncement) => {
    setEditingId(a.id);
    setForm(announcementToForm(a));
    setSaveError(null);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setSaveError(null);
  };

  const handleSave = async () => {
    if (!form.message.trim()) return;

    const hasCtaLabel = !!form.ctaLabel.trim();
    const hasCtaUrl = !!form.ctaUrl.trim();
    if (hasCtaLabel !== hasCtaUrl) {
      setSaveError(t('admin.announcements.ctaPairError'));
      return;
    }

    if (form.showAfter && form.showUntil) {
      if (new Date(form.showAfter) >= new Date(form.showUntil)) {
        setSaveError(t('admin.announcements.dateRangeError'));
        return;
      }
    }

    setSaving(true);
    setSaveError(null);

    const body = formToBody(form);

    if (editingId) {
      const existing = announcements.find((a) => a.id === editingId);
      const res = await api.admin.updateAnnouncement(editingId, {
        ...body,
        active: existing?.active ?? true,
      });
      if (!res.success) {
        setSaveError(t('admin.announcements.saveError'));
        setSaving(false);
        return;
      }
      setEditingId(null);
    } else {
      const res = await api.admin.createAnnouncement({ ...body, active: true });
      if (!res.success) {
        setSaveError(t('admin.announcements.saveError'));
        setSaving(false);
        return;
      }
    }

    setForm(EMPTY_FORM);
    setSaving(false);
    await load({ silent: true });
  };

  const updateField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setSaveError(null);
  };

  const formInvalid = useMemo(() => {
    if (!form.message.trim()) return true;
    const hasCtaLabel = !!form.ctaLabel.trim();
    const hasCtaUrl = !!form.ctaUrl.trim();
    if (hasCtaLabel !== hasCtaUrl) return true;
    if (form.showAfter && form.showUntil && new Date(form.showAfter) >= new Date(form.showUntil)) return true;
    return false;
  }, [form]);

  return (
    <div className="page-content admin-page">
      <div className="page-header">
        <h1 className="page-title">{t('admin.announcements.title')}</h1>
        <p className="page-subtitle">{t('admin.announcements.subtitle')}</p>
      </div>

      {loadError && (
        <Card className="admin-card admin-card-error">
          <p>{loadError}</p>
          <Button variant="secondary" size="sm" onClick={() => void load()}>
            {t('common.retry')}
          </Button>
        </Card>
      )}

      {loading ? (
        <div className="admin-loading">
          <div className="spinner spinner-lg" />
        </div>
      ) : (
        <>
          {/* Announcement list */}
          {announcements.length === 0 ? (
            <Card className="admin-card">
              <p>{t('admin.announcements.empty')}</p>
            </Card>
          ) : (
            <Card className="admin-card">
              <div className="admin-table-wrapper">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>{t('admin.announcements.table.active')}</th>
                      <th>{t('admin.announcements.table.message')}</th>
                      <th>{t('admin.announcements.table.priority')}</th>
                      <th>{t('admin.announcements.table.window')}</th>
                      <th>{t('admin.announcements.table.actions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {announcements.map((a) => (
                      <tr key={a.id} className={a.active ? '' : 'admin-row-inactive'}>
                        <td>
                          <label className="admin-toggle admin-toggle-inline">
                            <input
                              type="checkbox"
                              checked={a.active}
                              onChange={(e) => void handleToggleActive(a.id, e.target.checked)}
                              aria-label={t('admin.announcements.activeToggleLabel', { name: a.title || a.message.slice(0, 40) })}
                            />
                          </label>
                        </td>
                        <td>
                          <div className="admin-announcement-cell">
                            {a.title && <strong>{a.title}</strong>}
                            <span className="admin-announcement-excerpt">
                              {a.message.length > 100 ? `${a.message.slice(0, 100)}...` : a.message}
                            </span>
                          </div>
                        </td>
                        <td>
                          {a.highPriority && (
                            <span className="admin-badge admin-badge-warning">
                              {t('admin.announcements.highPriority')}
                            </span>
                          )}
                        </td>
                        <td className="admin-announcement-window">
                          {a.showAfter && <span>{formatDateTime(a.showAfter)}</span>}
                          {a.showAfter && a.showUntil && <span> - </span>}
                          {a.showUntil && <span>{formatDateTime(a.showUntil)}</span>}
                          {!a.showAfter && !a.showUntil && <span>{t('admin.announcements.always')}</span>}
                        </td>
                        <td>
                          <div className="admin-actions-cell">
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => handleEdit(a)}
                            >
                              {t('admin.announcements.edit')}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => void handleDelete(a.id)}
                            >
                              {t('admin.announcements.delete')}
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {/* Create / edit form */}
          <Card className="admin-card">
            <h2 className="admin-card-title">
              {editingId
                ? t('admin.announcements.editTitle')
                : t('admin.announcements.addTitle')}
            </h2>

            <div className="ann-form-group">
              <label className="admin-field-label" htmlFor="ann-message">
                {t('admin.announcements.form.message')}
              </label>
              <textarea
                id="ann-message"
                className="admin-textarea"
                rows={4}
                value={form.message}
                onChange={(e) => updateField('message', e.target.value)}
                maxLength={2000}
              />
            </div>

            <div className="ann-form-group">
              <label className="admin-field-label" htmlFor="ann-title">
                {t('admin.announcements.form.title')}
              </label>
              <input
                id="ann-title"
                type="text"
                className="ann-input"
                value={form.title}
                onChange={(e) => updateField('title', e.target.value)}
                maxLength={200}
              />
            </div>

            <div className="ann-form-row">
              <div className="ann-form-group">
                <label className="admin-field-label" htmlFor="ann-cta-label">
                  {t('admin.announcements.form.ctaLabel')}
                </label>
                <input
                  id="ann-cta-label"
                  type="text"
                  className="ann-input"
                  value={form.ctaLabel}
                  onChange={(e) => updateField('ctaLabel', e.target.value)}
                  maxLength={100}
                />
              </div>
              <div className="ann-form-group">
                <label className="admin-field-label" htmlFor="ann-cta-url">
                  {t('admin.announcements.form.ctaUrl')}
                </label>
                <input
                  id="ann-cta-url"
                  type="url"
                  className="ann-input"
                  value={form.ctaUrl}
                  onChange={(e) => updateField('ctaUrl', e.target.value)}
                  placeholder="https://..."
                />
              </div>
            </div>

            <div className="ann-form-row">
              <div className="ann-form-group">
                <label className="admin-field-label" htmlFor="ann-show-after">
                  {t('admin.announcements.form.showAfter')}
                </label>
                <input
                  id="ann-show-after"
                  type="datetime-local"
                  className="ann-input"
                  value={form.showAfter}
                  onChange={(e) => updateField('showAfter', e.target.value)}
                />
              </div>
              <div className="ann-form-group">
                <label className="admin-field-label" htmlFor="ann-show-until">
                  {t('admin.announcements.form.showUntil')}
                </label>
                <input
                  id="ann-show-until"
                  type="datetime-local"
                  className="ann-input"
                  value={form.showUntil}
                  onChange={(e) => updateField('showUntil', e.target.value)}
                />
              </div>
            </div>

            <div className="ann-form-row">
              <label className="admin-toggle">
                <input
                  type="checkbox"
                  checked={form.highPriority}
                  onChange={(e) => updateField('highPriority', e.target.checked)}
                />
                <span>{t('admin.announcements.form.highPriority')}</span>
              </label>
              <label className="admin-toggle">
                <input
                  type="checkbox"
                  checked={form.dismissable}
                  onChange={(e) => updateField('dismissable', e.target.checked)}
                />
                <span>{t('admin.announcements.form.dismissable')}</span>
              </label>
            </div>

            {saveError && <p className="admin-inline-error">{saveError}</p>}

            <div className="admin-form-actions">
              <Button
                variant="primary"
                onClick={() => void handleSave()}
                disabled={saving || formInvalid}
              >
                {editingId
                  ? t('admin.announcements.update')
                  : t('admin.announcements.add')}
              </Button>
              {editingId && (
                <Button variant="secondary" onClick={handleCancelEdit}>
                  {t('admin.announcements.cancelEdit')}
                </Button>
              )}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
