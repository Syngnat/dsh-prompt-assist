# Changelog / 变更记录

[English](<README.md>) | [简体中文](<README.zh-CN.md>)

## 1.2.30 — 增强超时、顶档呼吸与流式顺序修复 / Enhancement deadline, apex breath and stream order（2026-10-20）

- 修复「增强提示词」可能永久等待：模型流在请求被接受后若不再产生任何 chunk，原来的 `for await` 只在收到 chunk 时才检查取消信号，120 秒超时无法中断它，界面会一直停在「正在增强…」。现在每一步都与取消/超时竞速，超时立即返回 `timeout` 并释放 provider 流；客户端另加 135 秒兜底，传输层卡死也不会让输入框永久 pending。
- 修复「减弱动态效果」下最高档点阵闪烁过快：原版 D40 net 把顶层闪烁压缩到 0.01ms 并保留 `infinite`，实际表现为高频噪点，且每帧重绘 300 个格子，菜单滚动随之掉帧。减弱动态效果下改为整个矩阵一次 2.4 秒呼吸（单个合成动画），逐格闪烁停止；正常模式保持原版 1.45 秒逐格闪烁。真实 Chromium 帧采样中顶档滚动的长帧（>32ms）从 6 降到 0。
- 修复流式 NDJSON 传输的两个顺序问题：写入水位在 enqueue 之后才推进，重入的 `pull` 会重发同一段增量，预览出现重复文本；尾部增量也可能排在 `result` 帧之后。现在先推进水位再写，并在 `result` 之前补齐尾部增量。
- 新增 4 项中断测试（调用方取消、截止时间、迭代器释放、已中止不触达 provider）与减弱动效呼吸断言。无网络格式或存储变化。

## 1.2.29 — 设置点击修复、最高档动效恢复与常驻供应商分组 / Clickable settings, apex motion, pinned providers（2026-10-20）

- 修复设置页不可点击：草稿反馈区（未保存提醒、过期错误、重置与保存通知）原先是卡片的第五个直接子元素，在 Chromium 下溢出 `span 4` 的 subgrid，透明反馈网格坍缩到表单带上，吞掉完整问答轮数下拉与保存按钮的全部指针事件——必须完成的一次全局保存无法进行，输入框「增强提示词」按钮也因此一直保持灰色（启用需要已确认的全局配置）。反馈区现渲染在表单内、紧邻保存按钮之前；新增 SSR 回归断言表单必须保持为卡片的最后子元素。无网络格式、存储或模型调用变化。
- 恢复「减弱动态效果」下的最高档闪烁：移植版原本用一刀切 `animation:none`，而上游 Claude Style 的规则把时长压缩到 0.01ms 并保留 `infinite` 闪烁迭代，使最高档点阵在 `prefers-reduced-motion`（macOS「减弱动态效果」）下仍持续呼吸。现完全镜像该语义，重新钉扎滑块来源哈希，并扩展 12 例真实 Chromium 动效回归：0.01ms 网格必须保留至少 100 个运行中的 `lpa-ce-flash` 动画，指针选择仍可提交。刻意不断言依赖引擎时钟的颜色采样。
- 模型选择器支持常驻供应商快捷分组：分组标题右侧 ◎ 可把供应商设为常驻（快捷展开），未常驻的供应商折叠为显示模型数量与 › 的一行，点击或按 → 进入该供应商的二级列表，‹ 所有供应商 返回；二级内 Esc、←、Backspace 返回上一层且菜单保持打开。常驻记录保存在浏览器 localStorage（键 `local-prompt-assist:model-pinned-providers`，仅本机本 profile），沙箱文档禁用 localStorage 时退化为会话内状态；无常驻供应商时菜单 DOM 与 1.2.28 一致。新增 7 项纯函数单元测试与 8 项真实 Chromium 交互回归（布局回归共 40 项）。

## 1.2.28 — 输入框模型选择器 / Composer model picker（2026-10-20）

