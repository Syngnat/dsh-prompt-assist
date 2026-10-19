# Changelog / 变更记录

[English](<README.md>) | [简体中文](<README.zh-CN.md>)

## 1.2.18 — 授权后 Fast 立即生效 / Authorization reaches the Fast control

- Fix: authorizing a provider in the settings page did not un-block the Fast control. A profile authorization is durable profile state, not a session event, so a session's projection wire can keep the allowlist it was built with. The Client now merges the Host-authoritative authorization snapshot into the control's eligibility, refreshes it after every successful authorize/revoke, and re-reads it on load.
- The merge never grants anything by itself: the Host still owns the real allowlist and the request-time check. An idle or failed snapshot leaves the control unavailable instead of assuming access.
- Add regressions for a profile authorization that postdates the wire, idle/failed snapshots that must not grant, and the snapshot source's request de-duplication, filtering and disposal.

中文：修复“已在设置页授权供应商，但 Fast 仍显示未授权”的问题。授权属于 profile 持久状态而不是会话事件，因此会话投影可能仍带着旧的允许名单；客户端现在会把 Host 权威的授权快照合并进 Fast 的可用性判断，并在每次授权/撤销成功及页面加载后重新读取。合并本身不授予任何权限，Host 仍是唯一权威，快照不可用时保持不可用。

## 1.2.17 — 授权候选为空时给出明确原因 / Explaining an empty candidate list

- When no additional provider can be authorized, the settings section no longer renders an empty, disabled selector. It now explains which case applies: every provider that offers OpenAI-family models is already authorized by the package, or no registered provider currently offers an OpenAI-family model.
- Built-in IDs list the OpenAI-family models the Host recognized for them, so a user can see whether the actual route (for example `cpa / gpt-6.1-sol`) is already covered instead of assuming the section is broken.
- The selector placeholder is its own label instead of repeating the field label.
- Unchanged: authorization is still limited to registered providers with an OpenAI-family model, still needs explicit consent and a revision guard, and still cannot grant the package-configured IDs.

中文：候选为空时不再显示空的禁用下拉框，而是说明是“所有提供 OpenAI 系列模型的供应商都已内置授权”，还是“当前没有已注册且提供 OpenAI 系列模型的供应商”；内置项会显示 Host 识别到的模型名，便于确认实际路由（例如 cpa / gpt-6.1-sol）是否已被覆盖。授权限制不变。

## 1.2.16 — Priority 供应商自助授权 / Self-service provider authorization

- Add **Prompt assist → Priority provider authorization**. A profile can now authorize another provider ID without editing or reinstalling the package; the shipped `openai`, `openai-codex` and `cpa` entries stay the baseline.
- Restrict authorization on the Host, not just in the UI: the provider must be registered in the live LLM registry *and* its model catalog must contain at least one OpenAI-family model. Both checks run again at write time, so a stale or crafted request cannot authorize anything else. Missing, failing or changed catalogs never grant access.
- Require a separate risk confirmation, a monotonic revision for every write, a 32-entry cap, and refuse to authorize or revoke the package-configured IDs. Unknown or offline providers cannot be granted, but an already authorized provider can still be revoked after it disappears.
- Publish the effective allowlist (configuration plus profile authorizations) through the existing projection wire, so the Fast control becomes usable without rebuilding the projection. The resolver stays live, and previously returned wire views remain frozen copies.
- Runtime gating is unchanged: Priority still requires an OpenAI-family model, an authorized provider and a supported OpenAI API. Authorization records user consent for that endpoint; it does not prove the endpoint implements `service_tier`.
- The disabled Fast control now points to this settings section, so an unauthorized provider explains exactly where to fix it.
- Add 63 offline regressions (host store, RPC envelope, candidate filtering, consent/revision/limits, client controller and SSR), bringing the suite to 665.

中文：设置页新增 Priority 供应商自助授权，无需改包即可授权其他接入点。Host 强制限制候选：必须已在 LLM 注册表注册，且模型目录确实包含 OpenAI 系列模型；写入时会重新校验，陈旧或伪造请求无法授权别的东西。授权需单独风险确认、带 revision、最多 32 项，包内置项不可撤销或重复授权。有效名单通过投影即时生效；运行时仍要求 OpenAI 系列模型 + 已授权供应商 + 受支持协议。Fast 不可用时的提示会指向该设置项。

