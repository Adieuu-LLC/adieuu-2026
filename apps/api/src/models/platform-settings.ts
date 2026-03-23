import type { ObjectId } from 'mongodb';
import type { BaseDocument } from './base';

/**
 * Supported value types for platform_settings documents.
 */
export type PlatformSettingValueType =
  | 'boolean'
  | 'string'
  | 'number'
  | 'stringArray'
  | 'objectIdArray';

/**
 * Value payload; must match `valueType` on the document.
 */
export type PlatformSettingValue =
  | boolean
  | string
  | number
  | string[]
  | ObjectId[];

/**
 * Platform-wide configuration row (one document per `key`).
 */
export interface PlatformSettingsDocument extends BaseDocument {
  /** Unique setting identifier */
  key: string;
  description: string;
  valueType: PlatformSettingValueType;
  value: PlatformSettingValue;
  /** Actor user id (hex) or `system` for migrations */
  lastUpdatedBy: string;
}
