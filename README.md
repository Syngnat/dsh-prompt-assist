[English](<README.md>) | [简体中文](<README.zh-CN.md>)

# Prompt Assistance & Fast Acceleration

Provides prompt enhancement, next-question suggestions, and OpenAI Fast acceleration, with per-session configuration of models, reasoning effort, and auxiliary Fast.

A plugin bundle for the DeepSeek Harness (DSH) Web GUI. Enhancement and suggestions are independent features: enable either or both for the conversation you choose. Settings live on the sidebar page, not in a composer popup.

> **v1.2.10:** improves user-perspective rules for enhancement and next-question suggestions, and adds a normal, non-adoptable no-suggestion state. Offline contracts and state-flow tests pass; live model semantic acceptance has not been performed.

## Compatibility policy

Version admission uses `engines.dsh: >=0.2.1-rc.1`. This admits newer RC, patch, minor and major versions without asserting they have all been tested. Before mounting, the plugin checks the required Host capabilities; the Fast bridge retains its fail-closed adapter check. Missing capabilities are named in the error rather than guessed from a version number. CI checks version admission and real adapter contracts for both current verification targets.

## Requirements

- **Minimum DSH: `0.2.1-rc.1`, with no future-version ceiling.** Runtime capability checks—not a minor-version cutoff—guard the required Host APIs and Fast adapter seam. DSH `0.2.1-rc.1` and `0.2.1-rc.2` are the current verification targets; a newer version number alone is not rejected, but an actual API break may still require an integration update. No version exemption is used.
- A configured provider and model in DSH. This plugin does not supply API credentials.
- Network access to GitHub for installation and to your selected provider for generation.
- **Node.js 22+ and pnpm are for development only.** The distributable includes prebuilt runtime artifacts; ordinary users do not need to build the plugin.

## Install from GitHub

Open **Plugins** in DSH, choose the install action, and enter this package target:

```text
github:Syngnat/dsh-prompt-assist
```

The agent-facing equivalent, when plugin management is available and authorized, is:

```js
plugin_manager({
  action: "install_bundle",
  target: "github:Syngnat/dsh-prompt-assist"
})
```

No version number is needed. DSH installs the default branch, not GitHub Releases automatically. This repository keeps `main` at the latest validated stable release, including prebuilt runtime files. Development and candidates stay on other branches. An existing installation does not automatically follow new commits.

Do not enter a GitHub `/tree/` page or the bare `Syngnat/dsh-prompt-assist` shorthand.

Read the installation result. `application: applied` confirms Host activation; `restart-required` needs a DSH restart. A successful package download alone does not prove that the browser UI works. If dependency scripts are blocked, review the returned package names before approving them; do not enable scripts globally.

The package identifier remains `@local/dsh-openai-fast`, even though this repository is named `dsh-prompt-assist`. Its `private: true` flag prevents accidental npm publication; it does not prevent GitHub installation.

## Use

### Configure the intended conversation

1. Open the conversation you want to configure.
2. Select **Prompt assist** in the left sidebar. Check the conversation identifier shown on the page.
3. Configure **Enhance prompt** and **Next-question suggestions** separately. Each has its own enabled state, provider/model, native reasoning effort, auxiliary Fast switch, and Q&A round count.
4. Save each feature you change, then choose **Back to conversation**. Both features can remain enabled.

Features start disabled. Following the session follows only its model and reasoning effort; auxiliary Fast always remains an independent setting. Choose 1, 3, 5, or a custom **1–20 complete Q&A rounds**. Invalid values are rejected, not silently clamped. A model change that invalidates a saved effort requires an explicit new choice; the plugin does not silently lower the effort.

### Enhance a draft

Write the original text in the composer and click the enhancement icon button. Enhancement improves that text; recent complete Q&A supplies background, not a replacement task. It can run while the main conversation is busy, provided the composer remains editable and the session grants access. It does not send the enhanced text as a chat message.

Review the inline result, compare the original when needed, then copy or apply it. Pure-text application checks the original draft and revision, creates one undoable text edit, and leaves attachments unchanged. Editing the draft cancels obsolete work. Undo is offered only while the applied text and revision still match.