- Replace the composer model seat through the supported slot contract: the plugin registers `conversation.input.model` at priority `-1`, so it shadows the shipped picker instead of adding a second control, and the shipped picker resumes rendering as soon as the plugin unloads. Session scope, `locked`, availability and the model directory stay owned by the host; a missing directory service installs no replacement.
- Show models directly beneath provider headings in a single scrollable list, rather than provider cells opening submenus. Bundle the original builtin description data from Claude Style 0.16.3 with MIT attribution and locale/metadata fallback; remove the abandoned editable-description storage, RPC and settings UI.
- Reuse Claude Style 0.16.3 slider geometry, CSS, magnetic detents, label transitions and highest-level pixel animation with MIT attribution; verify against pinned upstream source. Replace effort rows with a discrete slider whose positions come only from the selected model's advertised metadata. Dragging previews a level and submits once on release; keyboard interaction, locked/pending states, model changes and failures retain native semantics.
- Preserve current effort on reselecting the same model. Show partial catalog failures alongside successful groups and provide retry. Add real-pointer/keyboard Chromium regressions and component-owned theme styles. Synthetic screenshots and fixtures are not authenticated live-profile visual acceptance.

## 1.2.27 — 输入框结果锚定 / Composer-anchored results

- Anchor enhancement/suggestion results to the native resident composer overlay, rather than the hero-level input dock. This avoids the Claude Style studio rule that orders all dock entries above an auto-margin workspace row, separating results from the bottom composer.
- Bound the result height to its own containing scrollports and visual viewport, including zoom; preserve compact pending/undo cards and native-menu precedence. No fixed screen coordinates, theme installation edits, extra model calls or draft mutation are introduced.
- Add focused geometry/disposal regressions and an explicitly synthetic Chromium layout regression. The latter reproduces the detached dock and exercises 93 combinations plus menu/click/cleanup checks; it is not authenticated live-profile visual acceptance.

## 1.2.26 — 全局配置与增强离线评测 / Global controls and offline enhancement evaluation

- Add a source-only offline enhancement evaluation workbench: intent-first four-way rubric, contrast references with explicit confirmation status, answer-free review export, evidence traceability checks and reference-label confusion/error reports. No runtime validation calls, semantic auto-approval, model benchmarks or profile changes are enabled by this tooling.
- Preserve allowlisted native provider failure categories and safe HTTP statuses instead of flattening authentication, rejection, throttling, quota, upstream timeout and context failures into `model-failed`. Strip provider prose and request identifiers; no automatic retries, budget increases, effort changes or deadline extensions. This repairs diagnostic loss, not a claim that the reported Hualong/DeepSeek request was reproduced successfully.
- Treat cosmetic synonym changes to an already-clear single constraint as unnecessary editing; integrate only user-confirmed goals from relevant QA. Resolve contradictory no-rewrite wording and add the reported domain-constraint example as a human evaluation reference. Exact-echo detection remains deliberately non-semantic, not a claim that all near-paraphrases can be blocked.
- Clarify enhancement with empty QA: the draft itself can justify typo correction, deduplication and separate points. Local ambiguity does not justify echoing the entire draft. Pasted requirements retain rules/examples/exceptions without business-rule solving or invented fragments; regression data is synthetic or anonymized, not the user's business document.
- Fix Grok Fast recognition for namespaced catalog IDs such as `安和桥/grok-4.7`: the bare-ID-only matcher hid the switch and excluded authorization candidates. Recognize the final model segment without rewriting request IDs or granting providers; cover visibility, explicit consent, revocation and main/auxiliary wire payloads offline.
- Move auxiliary model, reasoning, Fast and complete-QA controls to one profile-wide configuration per feature. Existing and new conversations share it; the settings page no longer requires selecting a conversation.
- Preserve the original enablement domain and create a separate, versioned controls domain. Historical session settings never override global choices. No session is silently selected for migration; each feature requires one explicit global save before generation.
- Keep follow-session as a global policy resolved at invocation time. Share the QA count, never QA content, drafts or file permissions. Main model and main Fast preferences are unchanged.
- Use independent flag/control revisions, captured-edit CAS and authenticated snapshot updates. Invalidate affected work across conversations; reject legacy session saves rather than silently making them global. No automatic replay of old QA.
- Add native storage persistence/isolation/rollback checks and offline tests for cross-session generation, dynamic follow-session routing, confirmation, concurrency and failure handling. No paid model request or live-profile mutation is part of verification.

## 1.2.25 — 自然下一句与低干扰空结果 / Natural follow-ups and quiet abstention

