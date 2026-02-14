# Mobile App (Capacitor)

This package contains the Capacitor configuration for iOS and Android builds.

## Setup

### Prerequisites

- **iOS**: Xcode 15+ (macOS only)
- **Android**: Android Studio with SDK 34+

### Initial Setup

1. Build the web app first:

```bash
pnpm --filter @chadder/web build
```

2. Initialize native platforms:

```bash
cd apps/mobile
npx cap add ios
npx cap add android
```

3. Sync web assets to native projects:

```bash
npx cap sync
```

## Development

### iOS

```bash
# Open in Xcode
pnpm run open:ios

# Or run directly on simulator
pnpm run run:ios
```

### Android

```bash
# Open in Android Studio
pnpm run open:android

# Or run on emulator
pnpm run run:android
```

### Live Reload (Development)

1. Update `capacitor.config.ts` to enable the dev server:

```typescript
server: {
  url: 'http://YOUR_LOCAL_IP:3000',
  cleartext: true,
}
```

2. Run the web dev server: `pnpm dev:web`

3. Run the native app

## Production Build

1. Build the web app: `pnpm --filter @chadder/web build`
2. Sync: `pnpm --filter @chadder/mobile sync`
3. Build in Xcode / Android Studio
