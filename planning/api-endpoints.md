# API Endpoints

## Base URL

- Development: `http://localhost:4000/api`
- Production: `https://api.adieuu.app/api`

## Common Headers

### Request Headers
| Header | Required | Description |
|--------|----------|-------------|
| `Content-Type` | Yes | `application/json` |
| `X-CSRF-Token` | For mutations | CSRF token from auth response |
| `X-Request-ID` | No | Client-generated request ID for tracing |

### Response Headers
| Header | Description |
|--------|-------------|
| `X-Request-ID` | Request ID (echoed or generated) |
| `X-RateLimit-Limit` | Max requests in window |
| `X-RateLimit-Remaining` | Remaining requests |
| `X-RateLimit-Reset` | Window reset timestamp |

## Standard Response Format

### Success
```typescript
{
  success: true,
  data: T,
  meta?: {
    requestId: string;
    timestamp: string;
  }
}
```

### Error
```typescript
{
  success: false,
  error: {
    code: string;      // Machine-readable code
    message: string;   // Human-readable message
  },
  meta?: {
    requestId: string;
    timestamp: string;
  }
}
```

## Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `VALIDATION_ERROR` | 400 | Request body validation failed |
| `INVALID_CREDENTIALS` | 401 | Invalid OTP or session |
| `UNAUTHORIZED` | 401 | No valid session |
| `CSRF_INVALID` | 403 | CSRF token missing or invalid |
| `FORBIDDEN` | 403 | Action not allowed |
| `NOT_FOUND` | 404 | Resource not found |
| `RATE_LIMITED` | 429 | Too many requests |
| `INTERNAL_ERROR` | 500 | Server error |

---

## Health Endpoints

### GET /api/health

Check API health status.

**Auth Required:** No

**Response:**
```typescript
{
  success: true,
  data: {
    status: "healthy",
    timestamp: "2026-02-14T12:00:00.000Z",
    version: "0.1.0"
  }
}
```

---

## Auth Endpoints

### POST /api/auth/request

Request an OTP code to be sent via email or SMS.

**Auth Required:** No

**Rate Limits:**
- 3 per identifier per 15 minutes
- 10 per IP per 15 minutes

**Request Body:**
```typescript
{
  identifier: string;  // Email address or phone number
  type: "email" | "sms";
}
```

**Validation (Zod):**
```typescript
const RequestOtpSchema = z.object({
  identifier: z.string().min(1).max(255),
  type: z.enum(['email', 'sms']),
}).refine((data) => {
  if (data.type === 'email') {
    return z.string().email().safeParse(data.identifier).success;
  }
  if (data.type === 'sms') {
    return isValidPhoneNumber(data.identifier);
  }
  return false;
}, {
  message: "Invalid identifier format for the specified type"
});
```

**Success Response (200):**
```typescript
{
  success: true,
  message: "If this account exists, a code has been sent."
}
```

**Note:** Always returns 200 with same message regardless of whether user exists (anti-enumeration).

---

### POST /api/auth/verify

Verify an OTP code and create a session.

**Auth Required:** No

**Rate Limits:**
- 5 per identifier per 15 minutes
- 20 per IP per 15 minutes

**Request Body:**
```typescript
{
  identifier: string;  // Email or phone used to request OTP
  code: string;        // 6-digit OTP code
}
```

**Validation (Zod):**
```typescript
const VerifyOtpSchema = z.object({
  identifier: z.string().min(1).max(255),
  code: z.string().length(6).regex(/^\d{6}$/),
});
```

**Success Response (200):**
```typescript
{
  success: true,
  data: {
    user: {
      id: "507f1f77bcf86cd799439011",
      email: "user@example.com",
      phone: null,
      displayName: null,
      createdAt: "2026-02-14T12:00:00.000Z"
    },
    csrfToken: "abc123..."
  }
}
```

**Sets Cookie:**
```
Set-Cookie: __Host-session=<session-id>; Secure; HttpOnly; SameSite=Strict; Path=/; Max-Age=2592000
```

**Error Response (401):**
```typescript
{
  success: false,
  error: {
    code: "INVALID_CREDENTIALS",
    message: "Invalid or expired code."
  }
}
```

---

### POST /api/auth/refresh

Refresh the current session, extending its expiry.

**Auth Required:** Yes (session cookie)

**Request Body:** None

**Success Response (200):**
```typescript
{
  success: true,
  data: {
    expiresAt: "2026-03-16T12:00:00.000Z"
  }
}
```

