/**
 * Conversations hook — re-exports from `hooks/conversations`.
 *
 * @module hooks/useConversations
 */

export type {
  DecryptedConversation,
  DisplayMessage,
  SendMessageErrorResult,
  ConversationsContextValue,
} from './conversations';
export { ConversationsProvider, useConversations } from './conversations';
