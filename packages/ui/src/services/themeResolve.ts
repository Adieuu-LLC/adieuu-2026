import type { ThemeDefinition } from '@adieuu/shared';
import { getBuiltinThemeDefinition } from '../constants/builtinThemes';

export function resolveTheme(
  themeOrId: string | ThemeDefinition,
  customThemes: ThemeDefinition[]
): ThemeDefinition | null {
  if (typeof themeOrId === 'object') return themeOrId;
  const builtin = getBuiltinThemeDefinition(themeOrId);
  if (builtin) return builtin;
  return customThemes.find((theme) => theme.id === themeOrId) ?? null;
}
