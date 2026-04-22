# Video uploads: E2E media, frame-based moderation, and async outbox

**Status:** Draft for refinement  
**Last updated:** 2026-04-19 (binding / integrity subsection added)  

This document captures the agreed direction for conversation **video** (and closely related **media**) uploads: preserving **end-to-end encryption** for the delivered asset, minimizing **cleartext** sent for **moderation**, standardizing **playback** across clients, and moving **heavy work** off the **critical path** of the composer via an **outbox** and **pending-upload** UX.

---

## 1. Executive summary

| Theme | Direction |
|--------|-----------|
| **Delivered asset** | The **E2E ciphertext** is what recipients download and decrypt. The server **must not** replace, transcode, or tamper with that blob. |
| **Moderation** | A **separate cleartext path** only. Prefer **sampled still frames (JPEG)** on an interval (e.g. ~5–10s + jitter, bounded count) instead of uploading the **full** video for scanning—**privacy** and **bandwidth** on the scan path. |
| **Compatibility & bandwidth** | **Default:** client normalizes to **H.264 + AAC in MP4** before encryption (single playable profile for web, desktop, future mobile). **Optional:** user sends **raw/original** file; playback and scan extraction are best-effort with clear UX copy. |
| **UX** | **Async pipeline:** user can compose and send **other** messages while media jobs run. Each pending send appears in a **conversation-level** control (e.g. top bar near **pins**): **Font Awesome upload** icon, panel styled like **pins**, list of jobs with progress, **cancel** and **retry**. Message is **committed** when processing + uploads complete (ordering semantics TBD—see §6.4). |
| **Scan integrity** | **Server session binding** (one scan prefix ↔ one E2E media). **Optional manifest** on seal for completeness/hashes. **Does not** prove a malicious client’s frames match ciphertext—see §7.4. |

---

## 2. Goals and non-goals

### 2.1 Goals

- Preserve **E2E** trust: message media bytes are exactly what the sender encrypted.
- Reduce **moderation cleartext surface** (frames vs full video) while remaining defensible with trust & safety.
- Reduce **upload and download** size when transcoding helps (smaller plaintext → smaller ciphertext).
- Avoid **blocking** the composer during transcode/upload; surface **multi-job** state clearly.
- Support **cancellation** and **failure recovery** (retry, orphan policy).
- **Bind** scan material to the correct **E2E upload server-side** (`e2eMediaId` / `scanHash` / authorized prefix only) so infrastructure bugs cannot easily attach the wrong frames to the wrong media.
- Where useful, add **structural integrity** checks (e.g. optional **manifest** under the scan prefix, completeness on **seal**) to catch **honest-client** defects and **partial** uploads—not to prove a **malicious** sender is honest (see §7.4).

### 2.2 Non-goals (for initial phases)

- Server-side production of a **viewer-optimized** replacement for the E2E blob (would break the “no tampering” invariant unless explicitly redesigned as a separate product).
- **Guaranteed** playback of **every** exotic codec when user chooses **raw send**—we communicate risk instead.
- **Perfect** moderation coverage from sparse frames—policy must accept tradeoffs or define escalation rules later.

---

## 3. Architecture principles

### 3.1 Two artifacts (existing pattern, refined)

1. **E2E encrypted blob**  
   - Stored and delivered as today.  
   - **One** video payload per attachment from the user’s perspective (ciphertext).

2. **Moderation scan material (cleartext)**  
   - **Not** the message ciphertext.  
   - **Planned change:** **N JPEG frames** sampled from the **same** normalized (or raw, if chosen) video **on the client**, **before** or **after** normalize as appropriate, uploaded under a **scan** contract tied to the same logical upload / `scanHash` / session model.  
   - Server/Lambda runs **image** moderation (or batched equivalent)—**not** necessarily `StartContentModeration` on a full MP4 for every conv video (today’s video path may need redesign).

### 3.2 Where processing runs

- **Before encryption:** normalize to H.264+AAC MP4 (default), extract dimensions/thumbnails/frames for scan, strip EXIF for images as today.  
- **Raw path:** encrypt **original** bytes; frame extraction for moderation only if decode pipeline succeeds; define failure behaviour (§7).

### 3.3 Privacy framing

- **Frames** expose **sparse** visual content, not continuous video—**less** cleartext than full MP4 on S3.  
- Retention, access logging, and TS review policies should be **documented** for frame objects vs legacy full-video scans.

---

## 4. Moderation: frame sampling

### 4.1 Intent

- Sample timestamps roughly every **5–10 seconds** with **random jitter** inside each window to avoid predictable gaps.  
- Enforce **minimum** frame count (e.g. 3–5) for short clips and **maximum** cap by duration to control cost and PII exposure.  
- Optionally always include **first** and/or **last** frame (product decision).

### 4.2 Tradeoffs