- Reframe suggestion generation as the user's natural next message, not generic task planning. Check grounded gaps and agreed next steps before abstaining; completion, multiple directions or awaiting authorization are not blanket none rules.
- Adapt verified mechanics from installed Codex Desktop 26.1013.40934: automatic abstention stays quiet, manual generation still reports none. Codex's actual prediction prompt is remote-configured and was not obtained or copied.
- Preserve explicit permissions, configured QA scope, model controls, per-QA deduplication, cancellation and error separation. No additional generation or automatic retries.
- Expand human reference cases and offline flow coverage; these tests do not establish a measured improvement in live-model suggestion quality or abstention rate.

## 1.2.24 — Grok Priority 与增强结构化 / Grok Priority and structured enhancement

- Strengthen enhancement instructions: independent points require real line breaks or lists, complete replacement text rather than appended commentary, and no synonym-only edits where restructuring is needed. Preserve intent, literal code and genuinely clear short requests.
- Detect finalized exact enhancement echoes conservatively, show a localized no-rewrite notice, and prevent redundant Apply actions. Formatting-only improvements remain usable. No extra model retry or heuristic prose splitting is added; semantic model quality is not claimed as live-tested.
- Recognize Grok 4+ alongside OpenAI models: `grok-4.6`, `grok-4.7`, future `grok-4.8` and later numeric major versions. This local naming rule is not a provider capability guarantee.
- Allow registered Grok-only providers through both Host and Client authorization candidate filters. Default provider authorization, consent, revision checks and exact provider IDs remain unchanged.
- Keep the existing request-level `service_tier: "priority"` injection and supported API checks for main and auxiliary calls. No model substitution, reasoning reduction or automatic default-tier retry.
- Update bilingual copy and document billing and verification limits. Existing command, storage and wire field identifiers remain compatible.
- A ready Host authorization snapshot now replaces the stale session allowlist in the Fast control, so revoked providers no longer remain visually authorized.
- 未调用真实或付费 xAI 模型；新模型仍须在供应商目录配置，上游可用性与实际计费由服务商决定。

## 1.2.23 — 在线更新来源判定与可诊断性 / Online-update source recognition and diagnosis

- Accept the official repository in every equivalent spelling the bundle manager may record: `github:…`, `github.com/…`, `https://github.com/Syngnat/dsh-prompt-assist`, an optional `git+` prefix, an optional `.git` suffix, any letter case, and a tag or commit pin (full or short SHA). Foreign repositories, a moving `#main` ref and non-Git origins such as `file:`/`link:` remain refused.
- Report the refused installation source in the status payload, bounded to 200 characters and stripped of control characters, and show it in the settings page next to the reason — previously macOS users only saw `(unsupported-source)` with no way to tell what the Host had detected.
- Add an actionable hint for that reason: reinstall from the unversioned target `github:Syngnat/dsh-prompt-assist`, then use online update again.
- Every eligibility branch now keeps the observed row, so a refusal can always name the installation it examined; the tool output schema carries the new field.
- Add 4 regressions (spelling matrix accepted/refused, refused-source reporting bounds, client rendering with a sanitized source): 689 offline tests pass.

中文：在线更新放宽到「官方仓库的等价写法」：`github:`、`github.com/`、`https://github.com/Syngnat/dsh-prompt-assist`、可选 `git+` 前缀与 `.git` 后缀、大小写，以及 tag 或提交（完整/短 SHA）固定；其他仓库、`#main` 浮动引用和 `file:`/`link:` 等非 Git 来源仍然拒绝。同时在状态里回报**实际检测到的安装来源**（限长、去控制字符）并在设置页显示，不再只给一个 `unsupported-source`；该原因下补充可操作提示：用无版本号地址 `github:Syngnat/dsh-prompt-assist` 重装后再在线更新。

## 1.2.22 — 授权列表显示供应商名称与 ID / Provider names beside IDs

- The Priority authorization lists now show the provider's display name beside its exact ID — for example `CPA · cpa` — because model settings identify a provider by name, while authorization is recorded by ID. The candidate selector already used `name (id)` and is unchanged.
- The Host supplies these names from the live LLM registry, restricted to the providers the receipt actually lists; a missing, failing or identical name degrades to the ID alone and never fails the authorization state. Names are length-capped and stripped of control characters.
- The Fast control's blocked reason uses the same pair (`CPA (cpa)`) so the tooltip matches what the settings page shows.
- Add regressions for name disclosure scope, sanitisation, identical-name omission, a failing registry, malformed client-side name maps, and the tooltip label: 685 offline tests pass.