## 1.2.15 — Fast 禁用原因可见 / Visible Fast availability reasons

- The Fast control no longer uses a native `disabled` button. It keeps `aria-disabled` semantics, stays focusable and hoverable, and clicking it explains why the toggle is unavailable — including the exact provider ID when that provider is not authorized for Priority.
- Move the hover explanation to the wrapping element, because Chromium does not show `title` on disabled buttons. The reason also appears in a visible popover after a blocked click.
- Add regressions for the `aria-disabled` semantics, the absence of a native `disabled` attribute, the wrapper carrying the reason, and the still-usable approved route.
- Unchanged: no Priority payload is sent to an unauthorized route, saved preferences are untouched, and the reason text never claims that Priority billing stopped.

中文：Fast 按钮不再使用原生 disabled，而是 aria-disabled：仍可聚焦和悬停，点击会就地说明不可用原因，未授权供应商时明确显示实际供应商 ID。悬停提示移到包装元素，避开 Chromium 不对禁用按钮显示 title 的限制。未授权路由仍不会注入 Priority。

## 1.2.14 — Assist error clarity and update-page hierarchy

- Stop failing an enhancement or suggestion only because the saved auxiliary Fast setting cannot apply to the followed model. The request now runs without Priority and reports that Fast was skipped; the saved setting is untouched, so switching back to an eligible route restores it. No Priority payload is ever added for an ineligible route.
- Name the actual auxiliary failure instead of showing one generic sentence: cancelled, empty result, provider/model failure and Fast incompatibility each get their own message, and unknown codes show a sanitized safe code for support.
- Give the online update page a real visual hierarchy: an availability banner with a badge, filled high-contrast primary buttons, a warning-accented confirmation card with grouped risk consent, and an emphasized latest-version value. Colors use theme tokens only, so light and dark themes both follow the Host.
- Preserve update semantics: checking still never installs, confirmation still requires explicit risk consent, and no new network request or automatic retry is added.
- Add 27 offline regressions, bringing the suite to 601: route-level Fast skipping for followed and explicit non-OpenAI routes, unchanged Priority injection for eligible routes, specific error mapping with sanitized codes, the settings card's non-blocking Fast notice, and SSR checks for the new update-page structure in both languages.

中文：增强/下一问建议不再因为“辅助 Fast 对当前模型不可用”而整体失败；改为跳过 Priority 继续生成并明确提示，已保存的 Fast 设置不变。失败信息改为具体原因并附安全错误码。在线更新页增加新版本横幅、醒目的主按钮、风险确认卡片和版本高亮，颜色全部使用主题 token。本版新增 27 项离线回归，总计 601 项。

## 1.2.13 — Defensive Fast visibility

- Keep recognized OpenAI-family controls visible while Priority authorization or projection state is unavailable. Show a disabled switch with the reason rather than silently hiding it; an unapproved provider cannot enable Priority.
- Share case-insensitive model-family recognition between Host and Client. Keep provider route IDs explicit and case-sensitive; do not automatically authorize compatible gateways.
- Mark projection hydration ready only after a successful usable read, deduplicate pending reads, retry missing/failed startup snapshots within a bounded lifecycle and stop retries on unmount.
- Add 25 real-component SSR and deterministic failure/retry regressions, bringing the offline suite to 574. This hardens reproducible source paths; it does not establish the root cause on an inaccessible reported machine.
- Clarify that loading status does not turn off an existing Host Fast preference or promise that Priority billing has stopped. Preserve existing preferences, global feature switches and model budgets.

中文：GPT系列Fast不再因供应商未获准或投影缺失而静默隐藏；改为禁用并解释原因，首次同步失败可有界恢复。不扩大Priority授权，不改变已有设置，不将防御修复冒称另机根因已确认。

## 1.2.12 — Profile-wide feature switches

