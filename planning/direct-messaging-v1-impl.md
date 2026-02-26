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

## Phase 2: Basic DM Send/Receive

**Goal:** Send and receive a single encrypted message between two identities.

**Dependencies:** Phase 1 complete

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

### API Tasks

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

### Client Tasks

| ID | Task | Files | Description |
|----|------|-------|-------------|
| 2.9 | Derive conversation ID | `services/conversation.ts` | Match server derivation |
| 2.10 | Fetch recipient keys | `services/encryption.ts` | GET recipient's device public keys |
| 2.11 | Encrypt message | `services/encryption.ts` | Session key → encrypt content → wrap for all devices → sign |
| 2.12 | Send message | `hooks/useSendMessage.ts` | Compose encrypted payload → POST to server |
| 2.13 | Decrypt message | `services/decryption.ts` | Find wrapped key → unwrap → decrypt → verify signature |
| 2.14 | Message content structure | `types/message.ts` | `DecryptedMessageContent` with `text`, `fromIdentityId`, `fromDeviceId?` |
| 2.15 | Basic message view | `pages/Conversation.tsx` | Display decrypted messages in a conversation |
| 2.16 | Message composer | `components/MessageComposer.tsx` | Text input → encrypt → send |

### Tests

| Test | Status |
|------|--------|
| Unit: Conversation ID derivation | Done - 11 tests in `utils/conversation.test.ts` |
| Unit: API Controller | Done - 18 tests in `routes/dm/controller.test.ts` |
| Unit: Message encryption | TODO - Client-side |
| Unit: Signature verification | TODO - Client-side |
| Integration: Send message | Done - covered by controller tests |
| Integration: Receive message | TODO - Client-side |
| E2E: Full flow | TODO - Requires client implementation |
| E2E: Sender multi-device | TODO - Requires client implementation |

---

## Phase 3: Conversation List & Discovery

**Goal:** Show all conversations, discover new incoming messages.

**Dependencies:** Phase 2 complete

### API Tasks

| ID | Task | Files | Description |
|----|------|-------|-------------|
| 3.1 | Get conversations for identity | `routes/dm/conversations.ts` | GET `/dm/conversations` - distinct conversations where `toIdentityId` = me |
| 3.2 | Conversation metadata | `routes/dm/conversations.ts` | Include last message timestamp, unread count |
| 3.3 | WebSocket: new message event | `services/websocket.ts` | Push notification when new message arrives |

### Client Tasks

| ID | Task | Files | Description |
|----|------|-------|-------------|
| 3.4 | Conversation list hook | `hooks/useConversations.ts` | Fetch and manage conversation list |
| 3.5 | Conversation list view | `pages/ConversationList.tsx` | Display all conversations with previews |
| 3.6 | Sender cache | `services/senderCache.ts` | Local IndexedDB cache: `conversationId → senderIdentityId` |
| 3.7 | Decrypt to discover sender | `services/conversation.ts` | On first message, decrypt to find sender, cache result |
| 3.8 | Start new conversation | `components/NewConversation.tsx` | Search identity → derive conversation ID → navigate |
| 3.9 | Real-time updates | `hooks/useMessageSubscription.ts` | WebSocket listener for new messages |
| 3.10 | Unread indicators | `components/ConversationListItem.tsx` | Show unread count badge |

### Tests

| Test | Description |
|------|-------------|
| Integration: List conversations | Identity with 3 conversations → returns all 3 |
| Integration: Empty state | New identity → empty conversation list |
| E2E: Discovery | Bob sends to Alice → Alice sees new conversation appear |
| E2E: Real-time | Alice has app open → Bob sends → message appears without refresh |

---

## Phase 4: Multi-Device Verification

**Goal:** Ensure multi-device works correctly, add device management.

**Dependencies:** Phase 3 complete

### API Tasks

| ID | Task | Files | Description |
|----|------|-------|-------------|
| 4.1 | List devices endpoint | `routes/identity/devices.ts` | GET `/identity/:id/devices` - return registered devices |
| 4.2 | Remove device endpoint | `routes/identity/devices.ts` | DELETE `/identity/:id/devices/:deviceId` |
| 4.3 | Update device activity | `routes/identity/devices.ts` | PATCH `/identity/:id/devices/:deviceId` - update `lastActiveAt` |

### Client Tasks

| ID | Task | Files | Description |
|----|------|-------|-------------|
| 4.4 | Device management UI | `pages/DeviceManagement.tsx` | List devices with names, last active, remove button |
| 4.5 | Device naming on registration | `hooks/useIdentityLogin.ts` | Prompt for device name on first login |
| 4.6 | Remove device flow | `hooks/useDeviceManagement.ts` | Confirm → DELETE → clear local keys if current device |
| 4.7 | Activity heartbeat | `services/deviceActivity.ts` | Periodic PATCH to update `lastActiveAt` |

### Tests

| Test | Description |
|------|-------------|
| Integration: List devices | Identity with 2 devices → returns both with correct metadata |
| Integration: Remove device | Remove device → no longer in list |
| E2E: Multi-device read | Send from device A → read on device B → both see message |
| E2E: Remove and verify | Remove device B → new messages not wrapped for B → B cannot decrypt new messages |

---

## Phase 5: Message Lifecycle

**Goal:** TTL, deletion, message ordering.

**Dependencies:** Phase 4 complete

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
Phase 2: Basic DM Send/Receive          [Core messaging]
    ↓
Phase 3: Conversation List & Discovery  [Usable product]
    ↓
Phase 4: Multi-Device Verification      [Quality assurance]
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
