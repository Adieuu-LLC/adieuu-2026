# Direct Messaging v1 - Implementation Plan

This document outlines the implementation phases for DM v1 as specified in `direct-messaging-v1.md`. Each phase is designed to be small, testable, and build on the previous phase. Tests must be written for each phase before implementation begins, and must all pass before the next phase can begin.

**Approach:**
- Implement in dependency order
- Each phase has clear testable outcomes
- API and client tasks can often be parallelized within a phase
- Each phase must be fully tested and passing, and all components must typecheck and build, before moving to the next

---

## Phase 1: Identity Key Infrastructure [COMPLETE]

**Goal:** Generate, store, and retrieve identity keys. Foundation for all encryption.

**Dependencies:** None (foundational)

**Status:** All API and Client tasks complete. All tests passing.

### API Tasks [COMPLETE]

| ID | Task | Files | Status |
|----|------|-------|--------|
| 1.1 | Update Identity model | `models/identity.ts` | Done - `preferredCryptoProfile`, `signingPublicKey`, `devices[]` added |
| 1.2 | EncryptedKeyBundle collection | `models/key-bundle.ts`, `repositories/key-bundle.repository.ts` | Done |
| 1.3 | Derive bundle ID utility | `utils/crypto.ts` | Done - `deriveBundleId()` using SHA3-256 |
| 1.4 | Register device endpoint | `routes/identity/index.ts` | Done - POST `/identity/:id/devices` |
| 1.5 | Get identity public keys | `routes/identity/index.ts` | Done - GET `/identity/:id/keys` |
| 1.6 | Store key bundle endpoint | `routes/identity/index.ts` | Done - PUT `/identity/:id/bundle` |
| 1.7 | Get key bundle endpoint | `routes/identity/index.ts` | Done - GET `/identity/:id/bundle` |
| 1.X | Atomic E2E initialization | `routes/identity/index.ts` | Bonus - POST `/identity/:id/e2e/initialize` |

### Client Tasks [COMPLETE]

| ID | Task | Files | Status |
|----|------|-------|--------|
| 1.8 | Key generation on identity creation | `services/e2eKeyService.ts`, `hooks/useIdentity.tsx` | Done - `generateE2EKeys()` integrated into `createIdentity` |
| 1.9 | Encrypt signing key bundle | `services/e2eKeyService.ts` | Done - Argon2id + ChaCha20-Poly1305 encryption |
| 1.10 | Upload bundle to server | `hooks/useIdentity.tsx` | Done - calls `api.identity.initializeE2E()` |
| 1.11 | IndexedDB key storage | `services/deviceKeyStorage.ts` | Done - AES-GCM encrypted storage with wrapping key |
| 1.12 | Login: fetch and decrypt bundle | `hooks/useIdentity.tsx` | Done - `loginToIdentity()` fetches and decrypts bundle |
| 1.13 | Login: register device | `hooks/useIdentity.tsx` | Done - new device detected, keys generated, registered |
| 1.14 | Separate passphrase option | `services/e2eKeyService.ts` | Done - backend support complete, UI prompt TODO |

### Tests [COMPLETE]

| Test | Status |
|------|--------|
| Unit: Key generation | Done - 28 tests in `e2eKeyService.test.ts` |
| Unit: Bundle encryption/decryption | Done - includes Argon2id, ChaCha20-Poly1305 roundtrip |
| Unit: Device key storage | Done - 23 tests in `deviceKeyStorage.test.ts` (21 skip in non-browser) |
| Integration: API endpoints | Done - tested via existing API test suite |

### Implementation Notes

- **i18n:** All client-side error messages localized in `packages/ui/src/i18n/locales/en.ts` under `identity.e2e.*`
- **Security:** Signing key never persisted locally, only in memory; device keys encrypted at rest with wrapping key; all keys cleared on logout
- **API Client:** E2E methods added to `IdentityApi` class in `packages/shared/src/api/client.ts`
- **Separate passphrase:** Backend fully supports `useSeparatePassphrase`; UI prompt for separate passphrase during login is TODO for Phase 4