- Persist enhancement and suggestion enabled flags per DSH profile instead of initializing them for every new conversation. Global controls are usable without choosing a session; other model/reasoning/Fast/Q&A controls remain session-local.
- Synchronize existing and new conversations through authenticated read-only snapshots with revision ordering, reject stale writes, cancel obsolete work and retain choices after Host restart.
- Keep historical session enabled records replay-compatible but non-authoritative. Do not automatically expand old session consent into global paid-request authorization; explicitly enable each global switch once.
- Preserve profile isolation, main Fast and existing session parameters. Publishing never upgrades an existing user installation.
- Exclude already-aborted jobs from request coalescing, so re-enabling during slow cancellation can start a fresh request without joining the cancelled one.
- Add profile persistence, cross-session state, snapshot ordering, stale-write, reconnect/baseline and lifecycle regressions: 549 offline tests plus real rc.1/rc.2 storage contracts. No real model requests are used.

中文：两个启用开关改为当前profile全局持久化，新会话无需逐个开启；模型等参数仍按会话保存。旧会话开关不自动迁移为全局收费授权，需在全局区明确开启一次。

## 1.2.11 — Confirmed online updates and provider-model budgets

- Add a separate prepare, explicit unchecked risk consent, and confirm flow for supported GitHub installations. Pin target/recovery commits and run replacement through public DSH Plugin Manager APIs and a Host-owned job; checking alone never installs.
- Verify actual loaded versions after update and recovery. Handle cancellation, restart requirements, lost receipts and failed best-effort recovery without silently resubmitting. Replacement is profile-wide and non-atomic; jobs survive page closure, not Host restart.
- Follow selected provider/model input windows and native output defaults. Remove fixed auxiliary 1024/4096-token budgets and extra draft/Q&A/output/transport text caps; an omitted output cap remains omitted. Preserve complete Q&A and use the Host token estimator rather than treating UTF-8 bytes as tokens.
- Preserve timeout reasons when transports throw a generic AbortError, prevent cross-generation budget/window/effort cache reuse, and transmit streaming progress as deltas while accepting older cumulative frames.
- Keep the independent 120-second deadline, explicit file-access safeguards, native carrier limits, existing feature settings and main Fast behavior. No automatic paid retry, reasoning downgrade or main-conversation parameter change.
- Validate 499 offline regressions, real rc.1/rc.2 LLM/token-estimator and jobs contracts, and reproducible prebuilt artifacts. Isolated Windows rc.2 update lifecycle checks use local packaged fixtures, not a real future GitHub release or live model evaluation.

中文：新增用户明确确认后的在线更新；输入输出额度跟随供应商模型设置，取消插件额外文本限额，修复超时误报和换代缓存。文件读取与120秒等待保护保留。更新可能影响整个profile且恢复可能失败，不自动安装、重试收费请求或调整推理档位。

## 1.2.10 — User-perspective drafting and normal abstention

- Enhancement uses confirmed context, preserves user-to-assistant intent, and retains unresolved core wording instead of inventing self-questions or clarification steps.
- Next-question rules preserve original user questions and authorization limits; unconfirmed assistant advice is not promoted to user intent.
- Add a strict suggestion/none model-output protocol. Valid none is a successful, empty-text outcome; empty, malformed, truncated, cancelled and failed responses are not silently converted to none.
- Buffer suggestion output until validated; show a neutral dismissible no-suggestion status without adopt/copy actions. Enhancement streaming remains unchanged. Context/configuration/session changes invalidate stale results.
- Add two nine-case semantic reference corpora and offline protocol/cache/transport/controller/SSR regressions: 402 total tests. Reference examples are not real-model results; live semantic and protocol-adherence acceptance remains unperformed.
- No changes to saved configuration, main Fast, manual update installation policy or time formatting.

中文：修正增强和建议的用户视角；无依据时建议可正常返回“暂无建议”，不作为可采用正文。测试验证机制，不宣称真实模型语义验收通过。

## 1.2.9 — First-conversation preview layout

- Prevent the complete result card from shrinking inside the native hero flex layout; retain space for header and action buttons.
- Let long result text absorb height pressure and scroll; bound expanded details without changing generation/apply/undo behavior.
- Add three offline sizing regressions and a real-browser native-hero layout probe covering five viewports and eight states, with synthetic results and no model calls.
- Preserve package identity, stored settings, manual update checks and the unversioned install target.