- **Coverage:** short objectionable segments may fall **between** samples—TS must sign off or define complementary signals (hash blocklists, user reports, escalation on edge scores).  
- **API shift:** conv video moderation may move from **video** Rekognition jobs to **per-frame** (or batch) **image** moderation—**Lambda `media-processor`**, DB writer, and completion flows need a designed **v2** path.  
- **Idempotency:** partial frame upload failures should have a clear **retry** and **finalisation** story so moderation state does not wedge.

### 4.3 Open parameters (to refine)

- Exact interval distribution, min/max frames, max resolution of JPEG scans.  
- Whether **audio** moderation requires separate policy (frames are visual-only).  
- Migration: **flag** for new uploads only vs backfill.

---

## 5. Client: encoding and “send raw”

### 5.1 Default path

- Transcode/compress to a **single** agreed profile: **H.264 + AAC**, **MP4** container, with explicit **max resolution / bitrate** (and optionally audio channel rules) documented for engineering and QA.  
- Skip transcode when input **already** satisfies probes (playable + within caps)—avoid redundant work.  
- Heavy work in **Web Workers** (or platform equivalent) so the **main thread** stays responsive; **outbox** owns lifecycle even if user navigates (persistence scope TBD).

### 5.2 Optional “send without processing”

- User-facing label: e.g. **Original file** / **No re-encoding**.  
- Copy: playback **not guaranteed** on all devices; moderation frames still attempted client-side when decoders allow.  
- Persist preference: per-send vs sticky user setting (TBD).

---

## 6. Outbox, composer, and pending-upload UX

### 6.1 Behaviour

- Starting a **send with media** enqueues an **outbox job**: prepare → encrypt → upload E2E → upload scan frame set → finalize message send.  
- **Composer** clears or remains available for **new** drafts; user can send **text-only** or other messages **concurrently** (subject to a **concurrency cap** to protect device).  
- Each job has states: **queued**, **preparing**, **uploading**, **finalizing**, **failed**, **cancelled**, **completed**.

### 6.2 UI placement

- **Conversation chrome** (e.g. top bar next to **pins**): **Font Awesome** **upload** icon with **badge** (count or aggregate status).  
- **Panel:** mirrors **pins** layout patterns—scrollable list, row actions.  
- **Row:** thumbnail or icon, title/filename, **progress** (percent and/or stage label), **Cancel**, **Retry** on failure.  
- Optional later: **inline** placeholder message in the thread vs **chrome-only** indicator (v1 can be chrome-only to reduce scope).

### 6.3 Cancellation and cleanup

- **AbortController** (or equivalent) for fetches; cancel **ffmpeg** / worker where supported.  
- **Server:** define behaviour for **abandoned** `e2eMediaId` / scan uploads (TTL, garbage collection, or explicit cancel API).  
- Align with existing **client timeouts** so UI never spins forever.

### 6.4 Ordering and timestamps (decision required)

- **Option A:** Message **timestamp** = user tapped Send (optimistic ordering).  
- **Option B:** Timestamp = **completion** time (simpler server, worse UX for “when I said it”).  
- **Recommendation:** align with product norm for async sends (many apps use **send time** with a **pending** state in-thread or in chrome).

---

## 7. API and backend work (high level)

### 7.1 Scan upload contract

- Today: scan upload is largely **one** payload per flow (image thumbnail or full MP4 for video).  
- **Target:** **one E2E video** + **M scan images** bound to one logical **scan session** (reuse or extend `scanHash`, `scanMediaId`, multipart completion, etc.).  
- **Storage layout:** client uploads all moderation stills under a **single deterministic S3 prefix** per session, e.g. `uploads/.../conv_scan/{scanSessionId}/` (exact pattern TBD). **One image** (classic image attachment) is the degenerate case: that prefix contains **one** object; **video frame batches** contain **N** objects under the same prefix.  
- Requirements: **atomic-ish completion** from the client’s perspective (all frames uploaded or retry), **idempotent** completion handler, clear **failure** codes. The pipeline should **not** start full moderation until the session is **sealed** (see §7.2) so `ListObjects` does not observe a half-uploaded set. **Authorization:** only the client/session that **owns** the `e2eMediaId` (or equivalent) may write to that prefix or complete the scan; prevents cross-user or cross-session mix-ups. **Integrity (optional):** see **§7.4** for manifests and commitments—what they do and do not prove.

### 7.2 Lambda / `media-processor` — prefix-driven batch scan (preferred)

**Problem with “array of keys” in the queue:** a large frame set inflates **SQS/EventBridge payload** size, risks **partial** lists, and couples producers to every object key.  

**Preferred model:** pass a **scan scope** the Lambda can resolve in S3:

