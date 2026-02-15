# Implementation Phases

## Overview

Phased approach to implementing the authentication system. Each phase builds on the previous and results in a working, testable increment.

---

## Phase 0: Foundation (Pre-requisites)

### Objectives
- Migrate API from Fastify to Bun.serve
- Set up MongoDB and Redis connections
- Establish project structure and patterns

### Tasks

#### 0.1 Bun Migration
- [ ] Update `apps/api/package.json` to use Bun
- [ ] Remove Fastify dependencies
- [ ] Create `Bun.serve()` entry point
- [ ] Implement basic request routing
- [ ] Implement middleware pipeline
- [ ] Verify health endpoint works

**Estimated time:** 2-3 hours

#### 0.2 Database Setup
- [ ] Add MongoDB driver (`mongodb` package)
- [ ] Add Redis client (recommend `ioredis` or Bun's built-in?)
- [ ] Create connection utilities
- [ ] Create base repository pattern
- [ ] Add connection health checks to /health endpoint

**Estimated time:** 2-3 hours

#### 0.3 Project Structure
- [ ] Create directory structure per architecture doc
- [ ] Set up config/environment handling
- [ ] Create shared utilities (response helpers, etc.)
- [ ] Create `sanitizeString` placeholder
- [ ] Set up error handling patterns

**Estimated time:** 1-2 hours

### Deliverables
- API running on Bun.serve
- MongoDB and Redis connected
- Health endpoint showing DB connection status
- Project structure in place

---

## Phase 1: Core Auth - Request OTP

### Objectives
- Implement OTP request flow
- Set up messaging providers
- Implement basic rate limiting

### Tasks

#### 1.1 OTP Service
- [ ] Create OTP generation utility (secure random)
- [ ] Create OTP hashing utility
- [ ] Create OTP storage in Redis (with TTL)
- [ ] Add attempt tracking

**Estimated time:** 2-3 hours

#### 1.2 Messaging Providers
- [ ] Create email provider interface
- [ ] Implement SES provider
- [ ] Create SMS provider interface
- [ ] Implement TextMagic provider
- [ ] Create provider factory

**Estimated time:** 3-4 hours

#### 1.3 Request OTP Endpoint
- [ ] Create POST /api/auth/request route
- [ ] Implement Zod validation schema
- [ ] Add sanitization via sanitizeString
- [ ] Implement rate limiting (Redis-based)
- [ ] Add jitter for timing protection
- [ ] Return consistent response (anti-enumeration)

**Estimated time:** 3-4 hours

#### 1.4 Magic Link Generation
- [ ] Create magic link token format
- [ ] Implement HMAC signature
- [ ] Include in email template
- [ ] Test link parsing

**Estimated time:** 1-2 hours

### Deliverables
- POST /api/auth/request working
- OTPs sent via email (SES) and SMS (TextMagic)
- Magic links included in emails
- Rate limiting active

---

## Phase 2: Core Auth - Verify & Sessions

### Objectives
- Implement OTP verification
- Create session management
- Implement CSRF protection

### Tasks

#### 2.1 User Repository
- [ ] Create User model interface
- [ ] Create UserRepository class
- [ ] Implement findByEmail/findByPhone
- [ ] Implement create/update methods
- [ ] Set up MongoDB indexes

**Estimated time:** 2-3 hours

#### 2.2 Session Service
- [ ] Create Session model interface
- [ ] Implement session ID generation (256-bit)
- [ ] Implement session storage in Redis
- [ ] Create session cookie helpers
- [ ] Implement session lookup

**Estimated time:** 2-3 hours

#### 2.3 Verify OTP Endpoint
- [ ] Create POST /api/auth/verify route
- [ ] Implement constant-time OTP comparison
- [ ] Implement find-or-create user logic
- [ ] Create session on success
- [ ] Set secure session cookie
- [ ] Generate and return CSRF token
- [ ] Add jitter for timing protection

**Estimated time:** 3-4 hours

#### 2.4 CSRF Middleware
- [ ] Implement CSRF validation using Bun.CSRF
- [ ] Add to mutation endpoints
- [ ] Handle CSRF errors gracefully

**Estimated time:** 1-2 hours

#### 2.5 Auth Middleware
- [ ] Create session validation middleware
- [ ] Extract user from session
- [ ] Add to protected routes

**Estimated time:** 1-2 hours

### Deliverables
- POST /api/auth/verify working
- Sessions created and stored
- Secure cookies set
- CSRF protection active
- Auth middleware ready

---

## Phase 3: Session Management

### Objectives
- Implement remaining auth endpoints
- Add session listing and revocation

### Tasks

#### 3.1 Auth Endpoints
- [ ] Implement GET /api/auth/me
- [ ] Implement POST /api/auth/refresh
- [ ] Implement POST /api/auth/logout

**Estimated time:** 2-3 hours

#### 3.2 Session Management Endpoints
- [ ] Implement GET /api/users/me/sessions
- [ ] Implement DELETE /api/users/me/sessions/:id
- [ ] Implement DELETE /api/users/me/sessions (all)

**Estimated time:** 2-3 hours

#### 3.3 Audit Logging
- [ ] Create AuditLog model
- [ ] Create AuditRepository
- [ ] Log auth events (request, verify, logout)
- [ ] Set up TTL index for auto-cleanup

**Estimated time:** 2-3 hours

### Deliverables
- Full auth flow complete
- Session management working
- Audit trail in place

---

## Phase 4: Account Linking

### Objectives
- Allow users to link email and phone to same account
- Handle identifier conflicts securely

### Tasks

#### 4.1 Link Request
- [ ] Implement POST /api/auth/link
- [ ] Reuse OTP request logic
- [ ] Store pending link in Redis

**Estimated time:** 1-2 hours

#### 4.2 Link Verification
- [ ] Implement POST /api/auth/link/verify
- [ ] Check for identifier conflicts
- [ ] Update user with new identifier
- [ ] Mark identifier as verified

**Estimated time:** 2-3 hours

#### 4.3 Edge Cases
- [ ] Handle linking already-taken identifier (generic error)
- [ ] Handle re-linking same identifier (no-op)
- [ ] Audit log linking events

**Estimated time:** 1-2 hours

### Deliverables
- Users can link email to phone-based account
- Users can link phone to email-based account
- Conflicts handled securely

---

## Phase 5: Security Hardening

### Objectives
- Implement remaining security measures
- Add security headers
- Comprehensive testing

### Tasks

#### 5.1 Security Headers Middleware
- [ ] Create security headers middleware
- [ ] Apply to all responses
- [ ] Configure CSP appropriately

**Estimated time:** 1-2 hours

#### 5.2 Additional Rate Limiting
- [ ] Add per-user rate limits
- [ ] Add global IP rate limits
- [ ] Add rate limit headers to responses

**Estimated time:** 1-2 hours

#### 5.3 Account Lockout
- [ ] Track failed attempts per user
- [ ] Implement temporary lockout after threshold
- [ ] Add unlock mechanism

**Estimated time:** 1-2 hours

#### 5.4 Security Review
- [ ] Review all endpoints for security issues
- [ ] Verify all inputs sanitized
- [ ] Verify all outputs don't leak info
- [ ] Test rate limiting effectiveness
- [ ] Test CSRF protection

**Estimated time:** 2-3 hours

### Deliverables
- All security measures implemented
- Security headers in place
- Rate limiting comprehensive
- System hardened

---

## Phase 6: Frontend Integration

### Objectives
- Create shared auth utilities for frontend
- Implement auth UI components
- Wire up web/desktop/mobile apps

### Tasks

#### 6.1 Shared Auth Utilities
- [ ] Create auth API client in @chadder/shared
- [ ] Create auth state management hooks
- [ ] Handle session cookie (web) vs secure storage (mobile)

**Estimated time:** 3-4 hours

#### 6.2 Auth UI Components
- [ ] Create login/signup form component
- [ ] Create OTP input component
- [ ] Create magic link handler page
- [ ] Create logout button

**Estimated time:** 3-4 hours

#### 6.3 Platform Integration
- [ ] Web: Cookie-based auth
- [ ] Desktop (Electron): Cookie-based (web view)
- [ ] Mobile (Capacitor): Secure storage for session

**Estimated time:** 4-6 hours

### Deliverables
- Auth working across all platforms
- Consistent UI experience
- Secure token storage per platform

---

## Timeline Summary

| Phase | Description | Estimated Time |
|-------|-------------|----------------|
| Phase 0 | Foundation | 5-8 hours |
| Phase 1 | Request OTP | 9-13 hours |
| Phase 2 | Verify & Sessions | 9-14 hours |
| Phase 3 | Session Management | 6-9 hours |
| Phase 4 | Account Linking | 4-7 hours |
| Phase 5 | Security Hardening | 5-9 hours |
| Phase 6 | Frontend Integration | 10-14 hours |
| **Total** | | **48-74 hours** |

---

## Dependencies

### External Packages to Request Approval

| Package | Purpose | Phase |
|---------|---------|-------|
| `mongodb` | MongoDB driver | 0 |
| `ioredis` | Redis client | 0 |
| `@aws-sdk/client-ses` | SES email sending | 1 |
| (TextMagic SDK or fetch) | SMS sending | 1 |

### Environment Setup

Before Phase 0:
- [ ] MongoDB 8 running (local or Atlas)
- [ ] Redis 7 running (local or cloud)
- [ ] AWS credentials for SES
- [ ] TextMagic API credentials
- [ ] Environment variables configured

---

## Testing Strategy

### Unit Tests
- OTP generation and hashing
- sanitizeString function
- Session ID generation
- Rate limit logic

### Integration Tests
- Full auth flow (request -> verify -> me -> logout)
- Rate limiting behavior
- Session management
- Account linking

### Security Tests
- Enumeration resistance
- Timing attack resistance
- CSRF protection
- Rate limit effectiveness

---

## Rollback Plan

Each phase is independently deployable. If issues arise:

1. **Phase rollback**: Revert to previous phase's code
2. **Feature flags**: Consider adding flags for new auth (can fall back to mock)
3. **Database migrations**: All changes are additive (no destructive migrations)
