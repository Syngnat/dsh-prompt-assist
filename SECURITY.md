# Security policy / 安全政策

[English README](<README.md>) | [中文说明](<README.zh-CN.md>)

## Scope and compatibility

From `v1.2.7`, the minimum supported DSH version is `0.2.1-rc.1`, with no future-version ceiling. Required Host and adapter capabilities are checked before use. Include the exact plugin tag/commit and DSH version in a report; version admission does not mean every future runtime has been tested. No independent security audit, penetration test, or complete secret-detection guarantee is claimed.

This policy covers this plugin. Vulnerabilities in DSH itself, a provider, or an unrelated plugin should also be reported to the relevant maintainer.

## Data flows and trust boundaries

- Generation sends the current draft, selected complete Q&A context, visible reference names, and explicitly authorized file content to the model provider selected in DSH. From v1.2.12, enabling automatic suggestions authorizes eligible future new-Q&A requests across the current profile; it does not replay past Q&A.
- The plugin does not upload data to a developer-operated service and does not add telemetry. DSH and the selected provider can have their own storage, logging, retention, and billing policies.
- Existing file references are not permission to read everything nearby. Only explicitly selected supported files are read; limits are 64 KiB per file and 128 KiB total. Folder recursion, session-reference content, and uploaded image/attachment content are not read.
- File checks can reject known sensitive paths or unsupported data, but they are not a complete data-loss-prevention system. Inspect your files and context before sending them.
- Preview is not execution. Review model output before copying or applying it. Structured references/commands support preview and copy only; plain-text apply uses draft/revision checks and leaves attachments alone.
- DSH Host plugins execute with local host-user authority, outside the workspace sandbox. Install code only from a source you trust, review the stable-channel policy and inspect build-script requests before approving them. A tag or commit can be used for an explicit audit/reproduction pin.

Cancellation stops obsolete local work and asks the transport to stop. It cannot retract data already delivered to a provider, guarantee that the provider stops processing, or guarantee that no charge occurs. Never send secrets merely to test cancellation.

## Update checks

Only an explicit check requests `https://api.github.com/repos/Syngnat/dsh-prompt-assist/releases/latest`. Opening the panel reads local cached state only. No API token, chat data, draft, files or provider secrets are attached. GitHub can log normal network metadata. Redirects, draft/prerelease metadata, oversized or malformed responses and foreign release links are refused. Responses are treated as data, never instructions or HTML. Checking alone never installs or writes a profile. The update tool exposes only status, check and read-only operation state.

## Explicitly confirmed online updates

From v1.2.11, supported installations can prepare a pinned target/recovery plan using this fixed repository's public GitHub API and raw package metadata. No chat or provider secrets are attached. Preparation does not install. A bounded, owner-authenticated confirmation with a one-use expiring token and explicit risk consent is required to start a Host-owned update job. Tokens are not returned to model tools or persisted in browser storage; a local recovery marker contains only versions and job id.

Installation/removal/enablement and best-effort recovery use public DSH Plugin Manager methods. The plugin does not edit profile files directly, approve dependency build scripts, grant version exemptions or accept arbitrary installation sources. Public manager policy still applies. Updates execute trusted Host code and affect the whole profile, can temporarily remove this plugin, can change bundle precedence and can fail to restore it. Save work and back up the profile. A closed browser page does not cancel an accepted job; a Host restart loses its in-memory record. Unknown outcomes never trigger automatic replay. See [online-update limits](<docs/confirmed-online-update.md>).

## Global switch persistence

Only the two enabled flags and a monotonic revision are stored through the public storage-domain service, with a profile-path hash separating namespaces even when profiles share one backend. No prompts, selected files or provider secrets are copied into this record. The server is authoritative; browser snapshots are not persistent permission. Session logs retain old enabled fields for compatibility, but reads/replays never promote them into global authorization.

The global switches are separate from per-session model/Fast/Q&A controls. All browser pages use a read-only authenticated snapshot stream. Unknown or disconnected state does not enable generation; stale writes require a reread and are never automatically replayed. Writes are serialized within one Host, not a new cross-process locking protocol.

## Model resource limits

Auxiliary input/output quotas follow the selected provider/model configuration rather than fixed plugin text quotas. Input admission uses a Host heuristic, not exact provider tokenization; the provider remains authoritative for shared-window and output validation. Larger configured budgets can increase cost and resource use. The independent 120-second deadline, explicit file-read limits and native carrier boundaries remain; cancellation or timeout does not guarantee upstream work or billing has stopped.

## Report a vulnerability

Prefer [GitHub private vulnerability reporting](<https://github.com/Syngnat/dsh-prompt-assist/security/advisories/new>) when that repository feature is available. If it is unavailable, open a minimal [issue](<https://github.com/Syngnat/dsh-prompt-assist/issues>) asking for a private reporting channel. Do not publish exploit details or confidential data in that initial issue. No unverified email address or response-time commitment is provided here.

A useful report includes:

1. The plugin version/commit, DSH version, operating system, and affected feature.
2. Minimal reproduction steps using synthetic prompts and temporary non-sensitive files.
3. Expected behavior, observed behavior, and the security impact.
4. Redacted diagnostics, if needed. Remove API keys, tokens, cookies, authorization headers, private file contents, personal paths, and conversation identifiers.

Do not test against other users or production services without authorization. Do not attach a full DSH profile or raw conversation log to a public issue.

## 中文要点

- 从 `v1.2.7` 起最低支持 DSH `0.2.1-rc.1`，不设置未来版本上限；启用前检查必要 Host 与适配器能力，版本放行不等于所有未来版本均已测试；不声称已完成独立安全审计。
- 草稿、选定完整 QA、可见引用名和明确授权的文件内容会发给 DSH 中选定的模型服务商；本插件不上传开发者服务器，不新增遥测。服务商及 DSH 自身的日志、留存和收费策略另行适用。
- 文件必须明确选择，每个最多 64 KiB、合计 128 KiB；不递归文件夹，不读取会话引用内容或上传图片/附件内容。敏感文件检查不等于全面防泄漏保障。
- 取消不能撤回已经发出的数据，也不能保证上游立即停止或不收费。
- Host 插件以本机用户权限运行。默认安装地址跟随由维护者管理的稳定分支；需要审计复现时可另行固定tag/commit。谨慎授权安装脚本，升级前常规备份。
- 优先通过上述 GitHub 私密漏洞报告入口联系；若未启用，只在公开 issue 中请求私密渠道，不公开漏洞细节、凭证、个人路径或会话内容。

更新检查仅在明确操作时访问固定GitHub公开接口，不带会话/草稿/文件/凭证；GitHub可记录常规网络信息。准备不会安装，只有owner明确勾选风险并确认后，才通过公开管理器更新整个profile。操作非原子，恢复也可能失败；不自动授权脚本、豁免版本或重发结果不明的操作。输入输出额度跟随供应商模型设置，较大预算可能增加费用和资源消耗；120秒等待及文件读取安全限制独立保留。