中文：Priority 授权列表改为同时显示供应商名称与准确 ID（例如 `CPA · cpa`），与模型设置里先看到名称的习惯对齐；授权本身仍按 ID 记录。名称由 Host 从实时的 LLM 注册表读取，且只包含该回执真正列出的供应商；名称缺失、读取失败或与 ID 相同时自动退化为只显示 ID，不会影响授权状态。Fast 按钮的不可用提示同样显示「名称 (ID)」。

## 1.2.21 — 设置页卡片式重排 / Settings page laid out as cards

- Rebuild the Prompt assist settings page as four consistent cards — global switches, session parameters, Priority authorization, and version/updates — each with its own title and one-line explanation instead of one flat column of bordered boxes.
- Global switches become real switch rows: label plus a short hint on the left, a 40×22 toggle on the right, with the long charge/migration notes moved into a muted footnote.
- Session parameters get an empty state when no session is selected, and the session id is shown as a chip.
- Priority authorization lists built-in and self-authorized providers as chips, and groups the candidate selector, risk consent and actions into one action block.
- The version card shows three statistic tiles (running version, latest stable, last check), keeps a single availability banner, moves the privacy/cache notes into a collapsed details block, and hosts the online update area as a borderless subsection — the previous nested double card is gone.
- Responsive rules collapse statistics and feature cards to one column at ≤720px; the composer-side preview panel is unchanged, and no button text, disabled condition, ARIA attribute or request flow was altered.
- The switch is drawn without absolute positioning, keeping the existing safeguard that the stylesheet never creates an overlay.
- Add layout regressions (four cards, switch semantics, empty state, stat tiles, subsection and install row) and update the assertions that referenced the previous flat markup: 681 offline tests pass.

中文：提示词辅助设置页改为四张统一卡片（全局开关、会话参数、Priority 授权、版本与更新），各自带标题与一行说明；开关改为真实 checkbox 的开关行，长说明移到底部脚注；未选会话显示空状态，会话 ID 用 chip；授权区用 chip 列表并集中动作行；版本区增加三块统计、单一更新横幅、可折叠隐私说明，并把在线更新改为无边框子区（不再双层卡片）。≤720px 单列。按钮文案、禁用条件、aria 与请求流程均未改动；开关不使用绝对定位，保留“样式表不产生浮层”的既有约束。

## 1.2.20 — 过期的更新记录默认折叠

- A terminal update record whose verified version differs from the running version is now demoted into a collapsed **Earlier update record** block. The main view no longer shows an old task's `1.2.12 / 1.2.13` next to the running version, so it cannot be mistaken for the current release.
- The collapsed summary carries the task's own versions plus the verified and currently running versions; expanding it still shows the job id, task versions and any error or restart notes.
- A record that matches the running version keeps the full, expanded presentation, and an in-progress task is never collapsed.
- Add regressions for the collapsed history block, the summary versions, and the unchanged presentation when the versions agree.

中文：与当前运行版本不一致的已结束更新记录，改为默认折叠的「历史更新记录」；主视图不再把旧任务的 1.2.12 / 1.2.13 与当前版本并列，避免误读。摘要仍显示任务版本、已验证版本与当前运行版本，展开后可看任务编号与错误/重启信息。与当前版本一致的记录保持完整展示，进行中的任务不会被折叠。

## 1.2.19 — 时间可读与历史更新记录不再误导 / Readable timestamps and honest update records

- Render the update check time as a readable UTC stamp (`2026-10-19 01:10:30 UTC`) instead of a raw ISO string, while keeping the exact machine-readable `dateTime` attribute. Confirmation expiry uses the same formatting.
- A terminal update record no longer looks like the current version: the record now shows the task's own versions, the currently running version, and — when the record's verified version differs from the running one — a note saying the record is from an earlier task.
- Add regressions for the readable stamp, the exact `dateTime`, the stale-record note and its absence when the versions agree.

中文：检查时间改为可读的 UTC 时间（如 `2026-10-19 01:10:30 UTC`），同时保留精确的 `dateTime` 属性；确认有效期使用同样格式。历史更新任务不再让人误以为是当前版本：分别显示任务原版本/目标版本、当前运行版本，并在记录内已验证版本与当前版本不一致时注明这是更早的任务记录。

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
