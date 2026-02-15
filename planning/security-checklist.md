# Security Checklist

## Overview

Security considerations for the Chadder authentication system. This is a living document to track security measures and their implementation status.

---

## 1. Anti-Enumeration

Prevent attackers from discovering valid user accounts.

### Measures

| Measure | Description | Status |
|---------|-------------|--------|
| Consistent responses | Same response message regardless of user existence | Planned |
| Consistent timing | Add jitter (100-500ms) to mask processing time differences | Planned |
| Generic errors | "Invalid or expired code" instead of specific errors | Planned |
| Rate limiting | Prevent bulk enumeration attempts | Planned |

### Implementation Notes

```typescript
// Always respond the same way
const GENERIC_OTP_SENT = "If this account exists, a code has been sent.";
const GENERIC_INVALID = "Invalid or expired code.";

// Add jitter to response time
async function addJitter(min = 100, max = 500): Promise<void> {
  const jitter = Math.floor(Math.random() * (max - min + 1)) + min;
  await Bun.sleep(jitter);
}
```

---

## 2. CSRF Protection

Prevent cross-site request forgery attacks.

### Measures

| Measure | Description | Status |
|---------|-------------|--------|
| CSRF tokens | Use Bun.CSRF.generate() for token generation | Planned |
| Token binding | CSRF token bound to session | Planned |
| Header validation | Require X-CSRF-Token header on mutations | Planned |
| SameSite cookies | Session cookie with SameSite=Strict | Planned |
| Origin validation | Validate Origin/Referer headers | Planned |

### Implementation Notes

```typescript
// Generate CSRF token bound to session
const csrfToken = Bun.CSRF.generate(sessionSecret);

// Verify on mutations
const isValid = Bun.CSRF.verify(providedToken, sessionSecret);
```

### Protected Endpoints

All state-changing endpoints require CSRF validation:
- POST /api/auth/logout
- POST /api/auth/link
- POST /api/auth/link/verify
- PATCH /api/users/me
- DELETE /api/users/me/sessions/*

### Unprotected Endpoints

These don't need CSRF (no session to exploit):
- POST /api/auth/request
- POST /api/auth/verify
- GET endpoints (read-only)

---

## 3. Rate Limiting

Prevent brute force and denial of service attacks.

### Strategy: Sliding Window with Redis

```typescript
async function checkRateLimit(
  key: string,
  limit: number,
  windowSeconds: number
): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
  const now = Date.now();
  const windowStart = now - (windowSeconds * 1000);
  
  // Use Redis sorted set for sliding window
  // ZREMRANGEBYSCORE key -inf windowStart
  // ZADD key now now
  // ZCARD key
  // EXPIRE key windowSeconds
  
  const count = await redis.zCard(key);
  const allowed = count < limit;
  
  return {
    allowed,
    remaining: Math.max(0, limit - count - 1),
    resetAt: Math.ceil((windowStart + windowSeconds * 1000) / 1000),
  };
}
```

### Limits Configuration

```typescript
const RATE_LIMITS = {
  // Auth endpoints (strict)
  'auth:request:identifier': { limit: 3, window: 900 },   // 3 per 15 min
  'auth:request:ip': { limit: 10, window: 900 },          // 10 per 15 min
  'auth:verify:identifier': { limit: 5, window: 900 },    // 5 per 15 min
  'auth:verify:ip': { limit: 20, window: 900 },           // 20 per 15 min
  
  // General (relaxed)
  'global:user': { limit: 100, window: 60 },              // 100 per min
  'global:ip': { limit: 1000, window: 60 },               // 1000 per min
} as const;
```

---

## 4. Input Validation & Sanitization

Prevent injection attacks and ensure data integrity.

### sanitizeString Utility

```typescript
type SanitizationType = 
  | 'email'
  | 'phone'
  | 'displayName'
  | 'alphanumeric'
  | 'numeric';

/**
 * Sanitizes a string based on the specified type.
 * 
 * @param input - The string to sanitize
 * @param type - The type of sanitization to apply
 * @returns The sanitized string
 * 
 * TODO: Implement actual sanitization logic
 */
function sanitizeString(input: string, type: SanitizationType): string {
  // Placeholder - to be implemented
  // Should handle:
  // - Trimming whitespace
  // - Normalizing unicode (NFKC)
  // - Removing null bytes
  // - Type-specific validation/normalization
  return input;
}
```

### Email Normalization

- Lowercase the entire email
- Trim whitespace
- Consider normalizing gmail dots (user.name@gmail.com = username@gmail.com)
- Apply sanitizeString before any database operations

### Phone Normalization

- Convert to E.164 format (+1234567890)
- Remove formatting characters
- Validate country code

### Validation with Zod

All input validated before processing:

```typescript
import { z } from 'zod';

const EmailSchema = z.string()
  .email()
  .max(255)
  .transform((email) => sanitizeString(email.toLowerCase(), 'email'));

const PhoneSchema = z.string()
  .min(10)
  .max(20)
  .transform((phone) => sanitizeString(normalizePhone(phone), 'phone'));
