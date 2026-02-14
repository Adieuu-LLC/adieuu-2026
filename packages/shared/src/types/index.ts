// Shared TypeScript types
// These are inferred from Zod schemas where possible

import type { z } from 'zod';
import type { UserSchema, ApiResponseSchema } from '../schemas';

// Infer types from schemas for single source of truth
export type User = z.infer<typeof UserSchema>;
export type ApiResponse<T> = {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
};

// Platform detection
export type Platform = 'web' | 'desktop' | 'mobile';

// Common utility types
export type Prettify<T> = {
  [K in keyof T]: T[K];
} & {};
