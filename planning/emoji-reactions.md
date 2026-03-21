# Emoji Reactions and Inline Emoji Support

Add encrypted emoji reactions and inline emoji support to DM conversations, using a separate `dm_reactions` collection, emoji-mart for the picker, and an evolved encrypted payload structure (version 2) that supports future attachments.

---

## Implementation Status

| Task | Status | Notes |
|------|--------|-------|
| Payload v2 (`DecryptedMessageContent`) | Done | `attachmentIds` field added, version bumped to 2, backward-compatible with v1 |
| Shared types (`DmReaction`, `DmReactionsApi`) | Done | Types and API client methods in `packages/shared/src/api/client.ts` |
| Server: `dm_reactions` model | Done | `apps/api/src/models/dm-reaction.ts` |
| Server: reaction repository | Done | `apps/api/src/repositories/dm-reaction.repository.ts` |
| Server: reaction controller + routes | Done | `apps/api/src/routes/dm/reaction-controller.ts`, routes in `index.ts` |
| Server: MongoDB indexes | Done | Added to `apps/api/src/db/mongo.ts` |
| Server: WebSocket events | Done | `dm:reaction:new`, `dm:reaction:removed` in `dm-events.service.ts` |
| Client: `dmReactionService` | Done | `packages/ui/src/services/dmReactionService.ts` -- encrypt/decrypt reactions |
| Client: `useDmReactions` hook | Done | `packages/ui/src/hooks/useDmReactions.ts` -- add, remove, fetch reactions |
| Install emoji-mart | Done | `@emoji-mart/react@1.1.1`, `@emoji-mart/data@1.2.1` in `packages/ui` |
| EmojiPicker component | Done | `packages/ui/src/components/EmojiPicker.tsx` -- reusable, compact mode for reactions |
| MessageComposer emoji button | Done | SmileIcon in toolbar, popover with picker, inserts at cursor position |
| Emoji-only message rendering | Done | Regex detection, renders at 2.5rem without bubble background |
| Reaction UI on messages | Done | SmilePlusIcon in MessageActionBar, ReactionBar below bubbles with toggle |

### Files created or modified

**New files:**
- `apps/api/src/models/dm-reaction.ts`
- `apps/api/src/repositories/dm-reaction.repository.ts`
- `apps/api/src/routes/dm/reaction-controller.ts`
- `packages/ui/src/services/dmReactionService.ts`
- `packages/ui/src/hooks/useDmReactions.ts`
- `packages/ui/src/components/EmojiPicker.tsx`

**Modified files:**
- `packages/ui/src/services/dmMessageService.ts` -- `DecryptedMessageContent` v2 with `attachmentIds`, version bump
- `packages/shared/src/api/client.ts` -- `DmReaction`, `SendDmReactionParams`, `DmReactionsApi` class, factory update
- `apps/api/src/db/mongo.ts` -- `DM_REACTIONS` collection constant, indexes
- `apps/api/src/services/dm-events.service.ts` -- reaction event types and publish functions
- `apps/api/src/routes/dm/index.ts` -- reaction route registrations
- `packages/ui/src/components/Icons.tsx` -- `SmileIcon`, `SmilePlusIcon`
- `packages/ui/src/components/MessageComposer.tsx` -- emoji button in toolbar with picker popover
- `packages/ui/src/components/MessageActionBar.tsx` -- `onReact` prop, reaction picker button
- `packages/ui/src/pages/Conversation.tsx` -- emoji-only rendering, `ReactionBar`, reaction props on `MessageBubble`
- `packages/ui/src/styles.scss` -- emoji-only, reactions, emoji picker styles
- `packages/ui/src/i18n/locales/en.ts` -- emoji/reaction i18n keys

---

## Architecture Overview

```
Client (all content encrypted)                Server (sees only opaque blobs)
+---------------------------+                 +---------------------------+
| Emoji Picker (emoji-mart) |                 | dm_messages collection    |
| Reaction Picker           |                 | dm_reactions collection   |
| MessageComposer           |                 |   (messageId link only)   |
| Encrypt Reaction          |                 +---------------------------+
| Encrypt Message (v2)      |
+---------------------------+
```

### Three-Collection Pattern

| Collection | Server sees | Server never sees |
|---|---|---|
| `dm_messages` | conversationId, toIdentityId, timestamps | text, sender, content type |
| `dm_reactions` | messageId, conversationId | emoji, reactor identity |
| `dm_attachments` (future) | messageId, conversationId, fileId | file type, name, dimensions |

---

## 1. Encrypted Payload Evolution (version 2)

`DecryptedMessageContent` in `packages/ui/src/services/dmMessageService.ts`:

```typescript
interface DecryptedMessageContent {
  text: string;
  attachmentIds?: string[];   // references to dm_attachments records (not inline blobs)
  fromIdentityId: string;
  fromDeviceId?: string;
  version: 2;  // bumped from 1
}
```

- Version 1 messages (no `attachmentIds`) continue to decrypt and render normally
- Emoji-only messages are `{ text: "<emoji>", version: 2 }` -- detected at render time