Enhancement keeps the user speaking to the assistant. It uses relevant confirmed context without adding clarification steps; when core meaning cannot be established, it conservatively edits or retains the original rather than guessing.

### Suggest the next question

Automatic suggestions use the latest selected complete Q&A pairs. They run only after a **new** complete Q&A becomes available, while the conversation is idle and the draft contains no text, references, or attachments. Mounting or reopening the UI establishes a baseline; it does not replay an old Q&A. The toolbar suggestion button can request a suggestion from existing complete Q&A when eligible.

Suggestions are unavailable while the main conversation is busy. If typing, settings, model, conversation, or Q&A changes invalidate a request, its result is discarded. A cancelled automatic attempt is not silently repeated; use the manual button when needed.

Suggestions preserve user questions and permission boundaries, do not promote unconfirmed assistant advice, and abstain when no grounded next step is available. A normal no-suggestion result displays a neutral dismissible status, never adoptable/copyable prompt text. Suggestions wait for complete protocol validation before display; enhancement keeps its streaming preview. Empty, malformed, truncated or failed responses remain errors, not normal abstentions.

### Fast

The main **Fast** icon button sits next to the model selector. It applies Priority handling only to explicitly allowed OpenAI model routes, subject to upstream support. It may incur extra charges; it is not a guarantee of lower latency. Supported subagents inherit the parent preference until they override it.

The Fast switch for each auxiliary feature is separate from the main Fast button and from the other auxiliary feature. Enabling one does not enable the others. Unsupported routes cannot enable auxiliary Fast, and an already checked switch can still be turned off.

### Files and references

- Existing file references are not read automatically. Explicitly select the files you want the current enhancement request to read.
- Limits are **64 KiB per file** and **128 KiB total** (65,536 and 131,072 bytes). Oversized inputs are rejected, not silently truncated.
- Folders are not traversed. Session references and uploaded images/attachments are not read as file content. Unsupported or sensitive files may be refused.
- Visible reference names may be included as context. A draft containing structured references or a command supports preview/copy only: structured apply is not supported.

### Preview and timing limits

Results stay in the allocated inline composer area instead of a floating overlay. Settings use a separate sidebar page; return to the conversation to edit the draft. Apply becomes available only after generation completes. Displayed durations use seconds rounded **down**, so a subsecond duration appears as 0 seconds. A cache hit shows the timing of the original generation.

This release does **not** implement native Ghost text, ArrowRight acceptance, or a new Ctrl+Alt+E shortcut. Use the explicit buttons. Output/token and wait limits can stop a request; reasoning may consume the same output budget. The plugin does not automatically retry paid requests or change the reasoning effort to work around a limit.

## Check for stable updates

Open **Prompt assist** in the sidebar and find **Version and updates** below the feature settings. No conversation selection is required for this global section.

- Opening the page reads only the Host's in-memory status. There is no startup check, background polling or scheduled network check.
- Click **Check for updates** to query this repository's public GitHub latest-release endpoint. Drafts and prereleases are rejected. The result distinguishes a newer stable version, the same version, a locally newer version, and a failed check.
- The section shows current/latest versions, the check time, a release link, the fixed installation address and manual-upgrade instructions. A failed check is not reported as up to date.
- Checks time out after 10 seconds, limit response size, coalesce concurrent requests and use a short 30-second cooldown. The shared status is ephemeral and resets when the Host/plugin restarts.
- Checking sends no conversation, draft, file, provider credentials or model request. GitHub receives ordinary network metadata such as the Host IP and request headers.
- **No update is downloaded or installed.** The built-in DSH plugin page is not given an automatic update capability by this feature.

## Privacy and security

Generation sends the draft, the selected complete Q&A context, visible reference names, and any explicitly authorized file content to **the provider you selected in DSH**. Review those contents before requesting assistance.

This plugin does not send data to a developer-operated server and does not add telemetry. DSH and your provider may have their own logging and retention policies. Installing a DSH Host plugin permits local code execution with the host user permissions; it is not a workspace sandbox boundary. Model output is untrusted and should be reviewed before use. No independent security audit is claimed. See [Security policy](<SECURITY.md>).

