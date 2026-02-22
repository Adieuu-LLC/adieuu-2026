# Friends & Notifications Architecture

## Overview

This document captures the architectural decisions for the Friends system and Notifications infrastructure in Adieuu. Friendships are between **Identities**, not Users, maintaining the cryptographic separation between User accounts and their anonymous Identities.

**Core Principles:**
- Friendships exist between Identities only (User accounts are never exposed)
- Privacy-preserving: ignored friend requests do not notify the sender
- Mutual consent required: either both parties add each other, or recipient accepts request
- Notifications delivered via polling (WebSockets can be added later for real-time)

---

## 1. Friend Request Flow

### 1.1 Request Lifecycle

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         FRIEND REQUEST FLOW                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  Identity A                                                 Identity B   │
│      │                                                          │        │
│      │  ──────── sends friend request ────────────────────────► │        │
│      │                                                          │        │
│      │                                    [Notification created]│        │
│      │                                                          │        │
│      │                                         B can:           │        │
│      │                                         ├─ Accept        │        │
│      │                                         ├─ Ignore        │        │
│      │                                         └─ Add A back    │        │
│      │                                                          │        │
│      │  If ACCEPTED or MUTUAL ADD:                              │        │
│      │  ◄───────── both become friends ─────────────────────────│        │
│      │  [Both receive "now friends" notification]               │        │
│      │                                                          │        │
│      │  If IGNORED:                                             │        │
│      │  [Nothing happens - A is NOT notified]                   │        │
│      │                                                          │        │
└─────────────────────────────────────────────────────────────────────────┘
```

### 1.2 States

| State | Description | Visible to Sender? |
|-------|-------------|-------------------|
| `pending` | Request sent, awaiting response | Yes (as "sent") |
| `accepted` | Recipient accepted, now friends | Yes |
| `ignored` | Recipient chose to ignore | **No** (appears as "pending" to sender) |
| `cancelled` | Sender cancelled before response | N/A |

**Note:** Friend requests do not expire. They remain pending until explicitly accepted, ignored, or cancelled.

### 1.3 Mutual Add Logic

When A sends a request to B:
1. Check if B has already sent a pending request to A
2. If yes: auto-accept both, create friendship, notify both parties
3. If no: create pending request, notify B only

---

## 2. Database Design

### 2.1 MongoDB Collections

#### `friend_requests`

Stores pending, ignored, and resolved friend requests.

```typescript
interface FriendRequest {
  _id: ObjectId;
  
  /** Identity that sent the request */
  fromIdentityId: string;
  
  /** Identity that received the request */
  toIdentityId: string;
  
  /** Current status of the request */
  status: 'pending' | 'accepted' | 'ignored' | 'cancelled';
  
  /** When the request was created */
  createdAt: Date;
  
  /** When the status last changed */
  updatedAt: Date;
  
  /** When the recipient responded (if applicable) */
  respondedAt?: Date;
}
```

**Indexes:**
- `{ fromIdentityId: 1, toIdentityId: 1 }` - unique, prevents duplicate requests
- `{ toIdentityId: 1, status: 1 }` - for fetching incoming requests
- `{ fromIdentityId: 1, status: 1 }` - for fetching sent requests
- `{ status: 1, updatedAt: 1 }` - for admin queries

#### `blocks`

Tracks when one identity has blocked another. Blocking prevents friend requests and other interactions.

```typescript
interface Block {
  _id: ObjectId;
  
  /** Identity that initiated the block */
  blockerIdentityId: string;
  
  /** Identity that is blocked */
  blockedIdentityId: string;
  
  /** When the block was created */
  createdAt: Date;
}
```

**Indexes:**
- `{ blockerIdentityId: 1, blockedIdentityId: 1 }` - unique, prevents duplicate blocks
- `{ blockedIdentityId: 1, blockerIdentityId: 1 }` - for checking "am I blocked by X?"
- `{ blockerIdentityId: 1 }` - for listing blocked identities

**Privacy Note:** Blocks are one-directional. When A blocks B:
- A will not see friend requests from B (auto-ignored silently)
- B cannot tell they are blocked (requests appear to send normally)
- A will not see B in search results (future enhancement)
- Existing friendship is removed when block is created

#### `friendships`

Denormalized friendship records for efficient querying. Two records per friendship.

```typescript
interface Friendship {
  _id: ObjectId;
  
  /** The identity whose friends list this record belongs to */
  identityId: string;
  
  /** The friend's identity */
  friendIdentityId: string;
  
  /** When the friendship was established */
  createdAt: Date;
  
