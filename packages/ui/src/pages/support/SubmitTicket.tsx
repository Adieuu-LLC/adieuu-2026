import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  TICKET_CATEGORIES,
  TICKET_SUBCATEGORIES,
  MAX_TICKET_BODY_LENGTH,
  MAX_TICKET_TITLE_LENGTH,
  type TicketCategory,
} from '@adieuu/shared';
import { Select, Portal, createListCollection } from '@ark-ui/react';
import { createApiClient } from '@adieuu/shared';
import { useAppConfig } from '../../config';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Input } from '../../components/Input';
import { Alert } from '../../components/Alert';
import {
  TicketAttachmentUploader,
  type TicketAttachmentItem,
} from '../../components/TicketAttachmentUploader';
import { MarkdownTextarea } from '../../components/MarkdownTextarea';

export function SubmitTicket() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { apiBaseUrl } = useAppConfig();
  const api = useMemo(() => createApiClient({ baseUrl: apiBaseUrl }), [apiBaseUrl]);

  const [category, setCategory] = useState<TicketCategory | ''>('');
  const [subcategory, setSubcategory] = useState('');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [attachments, setAttachments] = useState<TicketAttachmentItem[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const bodyRemaining = MAX_TICKET_BODY_LENGTH - body.length;
  const titleRemaining = MAX_TICKET_TITLE_LENGTH - title.length;

  const categoryCollection = useMemo(
    () =>
      createListCollection({
        items: TICKET_CATEGORIES.map((c) => ({
          value: c,
          label: t(`support.categories.${c}`),
        })),
      }),
    [t],
  );

  const subcategoryCollection = useMemo(() => {
    if (!category) {
      return createListCollection({ items: [] as { value: string; label: string }[] });
    }
    const subs = TICKET_SUBCATEGORIES[category];
    return createListCollection({
      items: subs.map((s) => ({
        value: s,
        label: t(`support.subcategories.${category}.${s}`),
      })),
    });
  }, [category, t]);

  useEffect(() => {
    setSubcategory('');
  }, [category]);

  const canSubmit =
    category !== '' &&
    title.trim().length > 0 &&
    body.trim().length > 0 &&
    title.length <= MAX_TICKET_TITLE_LENGTH &&
    body.length <= MAX_TICKET_BODY_LENGTH;

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!canSubmit || !category) return;

      setSubmitting(true);
      setError(null);

      const res = await api.supportTickets.createTicket({
        category,
        subcategory: subcategory || undefined,
        title: title.trim(),
        body,
        attachmentMediaIds: attachments.map((a) => a.mediaId),
      });

      setSubmitting(false);

      if (res.success && res.data) {
        navigate(`/support/${res.data.ticketId}`);
        return;
      }

      setError(t('support.submitError'));
    },
    [api, attachments, body, canSubmit, category, navigate, subcategory, t, title],
  );

  return (
    <div className="page-content support-page">
      <div className="container">
        <div className="page-header">
          <h1 className="page-title">{t('support.newTicket')}</h1>
          <p className="page-subtitle">{t('support.subtitle')}</p>
        </div>

        {error && <Alert variant="error">{error}</Alert>}

        <Card variant="elevated">
        <form onSubmit={(e) => void handleSubmit(e)} className="admin-form">
          <div className="admin-form-group">
            <label className="input-label">{t('support.form.category')}</label>
            <Select.Root
              collection={categoryCollection}
              value={category ? [category] : []}
              onValueChange={(d) => setCategory((d.value[0] as TicketCategory) ?? '')}
            >
              <Select.Control className="report-select-control">
                <Select.Trigger className="report-select-trigger">
                  <Select.ValueText placeholder={t('support.form.categoryPlaceholder')} />
                </Select.Trigger>
              </Select.Control>
              <Portal>
                <Select.Positioner>
                  <Select.Content className="report-select-content">
                    {categoryCollection.items.map((item) => (
                      <Select.Item key={item.value} item={item} className="report-select-item">
                        <Select.ItemText>{item.label}</Select.ItemText>
                      </Select.Item>
                    ))}
                  </Select.Content>
                </Select.Positioner>
              </Portal>
            </Select.Root>
          </div>

          {category && subcategoryCollection.items.length > 0 && (
            <div className="admin-form-group">
              <label className="input-label">{t('support.form.subcategory')}</label>
              <Select.Root
                collection={subcategoryCollection}
                value={subcategory ? [subcategory] : []}
                onValueChange={(d) => setSubcategory(d.value[0] ?? '')}
              >
                <Select.Control className="report-select-control">
                  <Select.Trigger className="report-select-trigger">
                    <Select.ValueText placeholder={t('support.form.subcategoryPlaceholder')} />
                  </Select.Trigger>
                </Select.Control>
                <Portal>
                  <Select.Positioner>
                    <Select.Content className="report-select-content">
                      {subcategoryCollection.items.map((item) => (
                        <Select.Item key={item.value} item={item} className="report-select-item">
                          <Select.ItemText>{item.label}</Select.ItemText>
                        </Select.Item>
                      ))}
                    </Select.Content>
                  </Select.Positioner>
                </Portal>
              </Select.Root>
            </div>
          )}

          <Input
            label={t('support.form.title')}
            value={title}
            onChange={(e) => setTitle(e.target.value.slice(0, MAX_TICKET_TITLE_LENGTH))}
            placeholder={t('support.form.titlePlaceholder')}
            hint={t('support.form.charsRemaining', { count: titleRemaining })}
          />

          <div className="admin-form-group">
            <label className="input-label" htmlFor="ticket-body">
              {t('support.form.body')}
            </label>
            <MarkdownTextarea
              id="ticket-body"
              value={body}
              onChange={setBody}
              maxLength={MAX_TICKET_BODY_LENGTH}
              placeholder={t('support.form.bodyPlaceholder')}
              rows={8}
            />
            <p className="input-hint">{t('support.form.charsRemaining', { count: bodyRemaining })}</p>
          </div>

          <TicketAttachmentUploader attachments={attachments} onChange={setAttachments} disabled={submitting} />

          <div className="admin-action-bar">
            <Button type="button" variant="secondary" onClick={() => navigate('/support')}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={!canSubmit || submitting}>
              {submitting ? t('common.loading') : t('support.form.submit')}
            </Button>
          </div>
        </form>
        </Card>
      </div>
    </div>
  );
}
