# React Native SDK verification

Verified on 2026-09-24. The initial API checks below used SDK commit `7fafd49d4509175a0a7ca0f9f68d6bed5a30470c`; review fixes were verified at `e8c5aed5dae6caedac7433b90dbb3c70e612236e`.

## Package and API

- Node 22.22.2, TypeScript 7.0.2: type checking and all eleven SDK test cases passed after the review fixes. These cover all eight operations, identity changes before dispatch, repeated identical identity, metadata opt-out, URL compatibility and safety, Unicode length limits, HTTP error details, malformed responses, network failures, and timeout/abort.
- `npm pack` and clean consumer installation passed. CommonJS, ESM, and TypeScript NodeNext consumers could import the package. Local Git dependency installation was also checked.
- The compiled package made **30 HTTP requests** through a localhost transport into Uprate's real Laravel HTTP kernel at app revision `0025556265b499ca6e84bd53c930ac5423c9e32e`. The fixture used SQLite `:memory:`, fake queues/mail, and blocked external HTTP. It did not use store credentials or call stores or AI providers.
- For both `ios` and `android`, verified roadmap loading, voting and removing votes, creating and listing feature requests, submitting and listing feedback, and recording review signals.
- Database inspection confirmed stored feedback and signals, platform/version headers, supplied metadata, and device-metadata opt-out. Switching the supplied user ID changed the returned lists; clearing identity prevented a new HTTP request. Another app's key could not access the first app's roadmap item or feedback.
- The client preserved real backend 401, 403, 404, and 422 responses, including field validation details. SDK tests additionally cover 429 retry delay, 503, malformed success, network errors, and timeout.

## Review fix verification

Three findings from an independent Fable 5.1 review were reproduced on the original implementation and fixed. The corresponding regression tests failed before the fixes and passed afterward.

- **Older React Native URL implementations:** initialization passed using the actual URL classes from RN 0.76.9 and RN 0.86.3, with both platform values, and with global `URL` absent. For this Node check, only Flow annotations were removed and the unused native Blob module was stubbed. The old implementation failed with `URL.username is not implemented` on RN 0.76.9. Unit tests additionally reject credentials, control characters, backslashes, query strings, fragments, invalid hosts/ports, and nonlocal HTTP.
- **Repeated identity during metadata collection:** feedback and review-signal requests now complete when the same context is supplied again. Real user changes, changes to user details, and logout still cancel pending requests before HTTP dispatch.
- **Unicode feedback limit:** the compiled SDK sent and persisted messages with exactly 5,000 ASCII characters, 5,000 emoji, and 5,000 mixed characters. All three 5,001-character variants were rejected before HTTP. This matches the backend's character count.

The latter two fixes were exercised through **six new HTTP requests** into the real Laravel HTTP kernel at app revision `e04326164a67d6f952033da1cea10673c9795586`. The fixture used SQLite `:memory:`, fake queue/mail, and blocked external HTTP; `make check-worktree` passed before execution. Database inspection confirmed four feedback rows, one review signal, and no SDK user created for the cancelled identity. This was a targeted rerun of the affected behavior, not a repeat of the initial 30-request sweep.

The updated tarball installed successfully in clean CJS/ESM consumers and the Expo fixture. The two compiled entrypoints used for verification and installed in the Expo consumer were byte-identical:

```text
dist/index.js  b42f24e43941643376019f32f6d655a055047d2d0ebd989f45d2a070ab6a43db
dist/index.cjs e148345449732583f70f55952af375dee989b44c8a031a85e0084ffa0b8bf2d1
```

## Expo consumer

An Expo 57.0.24 / React Native 0.86.3 / React 19.2.3 fixture installed the updated packed SDK and imported/configured it from the application entrypoint. `expo export --platform ios --platform android` succeeded again after the fixes and generated Hermes bytecode for both platforms. No native bridge, config plugin, or additional SDK runtime dependency was needed for this export.

This verifies package resolution and native bundle compilation. **It does not verify execution in Expo Go, an iOS simulator, an Android emulator, or a physical device.** Those runtimes were unavailable on the Linux verification host. Device execution remains a release check, using a local fixture API.

## Review and remaining constraints

The initial independent review checked API parity, headers, identity handling, error paths, serialization, package exports, and the app's guide link; its missing `#quick-start` heading finding was fixed. The subsequent Fable 5.1 SDK review produced the three confirmed defects addressed above. A fresh independent reviewer checked the fix diff and reported no additional confirmed defects.

Two other Fable observations were not confirmed: the cited Android header-stripping implementation is absent from RN 0.86.3, and Bun installation was not tested or promised by the npm-only preview instructions. Neither is evidence of a verified device runtime or Bun compatibility. The README now explicitly describes the supported custom URL forms and locking the Git preview to its resolved commit.

- The package has not been published to npm; the README provides Git installation for this preview.
- User isolation above follows the supplied user ID. The existing API does not authenticate that identity; a publishable key is not proof of who a user is. Signed identity is a separate backend change required before relying on these endpoints for sensitive, authenticated user data.
- The existing backend derives review territory from the first two characters of locale (for example `en-US` becomes `EN`). This pre-existing matching limitation is outside the SDK addition. The SDK sends the real locale without fabricating a region or changing its format.
- Review-signal recording was verified. Showing a store review dialog and matching a real store review were not tested or claimed.
- No production deployment, store operation, or native SDK release was performed.
