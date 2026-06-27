import { useCallback, useMemo, useState } from 'react';
import {
  FEEDBACK_CATEGORIES,
  FEEDBACK_STATUSES,
  MAX_FEEDBACK_ATTACHMENTS,
  MAX_FEEDBACK_BODY_LENGTH,
  MAX_FEEDBACK_TITLE_LENGTH,
  type FeedbackCategory,
  type FeedbackStatus,
} from '@adieuu/shared';
import { Select, Portal, Checkbox, createListCollection } from '@ark-ui/react';
import { useTranslation } from 'react-i18next';
import { Button } from '../Button';
import { Input } from '../Input';
import {
  FeedbackAttachmentUploader,
  type FeedbackAttachmentItem,
} from '../FeedbackAttachmentUploader';
import { useAuth } from '../../hooks/useAuth';

const ADIEUU_DEV_ENTITLEMENT = 'adieuu-dev';

const PRIVILEGED_CREATE_STATUSES = FEEDBACK_STATUSES.filter(
  (status) => status !== 'submitted',
);

export interface FeedbackSubmitFormValues {
  category: FeedbackCategory;
  title: string;
  description: string;
  attachmentMediaIds: string[];
  isRoadmapOfficial?: boolean;
  showOnTimeline?: boolean;
  targetReleaseDate?: string;
  status?: FeedbackStatus;
}

export interface FeedbackSubmitFormProps {
  submitting: boolean;
  onSubmit: (values: FeedbackSubmitFormValues) => void;
  onCancel: () => void;
}

