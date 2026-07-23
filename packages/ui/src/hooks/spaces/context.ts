import { createContext } from 'react';
import type { SpacesContextValue } from './types';

export const SpacesContext = createContext<SpacesContextValue | null>(null);
