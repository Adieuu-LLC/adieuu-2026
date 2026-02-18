# Authentication Flow

## Overview

Passwordless authentication via magic link (email) or OTP code (email/SMS). Users can authenticate with either email or phone number.

## Flow Diagrams

### 1. Request OTP Flow

```
┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│  Client  │     │   API    │     │  Redis   │     │  MongoDB │     │ Email/SMS│
└────┬─────┘     └────┬─────┘     └────┬─────┘     └────┬─────┘     └────┬─────┘
     │                │                │                │                │
     │ POST /auth/request             │                │                │
     │ {identifier, type}             │                │                │
     │───────────────>│                │                │                │
     │                │                │                │                │
     │                │ Check rate limit               │                │
     │                │───────────────>│                │                │
     │                │<───────────────│                │                │
     │                │                │                │                │
     │                │ Sanitize & normalize           │                │
     │                │ identifier                     │                │
     │                │                │                │                │
     │                │ Lookup user (optional)         │                │
     │                │────────────────────────────────>│                │
     │                │<────────────────────────────────│                │
     │                │                │                │                │
     │                │ Generate OTP   │                │                │
     │                │ (6-digit code) │                │                │
     │                │                │                │                │
     │                │ Store hashed OTP               │                │
     │                │───────────────>│                │                │
     │                │                │                │                │
     │                │ Send OTP (async)               │                │
     │                │─────────────────────────────────────────────────>│
     │                │                │                │                │
     │                │ Add jitter delay               │                │
     │                │ (100-500ms)    │                │                │
     │                │                │                │                │
     │ 200 OK         │                │                │                │
     │ {message: "Code sent"}         │                │                │
     │<───────────────│                │                │                │
```

### 2. Verify OTP Flow

```
┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│  Client  │     │   API    │     │  Redis   │     │  MongoDB │
└────┬─────┘     └────┬─────┘     └────┬─────┘     └────┬─────┘
     │                │                │                │
     │ POST /auth/verify              │                │
     │ {identifier, code}             │                │
     │───────────────>│                │                │
     │                │                │                │
     │                │ Check rate limit               │
     │                │───────────────>│                │
     │                │<───────────────│                │
     │                │                │                │
     │                │ Get stored OTP │                │
     │                │───────────────>│                │
     │                │<───────────────│                │
     │                │                │                │
     │                │ Constant-time compare          │
     │                │ (hash(input) vs stored)        │
     │                │                │                │
     │                │ [If valid]     │                │
     │                │ Delete OTP     │                │
     │                │───────────────>│                │
     │                │                │                │
     │                │ Find/Create user               │
     │                │────────────────────────────────>│
     │                │<────────────────────────────────│
     │                │                │                │
     │                │ Create session │                │
     │                │───────────────>│                │
     │                │                │                │
     │                │ Log audit event                │
     │                │────────────────────────────────>│
     │                │                │                │
     │ 200 OK         │                │                │
     │ Set-Cookie: session=xxx        │                │
     │ {user, csrfToken}              │                │
     │<───────────────│                │                │
```

### 3. Magic Link Flow (Email Only)

Magic links are an alternative to manual OTP entry. The link contains the OTP embedded in the URL.

```
Email contains:
https://app.adieuu.com/auth/verify?token={base64(identifier + ':' + otp)}&signature={hmac}

When clicked:
1. Client extracts token and signature
2. Client calls POST /auth/verify with decoded identifier and OTP
3. Same verification flow as manual OTP
```

## Detailed Specifications

### Request OTP Endpoint

**Endpoint:** `POST /api/auth/request`

**Request:**
```typescript
{
  identifier: string;  // Email or phone number
  type: 'email' | 'sms';  // Delivery method
}
```

**Validation:**
- If `type === 'email'`: identifier must be valid email format
- If `type === 'sms'`: identifier must be valid phone (E.164 or common formats)

**Processing:**
1. Validate CSRF token (from header)
2. Check rate limits:
   - 3 requests per identifier per 15 minutes
   - 10 requests per IP per 15 minutes