### Attachment Browsability (future)

Attachments will live in a separate `dm_attachments` collection. The message payload references them by ID (`attachmentIds`), not by value. This enables:
- Server can answer "which messages have attachments?" without knowing types
- Client filters by type after decrypting attachment metadata
- Much smaller decryption surface than "decrypt every message"

---

## 2. Reactions -- Separate Encrypted Collection

### Server Model (`dm_reactions`)

```typescript
interface DmReactionDocument {
  _id: ObjectId;
  messageId: ObjectId;
  conversationId: string;         // blinded conversation ID
  toIdentityId: ObjectId;         // other participant (for delivery routing)
  ciphertext: string;             // encrypted: { emoji, fromIdentityId }
  nonce: string;
  wrappedKeys: SerializedWrappedKey[];
  signature: string;
  cryptoProfile: CryptoProfile;
  clientReactionId: string;       // dedup
  createdAt: Date;
}
```

### API Endpoints

- `POST /api/dm/messages/:messageId/reactions` -- add reaction
- `DELETE /api/dm/reactions/:reactionId` -- remove reaction
- `GET /api/dm/conversations/:conversationId/reactions?messageIds=...` -- batch fetch

### WebSocket Events

- `dm:reaction:new` -- `{ reaction: PublicDmReaction }`
- `dm:reaction:removed` -- `{ reactionId, messageId, conversationId }`

### Client Encryption

`DecryptedReactionContent` in `packages/ui/src/services/dmReactionService.ts`:

```typescript
interface DecryptedReactionContent {
  emoji?: string;              // Unicode emoji (standard)
  customEmoji?: {              // future: custom emoji support
    id: string;
    key: string;
    name: string;
    animated: boolean;
  };
  fromIdentityId: string;
  version: 1;
}
```

Same session-key + hybrid-wrap encryption pattern as messages.

---

## 3. UI Components (remaining work)

### 3a. Emoji Picker (emoji-mart)

- Install `@emoji-mart/react` and `@emoji-mart/data` in `packages/ui`
- Create `packages/ui/src/components/EmojiPicker.tsx` -- wraps emoji-mart with our theme/styling
- Reused for both inline message composition and reaction picking
- Future: extend to support custom uploaded emoji sets

### 3b. MessageComposer Integration

In `packages/ui/src/components/MessageComposer.tsx`:
- Add emoji button (smiley icon) in toolbar
- Opens `EmojiPicker` as a popover
- Inserts selected emoji at cursor position in textarea

### 3c. Reaction UI on Messages

In `packages/ui/src/pages/Conversation.tsx` (`MessageBubble` and `MessageActionBar`):
- Add reaction button to `MessageActionBar`
- Compact `EmojiPicker` popover anchored to message
- `ReactionBar` below each bubble showing grouped reactions (emoji + count)
- Click existing reaction to toggle (add/remove)

### 3d. Emoji-Only Message Rendering

- Detect emoji-only messages at render time (text contains only emoji characters)
- Render larger (2-3x font size) without standard bubble background
- Purely a presentation concern

---

## 4. Privacy and Security Considerations

- **Server never sees reaction content**: emoji and reactor identity are inside encrypted payload
- **Server sees `messageId` on reactions**: analogous to existing `replyToId` metadata leak
- **No content-type leakage**: all message types are indistinguishable opaque ciphertext
- **Reaction signatures**: Ed25519-signed to prevent forgery
- **Deduplication**: `clientReactionId` prevents duplicates without leaking content

---

## 5. Custom Emojis (Future Design Notes)

Approach: **"encrypt once, distribute key via payload"**

1. Client generates symmetric key, encrypts emoji image (PNG/WebP/GIF/APNG), uploads encrypted blob
2. Server stores blob with ID in `custom_emojis` collection -- never sees the image
3. When used in message/reaction, E2E encrypted payload includes emoji ID + decryption key
4. Recipient decrypts payload, fetches blob by ID, decrypts with included key, caches locally

### Server Collection

```typescript
interface CustomEmojiDocument {
  _id: ObjectId;
  ownerIdentityId: ObjectId;    // who uploaded it
  ownerType: 'user' | 'space';  // personal vs Space-owned
  spaceId?: ObjectId;           // if Space-owned
  encryptedBlob: string;        // encrypted image data (or object storage ref)
  encryptedMetadata: string;    // encrypted: { name, animated, mimeType, dimensions }
  metadataNonce: string;
  createdAt: Date;
}
```

### Open Decisions

- **Ownership scope**: Per-user, per-Space, or both. `ownerType` field supports either.
- **Space emojis**: Scoped to their respective Space (usable only within that Space). Functionally similar to user emojis.
- **Metadata correlation**: Server can see `customEmojiId` usage frequency. Per-conversation aliases could obfuscate this at cost of complexity.
- **Size limits**: Max 256KB-1MB. Animated emojis tend to be larger.
- **Picker integration**: emoji-mart supports custom emoji sets for a "Custom" tab.
