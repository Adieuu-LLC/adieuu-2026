/**
 * Users controller module.
 *
 * Contains the business logic for user-related endpoints, including
 * user retrieval, creation, and profile management.
 *
 * @module routes/users/controller
 */

import { sanitizeString } from '../../utils/sanitize';

/**
 * Represents a user entity in the system.
 *
 * @interface User
 * @property id - Unique identifier (UUID v4)
 * @property email - User's email address (sanitized)
 * @property name - User's display name
 * @property createdAt - ISO 8601 timestamp of account creation
 * @property updatedAt - ISO 8601 timestamp of last profile update
 */
export interface User {
  id: string;
  email: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Result type for user retrieval operations.
 *
 * This is a discriminated union type that represents either a successful
 * user lookup or a failure with an error message.
 *
 * @typedef GetUserResult
 */
export type GetUserResult =
  | { success: true; user: User }
  | { success: false; error: string };

/**
 * Retrieves a user by their unique identifier.
 *
 * Looks up a user in the database by their UUID and returns their
 * public profile information.
 *
 * @param id - The user's UUID
 * @returns A promise resolving to the user data or an error
 *
 * @remarks
 * Currently returns mock data. Replace with actual database lookup
 * when the user collection is implemented.
 *
 * @example
 * ```typescript
 * const result = await getUserById('550e8400-e29b-41d4-a716-446655440000');
 *
 * if (result.success) {
 *   console.log('User found:', result.user.name);
 * } else {
 *   console.error('User not found:', result.error);
 * }
 * ```
 */
export async function getUserById(id: string): Promise<GetUserResult> {
  // TODO: Replace with actual database lookup
  const mockUser: User = {
    id,
    email: sanitizeString('user@example.com', 'email').value,
    name: 'Example User',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  return {
    success: true,
    user: mockUser,
  };
}
