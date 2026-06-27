/**
 * Default max HTTP request body size (bytes) for JSON APIs.
 * Keep in sync with Terraform `api_max_request_body_bytes` default.
 */
export const DEFAULT_MAX_REQUEST_BODY_BYTES = 250 * 1024;

/**
 * Default max body (bytes) for unauthenticated clients when the route is not
 * on the allowlist (see API router). Webhook and other signed callbacks use
 * {@link DEFAULT_MAX_REQUEST_BODY_BYTES} instead. Keep small to limit abuse
 * surface; must not exceed the authenticated cap.
 */
export const DEFAULT_ANONYMOUS_MAX_REQUEST_BODY_BYTES = 16 * 1024;