  /** Friendship metadata */
  metadata: {
    /** How the friendship was created */
    source: 'request_accepted' | 'mutual_add';
    /** Original request ID (if from request) */
    requestId?: ObjectId;
  };
}
```

**Indexes:**
- `{ identityId: 1, friendIdentityId: 1 }` - unique, compound for lookups
- `{ identityId: 1, createdAt: -1 }` - for listing friends by recency
- `{ friendIdentityId: 1 }` - for reverse lookups

**Note:** Two records are created per friendship (A→B and B→A) to enable efficient "get my friends" queries without complex aggregation.

#### `notifications`

General notification system for friend requests, messages, and other events.

```typescript
interface Notification {
  _id: ObjectId;
  
  /** Identity that receives this notification */
  recipientIdentityId: string;
  
  /** Notification type */
  type: NotificationType;
  
  /** Type-specific payload */
  data: NotificationData;
  
  /** Whether the user has seen this notification */
  read: boolean;
  
  /** When the notification was created */
  createdAt: Date;
}

type NotificationType = 
  | 'friend_request_received'
  | 'friend_request_accepted'
  | 'friendship_established'
  | 'message_received'
  | 'mention';

interface FriendRequestNotificationData {
  requestId: string;
  fromIdentityId: string;
  fromDisplayName: string;
  fromUsername: string;
  fromAvatarUrl?: string;
}

interface FriendshipEstablishedNotificationData {
  friendIdentityId: string;
  friendDisplayName: string;
  friendUsername: string;
  friendAvatarUrl?: string;
}

type NotificationData = 
  | FriendRequestNotificationData 
  | FriendshipEstablishedNotificationData
  | Record<string, unknown>;
```

**Indexes:**
- `{ recipientIdentityId: 1, read: 1, createdAt: -1 }` - for fetching unread notifications
- `{ recipientIdentityId: 1, createdAt: -1 }` - for fetching all notifications
- `{ recipientIdentityId: 1, type: 1 }` - for filtering by type

**Note:** Notifications are not auto-deleted. Users explicitly manage their notifications (mark read/unread, delete).

---

## 3. API Endpoints

### 3.1 Friend Requests

#### Send Friend Request
```
POST /api/friends/request
Authorization: Identity session required

Request:
{
  "toIdentityId": "string"
}

Response (201 Created):
{
  "success": true,
  "data": {
    "requestId": "string",
    "status": "pending" | "accepted",  // accepted if mutual add
    "message": "Friend request sent" | "You are now friends"
  }
}

Errors:
- 400: Cannot send friend request to yourself
- 400: Already friends with this identity
- 400: Friend request already pending
- 404: Identity not found
- 429: Too many friend requests (rate limited)
```

#### Get Incoming Requests
```
GET /api/friends/requests/incoming
Authorization: Identity session required

Query params:
- status?: 'pending' (default: pending only)
- limit?: number (default: 20, max: 50)
- cursor?: string (pagination)

Response:
{
  "success": true,
  "data": {
    "requests": [
      {
        "id": "string",
        "fromIdentity": PublicIdentity,
        "createdAt": "ISO8601"
      }
    ],
    "cursor": "string | null"
  }
}
```

#### Get Sent Requests
```
GET /api/friends/requests/sent
Authorization: Identity session required

Query params:
- limit?: number (default: 20, max: 50)
- cursor?: string

Response:
{
  "success": true,
  "data": {
    "requests": [
      {
        "id": "string",
        "toIdentity": PublicIdentity,
        "status": "pending",  // Only show pending to sender
        "createdAt": "ISO8601"
      }
    ],
    "cursor": "string | null"
  }
}
```

#### Accept Friend Request
```
POST /api/friends/request/:requestId/accept
Authorization: Identity session required

Response:
{
  "success": true,
  "data": {
    "friend": PublicIdentity
  },
  "message": "You are now friends"
}

Errors:
- 404: Request not found or not addressed to you
- 400: Request already responded to
```

#### Ignore Friend Request
```
POST /api/friends/request/:requestId/ignore
Authorization: Identity session required

Response:
{
  "success": true
}

Note: No notification is sent to the sender.
```

#### Cancel Friend Request
```
DELETE /api/friends/request/:requestId
Authorization: Identity session required

Response:
{
  "success": true
}

Errors:
- 404: Request not found or not sent by you
- 400: Request already responded to
```

### 3.2 Friendships

#### Get Friends List
```
GET /api/friends
Authorization: Identity session required

Query params:
- limit?: number (default: 50, max: 100)
- cursor?: string
- search?: string (filter by username/displayName)

Response:
{
  "success": true,
  "data": {
    "friends": [
      {
        "identity": PublicIdentity,
        "friendsSince": "ISO8601"
      }
    ],
    "cursor": "string | null",
    "total": number
  }
}
```

#### Check Friendship Status
```
GET /api/friends/status/:identityId
Authorization: Identity session required

