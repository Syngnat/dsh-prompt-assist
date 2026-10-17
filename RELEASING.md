# Stable GitHub release procedure

English / 中文

## Policy

- Public install target: `github:Syngnat/dsh-prompt-assist`.
- `main` is a distribution channel, not a development branch. Keep it at the latest validated stable release with committed prebuilt files.
- Work on `feat/*`, `fix/*` or `release/*` branches. Candidates and prereleases must not be promoted to main.
- Every stable release advances package version and carries an immutable annotated tag, GitHub Release, prebuilt Host/Client files, archive and SHA-256 checksum. Never move a published tag.
- The plugin's update checker only reads public release metadata. The maintainer publishing script is not shipped in the runtime archive and never upgrades a DSH profile.

## Prepare and verify

1. Branch from stable main; implement changes and tests. Update package version, versioned Host export/files and the Host shim; generate artifacts with `pnpm run build`.
2. Run offline tests, inspect the diff and package contents, and verify the actual user-facing capability in an isolated DSH profile. Use no real paid model request for release checks.
3. Update both READMEs, security data flows and changelog. They must advertise the unversioned install target. Keep metadata, package identity and stored settings compatible.
4. Commit source and generated artifacts on the candidate branch, push that branch, and wait for successful **Build and test** CI for the exact candidate commit. CI includes three operating systems and both current DSH adapter-contract targets.
5. Prepare release notes outside tracked source, for example under ignored `.release-check/`. Record verified results separately from UI/model/platform limitations.

## Publish explicitly

Run the plan first (no mutation):

```sh
pnpm run release:stable
```

After reviewing the plan, publish:

```sh
pnpm run release:stable -- --publish --notes .release-check/release-notes.md
```

The script refuses main/detached work, an unclean checkout, prerelease versions, another origin, an unpushed candidate, missing successful candidate CI, a non-increasing stable version and an existing release tag. It rebuilds and reruns tests, packs an archive, creates the tag and a draft Release with assets, then fast-forwards remote main and publishes the Release as latest. Finally it checks that main, the peeled tag and the candidate SHA agree and that GitHub's latest Release names that tag.

Git refs and GitHub Release publication are separate network operations, not an atomic transaction. On a partial failure, inspect the exact tag, draft/public Release and main before continuing. Complete publication of the already verified candidate; do not force-push, rewrite tags, publish a different candidate under the same tag or silently call a partial publication successful. If the tag exists before the draft is created, create the draft for that exact tag and resume the remaining reviewed steps manually.

After completion, verify a fresh install from the **unversioned** target resolves the published package version. Any upgrade of a user's current profile is a separate, explicitly authorized operation through DSH Plugin Manager. Follow its applied/restart-required result, verify retained settings, and distinguish Host/slot verification from full visual acceptance.

Synchronize the local main only after remote publication succeeds:

```sh
git fetch origin main
git switch main
git merge --ff-only origin/main
```

## 中文摘要

main只放已验证、可安装的最新稳定版；开发在其他分支。候选提交必须包含预构建文件，并通过同一SHA的CI后才允许晋升。发布脚本默认只显示计划，显式添加--publish才创建tag/Release并快进main。发布完成后核对main、tag、Release一致，并测试无版本号安装地址。网络操作无法成为单一事务，部分失败必须检查并完成同一候选的发布，不改写已有tag，不谎报完成。本脚本不升级任何用户的DSH；用户升级仍是独立授权的手动管理操作。
