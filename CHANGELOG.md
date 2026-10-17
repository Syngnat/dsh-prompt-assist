# Changelog / 变更记录

[English](<README.md>) | [简体中文](<README.zh-CN.md>)

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
