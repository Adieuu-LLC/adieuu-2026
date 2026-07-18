import { memo } from 'react';
import type { PublicCustomEmoji } from '@adieuu/shared';
import type { MentionableUser } from './composerTypes';
import type { AppIconName } from '../../icons/appIcons';
import { Icon } from '../../icons/Icon';

export type MentionSuggestion =
  | { kind: 'user'; id: string; user: MentionableUser; displayText: string }
  | { kind: 'group'; id: string; displayText: string };

export type ShortcodeSuggestion =
  | [code: string, emoji: string]
  | { type: 'custom'; emoji: PublicCustomEmoji };

export const ComposerShortcodeAutocomplete = memo(function ComposerShortcodeAutocomplete({
  suggestions,
  selectedIdx,
  onSelect,
}: {
  suggestions: ShortcodeSuggestion[];
  selectedIdx: number;
  onSelect: (code: string, emoji: string) => void;
}) {
  if (suggestions.length === 0) return null;

  return (
    <div className="conversation-composer-emoji-ac" role="listbox" id="emoji-ac-listbox">
      {suggestions.map((item, i) => {
        const isCustom = !Array.isArray(item) && item.type === 'custom';
        const code = isCustom ? item.emoji.shortcode : (item as [string, string])[0];
        const display = isCustom ? null : (item as [string, string])[1];
        const key = isCustom ? `custom-${item.emoji.id}` : code;

        return (
          <div
            key={key}
            id={`emoji-ac-option-${key}`}
            role="option"
            tabIndex={0}
            aria-selected={i === selectedIdx}
            className={`conversation-composer-emoji-ac-item${i === selectedIdx ? ' conversation-composer-emoji-ac-item--selected' : ''}`}
            onMouseDown={(e) => {
              e.preventDefault();
              onSelect(code, display ?? `:${code}:`);
            }}
          >
            {isCustom ? (
              <img
                src={item.emoji.cdnUrl}
                alt={item.emoji.name}
                className="conversation-composer-emoji-ac-emoji conversation-composer-emoji-ac-emoji--custom"
                decoding="async"
              />
            ) : (
              <span className="conversation-composer-emoji-ac-emoji">{display}</span>
            )}
            <span className="conversation-composer-emoji-ac-code">:{code}:</span>
          </div>
        );
      })}
    </div>
  );
});

export const ComposerMentionAutocomplete = memo(function ComposerMentionAutocomplete({
  suggestions,
  selectedIdx,
  onSelect,
}: {
  suggestions: MentionSuggestion[];
  selectedIdx: number;
  onSelect: (id: string, displayText: string) => void;
}) {
  if (suggestions.length === 0) return null;

  return (
    <div className="conversation-composer-mention-ac" role="listbox" id="mention-ac-listbox">
      {suggestions.map((s, i) => (
        <div
          key={s.id}
          id={`mention-ac-option-${s.id}`}
          role="option"
          tabIndex={0}
          aria-selected={i === selectedIdx}
          className={`conversation-composer-mention-ac-item${i === selectedIdx ? ' conversation-composer-mention-ac-item--selected' : ''}${s.kind === 'group' ? ' conversation-composer-mention-ac-item--group' : ''}`}
          onMouseDown={(ev) => {
            ev.preventDefault();
            onSelect(s.id, s.displayText);
          }}
        >
          {s.kind === 'group' ? (
            <span className="conversation-composer-mention-ac-avatar conversation-composer-mention-ac-avatar--group" aria-hidden>
              @
            </span>
          ) : s.user.avatarUrl ? (
            <img src={s.user.avatarUrl} alt="" className="conversation-composer-mention-ac-avatar" />
          ) : (
            <span className="conversation-composer-mention-ac-avatar conversation-composer-mention-ac-avatar--placeholder">
              {s.displayText[0]?.toUpperCase() ?? '?'}
            </span>
          )}
          <span className="conversation-composer-mention-ac-name">{s.displayText}</span>
          {s.kind === 'group' ? (
            <span className="conversation-composer-mention-ac-username">@{s.displayText}</span>
          ) : s.user.username ? (
            <span className="conversation-composer-mention-ac-username">@{s.user.username}</span>
          ) : null}
        </div>
      ))}
    </div>
  );
});

export type PageTagSuggestion = {
  id: string;
  displayText: string;
  icon?: AppIconName;
};

export const ComposerPageTagAutocomplete = memo(function ComposerPageTagAutocomplete({
  suggestions,
  selectedIdx,
  onSelect,
}: {
  suggestions: PageTagSuggestion[];
  selectedIdx: number;
  onSelect: (id: string, displayText: string) => void;
}) {
  if (suggestions.length === 0) return null;

  return (
    <div className="conversation-composer-pagetag-ac" role="listbox" id="pagetag-ac-listbox">
      {suggestions.map((s, i) => (
        <div
          key={s.id}
          id={`pagetag-ac-option-${s.id}`}
          role="option"
          tabIndex={0}
          aria-selected={i === selectedIdx}
          className={`conversation-composer-pagetag-ac-item${i === selectedIdx ? ' conversation-composer-pagetag-ac-item--selected' : ''}`}
          onMouseDown={(ev) => {
            ev.preventDefault();
            onSelect(s.id, s.displayText);
          }}
        >
          <span className="conversation-composer-pagetag-ac-icon" aria-hidden>
            {s.icon ? <Icon name={s.icon} /> : '#'}
          </span>
          <span className="conversation-composer-pagetag-ac-name">{s.displayText}</span>
        </div>
      ))}
    </div>
  );
});
