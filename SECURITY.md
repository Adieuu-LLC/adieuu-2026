# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in Adieuu, please report it responsibly. **Do not open a public issue.**

**Email:** [security@adieuu.com](mailto:security@adieuu.com)

Include as much of the following as possible:

- Description of the vulnerability
- Steps to reproduce or proof of concept
- Affected components (API, chat, crypto, desktop, web, infrastructure)
- Potential impact assessment
- Suggested fix (if you have one)

## Response Timeline

- **Acknowledgment:** Within 48 hours of receipt (normally much sooner, but we all have lives/kids: please give us a bit of grace here, especially over holidays :) )
- **Initial assessment:** Within 3 business days following acknowledgement
- **Fix timeline:** Depends on severity; critical issues are prioritized immediately

We ask that you keep the vulnerability confidential until we've had reasonable time to investigate and deploy a fix. We'll coordinate with you on disclosure timing: if the vulnerability has potential impact on customer data, we'd like to know what the impact is and notify affected parties first (and that can take a bit of time, depending on the type of vuln).

## Scope

The following are in scope:

- Authentication and session management (`apps/api`)
- Cryptographic operations (`packages/crypto`)
- Account/Alias separation and privacy guarantees
- E2EE implementation and key management
- WebSocket chat service (`apps/chat`)
- Media upload/processing pipeline
- Desktop app security (Electron, IPC, navigation guards)
- Infrastructure misconfigurations exposed in this repository

Out of scope:

- Denial of service attacks against production infrastructure
- Social engineering (we would have no way of knowing your campaign isn't malicious and it would be treated as such)
- Issues in third-party dependencies (report upstream; let us know if it affects us - though this is part of what we use Manifest for, they're great at this!)
- Self-hosted instances you control (though we appreciate reports if the default configuration is insecure)

## Recognition

We don't currently have a paid bug bounty program, but we are grateful for responsible disclosures and can (at the least) offer:

- Complimentary in-app subscriptions and entitlements
- Permanent recognition on our in-app acknowledgments wall (if you'd like)
- Credit in the security advisory (if you'd like)

We hope to offer financial bounties and other benefits in the future as project growth allows.

## Supported Versions

Security fixes are applied to the latest release on `main`. We do not backport to older versions.
