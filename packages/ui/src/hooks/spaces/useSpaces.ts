import { useContext } from 'react';
import { SpacesContext } from './context';
import type { SpacesContextValue } from './types';

export function useSpaces(): SpacesContextValue {
  const context = useContext(SpacesContext);
  if (!context) {
    throw new Error('useSpaces must be used within a SpacesProvider');
  }
  return context;
}
