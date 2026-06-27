/**
 * Message editing: max count of prior snapshots kept on the message document.
 * After this many successful edits, the client must send a new message.
 */
export const MAX_MESSAGE_REVISIONS = 3;