---

## Phase 2: Basic DM Send/Receive [COMPLETE]

**Goal:** Send and receive a single encrypted message between two identities.

**Dependencies:** Phase 1 complete

**Status:** All API and Client tasks complete. Core tests passing. E2E tests deferred to Phase 3.

### Design Decisions

The following design decisions were made during implementation planning:

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Conversation `_id` | Use `ObjectId` for `_id`, add separate `conversationId: string` for blinded hash | Maintains compatibility with `BaseDocument` and `BaseRepository` patterns; avoids manual `_id` manipulation |
| WrappedKey storage format | Base64 serialized strings (matching `SerializedEncryptedPayload.wrappedKeys`) | More portable for MongoDB, matches wire format from clients; base64 is encoding not encryption - no security impact |
| Friendship validation | Placeholder function returning `true` for now | Identity settings for "receive from anyone vs friends only" to be added later; keeps initial implementation simple |
| Route structure | `/api/dm/*` nested approach | Consistent with planned `/api/group/*` and `/api/space/*` for other messaging types; each has different crypto models |
| ConversationId validation | Server validates that `authIdentityId + toIdentityId` derives to provided `conversationId` | Maintains obfuscation integrity; prevents malformed requests |
| Multi-device key wrapping | Trust client to wrap for all devices (sender + recipient) | Server can't validate without knowing sender (obfuscated); client bugs only cause self-inflicted read issues, not security risks |
| Collection names | `dm_conversations`, `dm_messages` | Consistent with existing naming conventions |

**Privacy/Obfuscation Notes:**
- `conversationId` is a blinded hash: `SHA3-256(sort([A,B]) || "dm-v1")` - doesn't reveal participants directly
- `fromIdentityId` is NOT stored on the message document - only revealed after decryption
- `toIdentityId` IS stored (needed for delivery/queries), but combined with blinded `conversationId`, pattern analysis is required to determine sender
- This design accepts that determined attackers with full DB access could eventually correlate patterns, but raises the bar significantly

### API Tasks [COMPLETE]

| ID | Task | Files | Status |
|----|------|-------|--------|
| 2.1 | DM conversation model | `models/dm-conversation.ts` | Done |
| 2.2 | DM conversation repository | `repositories/dm-conversation.repository.ts` | Done |
| 2.3 | DM message model | `models/dm-message.ts` | Done |
| 2.4 | DM message repository | `repositories/dm-message.repository.ts` | Done |
| 2.5 | Blinded conversation ID utility | `utils/conversation.ts` | Done |
| 2.6 | Send message endpoint | `routes/dm/controller.ts` | Done - POST `/dm/messages` |
| 2.7 | Get messages endpoint | `routes/dm/controller.ts` | Done - GET `/dm/conversations/:id/messages` |
| 2.8 | Get or create conversation | `routes/dm/controller.ts` | Done - POST `/dm/conversations` |
| 2.X | Get conversation endpoint | `routes/dm/controller.ts` | Bonus - GET `/dm/conversations/:id` |

### Client Tasks [COMPLETE]

| ID | Task | Files | Status |
|----|------|-------|--------|
| 2.9 | Derive conversation ID | `packages/crypto/src/dm/index.ts` | Done |
| 2.10 | Fetch recipient keys | `packages/shared/src/api/client.ts` | Done - DmApi.getOrCreateConversation + IdentityApi.getPublicKeys |
| 2.11 | Encrypt message | `packages/ui/src/services/dmMessageService.ts` | Done - encryptDmMessage() |
| 2.12 | Send message | `packages/ui/src/hooks/useDmMessages.ts` | Done - useSendDmMessage hook |
| 2.13 | Decrypt message | `packages/ui/src/services/dmMessageService.ts` | Done - decryptDmMessage() |
| 2.14 | Message content structure | `packages/ui/src/services/dmMessageService.ts` | Done - DecryptedMessageContent type |
| 2.15 | Basic message view | `packages/ui/src/components/MessageList.tsx` | Done |
| 2.16 | Message composer | `packages/ui/src/components/MessageComposer.tsx` | Done |

