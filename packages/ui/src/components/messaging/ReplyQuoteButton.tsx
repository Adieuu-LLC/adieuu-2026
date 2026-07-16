import type { ReplyQuotePayload } from '../../pages/conversations/conversationUtils';

export function ReplyQuoteButton({ replyQuote }: { replyQuote: ReplyQuotePayload }) {
  const { text, quotedAuthor, onQuoteClick } = replyQuote;
  const ariaLabel = quotedAuthor ? `${quotedAuthor.displayName}: ${text}` : text;

  return (
    <button
      type="button"
      className="dm-message-reply-quote"
      onClick={(e) => {
        e.stopPropagation();
        onQuoteClick();
      }}
      aria-label={ariaLabel}
    >
      <span className="dm-message-reply-quote-inner">
        {quotedAuthor && (
          <>
            <span className="dm-message-reply-quote-avatar" aria-hidden>
              {quotedAuthor.avatarUrl ? (
                <img src={quotedAuthor.avatarUrl} alt="" className="dm-message-reply-quote-avatar-img" />
              ) : (
                <span className="dm-message-reply-quote-avatar-placeholder">
                  {quotedAuthor.displayName.charAt(0).toUpperCase()}
                </span>
              )}
            </span>
            <span className="dm-message-reply-quote-author">{quotedAuthor.displayName}</span>
          </>
        )}
        <span className="dm-message-reply-quote-snippet">{text}</span>
      </span>
    </button>
  );
}