1. **Inputs (conceptual):** a **bucket + prefix** (or stable **scan session id** that maps to exactly one prefix), plus metadata already on the session (`mediaId`, `purpose: conv_scan`, content-moderation flags, etc.).  
2. **Invocation:** after the client (or API **complete-scan** step) marks the session **ready**, enqueue **one** job: *“moderate all images under this prefix”* — not *“moderate these 47 keys”*.  
3. **Lambda behaviour:** `ListObjectsV2` (paginated) with the given **prefix**, filter to expected image content-types / suffix rules, **sort keys** deterministically (e.g. lexical on `Key` so `frame-0001.jpg` … is stable).  
4. **Per-object work:** for each image (or batched where Rekognition allows), run **image** moderation (`DetectModerationLabels` or equivalent); **aggregate** results into a single outcome for the **scan session** (e.g. worst-case / policy-specific rollup).  
5. **Caps:** enforce **max keys per prefix** (aligned with client max frame count) so a bug or attack cannot schedule unbounded work; optional **max payload size** per object.  
6. **Single vs batch:** identical code path — **M = 1** and **M > 1** only change iteration length.

**Alternative (not preferred for large N):** include an explicit **array of keys** in the message for debugging or tiny batches; still keep **prefix iteration** as the scalable default so queue messages stay small.

**Legacy:** full-MP4 **video** Rekognition path can remain for older objects until deprecated behind a **feature flag**.

**Cost model:** N image API calls vs one async video job — finance / TS input; prefix model avoids **N Lambda cold starts** from **N** per-object S3 notifications unless we explicitly want that (usually we do **not**).

### 7.3 API (`apps/api`)

- Endpoints for **requesting** scan uploads for **multiple** objects under one parent.  
- Validation: **content-type**, **size limits** per frame, **rate** limits.  
- **Authorization:** same participant checks as today; enforce **one scan session ↔ one E2E media record** so frames cannot be finalized against another user’s upload.  
- **Seal step:** when the client signals **scan complete**, optionally validate an **optional manifest** (§7.4) before enqueueing Lambda—reject incomplete or inconsistent sets early.

### 7.4 Scan binding, manifests, and limits of client-only proof

**Threat model (three different problems):**

| Concern | Who / what | What helps |
|--------|------------|------------|
| **Wrong association** (prefix A tied to media B, replay, mis-wired job) | Infra / bugs / confused client | **Server-issued session** (`e2eMediaId`, `scanHash`), **authorized prefix** per session, **seal-then-process** so moderation never runs on a half-written prefix. |
| **Honest client defects** (truncated batch, wrong keys, pipeline bug) | Buggy legitimate app | **Optional manifest** in the prefix (ordered frame keys, per-frame hashes, expected count); **API or pre-Lambda** validation on seal; **deterministic** key naming + `ListObjects` reconciliation. |
| **Malicious sender** (benign frames, evil ciphertext) | User with modified client | **Not** solvable with client-only crypto: they control both artifacts. Rely on **policy**, **rate limits**, **reports**, and TS process—not on “signatures” that the same client mints. |

**Worth doing (practical):**

1. **Server-side session binding (required):** every scan object and the **seal** action must be authorized for **exactly one** E2E upload / scan session. Lambda receives only **session-scoped** input (prefix or id that maps server-side to that media). This is **not** moot: it secures the **honest** system against **operator and routing** errors.

2. **Optional manifest file in the scan prefix (recommended for batch frames):** e.g. JSON listing expected object keys (or suffixes), **order**, optional **SHA-256 per frame**, optional **single digest** of the **normalized plaintext** bytes that were encrypted (the “media body” commitment). On **seal**, API checks: manifest exists, listed objects present, counts within caps, hashes match if provided. Catches **partial uploads** and many **client bugs** before Rekognition spend.

3. **Optional commitment in the E2E message payload (product-dependent):** if the encrypted message metadata can carry a **hash** (or root hash of frames) visible to **recipients** after decrypt, **honest** senders get **detectable** inconsistency if something corrupted bytes between encrypt and send. **Malicious** senders still choose consistent lies—same limitation as above.

**Not worth relying on for “truth” against senders:**

- **Signing frames** with a secret on the client (secret leaks) or with a **user/device key** that the same client holds (proves **stream origin** to your API, not that frames match ciphertext).
- **“Prove sampling honesty”** with pure client-side math: a modified client can always upload matching metadata.

**Lambda note:** if a **manifest** object lives in the prefix, either **exclude** it from image moderation via naming convention (e.g. `manifest.json` only) or filter in code so Rekognition never ingests it.

---

## 8. Phased delivery

### Phase A — Client foundations

- H.264+AAC default pipeline + **probes** to skip when unnecessary.  
- **Send raw** toggle + strings.  
- Client **frame extraction** for moderation (interval + jitter + caps) from normalized (or raw) video.  
- **Feature flag** to keep **legacy** full-video scan if needed during rollout.

**Exit criteria:** Can produce frame set locally; unit tests for sampling logic; manual QA on web + desktop.