### Tests

| Test | Status |
|------|--------|
| Unit: Conversation ID derivation (server) | Done - 11 tests in `apps/api/src/utils/conversation.test.ts` |
| Unit: Conversation ID derivation (client) | Done - 11 tests in `packages/crypto/src/dm/index.test.ts` |
| Unit: API Controller | Done - 18 tests in `apps/api/src/routes/dm/controller.test.ts` |
| Unit: Message encryption | Done - 7 tests in `packages/ui/src/services/dmMessageService.test.ts` |
| Unit: Signature verification | Done - covered in dmMessageService.test.ts |
| Integration: Send message | Done - covered by controller tests |
| Integration: Receive message | Partial - decryption for own messages only (see limitations) |
| E2E: Full flow | TODO - Phase 3+ |
| E2E: Sender multi-device | TODO - Phase 3+ |

**Phase 2 Limitations (to address in Phase 3):**
- Decryption of received messages requires knowing the sender's signing key. Currently only own sent messages can be fully decrypted/verified.
- Conversation participant info needs to be passed to useDmMessages for received message verification.

---

## Phase 3: Conversation List & Discovery [COMPLETE]

**Goal:** Show all conversations, discover new incoming messages, enable functional DMs between two identities.

**Dependencies:** Phase 2 complete

**Status:** All API and Client tasks complete. All tests passing.

**Expected Outcome:** By end of Phase 3, two identities can:
- Start a new DM conversation
- Send and receive encrypted messages
- See a list of all their DM conversations
- Open a conversation and see decrypted message history
- Receive real-time notifications when new messages arrive
- See unread indicators on conversations

### Design Decisions

The following design decisions were made during Phase 3 planning:

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Sender verification | Encrypted sender hint using conversation-derived key | Enables signature verification before decrypting untrusted payloads; server cannot derive the key |
| Sender hint key derivation | `HKDF(conversationId, "adieuu-sender-hint-v1")` | Both participants can compute; domain-separated for security |
| Sender hint nonce | Derive from `clientMessageId` via `SHA3-256(clientMessageId).slice(0,12)` | Client-generated, unique per message, available at encryption time |
| Sender hint cipher | ChaCha20-Poly1305 (default) or AES-256-GCM (cnsa2) | Matches conversation's active crypto profile |
| Conversation list source | Query `dm_messages` for distinct `conversationId` where `toIdentityId` = me | Conversations don't store participants explicitly; derive from message delivery |
| Participant cache structure | `conversationId → otherParticipantId + signingPublicKey + cachedAt` | In a DM, only 2 participants; cache the "other" party for all operations |
| Participant cache fallback | If cache miss, fetch first message and decrypt sender hint | Resilient to cache clearing; one extra API call per conversation |
| WebSocket event flow | API stores → Redis publish → Chat server broadcasts | API is source of truth; chat server is stateless relay; offline messages still stored |
| WebSocket authentication | Session token in query param, validated against Redis on connect | Fast O(1) lookup; session already authenticated by API |
| WebSocket session expiry | No periodic revalidation in v1 | Low risk (read-only zombie); natural reconnection cycles handle expiry |
| Unread tracking | Encrypted `lastReadMessageId` per participant per conversation | ObjectIds contain timestamps; encrypting hides activity patterns from server |
| Unread computation | Client-side boolean "has unread" check | Server cannot decrypt read state; boolean check is O(1) and scales to groups/spaces |
| Read state key derivation | `HKDF(conversationId, "adieuu-read-state-v1")` | Both participants can compute; separate from sender hint key |
| Read state nonce | Random 12-byte nonce, included in output as `base64(nonce \|\| ciphertext)` | Unique per encryption; self-contained output |
| Unified conversation type | `Conversation` with `type: 'dm' \| 'group'` discriminator | UI works with unified type; DM/Group backends merge in hook layer |

**Future Enhancements (deferred):**
- Add `encryptedOtherParticipant` to conversation document for instant participant recovery without fetching messages
- Add session expiry events from API to chat server for immediate WebSocket termination on logout/revoke