中文：修复新会话首屏结果框被压成窄条和操作按钮裁切；新增40组浏览器布局检查，不改生成逻辑和已保存配置。

## 1.2.8 — Manual stable-update checks

- Add a global Plugin updates section to the Prompt assist settings page: explicit checks, current/latest stable versions, check time, release link, copyable unversioned address and manual-upgrade instructions.
- No startup/background checks, automatic downloads, installs or one-click-upgrade workflow. UI and read-only tool share one bounded Host service; errors never mean up to date.
- Keep main as the verified stable channel. Development/candidates use other branches, with exact-commit CI gates and a maintainer-only publishing script that verifies main/tag/latest Release consistency.
- Connect the existing Host capability preflight to the actual entry before any adapter resolution or mounting, with an entry-level regression test.
- Keep plugin/persistence identities, auxiliary configuration, main Fast and existing layout unchanged.

中文：新增手动检查稳定版和新版提示；不自动下载安装。对外统一无版本号地址，默认分支只保留已验证稳定版。原配置和功能保持不变。

## 1.2.7 — Capability-based compatibility

- Replace the exact DSH prerelease pin with a minimum-only requirement: `>=0.2.1-rc.1`. No upper-version cutoff or compatibility exemption.
- Check required Host capabilities before mounting. Keep the strict Fast adapter guard and report the missing integration seam.
- Add version-admission regressions and CI against real DSH rc.1/rc.2 adapter exports without model calls.
- Preserve package/persistence identities, existing settings, layout, and request behavior.

中文：取消精确版本锁与未来版本上限，改为最低支持版本加实际接口检查；修复 DSH rc.2 的版本拒绝，不改变已有配置和功能。

## 1.2.6 — First public GitHub distribution

**Validation:** 221 offline tests passed on Windows. A clean DSH 0.2.1-rc.1 profile passed archive installation, complete schema import, Host startup and authenticated plugin RPC smoke without a model call. Full GUI/provider acceptance and macOS/Linux runtime tests remain unverified.

### Included

- Standalone GitHub distribution under `Syngnat/dsh-prompt-assist`, with prebuilt Host and Client artifacts. No npm publication is claimed.
- Sidebar settings for two independent per-conversation features: prompt enhancement and next-question suggestions. Each keeps its own provider/model, native reasoning effort, auxiliary Fast switch, and complete-Q&A count.
- Direct toolbar enhancement and suggestion actions, with inline streaming previews, explicit apply/copy, guarded plain-text replacement, and conditional undo.
- Enhancement of the original draft while the main conversation is busy; suggestions wait for an idle conversation. Automatic suggestions only follow a new complete Q&A with an empty, reference-free, attachment-free draft.
- Existing OpenAI Fast behavior retained, with its icon next to the model selector. Priority requires an allowed OpenAI route and upstream support, and may cost extra. Auxiliary Fast stays independent.
- Explicit file selection with 64 KiB/file and 128 KiB/total limits; uploaded image/attachment content and folder traversal are not included.
- Seconds-based duration display rounded down, with generation details and clear output/wait-budget errors.
- English and Simplified Chinese documentation, an MIT license, and a security-reporting policy.

### Compatibility and limits

- Declared DSH compatibility remains exactly `0.2.1-rc.1`; development requires Node.js 22+.
- Package identity remains `@local/dsh-openai-fast`; existing projection identities are retained for prior local users. Upgrading replaces the plugin dependency, not session records or provider/source configuration. Back up normal DSH data before upgrading.
- Native Ghost, ArrowRight acceptance, structured-reference apply, and a new Ctrl+Alt+E shortcut are not supported.
- Offline tests do not establish visual acceptance, live-model correctness, or an independent security audit.

### 中文摘要

以 `v1.2.6` 首次公开分发“提示词辅助与 Fast 加速”。提供提示词增强、下一问建议和 OpenAI Fast 加速，支持按会话独立配置模型、推理档位及辅助 Fast。保留原包与投影标识，通过 GitHub tag 分发预构建产物，不声称 npm 已发布。Windows 独立 profile 安装、导入、启动及接口冒烟已通过；完整界面流程未验收，macOS/Linux 未测；当前仅声明兼容 DSH `0.2.1-rc.1`。

Prior local iterations are not listed as separate public releases.