Response:
{
  "success": true,
  "data": {
    "status": "friends" | "request_sent" | "request_received" | "none",
    "friendsSince"?: "ISO8601",
    "requestId"?: "string"
  }
}
```

#### Remove Friend
```
DELETE /api/friends/:identityId
Authorization: Identity session required

Response:
{
  "success": true
}

Note: Removes friendship for both parties. No notification sent.
```

### 3.3 Notifications

#### Get Notifications
```
GET /api/notifications
Authorization: Identity session required

Query params:
- since?: ISO8601 timestamp (only notifications after this time)
- limit?: number (default: 50, max: 100)
- unreadOnly?: boolean (default: false)
- types?: string (comma-separated NotificationType values)

Response:
{
  "success": true,
  "data": {
    "notifications": [
      {
        "id": "string",
        "type": NotificationType,
        "data": NotificationData,
        "read": boolean,
        "createdAt": "ISO8601"
      }
    ],
    "unreadCount": number
  }
}
```

#### Mark Notifications as Read
```
POST /api/notifications/read
Authorization: Identity session required

Request:
{
  "notificationIds": ["string"] | "all"
}

Response:
{
  "success": true,
  "data": {
    "markedCount": number
  }
}
```

#### Mark Notifications as Unread
```
POST /api/notifications/unread
Authorization: Identity session required

Request:
{
  "notificationIds": ["string"] | "all"
}

Response:
{
  "success": true,
  "data": {
    "markedCount": number
  }
}
```

#### Delete Notifications
```
DELETE /api/notifications
Authorization: Identity session required

Request:
{
  "notificationIds": ["string"] | "all"
}

Response:
{
  "success": true,
  "data": {
    "deletedCount": number
  }
}
```

#### Get Unread Count
```
GET /api/notifications/count
Authorization: Identity session required

Response:
{
  "success": true,
  "data": {
    "unread": number,
    "byType": {
      "friend_request_received": number,
      "message_received": number
    }
  }
}
```

### 3.4 Blocks

#### Block an Identity
```
POST /api/blocks
Authorization: Identity session required

Request:
{
  "identityId": "string"
}

Response:
{
  "success": true,
  "message": "Identity blocked"
}

Side effects:
- Any existing friendship is removed (both directions)
- Any pending friend requests between the identities are cancelled/ignored
- Future friend requests from blocked identity are silently ignored

Errors:
- 400: Cannot block yourself
- 400: Already blocked
- 404: Identity not found
```

#### Unblock an Identity
```
DELETE /api/blocks/:identityId
Authorization: Identity session required

Response:
{
  "success": true,
  "message": "Identity unblocked"
}

Errors:
- 404: Block not found
```

#### Get Blocked Identities
```
GET /api/blocks
Authorization: Identity session required

Query params:
- limit?: number (default: 50, max: 100)
- cursor?: string

Response:
{
  "success": true,
  "data": {
    "blocks": [
      {
        "identity": PublicIdentity,
        "blockedAt": "ISO8601"
      }
    ],
    "cursor": "string | null"
  }
}
```

#### Check if Blocked
```
GET /api/blocks/check/:identityId
Authorization: Identity session required

Response:
{
  "success": true,
  "data": {
    "blocked": boolean,
    "blockedAt"?: "ISO8601"
  }
}

Note: This only checks if YOU have blocked the identity, 
not if they have blocked you (that would leak information).
```

---

## 4. Polling Strategy

### 4.1 Client-Side Polling

For MVP, the client polls for notifications. WebSockets can be added later for real-time.

```typescript
interface PollingConfig {
  /** Interval when app is in foreground (ms) */
  foregroundInterval: 30_000;  // 30 seconds
  
  /** Interval when app is backgrounded/idle (ms) */
  backgroundInterval: 120_000;  // 2 minutes
  
