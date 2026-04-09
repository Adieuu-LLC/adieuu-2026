import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MEMBER_COLORS } from './conversationUtils';

export function MemberEditPanel({
  initialNickname,
  initialColor,
  onSave,
  onCancel,
}: {
  initialNickname: string;
  initialColor: string | undefined;
  onSave: (nickname: string, color: string | undefined) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [nickname, setNickname] = useState(initialNickname);
  const [color, setColor] = useState(initialColor);

  return (
    <div className="conversation-member-edit-panel">
      <label className="conversation-member-edit-field">
        <span className="conversation-member-edit-label">{t('conversations.nickname', 'Nickname')}</span>
        <input
          type="text"
          className="conversation-member-edit-input"
          placeholder={t('conversations.nicknamePlaceholder', 'Custom name...')}
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          maxLength={50}
        />
      </label>
      <div className="conversation-member-edit-field">
        <span className="conversation-member-edit-label">{t('conversations.memberColor', 'Colour')}</span>
        <div className="conversation-member-color-swatches">
          <button
            type="button"
            className={`conversation-member-color-swatch conversation-member-color-swatch--none${!color ? ' conversation-member-color-swatch--active' : ''}`}
            onClick={() => setColor(undefined)}
            aria-label={t('conversations.clearColor', 'Clear colour')}
          />
          {MEMBER_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              className={`conversation-member-color-swatch${color === c ? ' conversation-member-color-swatch--active' : ''}`}
              style={{ background: c }}
              onClick={() => setColor(c)}
              aria-label={c}
            />
          ))}
        </div>
      </div>
      <div className="conversation-member-edit-actions">
        <button type="button" className="conversation-member-edit-save" onClick={() => onSave(nickname, color)}>
          {t('conversations.saveMemberSettings', 'Save')}
        </button>
        <button type="button" className="conversation-member-edit-cancel" onClick={onCancel}>
          {t('conversations.cancelMemberSettings', 'Cancel')}
        </button>
      </div>
    </div>
  );
}