### Phase B — API + moderation pipeline

- Multi-image scan session API; **prefix-per-session** storage layout; **seal-then-process** trigger so Lambda lists a complete set.  
- **Optional manifest + seal validation** (§7.4) before enqueue; filter manifest object out of moderation iteration.  
- `media-processor`: **one job per scan session** using **S3 prefix iteration** (§7.2); DB states; **flag** to choose frame batch vs full video for conv_scan.

**Exit criteria:** End-to-end moderation outcome for frame-based uploads in staging; TS sign-off on sampling policy.

### Phase C — Outbox + UX

- Persistent (or session) **queue**; concurrency cap; retry/cancel.  
- Top-bar **upload** entry + **pins-like** panel; Font Awesome icon.  
- Composer non-blocking for other messages.

**Exit criteria:** User can run 2+ concurrent media sends; cancel works; no stuck “uploading” without error.

### Phase D — Metrics, retention, polish

- Metrics: E2E bytes, scan bytes, p50/p95 **time-to-send**, cancel rate, moderation latency.  
- Retention policy for frames; admin docs.  
- Mobile parity when app consumes same APIs.

---

## 9. Risks

| Risk | Mitigation |
|------|------------|
| **TS** rejects sparse frames | Early sign-off; document gaps; optional escalation triggers later. |
| **Duplicate** transcode (composer + `uploadE2EMediaOnly` internal prepare) | Refactor upload flow to **single** prepare path (codebase already calls prepare in multiple places—align). |
| **Orphan** uploads after cancel | Explicit cancel API + GC job + client discipline. |
| **Raw** path **cannot** decode for frames | Product rule: block send, warn-only, or send with degraded moderation—decide in §7. |
| **Battery/thermal** on mobile | Concurrency 1 default on low-power; background rules. |
| **Over-claiming crypto** (“signed frames prove honesty”) | Document §7.4 in TS/engineering reviews; invest in **session binding + manifest**, not false assurance vs malicious clients. |

---

## 10. Metrics and success criteria

- **Upload:** median and p95 **total bytes** (E2E + all scan parts) vs baseline.  
- **Latency:** time from **Send** to **message visible** / **completed**.  
- **Reliability:** failure rate, retry success, cancel rate.  
- **Seal / manifest:** rate of **rejections** at seal (missing object, hash mismatch)—signals client bugs or abuse.  
- **Safety:** false negative/positive discussion with TS (qualitative + incident review).  
- **UX:** support tickets / user confusion on “pending” vs “failed”.

---

## 11. Related code (starting points)

These paths will likely change during implementation; listed for planning only.

- `packages/ui/src/services/conversationMediaUploadFlow.ts` — E2E upload, scan payload shape (`ModerationScanPayload`), `uploadModerationScanCopy`.  
- `packages/ui/src/components/composer/MessageComposer.tsx` — send flow, timeouts, attachment state.  
- `packages/ui/src/utils/videoProcessing.ts`, `videoTranscode` — client transcode and probes.  
- `infra/aws/lambda/media-processor/` — conv_scan video vs image moderation.  
- `apps/api/src/services/e2e-upload.service.ts` — scan upload requests.

---

## 12. Decision log (fill as we refine)

| ID | Question | Options | Decision | Date |
|----|----------|---------|----------|------|
| D1 | Message timestamp for async sends | Send time vs completion time | TBD | |
| D2 | Frame sampling constants | Interval, jitter, min/max frames | TBD | |
| D3 | Raw send when frame extract fails | Block / warn / send degraded | TBD | |
| D4 | Outbox persistence | Per-tab only vs durable local store vs sync | TBD | |
| D5 | Inline thread placeholder vs chrome-only v1 | Both / chrome-only | TBD | |
| D6 | Deprecate full-MP4 scan | Flag date + migration | TBD | |
| D7 | Lambda scan input shape | Key array in queue vs **S3 prefix / session id** (Lambda lists objects) | **Prefix / session id** (single job iterates keys) | 2026-04-19 |
| D8 | Seal-time manifest | None vs **optional manifest** (keys, counts, optional hashes) | **Recommended:** optional manifest for batch frames; validate on seal (§7.4) | 2026-04-19 |
| D9 | Plaintext commitment in message payload | None vs hash of normalized bytes (or frame root) for recipient check | TBD | |

---

## 13. Next steps for refinement

1. Run **D1–D9** with product + TS + mobile owner.  
2. Sketch **API** request/response** for multi-frame scan + **manifest schema** (one doc or OpenAPI snippet).  
3. Estimate **Lambda** cost for N frames vs one video job at expected volume.  
4. Prototype **sampling** algorithm + fixtures (short clip, long clip, edge timestamps).  
5. Align **i18n** keys for pending/cancel/failed/raw-send copy early.

---

*End of draft.*