**Error Response (401):**
```typescript
{
  success: false,
  error: {
    code: "UNAUTHORIZED",
    message: "Session expired or invalid."
  }
}
```

---

### POST /api/auth/logout

End the current session.

**Auth Required:** Yes (session cookie + CSRF)

**Request Body:** None

**Success Response (200):**
```typescript
{
  success: true,
  message: "Logged out successfully."
}
```

**Clears Cookie:**
```
Set-Cookie: __Host-session=; Secure; HttpOnly; SameSite=Strict; Path=/; Max-Age=0
```

---

### GET /api/auth/me

Get current authenticated user info.

**Auth Required:** Yes (session cookie)

**Success Response (200):**
```typescript
{
  success: true,
  data: {
    user: {
      id: "507f1f77bcf86cd799439011",
      email: "user@example.com",
      emailVerified: true,
      phone: "+15551234567",
      phoneVerified: true,
      displayName: "John Doe",
      createdAt: "2026-02-14T12:00:00.000Z",
      lastLoginAt: "2026-02-14T12:00:00.000Z"
    },
    session: {
      createdAt: "2026-02-14T12:00:00.000Z",
      expiresAt: "2026-03-16T12:00:00.000Z"
    }
  }
}
```

---

### POST /api/auth/link

Link an additional email or phone to the account.

**Auth Required:** Yes (session cookie + CSRF)

**Request Body:**
```typescript
{
  identifier: string;  // Email or phone to link
  type: "email" | "sms";
}
```

**Success Response (200):**
```typescript
{
  success: true,
  message: "Verification code sent."
}
```

**Note:** User must then verify the OTP via `/api/auth/link/verify`

---

### POST /api/auth/link/verify

Verify the OTP for linking an additional identifier.

**Auth Required:** Yes (session cookie + CSRF)

**Request Body:**
```typescript
{
  identifier: string;
  code: string;
}
```

**Success Response (200):**
```typescript
{
  success: true,
  data: {
    user: {
      // Updated user with new linked identifier
    }
  }
}
```

---

## User Endpoints

### PATCH /api/users/me

Update current user's profile.

**Auth Required:** Yes (session cookie + CSRF)

**Request Body:**
```typescript
{
  displayName?: string;  // Max 100 chars
}
```

**Validation (Zod):**
```typescript
const UpdateUserSchema = z.object({
  displayName: z.string().min(1).max(100).optional(),
});
```

**Success Response (200):**
```typescript
{
  success: true,
  data: {
    user: {
      id: "507f1f77bcf86cd799439011",
      displayName: "New Name",
      // ... rest of user fields
    }
  }
}
```

---

### GET /api/users/me/sessions

List all active sessions for the current user.

**Auth Required:** Yes (session cookie)

**Success Response (200):**
```typescript
{
  success: true,
  data: {
    sessions: [
      {
        id: "session-id-hash",  // Partial hash, not full ID
        current: true,
        createdAt: "2026-02-14T12:00:00.000Z",
        lastActivityAt: "2026-02-14T12:00:00.000Z",
        userAgent: "Mozilla/5.0...",
        ipCity: "New York",  // Optional geo lookup
        ipCountry: "US"
      }
    ]
  }
}
```

---

### DELETE /api/users/me/sessions/:id

Revoke a specific session.

**Auth Required:** Yes (session cookie + CSRF)

**Success Response (200):**
```typescript
{
  success: true,
  message: "Session revoked."
}
```

---

### DELETE /api/users/me/sessions

Revoke all sessions except the current one.

**Auth Required:** Yes (session cookie + CSRF)

**Success Response (200):**
```typescript
{
  success: true,
  message: "All other sessions revoked.",
  data: {
    revokedCount: 3
  }
}
```

---

## Rate Limiting Details

### Windows and Limits

| Endpoint | Limit | Window | Identifier |
|----------|-------|--------|------------|
| POST /auth/request | 3 | 15 min | Per email/phone |
| POST /auth/request | 10 | 15 min | Per IP |
| POST /auth/verify | 5 | 15 min | Per email/phone |
| POST /auth/verify | 20 | 15 min | Per IP |
| POST /auth/link | 3 | 15 min | Per user |
| All authenticated | 100 | 1 min | Per user |
| All endpoints | 1000 | 1 min | Per IP |

### Rate Limit Response (429)

```typescript
{
  success: false,
  error: {
    code: "RATE_LIMITED",
    message: "Too many requests. Please try again later."
  }
}
```

**Headers:**
```
Retry-After: 60
X-RateLimit-Limit: 5
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1707912000
```