### API Tasks [COMPLETE]

| ID | Task | Files | Status |
|----|------|-------|--------|
| 3.1 | Get conversations endpoint | `routes/dm/controller.ts`, `routes/dm/index.ts` | Done |
| 3.2 | Conversation list repository method | `repositories/dm-message.repository.ts` | Done |
| 3.3 | Add `encryptedSenderId` to message model | `models/dm-message.ts` | Done |
| 3.4 | Update send message to include sender hint | `routes/dm/controller.ts` | Done |
| 3.5 | Add read state to conversation model | `models/dm-conversation.ts`, `repositories/dm-conversation.repository.ts` | Done |
| 3.6 | Update read state endpoint | `routes/dm/controller.ts`, `routes/dm/index.ts` | Done |
| 3.7 | Redis publish on message send | `routes/dm/controller.ts`, `services/dm-events.service.ts` | Done |
| 3.8 | Chat server: handle dm:new events | `apps/chat/src/types.ts` | Done |

**Implementation Notes:**
- `GET /dm/conversations` returns conversations with `lastMessageAt`, `lastMessageId`, `readState`, and `activeCryptoProfile`
- `PUT /dm/conversations/:conversationId/read-state` accepts `encryptedLastReadId` (base64)
- Messages now require `encryptedSenderId` field (base64, max 256 chars)
- DM events (`dm:new`, `dm:read`, `dm:typing`) published to Redis channel `identity:{toIdentityId}`
- New service `dm-events.service.ts` handles Redis pub/sub for real-time delivery
- All 640 API tests passing

### Client Tasks [COMPLETE]

| ID | Task | Files | Status |
|----|------|-------|--------|
| 3.9 | Derive sender hint key | `packages/crypto/src/dm/index.ts` | Done - `deriveSenderHintKey()`, `deriveSenderHintNonce()` |
| 3.10 | Encrypt sender ID on send | `packages/ui/src/services/dmMessageService.ts` | Done - `encryptSenderId()` |
| 3.11 | Decrypt sender hint on receive | `packages/ui/src/services/dmMessageService.ts` | Done - `decryptSenderHint()` |
| 3.12 | Update message verification flow | `packages/ui/src/hooks/useDmMessages.ts` | Done - sender hint + participant cache |
| 3.13 | Participant cache service | `packages/ui/src/services/participantCache.ts` | Done - IndexedDB cache with fallback |
| 3.14 | Derive read state key | `packages/crypto/src/dm/index.ts` | Done - `deriveReadStateKey()` |
| 3.15 | Encrypt/decrypt read state | `packages/ui/src/services/readStateService.ts` | Done - `encryptLastReadId()`, `decryptLastReadId()` |
| 3.16 | Conversation list hook | `packages/ui/src/hooks/useDmConversationsList.ts` | Done - `useDmConversationsList()` with unread status |
| 3.17 | Conversation list UI | `packages/ui/src/components/DmConversationList.tsx` | Deferred to UI integration phase |
| 3.18 | Start new conversation flow | `packages/ui/src/components/NewDmDialog.tsx` | Deferred to UI integration phase |
| 3.19 | Update DM API client | `packages/shared/src/api/client.ts` | Done - `getConversations()`, `updateReadState()`, types updated |
| 3.20 | WebSocket connection hook | `packages/ui/src/hooks/useChatConnection.ts` | Done - `useChatConnection()` with auto-reconnect |
| 3.21 | Real-time message subscription | `packages/ui/src/hooks/useDmSubscription.ts` | Done - `useDmSubscription()` for dm:new/read/typing |
| 3.22 | Mark conversation as read | `packages/ui/src/hooks/useMarkAsRead.ts` | Done - `useMarkAsRead()` |

