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

- **Acknowledgment:** Within 48 hours of receipt
- **Initial assessment:** Within 7 days
- **Fix timeline:** Depends on severity; critical issues are prioritized immediately

We ask that you keep the vulnerability confidential until we've had reasonable time to investigate and deploy a fix. We'll coordinate with you on disclosure timing.

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
- Social engineering
- Issues in third-party dependencies (report upstream; let us know if it affects us)
- Self-hosted instances you control (though we appreciate reports if the default configuration is insecure)

## Recognition

We don't currently have a paid bug bounty program, but we are grateful for responsible disclosures and offer:

- Complimentary in-app subscriptions and entitlements
- Permanent recognition on our in-app acknowledgments wall
- Credit in the security advisory (if you'd like to be named)

We hope to offer financial bounties in the future as the project grows.

## Supported Versions

Security fixes are applied to the latest release on `main`. We do not backport to older versions.