## Upgrade and remove

1. Keep a normal backup of your DSH profile and session data. Save drafts and feature settings before upgrading.
2. In **Plugins**, identify the existing bundle by its manifest name, `@local/dsh-openai-fast`. Remove the old plugin dependency before adding the same unversioned GitHub target again. Do not delete profile or session data.
3. Install using `github:Syngnat/dsh-prompt-assist` and follow the returned restart/application status. New releases do not silently update an existing installation.

For existing local users, the package and projection identities are retained. Upgrading the plugin dependency does not delete session records or require rewriting your provider/source configuration. Existing profile overrides can still affect activation. Profiles without live reload may require stopping DSH before removal and restarting after installation. A backup remains prudent; this is not a guarantee of compatibility with future DSH versions.

### Moving from an existing local-directory installation

A long-running DSH process can retain the old local package directory after switching the same package name to an archive or GitHub source. If installation reports an old-path ENOENT, do not copy generated files into that old directory. Remove the old dependency, fully quit and restart DSH, then install the unversioned GitHub target. Session records and feature identities are unchanged.

## Development

Use a standalone checkout with Node.js 22+ and pnpm. Create a development branch before editing:

```sh
git clone https://github.com/Syngnat/dsh-prompt-assist.git
cd dsh-prompt-assist
git switch -c feat/my-change
pnpm install --ignore-scripts
node build.mjs
node --test tests/*.test.js
```

The build emits the versioned Host artifact and the Client artifacts declared by the [package manifest](<package.json>). Keep React and Harness Client modules external. Commit the distributable artifacts with the release tag so installation does not depend on a local checkout or an installation-time build script.

Tests use Node built-ins and mocked/offline transports. Passing unit tests is not a visual acceptance result and does not verify a live model route. Do not add paid model requests to routine tests.

Maintainers: follow the gated [stable release procedure](<RELEASING.md>). Never commit candidate work directly to `main`.

### Composer layout regression

Use an isolated DSH Web profile and a fresh, unsent conversation, with a disposable Playwright CLI session. After dismissing onboarding and entering a harmless two-line draft, run `node scripts/test-preview-layout.mjs --session <session-name>`. The probe renders the real Preview component with synthetic results in the native hero composer and checks five viewport sizes across eight states. It checks button bounds, hit targets, horizontal overflow and composer reachability; it never calls a model or applies text. It restores the viewport and removes its test DOM/CSS. Run only in the isolated page, not a user conversation. Reports go to ignored `output/playwright/`. This browser check is separate from the default offline Node test suite.

## Validation status

| Area | Release status |
| --- | --- |
| GitHub distribution | Prebuilt tag and release assets; see the GitHub release for download verification |
| Windows DSH `0.2.1-rc.2` | Earlier v1.2.9 activation/settings/slot checks; current-profile upgrade not performed for v1.2.10 |
| Real DSH rc.1 / rc.2 adapter contracts | Both CI jobs passed without model calls |
| Windows update section | Real Chrome click → authenticated Host route → GitHub stable metadata verified in an isolated DSH rc.2 profile; guide and rendered layout checked |
| v1.2.10 suggestion outcomes | Offline model-fixture → Runtime/cache → RPC/stream → controller/SSR checks; no live browser or model acceptance |
| macOS and Linux | CI build and the offline test suite passed; DSH runtime not tested |
| Independent security audit | Not performed/claimed |

The current candidate passes 402 offline tests locally. [GitHub Actions](https://github.com/Syngnat/dsh-prompt-assist/actions) covers Windows, macOS and Linux builds/tests plus real DSH adapter-contract checks; stable publication requires successful exact-commit CI. Earlier update-page and first-session layout browser checks do not constitute v1.2.10 live-model or new-status UI acceptance. No live model semantic or output-protocol adherence evaluation was performed for this release.

## License

[MIT](<LICENSE>), copyright 2026 Syngnat. See the [changelog](<CHANGELOG.md>) for release notes.