**Task Descriptions:**
- 3.10: Add `encryptSenderId()`, include in message payload
- 3.11: Add `decryptSenderHint()` for pre-verification sender discovery
- 3.12: Decrypt hint → fetch signing key → verify → decrypt payload
- 3.13: IndexedDB cache: `{ conversationId, otherParticipantId, signingPublicKey }`
- 3.15: `encryptLastReadId()`, `decryptLastReadId()`
- 3.16: Replace mock data with real API call, compute unread client-side
- 3.17: Display conversations with other participant info, unread dot
- 3.18: Search identity → confirm → navigate to conversation
- 3.19: Add `getConversations()`, `updateReadState()` methods
- 3.20: Connect to chat server, handle reconnection
- 3.21: Listen for `dm:new` events, trigger refetch/append
- 3.22: On viewing conversation, update read state via API

### Tests [COMPLETE]

| Test | Description | Status |
|------|-------------|--------|
| Unit: Sender hint encryption | `encryptSenderId` → `decryptSenderHint` roundtrip | Done - `dmMessageService.test.ts` |
| Unit: Read state encryption | `encryptLastReadId` → `decryptLastReadId` roundtrip | Done - `readStateService.test.ts` |
| Unit: Key derivation consistency | Client and server derive same keys for same conversationId | Done - `dm/index.test.ts` |
| Integration: List conversations | Identity with 3 conversations → returns all 3 with metadata | Done - `controller.test.ts` |
| Integration: Empty state | New identity → empty conversation list | Done - `controller.test.ts` |
| Integration: Conversation aggregation | Messages in conversation → correct last message timestamp | Done - `controller.test.ts` |
| Integration: Read state update | Update read state → persisted and retrievable | Done - `controller.test.ts` |
| E2E: Full send/receive flow | Alice sends to Bob → Bob sees message with verified sender | Deferred to UI integration |
| E2E: Conversation discovery | Bob sends to Alice → Alice sees new conversation appear in list | Deferred to UI integration |
| E2E: Real-time delivery | Alice has app open → Bob sends → message appears without refresh | Deferred to UI integration |
| E2E: Unread indicator | Bob sends to Alice → Alice sees unread dot → opens → dot clears | Deferred to UI integration |

---

## Phase 4: Device Management UI

**Goal:** Add device management UI and activity tracking. Core multi-device encryption is already working.

**Dependencies:** Phase 3 complete

**Status:** Core multi-device encryption complete. UI tasks remain.

**Already Implemented:**
- Multi-device key wrapping: Session keys wrapped for all devices of sender + recipient
- Device registration with naming: `POST /identity/:id/devices` with `name` field
- List devices API: `GET /identity/:id/devices`
- Remove device API: `DELETE /identity/:id/devices/:deviceId`
- API client methods: `listDevices()`, `removeDevice()`
- Repository method: `updateDeviceActivity()` (not yet exposed via API)

### API Tasks

| ID | Task | Files | Status |
|----|------|-------|--------|
| 4.1 | List devices endpoint | `routes/identity/index.ts` | Done |
| 4.2 | Remove device endpoint | `routes/identity/index.ts` | Done |
| 4.3 | Update device activity endpoint | `routes/identity/index.ts` | TODO - expose `PATCH /identity/:id/devices/:deviceId` |

### Client Tasks

| ID | Task | Files | Status |
|----|------|-------|--------|
| 4.4 | Device management UI | `pages/DeviceManagement.tsx` | TODO |
| 4.5 | Device naming on registration | `hooks/useIdentityLogin.ts` | Partial - backend supports, UI prompt TODO |
| 4.6 | Remove device flow | `hooks/useDeviceManagement.ts` | TODO |
| 4.7 | Activity heartbeat | `services/deviceActivity.ts` | TODO |

### Tests

| Test | Description | Status |
|------|-------------|--------|
| Integration: List devices | Identity with 2 devices → returns both with correct metadata | TODO |
| Integration: Remove device | Remove device → no longer in list | TODO |
| E2E: Multi-device read | Send from device A → read on device B → both see message | Working (via existing encryption) |
| E2E: Remove and verify | Remove device B → new messages not wrapped for B → B cannot decrypt new messages | TODO |

---

## Phase 5: Message Lifecycle

**Goal:** TTL, deletion, message ordering.

**Dependencies:** Phase 3 complete (Phase 4 is optional polish)

### API Tasks

