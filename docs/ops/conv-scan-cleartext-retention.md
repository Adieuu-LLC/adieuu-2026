# Conversation scan (`conv_scan`) cleartext retention

This note documents retention and admin expectations for conversation scan cleartext (conv_scan hash-check pipeline).

## What is stored

- **E2E ciphertext:** The encrypted attachment blob delivered to recipients. The server does not decrypt it for routine operation.
- **Scan material:** Cleartext frames (JPEG grids) or, when legacy mode is enabled, a single MP4 under `uploads/conv_scan/{scanHash}/`. Used only for CSAM hash checks and, when applicable, moderator review.

## Lifecycle

- **Pass:** Scan objects under the prefix are deleted after hash checks pass (see `media-processor` batch completion path).
- **Reject:** Scan objects may be retained for human review until associated moderation reports are resolved and purged via API (see `purgeConvScanEvidenceForTerminalReport` and related guards for open reports).
- **Abandon / cancel:** Clients should call abandon APIs; operators may run prefix purges aligned with product policy.

## Operational knobs

- **Legacy full-video scan:** Lambda env `ALLOW_LEGACY_CONV_SCAN_VIDEO` (Terraform: `allow_legacy_conv_scan_video_moderation`). When set to `false`, sealed batches containing only a conv_scan MP4 fail fast so all clients must use frame JPEG uploads.

## Trust & safety

- Frame sampling is sparse; policy owners should document acceptable coverage and escalation procedures.
- Access to scan evidence in staff tools should follow least-privilege and audit expectations already applied to moderation queues.