3. Sanitize identifier via `sanitizeString(identifier, 'email' | 'phone')`
4. Normalize identifier (lowercase email, E.164 phone)
5. Check if user exists (for audit only, don't change response)
6. Generate 6-digit OTP using secure random
7. Hash OTP with SHA-256 before storing
8. Store in Redis with 10-minute TTL
9. Queue message delivery (fire and forget)
10. Add random jitter delay (100-500ms)
11. Return success response

**Response (always 200 for valid format):**
```typescript
{
  success: true,
  message: "If this account exists, a code has been sent."
}
```

### Verify OTP Endpoint

**Endpoint:** `POST /api/auth/verify`

**Request:**
```typescript
{
  identifier: string;  // Email or phone
  code: string;        // 6-digit OTP
}
```

**Processing:**
1. Validate CSRF token
2. Check rate limits:
   - 5 attempts per identifier per 15 minutes
   - 20 attempts per IP per 15 minutes
3. Sanitize and normalize identifier
4. Retrieve stored OTP hash from Redis
5. Hash provided code
6. Constant-time comparison
7. If invalid:
   - Increment attempt counter
   - Add jitter delay
   - Return generic error
8. If valid:
   - Delete OTP from Redis
   - Find or create user
   - Mark identifier as verified
   - Create server-side session
   - Set secure HTTP-only cookie
   - Generate CSRF token for session
   - Log successful auth

**Response (success):**
```typescript
{
  success: true,
  data: {
    user: {
      id: string;
      email?: string;
      phone?: string;
      displayName?: string;
    },
    csrfToken: string;  // For subsequent requests
  }
}
```

**Response (failure - always same message):**
```typescript
{
  success: false,
  error: {
    code: "INVALID_CREDENTIALS",
    message: "Invalid or expired code."
  }
}
```

### Refresh Session

**Endpoint:** `POST /api/auth/refresh`

**Request:** None (uses session cookie)

**Processing:**
1. Validate session cookie exists
2. Look up session in Redis
3. Validate session not expired
4. Extend session TTL
5. Optionally rotate session ID (for high-security mode)

**Response:**
```typescript
{
  success: true,
  data: {
    expiresAt: string;  // ISO timestamp
  }
}
```

### Logout

**Endpoint:** `POST /api/auth/logout`

**Request:** None (uses session cookie)

**Processing:**
1. Validate CSRF token
2. Delete session from Redis
3. Clear session cookie
4. Log audit event

**Response:**
```typescript
{
  success: true,
  message: "Logged out successfully."
}
```

## OTP Specifications

| Property | Value |
|----------|-------|
| Length | 6 digits |
| Character set | 0-9 |
| TTL | 10 minutes |
| Max attempts | 5 per OTP |
| Lockout | 15 minutes after max attempts |

### Generation
```typescript
function generateOtp(): string {
  const buffer = crypto.getRandomValues(new Uint32Array(1));
  const otp = (buffer[0] % 1000000).toString().padStart(6, '0');
  return otp;
}
```

### Storage
```typescript
function hashOtp(otp: string, identifier: string): string {
  // Include identifier to prevent OTP reuse across accounts
  return sha256(otp + ':' + identifier + ':' + OTP_SECRET);
}
```

## Session Specifications

| Property | Value |
|----------|-------|
| ID length | 256 bits (32 bytes) |
| Encoding | Base64 URL-safe |
| TTL | 30 days |
| Refresh | Extends TTL to 30 days from last activity |
| Cookie name | `__Host-session` |
| Cookie flags | `Secure; HttpOnly; SameSite=Strict; Path=/` |

### Session Data (Redis)
```typescript
interface Session {
  userId: string;
  createdAt: number;      // Unix timestamp
  lastActivityAt: number;
  expiresAt: number;
  userAgent: string;
  ipHash: string;         // Hashed IP for audit
  csrfToken: string;      // Bound to session
}
```

## Magic Link Format

For email-based auth, users can click a link instead of entering the OTP manually.

**URL Structure:**
```
{WEB_APP_URL}/auth/verify?t={token}&s={signature}
```

**Token:** Base64 URL-encoded `{identifier}:{otp}`

**Signature:** HMAC-SHA256 of token using `OTP_SECRET`

**Client Processing:**
1. Extract `t` and `s` from URL
2. Verify signature client-side (optional UX improvement)
3. Decode token to get identifier and OTP
4. Call `POST /api/auth/verify` with extracted values

## Account Linking

Users can have both email and phone attached to their account.

### Add Email to Phone-authenticated User
1. User is logged in via phone
2. User calls `POST /api/auth/link` with `{type: 'email', identifier: 'user@example.com'}`
3. OTP sent to email
4. User verifies OTP
5. Email added to account, marked as verified

### Add Phone to Email-authenticated User
Same flow, reversed.

### Conflict Resolution
If the identifier being linked already belongs to another account:
- Return generic error (prevents enumeration)
- Log the attempt for security review