| ID | Task | Files | Description |
|----|------|-------|-------------|
| 5.1 | TTL background job | `jobs/message-expiration.ts` | Cron job to delete expired messages |
| 5.2 | Delete for everyone | `routes/dm/messages.ts` | DELETE `/dm/messages/:id` (sender only) → set `deletedForEveryone` |
| 5.3 | Delete for self | `routes/dm/messages.ts` | POST `/dm/messages/:id/delete-for-self` → add to `deletedFor[]` |
| 5.4 | Filter deleted in queries | `repositories/dm-message.repository.ts` | Respect `deletedForEveryone` and `deletedFor` when fetching |
| 5.5 | Return tombstones | `routes/dm/messages.ts` | Deleted messages return `{ _id, deleted: true }` for sync |

### Client Tasks

| ID | Task | Files | Description |
|----|------|-------|-------------|
| 5.6 | Send with TTL | `components/MessageComposer.tsx` | Optional TTL selector (1 min, 1 hour, 1 day, etc.) |
| 5.7 | Delete message UI | `components/MessageActions.tsx` | Context menu: "Delete for everyone" (sender) / "Delete for me" (recipient) |
| 5.8 | Handle tombstones | `services/decryption.ts` | Display "Message deleted" placeholder |
| 5.9 | Optimistic deletion | `hooks/useDeleteMessage.ts` | Remove from UI immediately, sync with server |

### Tests

| Test | Description |
|------|-------------|
| Integration: TTL expiration | Send with 1-second TTL → wait → message gone |
| Integration: Delete for everyone | Sender deletes → recipient no longer sees message |
| Integration: Delete for self | Recipient deletes → still visible to sender |
| E2E: Tombstone sync | Delete message → other devices see tombstone |

---

## Phase 6: Reactions

**Goal:** Add and display reactions on messages.

**Dependencies:** Phase 5 complete

### API Tasks

| ID | Task | Files | Description |
|----|------|-------|-------------|
| 6.1 | DM reaction model | `models/dm-reaction.ts` | Schema from spec (section 3.4) |
| 6.2 | DM reaction repository | `repositories/dm-reaction.repository.ts` | CRUD operations |
| 6.3 | Add reaction endpoint | `routes/dm/reactions.ts` | POST `/dm/messages/:id/reactions` |
| 6.4 | Remove reaction endpoint | `routes/dm/reactions.ts` | DELETE `/dm/messages/:id/reactions/:reactionId` |
| 6.5 | Include reactions in message fetch | `routes/dm/messages.ts` | Populate reactions array on messages |

### Client Tasks

| ID | Task | Files | Description |
|----|------|-------|-------------|
| 6.6 | Reaction picker | `components/ReactionPicker.tsx` | Emoji selector UI |
| 6.7 | Encrypt reaction | `services/reactions.ts` | Encrypt emoji + fromIdentityId → wrap → sign |
| 6.8 | Send reaction | `hooks/useReactions.ts` | POST encrypted reaction |
| 6.9 | Decrypt reactions | `services/reactions.ts` | Unwrap → decrypt → display |
| 6.10 | Display reactions | `components/MessageReactions.tsx` | Show reactions under message |
| 6.11 | Remove reaction | `hooks/useReactions.ts` | DELETE → optimistic removal |

### Tests

| Test | Description |
|------|-------------|
| Unit: Reaction encryption | Encrypt → decrypt roundtrip |
| Integration: Add reaction | React to message → reaction stored |
| Integration: Remove reaction | Remove reaction → no longer returned |
| E2E: Full flow | Alice sends → Bob reacts 👍 → Alice sees reaction |

---

## Phase 7: Replies & Threading

**Goal:** Reply to messages, view threads.

**Dependencies:** Phase 6 complete

### API Tasks

| ID | Task | Files | Description |
|----|------|-------|-------------|
| 7.1 | Support threading fields | `models/dm-message.ts` | Already has `replyToId`, `threadRootId` |
| 7.2 | Get thread endpoint | `routes/dm/messages.ts` | GET `/dm/messages/:id/thread` - messages with same `threadRootId` |
| 7.3 | Include reply preview | `routes/dm/messages.ts` | When fetching, include parent message snippet (encrypted) |