  /** Interval when actively chatting (ms) */
  activeInterval: 5_000;  // 5 seconds (for typing indicators, etc.)
}
```

### 4.2 Efficient Polling

To minimize bandwidth and server load:

1. **Conditional Requests**: Use `If-Modified-Since` header
   - Server returns `304 Not Modified` if no new notifications
   - Client sends timestamp of last received notification

2. **Cursor-Based Pagination**: Use `since` parameter
   - Client tracks last notification timestamp
   - Only fetch notifications newer than that

3. **Unread Count Endpoint**: Lightweight check
   - `/api/notifications/count` returns just numbers
   - Full fetch only when count changes

### 4.3 Future: WebSocket Enhancement

When adding WebSocket support:
- Notifications pushed in real-time
- Polling becomes fallback for reconnection
- Same notification format for both transports

---

## 5. Rate Limiting

### 5.1 Friend Requests

| Action | Limit | Window |
|--------|-------|--------|
| Send friend request | 20 | per hour |
| Send friend request (global) | 100 | per day |
| Accept/Ignore request | 100 | per hour |

### 5.2 Blocks

| Action | Limit | Window |
|--------|-------|--------|
| Block identity | 50 | per hour |
| Unblock identity | 50 | per hour |

### 5.3 Notifications Polling

| Action | Limit | Window |
|--------|-------|--------|
| GET /api/notifications | 120 | per minute |
| GET /api/notifications/count | 300 | per minute |
| DELETE /api/notifications | 60 | per minute |

---

## 6. Privacy Considerations

### 6.1 Information Leakage Prevention

1. **Ignored Requests**: Sender sees "pending" status indefinitely
   - Cannot distinguish between ignored and not-yet-seen
   - No expiration; sender must cancel if they want to retract

2. **Blocked Identities**:
   - Requests from blocked identities are auto-ignored silently
   - Blocked identity cannot tell they're blocked
   - Block appears to succeed but has no effect from blocked party's perspective

3. **Friend Removal**:
   - When A removes B, no notification sent to B
   - B discovers removal only when viewing friends list or attempting to message

### 6.2 Enumeration Protection

- Cannot enumerate all friends of an arbitrary identity
- Friend lists are private to each identity
- "Mutual friends" feature (if implemented) requires both to be your friend

---

## 7. Implementation Phases

### Phase 1: Core Infrastructure
- [ ] Create `blocks` collection and repository
- [ ] Implement block/unblock endpoints
- [ ] Create `friend_requests` collection and repository
- [ ] Implement send/accept/ignore/cancel endpoints
- [ ] Add mutual-add detection logic
- [ ] Add block-check to friend request flow

### Phase 2: Notifications System
- [ ] Create `notifications` collection and repository
- [ ] Implement notification creation for friend events
- [ ] Add polling endpoints (get, mark read/unread, delete)
- [ ] Frontend: Notification bell/badge

### Phase 3: Friends Management
- [ ] Create `friendships` collection and repository
- [ ] Implement friends list endpoint
- [ ] Implement friendship status check
- [ ] Implement remove friend
- [ ] Frontend: Friends list page

### Phase 4: Frontend Integration
- [ ] Add Friend button flow (currently stubbed)
- [ ] Friend request accept/ignore UI
- [ ] Blocked identities management page
- [ ] Notifications panel/page

### Phase 5: Polish
- [ ] Rate limiting for all endpoints
- [ ] Frontend: Loading states and error handling
- [ ] Accessibility review

---

## 8. Security Checklist

**Authentication & Authorization:**
- [ ] All friend/notification/block endpoints require valid identity session
- [ ] Cannot send request to own identity
- [ ] Cannot accept/ignore request not addressed to you
- [ ] Cannot cancel request you didn't send
- [ ] Cannot block yourself
- [ ] Cannot unblock someone you haven't blocked

**Privacy Protection:**
- [ ] No timing side-channels for ignore/block detection
- [ ] Friendship status only visible to involved parties
- [ ] Block status only visible to the blocker
- [ ] Notifications cannot leak User identity

**Abuse Prevention:**
- [ ] Rate limiting on friend requests
- [ ] Rate limiting on notification polling
- [ ] Blocked identities cannot send friend requests (silent ignore)

**Data Integrity:**
- [ ] Blocking removes existing friendship (both directions)
- [ ] Blocking cancels/ignores pending requests (both directions)
- [ ] Duplicate friend requests prevented at DB level
- [ ] Duplicate blocks prevented at DB level

---

## 9. Design Decisions (Resolved)

| Decision | Resolution | Rationale |
|----------|------------|-----------|
| Blocking | Included in Phase 1 | Required for safety; blocks affect friend requests |
| Request Expiration | No expiration | Simpler; user can cancel if needed |
| Friend Limit | No limit | No artificial restrictions for now |
| Notification Retention | User-managed | No auto-cleanup; users mark read/unread or delete |

---

## 10. Privacy & Security Summary

**Identity Isolation:**
- All friend/notification data is tied to Identity, not User
- No database field or API response can link back to User account
- Even if database is compromised, Identity ↔ User link is cryptographically protected

**Information Leakage Prevention:**
- Ignored requests appear as "pending" to sender indefinitely
- Blocks are invisible to the blocked party
- Friend removal is silent (no notification)
- Cannot check if someone has blocked you

**Rate Limiting:**
- Prevents friend request spam
- Prevents notification polling abuse
