import { createContext } from 'react';
import type { ConversationsContextValue } from './types';

export const ConversationsContext = createContext<ConversationsContextValue | null>(null);
