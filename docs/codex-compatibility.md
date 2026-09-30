# Codex compatibility, 2026-09-30

## Release baseline

- Desktop: **26.928.20755**, downloaded from the macOS link on the [official app page](https://learn.chatgpt.com/docs/app). Its packaged CLI reports **0.159.0**.
- Standalone CLI: **0.159.2**, the latest stable release returned by the [official release API](https://api.github.com/repos/openai/codex/releases/latest) on 2026-09-30. See the [release](https://github.com/openai/codex/releases/tag/rust-v0.159.2) and [changelog](https://learn.chatgpt.com/docs/changelog).
- Repository baseline: `shay-wong/codex-panel`, commit `9628e79`.

Desktop and CLI versions are separate. The installed desktop version was not used as the compatibility target. This is a dated baseline, not a guarantee for future releases.

## Changes

The macOS launcher previously checked `Contents/Resources/codex`, which no longer exists in the latest desktop bundle. Executable discovery and native signature verification now select `Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex`. This is the real signed executable, not the shell wrapper in `codex-cli/bin`. Existing flat bundles remain supported. OpenAI application and executable signing identities are still checked.

The default-off custom-provider sending adapter recognizes the expanded native composer gate in `app-primary-92c16ff2fe4e.js`. It retains the additional pending-session, unavailable-thread, service-tier-loading, and policy checks. The switch still affects only the two account quota conditions for a known local non-OpenAI provider. It does not change official account limits, provider credentials, remote execution, or the installed application.

The project model menu and host validation include `gpt-6.1-sol`, `gpt-6-sol`, and `gpt-6-luna`. Efforts and defaults were checked against the real `model/list` response from CLI 0.159.2. Saved selections and the automation default are unchanged. Account availability can differ; the desktop's bundled 0.159.0 catalog does not yet contain `gpt-6.1-sol` in a signed-out session.

## Verification

- Real desktop packaged CLI: executable discovery, initialization, `model/list`, `skills/list`, and ephemeral `thread/start` succeeded with disposable state and workspace directories.
- Real standalone CLI 0.159.2: the same operations succeeded; new model efforts and defaults match the returned metadata.
- Official desktop bundle and nested executable passed strict signature verification outside the filesystem sandbox. The executable identity is `codex`, team `2DC432GLL2`.
- The real 26.928.20755 composer source is recognized, its non-quota blockers remain in the replacement, and the replacement passes JavaScript syntax checking.
- `npm run typecheck`, `npm run build:web`, and `npm run build:launcher` passed. The web build retains existing CSS pseudo-element and chunk-size warnings.
- Focused automation/executable checks: 12 passed, one Windows-only case skipped on macOS.
- A browser preview with isolated Panel data loaded successfully. The project automation menu displayed all three new models and saved a selection of 6.1 Sol while automatic execution remained disabled.
- Composer/injector checks: 30 passed, including the latest gate's loading/session conditions and live switch changes. The filesystem-watch check required running outside the sandbox after sandboxed `fs.watch` returned `EMFILE`.

## Remaining validation

This machine has no Rust toolchain or Xcode command-line tools, so the native launcher was not compiled or packaged. The frontend launcher build is not a native build. No signed-in desktop injection or real model submission was performed, and Windows/Linux were not exercised. These steps remain necessary before claiming a fully verified desktop release. No installed app, production Panel data, login credentials, or existing conversations were modified.

To build the macOS launcher on a machine with the required toolchain, install Node.js 22.5+, Xcode command-line tools, and Rust, then follow the repository's `npm ci` and `npm run app:build:local` instructions. Install only after reviewing the resulting build.
