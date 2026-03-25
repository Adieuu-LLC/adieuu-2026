/**
 * User Preferences model.
 *
 * Stores per-account preferences such as theme selection and custom themes.
 * One document per user; created lazily on first preference write.
 *
 * @module models/user-preferences
 */

import type { BaseDocument } from './base';
import type { ObjectId } from 'mongodb';

export interface UserPreferencesDocument extends BaseDocument {
  userId: ObjectId;
  themeId?: string;
  customThemes?: StoredThemeDefinition[];
}

/**
 * Mirrors the shared ThemeDefinition shape but lives in the API layer
 * so we don't import from the client-side shared package at the model level.
 */
export interface StoredThemeDefinition {
  id: string;
  name: string;
  description: string;
  version: number;
  colors: Record<string, string>;
}

export interface CreateUserPreferencesInput {
  userId: ObjectId;
  themeId?: string;
  customThemes?: StoredThemeDefinition[];
}

export interface UpdateUserPreferencesInput {
  themeId?: string;
  customThemes?: StoredThemeDefinition[];
}
