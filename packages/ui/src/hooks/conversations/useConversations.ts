import { useContext } from 'react';
import { ConversationsContext } from './context';
import type { ConversationsContextValue } from './types';

export function useConversations(): ConversationsContextValue {
  const context = useContext(ConversationsContext);
  if (!context) {
    throw new Error('useConversations must be used within a ConversationsProvider');
  }
  return context;
}
