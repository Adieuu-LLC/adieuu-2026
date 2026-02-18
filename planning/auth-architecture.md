# Auth Architecture

## Overview

Passwordless authentication system using magic links (email) and OTP codes (SMS/email) with server-side session management.

## Stack

| Component | Technology | Version | Notes |
|-----------|------------|---------|-------|
| Runtime | Bun | 1.3.9 | Native HTTP server via `Bun.serve()` |
| Primary DB | MongoDB | 8.0+ | User data, audit logs |
| Session Store | Redis | 7.x | Sessions, rate limiting, OTP storage |
| Email | AWS SES | - | Abstracted via provider interface |
| SMS | TextMagic | - | OTP delivery |

## Directory Structure

```
apps/api/
├── src/
│   ├── index.ts                 # Bun.serve entry point
│   ├── server.ts                # Server configuration
│   ├── routes/
│   │   ├── index.ts             # Route aggregator
│   │   ├── health.ts
│   │   └── auth/
│   │       ├── index.ts
│   │       ├── request-otp.ts   # POST /auth/request
│   │       ├── verify-otp.ts    # POST /auth/verify
│   │       ├── refresh.ts       # POST /auth/refresh
│   │       └── logout.ts        # POST /auth/logout
│   ├── middleware/
│   │   ├── index.ts
│   │   ├── security-headers.ts  # Helmet-like security headers
│   │   ├── rate-limit.ts        # Redis-backed rate limiting
│   │   ├── csrf.ts              # CSRF token validation
│   │   ├── auth.ts              # Session validation
│   │   └── request-id.ts        # Request tracing
│   ├── services/
│   │   ├── auth/
│   │   │   ├── otp.service.ts   # OTP generation/verification
│   │   │   └── session.service.ts
│   │   └── messaging/
│   │       ├── index.ts         # Provider interface
│   │       ├── email/
│   │       │   ├── provider.interface.ts
│   │       │   └── ses.provider.ts
│   │       └── sms/
│   │           ├── provider.interface.ts
│   │           └── textmagic.provider.ts
│   ├── repositories/
│   │   ├── base.repository.ts   # Base repository pattern
│   │   ├── user.repository.ts
│   │   ├── session.repository.ts
│   │   └── audit.repository.ts
│   ├── db/
│   │   ├── mongo.ts             # MongoDB connection
│   │   ├── redis.ts             # Redis connection
│   │   └── collections.ts       # Collection name constants
│   ├── models/
│   │   ├── user.model.ts        # TypeScript interfaces (no ORM)
│   │   ├── session.model.ts
│   │   └── otp.model.ts
│   ├── utils/
│   │   ├── sanitize.ts          # sanitizeString placeholder
│   │   ├── crypto.ts            # Secure random, hashing
│   │   ├── timing.ts            # Jitter, constant-time compare
│   │   └── response.ts          # Standardized API responses
│   └── config/
│       ├── index.ts             # Environment config
│       └── constants.ts         # App constants
```

## Database Design

### MongoDB Collections

#### `users`
```typescript
interface User {
  _id: ObjectId;
  
  // Contact methods (at least one required)
  email?: string;           // Normalized, lowercase
  emailVerified: boolean;
  phone?: string;           // E.164 format
  phoneVerified: boolean;
  
  // Profile
  displayName?: string;
  
  // Security
  failedAttempts: number;
  lockedUntil?: Date;
  
  // Metadata
  createdAt: Date;
  updatedAt: Date;
  lastLoginAt?: Date;
}
```

**Indexes:**
- `{ email: 1 }` - unique, sparse
- `{ phone: 1 }` - unique, sparse
- `{ createdAt: 1 }` - for analytics

#### `audit_logs`
```typescript
interface AuditLog {
  _id: ObjectId;
  userId?: ObjectId;        // Null for failed attempts
  action: AuditAction;      // 'login_request' | 'login_success' | 'login_failure' | 'logout'
  identifier: string;       // Hashed email/phone
  ipAddress: string;        // Hashed or encrypted
  userAgent: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}
```

**Indexes:**
- `{ userId: 1, createdAt: -1 }`
- `{ createdAt: 1 }` - TTL index (90 days retention)

### Redis Data Structures

#### OTP Storage
```
Key: otp:{hashedIdentifier}
Value: {
  code: string,           // Hashed OTP
  attempts: number,
  createdAt: number
}
TTL: 10 minutes
```

#### Sessions
```
Key: session:{sessionId}
Value: {
  userId: string,
  createdAt: number,
  expiresAt: number,
  userAgent: string,
  ipHash: string
}
TTL: 30 days (refresh extends)
```

#### Rate Limiting
```
Key: ratelimit:{action}:{identifier}
Value: count (integer)
TTL: Window size (e.g., 60 seconds)
```

## Repository Pattern

No ORM. Direct MongoDB driver with typed interfaces.

```typescript
// Base repository interface
interface IRepository<T> {
  findById(id: string): Promise<T | null>;
  findOne(filter: Filter<T>): Promise<T | null>;
  create(data: Omit<T, '_id'>): Promise<T>;
  updateById(id: string, update: Partial<T>): Promise<T | null>;
  deleteById(id: string): Promise<boolean>;
}

// User repository with auth-specific methods
interface IUserRepository extends IRepository<User> {
  findByEmail(email: string): Promise<User | null>;
  findByPhone(phone: string): Promise<User | null>;
  findByIdentifier(identifier: string): Promise<User | null>;
  incrementFailedAttempts(userId: string): Promise<void>;
  resetFailedAttempts(userId: string): Promise<void>;
  lockAccount(userId: string, until: Date): Promise<void>;
}
```

## Messaging Provider Interface

Abstracted for hot-swapping providers.

```typescript
// Email provider interface
interface IEmailProvider {
  readonly name: string;
  send(options: {
    to: string;
    subject: string;
    text: string;
    html?: string;
  }): Promise<{ messageId: string }>;
}

// SMS provider interface
interface ISmsProvider {
  readonly name: string;
  send(options: {
    to: string;      // E.164 format
    message: string;
  }): Promise<{ messageId: string }>;
}

// Factory pattern for providers
const emailProvider = createEmailProvider('ses'); // or 'sendgrid', 'resend'
const smsProvider = createSmsProvider('textmagic');
```

## Environment Variables

```bash
# Server
PORT=4000
HOST=0.0.0.0
NODE_ENV=development

# MongoDB
MONGODB_URI=mongodb://localhost:27017/adieuu
MONGODB_DB_NAME=adieuu

# Redis
REDIS_URL=redis://localhost:6379

# AWS SES
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
SES_FROM_EMAIL=noreply@adieuu.app

# TextMagic
TEXTMAGIC_USERNAME=
TEXTMAGIC_API_KEY=
TEXTMAGIC_FROM=Adieuu

# Security
CSRF_SECRET=           # For CSRF token generation
SESSION_SECRET=        # For session ID generation
OTP_SECRET=           # For OTP generation (HMAC)

# Client URLs (for magic links)
WEB_APP_URL=http://localhost:3000
```

## Security Considerations

See `security-checklist.md` for full details. Key points:

1. **OTP Storage**: OTPs are hashed before storage (SHA-256)
2. **Session IDs**: Cryptographically secure random (256-bit)
3. **Rate Limiting**: Per-IP and per-identifier limits
4. **Timing Attacks**: Constant-time comparison for OTPs
5. **Enumeration**: Consistent responses regardless of user existence
6. **CSRF**: Native Bun.CSRF for state-changing operations