```

---

## 5. Session Security

Protect user sessions from hijacking and misuse.

### Measures

| Measure | Description | Status |
|---------|-------------|--------|
| Secure random IDs | 256-bit session IDs using crypto.getRandomValues | Planned |
| HTTP-only cookies | Prevent JavaScript access to session cookie | Planned |
| Secure flag | Only send cookie over HTTPS | Planned |
| SameSite=Strict | Prevent CSRF via cookie leakage | Planned |
| __Host- prefix | Additional cookie security (no subdomain/path override) | Planned |
| Session binding | Store IP hash and user agent for validation | Planned |
| Idle timeout | Sessions expire after inactivity | Planned |
| Absolute timeout | Sessions have maximum lifetime | Planned |

### Cookie Configuration

```typescript
const SESSION_COOKIE_OPTIONS = {
  name: '__Host-session',
  httpOnly: true,
  secure: true,             // Always in production
  sameSite: 'strict',
  path: '/',
  maxAge: 30 * 24 * 60 * 60, // 30 days
} as const;
```

### Session Validation

On each authenticated request:
1. Validate session exists in Redis
2. Check session not expired
3. Optionally: Verify IP hash matches (configurable strictness)
4. Update lastActivityAt timestamp

---

## 6. OTP Security

Secure one-time password generation and verification.

### Measures

| Measure | Description | Status |
|---------|-------------|--------|
| Secure generation | Use crypto.getRandomValues, not Math.random | Planned |
| Hashed storage | SHA-256 hash OTP before storing | Planned |
| Constant-time compare | Prevent timing attacks during verification | Planned |
| Expiration | 10-minute TTL for OTPs | Planned |
| Attempt limiting | Max 5 attempts per OTP | Planned |
| Single use | Delete OTP immediately on successful verification | Planned |
| Rate limiting | Limit OTP request frequency | Planned |

### Secure Generation

```typescript
function generateSecureOtp(length = 6): string {
  const buffer = new Uint32Array(1);
  crypto.getRandomValues(buffer);
  const max = Math.pow(10, length);
  return (buffer[0] % max).toString().padStart(length, '0');
}
```

### Constant-Time Comparison

```typescript
import { timingSafeEqual } from 'crypto';

function constantTimeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    // Still do the comparison to maintain constant time
    timingSafeEqual(Buffer.from(a), Buffer.from(a));
    return false;
  }
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}
```

---

## 7. Security Headers

HTTP headers to enhance browser security.

### Required Headers

```typescript
const SECURITY_HEADERS = {
  // Prevent MIME type sniffing
  'X-Content-Type-Options': 'nosniff',
  
  // Prevent clickjacking
  'X-Frame-Options': 'DENY',
  
  // XSS protection (legacy, but harmless)
  'X-XSS-Protection': '1; mode=block',
  
  // Referrer policy
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  
  // Permissions policy
  'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
  
  // Content Security Policy (adjust as needed)
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' https://api.chadder.app",
  
  // HSTS (production only)
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
} as const;
```

### Implementation

```typescript
function addSecurityHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    headers.set(key, value);
  }
  
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
```

---

## 8. Cryptographic Requirements

### Algorithms

| Purpose | Algorithm | Notes |
|---------|-----------|-------|
| OTP hashing | SHA-256 | With identifier and secret salt |
| Session IDs | crypto.getRandomValues | 256 bits |
| CSRF tokens | Bun.CSRF (built-in) | |
| Password hashing | N/A | No passwords in this system |
| Data encryption | AES-256-GCM | For any sensitive data at rest |

### Key Management

- Secrets stored in environment variables
- Different secrets per environment (dev/staging/prod)
- Secrets should be rotated periodically
- Consider AWS Secrets Manager for production

---

## 9. Audit Logging

Track security-relevant events for forensics and compliance.

### Events to Log

| Event | Data Logged |
|-------|-------------|
| OTP requested | Identifier (hashed), IP (hashed), type, timestamp |
| OTP verified (success) | User ID, identifier (hashed), IP (hashed), timestamp |
| OTP verified (failure) | Identifier (hashed), IP (hashed), attempt count, timestamp |
| Session created | User ID, session ID (partial), IP (hashed), user agent |
| Session revoked | User ID, session ID (partial), reason |
| Account linked | User ID, identifier type, timestamp |
| Account locked | User ID, reason, duration |

### Log Format

```typescript
interface AuditLogEntry {
  timestamp: string;
  eventType: string;
  userId?: string;
  identifierHash?: string;
  ipHash: string;
  userAgent?: string;
  success: boolean;
  metadata?: Record<string, unknown>;
}
```

### Retention

- Audit logs retained for 90 days minimum
- Use MongoDB TTL index for automatic cleanup
- Consider longer retention for compliance requirements

---

## 10. Dependency Security

### Measures

| Measure | Description | Status |
|---------|-------------|--------|
| Minimal dependencies | Avoid unnecessary packages | Planned |
| Lock file | pnpm-lock.yaml for reproducible builds | Done |
| Audit | Run `pnpm audit` regularly | Planned |
| Updates | Keep dependencies updated | Planned |
| Review | Manually review new dependencies | Policy |

### Approved External Packages

| Package | Purpose | Status |
|---------|---------|--------|
| zod | Schema validation | Approved |
| mongodb | Database driver | Approved |
| ioredis | Redis client | Pending approval |
| @aws-sdk/client-ses | Email delivery | Pending approval |

---

## 11. Error Handling

### Principles

1. Never expose internal errors to clients
2. Log full error details server-side
3. Return generic error messages
4. Include request ID for correlation

### Error Response

```typescript
// Internal error - full details logged
logger.error('Database error', { 
  error: err,
  requestId,
  operation: 'findUser',
});

// Client response - generic message
return {
  success: false,
  error: {
    code: 'INTERNAL_ERROR',
    message: 'An unexpected error occurred.',
  },
  meta: { requestId },
};
```

---

## 12. Future Considerations

- [ ] WebAuthn/Passkey support
- [ ] Biometric authentication for mobile
- [ ] Hardware key support (YubiKey)
- [ ] IP reputation checking
- [ ] Device fingerprinting
- [ ] Anomaly detection for suspicious login patterns
- [ ] Account recovery flow (secure, with verification)
