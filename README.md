# Uprate SDK for React Native and Expo

Use Uprate feedback, roadmap voting, and review signals in iOS and Android apps. The SDK is a small TypeScript HTTP client. It has no native bridge or required runtime dependencies, so it works in Expo Go as well as bare React Native.

## Quick start

### Install

Until the first npm release, install from GitHub:

```sh
npm install github:UprateHQ/uprate-sdk-react-native#feat/react-native-sdk
```

After publication, use `npm install @upratehq/react-native`. The GitHub install builds the package during installation. This preview branch can move; commit your app's lockfile so installs keep using its resolved commit until you update it.

Create an **SDK publishable key** under Apps → your app → SDK API Keys in Uprate. It starts with `uprt_pub_`. A key from Settings → API keys will not work. Keep `uprt_secret_` keys on your server; never put them in a mobile app.

### Configure

```ts
import { Platform } from 'react-native';
import { createUprateClient } from '@upratehq/react-native';

const platform = Platform.OS;
if (platform !== 'ios' && platform !== 'android') {
  throw new Error('Uprate SDK supports iOS and Android');
}

export const uprate = createUprateClient({
  apiKey: 'uprt_pub_your_publishable_key',
  platform,
  // appVersion: your native app version, recommended for review matching
});

// After your app signs a user in, use its stable user ID. Email/name are optional.
export function onLogin(user: { id: string; email?: string }) {
  uprate.setUserContext({ userId: user.id, email: user.email });
}

// On logout, before showing another user's data:
export function onLogout() {
  uprate.clearUserContext();
}
```

Create one client for the app. Set user context after sign-in and clear it on logout. Every operation requires user context. The SDK keeps it in memory and does not invent or persist a device ID. Each request uses the identity captured when that operation began; no HTTP request is sent if the user changes while metadata is being collected. Clearing context blocks new requests, but a request already sent can still finish. Clear or ignore its result in your app's UI after logout; the SDK does not cache results.

The publishable key and `userId` are **not user authentication**. The current SDK API accepts the user ID supplied by the app. A modified client can claim another ID, including for `getMySubmissions()`. Do not use this API to expose information that requires verified user identity until the server supports signed identity.

### Expo device metadata

The core SDK does not collect device information by itself. To include it, install Expo's modules with versions selected for your Expo SDK:

```sh
npx expo install expo-application expo-constants expo-device expo-localization
```

```ts
import * as Application from 'expo-application';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { getLocales } from 'expo-localization';
import { Platform } from 'react-native';
import { createUprateClient } from '@upratehq/react-native';

const platform = Platform.OS;
if (platform !== 'ios' && platform !== 'android') {
  throw new Error('Uprate SDK supports iOS and Android');
}

const uprate = createUprateClient({
  apiKey: 'uprt_pub_your_publishable_key',
  platform,
  appVersion: Constants.expoGoConfig
    ? Constants.expoConfig?.version // project config while testing in Expo Go
    : Application.nativeApplicationVersion ?? undefined, // installed binary version
  deviceMetadataProvider: () => ({
    ...(Device.modelName ? { model: Device.modelName } : {}),
    ...(Device.osVersion ? { os_version: Device.osVersion } : {}),
    ...(getLocales()[0]?.languageTag ? { locale: getLocales()[0].languageTag } : {}),
  }),
});
```

These Expo modules are available in Expo Go. Production review matching uses the installed binary version; Expo Go uses the project config version only for development. The app can supply the same `appVersion` and `deviceMetadataProvider` values using its own libraries in bare React Native. Do not pass a hardware ID, advertising ID, or synthetic fallback. Device metadata is attached only to feedback and review signals. Disable it per call with `collectDeviceMetadata: false`.

## Features

```ts
const { settings, items } = await uprate.roadmap.getItems();
const vote = await uprate.roadmap.vote(items[0].uuid);
await uprate.roadmap.removeVote(items[0].uuid);
const request = await uprate.roadmap.submitRequest('Dark mode', 'Please add it.');
const myRequests = await uprate.roadmap.getMyRequests();

const submitted = await uprate.feedback.submit({
  message: 'Checkout is slow',
  rating: 4, // optional, 1–5
  metadata: { screen: 'checkout' }, // optional JSON data under metadata.custom
});
const mySubmissions = await uprate.feedback.getMySubmissions();
```

The roadmap includes server settings such as `voting_enabled`, `show_vote_count`, and `voting_excluded_statuses`. `votes_count` can be absent when vote counts are hidden. Results use the API's snake_case fields, including `uuid` and ISO timestamp strings.

The SDK records a review signal only when you call `recordPrompt()`. It never displays a native review prompt. In Expo, call it after requesting a review with `expo-store-review`:

```ts
import * as StoreReview from 'expo-store-review';

await StoreReview.requestReview();
await uprate.reviews.recordPrompt();
```

The operating system decides whether to display the prompt; a signal records your request to show it, not proof that a dialog appeared. `recordPrompt({ collectDeviceMetadata: false })` omits device metadata.

## Errors and local development

Operations throw `UprateError` with a stable `code`: `user_context_not_set`, `user_context_changed`, `invalid_api_key` (401), `feature_not_enabled` (403), `not_found` (404), `validation_error` (422), `rate_limited` (429), `timeout`, `network_error`, `server_error`, or `unexpected_response`. `validationErrors` holds field errors from a 422 response; `retryAfterSeconds` holds a 429 delay when provided. The SDK does not automatically retry writes. The 15-second timeout applies to the HTTP request, not to your metadata provider.

The default API URL uses HTTPS. For a local Laravel server, opt into HTTP explicitly:

```ts
createUprateClient({
  apiKey: 'uprt_pub_local_fixture_key',
  platform: 'android',
  baseUrl: 'http://10.0.2.2:8000/api/sdk/v1', // Android emulator -> host machine
  allowInsecureHttp: true,
});
```

Local HTTP accepts `localhost` and its subdomains, IPv4 loopback and private LAN addresses, IPv6 loopback `[::1]`, and Android's `10.0.2.2` alias. Custom base URLs must be absolute, with an ASCII DNS name, decimal IPv4 address, or `[::1]`; credentials, query strings, and fragments are rejected. Validation does not require React Native's global `URL` implementation, including older versions with missing URL properties. Use a local fixture key and fake external adapters; never point tests at a real store account. Set `timeoutMs` between 1 and 60000 to change the HTTP timeout.

## Development

Requires Node 22 for the test runner. Run `npm ci`, `npm run typecheck`, `npm test`, and `npm pack --dry-run`. The package ships compiled CommonJS, ESM, and TypeScript declarations. No app UI, hooks, or provider are required.

MIT license. See [LICENSE](LICENSE).
