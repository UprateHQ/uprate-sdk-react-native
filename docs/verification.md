# React Native SDK verification

Verified on 2026-09-24 against SDK implementation commit `7fafd49d4509175a0a7ca0f9f68d6bed5a30470c`.

## Package and API

- Node 22.22.2, TypeScript 7.0.2: type checking and all seven SDK test cases passed, covering all eight operations, identity changes before dispatch, metadata opt-out, input validation, HTTP error details, malformed responses, network failures, and timeout/abort.
- `npm pack` and clean consumer installation passed. CommonJS, ESM, and TypeScript NodeNext consumers could import the package. Local Git dependency installation was also checked.
- The compiled package made **30 HTTP requests** through a localhost transport into Uprate's real Laravel HTTP kernel at app revision `0025556265b499ca6e84bd53c930ac5423c9e32e`. The fixture used SQLite `:memory:`, fake queues/mail, and blocked external HTTP. It did not use store credentials or call stores or AI providers.
- For both `ios` and `android`, verified roadmap loading, voting and removing votes, creating and listing feature requests, submitting and listing feedback, and recording review signals.
- Database inspection confirmed stored feedback and signals, platform/version headers, supplied metadata, and device-metadata opt-out. Switching the supplied user ID changed the returned lists; clearing identity prevented a new HTTP request. Another app's key could not access the first app's roadmap item or feedback.
- The client preserved real backend 401, 403, 404, and 422 responses, including field validation details. SDK tests additionally cover 429 retry delay, 503, malformed success, network errors, and timeout.

The two SDK entrypoints tested in the package and Expo consumer were byte-identical:

```text
dist/index.js  58b31096d68da4170765bc8bfb432005661062b8dbb79e900ad59b2666878b8c
dist/index.cjs dc6568ffce2fcfb4cb47cc7b2baad370d01e5f4667153f7bcb2e3f85e6a6edd3
```

## Expo consumer

A fresh Expo 57.0.24 / React Native 0.86.3 / React 19.2.3 fixture installed the packed SDK and imported/configured it from the application entrypoint. `expo export --platform ios --platform android` succeeded and generated Hermes bytecode for both platforms. No native bridge, config plugin, or additional SDK runtime dependency was needed for this export.

This verifies package resolution and native bundle compilation. **It does not verify execution in Expo Go, an iOS simulator, an Android emulator, or a physical device.** Those runtimes were unavailable on the Linux verification host. Device execution remains a release check, using a local fixture API.

## Review and remaining constraints

An independent reviewer checked API parity, headers, identity handling, error paths, serialization, package exports, and the app's guide link. The only reported defect was a missing `#quick-start` heading; it was corrected and the anchor was checked.

- The package has not been published to npm; the README provides Git installation for this preview.
- User isolation above follows the supplied user ID. The existing API does not authenticate that identity; a publishable key is not proof of who a user is. Signed identity is a separate backend change required before relying on these endpoints for sensitive, authenticated user data.
- The existing backend derives review territory from the first two characters of locale (for example `en-US` becomes `EN`). This pre-existing matching limitation is outside the SDK addition. The SDK sends the real locale without fabricating a region or changing its format.
- Review-signal recording was verified. Showing a store review dialog and matching a real store review were not tested or claimed.
- No production deployment, store operation, or native SDK release was performed.