### Client Tasks

| ID | Task | Files | Description |
|----|------|-------|-------------|
| 7.4 | Reply to message | `components/MessageActions.tsx` | "Reply" action → set replyToId in composer |
| 7.5 | Start thread | `components/MessageActions.tsx` | "Start thread" → set replyToId + threadRootId |
| 7.6 | Reply indicator | `components/Message.tsx` | Show "replying to [preview]" above message |
| 7.7 | Thread collapse/expand | `components/Thread.tsx` | Collapsible thread UI |
| 7.8 | Thread view | `pages/ThreadView.tsx` | Full thread conversation view |
| 7.9 | Thread count indicator | `components/Message.tsx` | "N replies" link on thread root |

### Tests

| Test | Description |
|------|-------------|
| Integration: Reply creates link | Reply to message → `replyToId` set correctly |
| Integration: Thread grouping | Messages with same `threadRootId` returned together |
| E2E: Inline reply | Reply to message → shows reply preview |
| E2E: Thread | Start thread → add replies → collapse/expand works |

---

## Phase 8: Profile Negotiation

**Goal:** Handle different crypto profiles between participants.

**Dependencies:** Phase 7 complete

### API Tasks

| ID | Task | Files | Description |
|----|------|-------|-------------|
| 8.1 | Profile change request model | `models/profile-change-request.ts` | Track pending profile change requests |
| 8.2 | Request profile change | `routes/dm/conversations.ts` | POST `/dm/conversations/:id/profile-request` |
| 8.3 | Accept/reject profile change | `routes/dm/conversations.ts` | POST `/dm/conversations/:id/profile-request/:id/respond` |
| 8.4 | Update conversation profile | `repositories/dm-conversation.repository.ts` | Update `activeCryptoProfile`, append to `profileHistory` |

### Client Tasks

| ID | Task | Files | Description |
|----|------|-------|-------------|
| 8.5 | Profile selector | `pages/IdentitySettings.tsx` | Choose preferred crypto profile (default/cnsa2) |
| 8.6 | Detect profile mismatch | `hooks/useConversation.ts` | Compare profiles on conversation start |
| 8.7 | Mismatch dialog | `components/ProfileMismatchDialog.tsx` | "Adopt their profile" / "Request they adopt yours" |
| 8.8 | Profile change request UI | `components/ProfileChangeRequest.tsx` | Accept/reject incoming requests |
| 8.9 | History warning | `components/ProfileChangeWarning.tsx` | Warn that old messages become unreadable |
| 8.10 | Encrypt with correct profile | `services/encryption.ts` | Use conversation's `activeCryptoProfile` |

### Tests

| Test | Description |
|------|-------------|
| Unit: Profile config selection | Correct algorithms for each profile |
| Integration: Profile negotiation | Mismatched profiles → request/accept flow |
| E2E: Full negotiation | Alice (default) → Bob (cnsa2) → negotiate → messages use agreed profile |
| E2E: Profile change | Mid-conversation change → old messages unreadable |

---

## Implementation Order Summary

```
Phase 1: Identity Key Infrastructure     [COMPLETE]
    ↓
Phase 2: Basic DM Send/Receive          [COMPLETE]
    ↓
Phase 3: Conversation List & Discovery  [COMPLETE]
    ↓
Phase 4: Device Management UI           [Optional polish - core multi-device works]
    ↓
Phase 5: Message Lifecycle              [Message management]
    ↓
Phase 6: Reactions                      [Engagement]
    ↓
Phase 7: Replies & Threading            [Conversation structure]
    ↓
Phase 8: Profile Negotiation            [Advanced security]
```

---

## Notes

- **Parallelization:** Within each phase, API and client tasks can often be developed in parallel
- **Testing:** Each phase should be fully tested before moving to the next
- **Feature flags:** Consider feature flags for phases 6-8 to enable incremental rollout
- **Performance:** Add indexes as needed during each phase, don't defer to end