export function FeedbackSubmitForm({ submitting, onSubmit, onCancel }: FeedbackSubmitFormProps) {
  const { t } = useTranslation();
  const { session } = useAuth();
  const isStaff = session?.isPlatformAdmin === true || session?.isPlatformModerator === true;
  const hasAdieuuDev = session?.entitlements?.includes(ADIEUU_DEV_ENTITLEMENT) === true;
  const showPrivilegedFields = isStaff && hasAdieuuDev;

  const [category, setCategory] = useState<FeedbackCategory | ''>('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [attachments, setAttachments] = useState<FeedbackAttachmentItem[]>([]);
  const [addToTimeline, setAddToTimeline] = useState(false);
  const [isRoadmapOfficial, setIsRoadmapOfficial] = useState(false);
  const [targetReleaseDate, setTargetReleaseDate] = useState('');
  const [status, setStatus] = useState<FeedbackStatus | ''>('');

  const descriptionRemaining = MAX_FEEDBACK_BODY_LENGTH - description.length;
  const titleRemaining = MAX_FEEDBACK_TITLE_LENGTH - title.length;

  const categoryCollection = useMemo(
    () =>
      createListCollection({
        items: FEEDBACK_CATEGORIES.map((c) => ({
          value: c,
          label: t(`feedback.categories.${c}`),
        })),
      }),
    [t],
  );

  const statusCollection = useMemo(
    () =>
      createListCollection({
        items: PRIVILEGED_CREATE_STATUSES.map((value) => ({
          value,
          label: t(`feedback.statuses.${value}`),
        })),
      }),
    [t],
  );

  const canSubmit =
    category !== '' &&
    title.trim().length > 0 &&
    (showPrivilegedFields || description.trim().length > 0) &&
    title.length <= MAX_FEEDBACK_TITLE_LENGTH &&
    description.length <= MAX_FEEDBACK_BODY_LENGTH &&
    attachments.length <= MAX_FEEDBACK_ATTACHMENTS;

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!canSubmit || !category) return;

      onSubmit({
        category,
        title: title.trim(),
        description: description.trim(),
        attachmentMediaIds: attachments.map((a) => a.mediaId),
        ...(showPrivilegedFields && isRoadmapOfficial ? { isRoadmapOfficial: true } : {}),
        ...(showPrivilegedFields && addToTimeline ? { showOnTimeline: true } : {}),
        ...(showPrivilegedFields && addToTimeline && targetReleaseDate.trim()
          ? { targetReleaseDate: targetReleaseDate.trim() }
          : {}),
        ...(showPrivilegedFields && status ? { status: status as FeedbackStatus } : {}),
      });
    },
    [
      addToTimeline,
      attachments,
      canSubmit,
      category,
      description,
      isRoadmapOfficial,
      onSubmit,
      showPrivilegedFields,
      status,
      targetReleaseDate,
      title,
    ],
  );

  return (
    <form onSubmit={handleSubmit} className="admin-form">
      <div className="admin-form-group">
        <Select.Root
          collection={categoryCollection}
          value={category ? [category] : []}
          onValueChange={(d) => setCategory((d.value[0] as FeedbackCategory) ?? '')}
        >
          <Select.Label className="input-label">{t('feedback.form.category')}</Select.Label>
          <Select.Control className="report-select-control">
            <Select.Trigger className="report-select-trigger">
              <Select.ValueText placeholder={t('feedback.form.categoryPlaceholder')} />
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

      <Input
        label={t('feedback.form.title')}
        value={title}
        onChange={(e) => setTitle(e.target.value.slice(0, MAX_FEEDBACK_TITLE_LENGTH))}
        placeholder={t('feedback.form.titlePlaceholder')}
        hint={t('feedback.form.charsRemaining', { count: titleRemaining })}
      />

      <div className="admin-form-group">
        <label className="input-label" htmlFor="feedback-description">
          {t('feedback.form.description')}
          {showPrivilegedFields && (
            <span className="input-label-optional">{t('feedback.form.optional')}</span>
          )}
        </label>
        <textarea
          id="feedback-description"
          className="input textarea"
          value={description}
          onChange={(e) => setDescription(e.target.value.slice(0, MAX_FEEDBACK_BODY_LENGTH))}
          placeholder={t('feedback.form.descriptionPlaceholder')}
          rows={8}
        />
        <p className="input-hint">
          {t('feedback.form.charsRemaining', { count: descriptionRemaining })}
        </p>
      </div>

      <FeedbackAttachmentUploader
        attachments={attachments}
        onChange={setAttachments}
        disabled={submitting}
      />

      {showPrivilegedFields && (
        <div className="feedback-submit-privileged-fields">
          <Checkbox.Root
            checked={addToTimeline}
            onCheckedChange={(e) => setAddToTimeline(e.checked === true)}
            className="feedback-official-checkbox"
          >
            <Checkbox.Control className="fs-checkbox-control" />
            <Checkbox.Label className="fs-checkbox-label">
              <span className="fs-checkbox-title">{t('feedback.form.addToTimeline')}</span>
              <span className="fs-checkbox-hint">{t('feedback.form.addToTimelineHint')}</span>
            </Checkbox.Label>
            <Checkbox.HiddenInput />
          </Checkbox.Root>

          {addToTimeline && (
            <Input
              type="date"
              label={t('feedback.form.targetReleaseDate')}
              value={targetReleaseDate}
              onChange={(e) => setTargetReleaseDate(e.target.value)}
            />
          )}

          <Checkbox.Root
            checked={isRoadmapOfficial}
            onCheckedChange={(e) => setIsRoadmapOfficial(e.checked === true)}
            className="feedback-official-checkbox"
          >
            <Checkbox.Control className="fs-checkbox-control" />
            <Checkbox.Label className="fs-checkbox-label">
              <span className="fs-checkbox-title">{t('feedback.form.roadmapOfficial')}</span>
              <span className="fs-checkbox-hint">{t('feedback.form.roadmapOfficialHint')}</span>
            </Checkbox.Label>
            <Checkbox.HiddenInput />
          </Checkbox.Root>

          <div className="admin-form-group">
            <Select.Root
              collection={statusCollection}
              value={status ? [status] : []}
              onValueChange={(d) => setStatus((d.value[0] as FeedbackStatus) ?? '')}
            >
              <Select.Label className="input-label">{t('feedback.form.initialStatus')}</Select.Label>
              <Select.Control className="report-select-control">
                <Select.Trigger className="report-select-trigger">
                  <Select.ValueText placeholder={t('feedback.form.initialStatusPlaceholder')} />
                </Select.Trigger>
              </Select.Control>
              <Portal>
                <Select.Positioner>
                  <Select.Content className="report-select-content">
                    {statusCollection.items.map((item) => (
                      <Select.Item key={item.value} item={item} className="report-select-item">
                        <Select.ItemText>{item.label}</Select.ItemText>
                      </Select.Item>
                    ))}
                  </Select.Content>
                </Select.Positioner>
              </Portal>
            </Select.Root>
          </div>
        </div>
      )}

      <div className="admin-action-bar">
        <Button type="button" variant="secondary" onClick={onCancel}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" disabled={!canSubmit || submitting}>
          {t('feedback.form.submit')}
        </Button>
      </div>
    </form>
  );
}
