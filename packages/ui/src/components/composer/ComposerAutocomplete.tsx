import type { MentionableUser } from './composerTypes';

export function ComposerShortcodeAutocomplete({
  suggestions,
  selectedIdx,
  onSelect,
}: {
  suggestions: [string, string][];
  selectedIdx: number;
  onSelect: (code: string, emoji: string) => void;
}) {
  if (suggestions.length === 0) return null;

  return (
    <ul className="conversation-composer-emoji-ac" role="listbox" id="emoji-ac-listbox">
      {suggestions.map(([code, emoji], i) => (
        <li
          key={code}
          id={`emoji-ac-option-${code}`}
          role="option"
          aria-selected={i === selectedIdx}
          className={`conversation-composer-emoji-ac-item${i === selectedIdx ? ' conversation-composer-emoji-ac-item--selected' : ''}`}
          onMouseDown={(e) => {
            e.preventDefault();
            onSelect(code, emoji);
          }}
        >
          <span className="conversation-composer-emoji-ac-emoji">{emoji}</span>
          <span className="conversation-composer-emoji-ac-code">:{code}:</span>
        </li>
      ))}
    </ul>
  );
}

export function ComposerMentionAutocomplete({
  suggestions,
  selectedIdx,
  onSelect,
}: {
  suggestions: { id: string; user: MentionableUser; displayText: string }[];
  selectedIdx: number;
  onSelect: (id: string, displayText: string) => void;
}) {
  if (suggestions.length === 0) return null;

  return (
    <ul className="conversation-composer-mention-ac" role="listbox" id="mention-ac-listbox">
      {suggestions.map((s, i) => (
        <li
          key={s.id}
          id={`mention-ac-option-${s.id}`}
          role="option"
          aria-selected={i === selectedIdx}
          className={`conversation-composer-mention-ac-item${i === selectedIdx ? ' conversation-composer-mention-ac-item--selected' : ''}`}
          onMouseDown={(ev) => {
            ev.preventDefault();
            onSelect(s.id, s.displayText);
          }}
        >
          {s.user.avatarUrl ? (
            <img src={s.user.avatarUrl} alt="" className="conversation-composer-mention-ac-avatar" />
          ) : (
            <span className="conversation-composer-mention-ac-avatar conversation-composer-mention-ac-avatar--placeholder">
              {s.displayText[0]?.toUpperCase() ?? '?'}
            </span>
          )}
          <span className="conversation-composer-mention-ac-name">{s.displayText}</span>
          {s.user.username && (
            <span className="conversation-composer-mention-ac-username">@{s.user.username}</span>
          )}
        </li>
      ))}
    </ul>
  );
}
