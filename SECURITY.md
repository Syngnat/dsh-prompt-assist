# Security policy / 安全政策

[English README](<README.md>) | [中文说明](<README.zh-CN.md>)

## Scope and compatibility

From `v1.2.7`, the minimum supported DSH version is `0.2.1-rc.1`, with no future-version ceiling. Required Host and adapter capabilities are checked before use. Include the exact plugin tag/commit and DSH version in a report; version admission does not mean every future runtime has been tested. No independent security audit, penetration test, or complete secret-detection guarantee is claimed.

This policy covers this plugin. Vulnerabilities in DSH itself, a provider, or an unrelated plugin should also be reported to the relevant maintainer.

## Data flows and trust boundaries

- Generation sends the current draft, selected complete Q&A context, visible reference names, and explicitly authorized file content to the model provider selected in DSH. Enabling automatic suggestions authorizes eligible new-Q&A requests for that feature and conversation.
- The plugin does not upload data to a developer-operated service and does not add telemetry. DSH and the selected provider can have their own storage, logging, retention, and billing policies.
- Existing file references are not permission to read everything nearby. Only explicitly selected supported files are read; limits are 64 KiB per file and 128 KiB total. Folder recursion, session-reference content, and uploaded image/attachment content are not read.
- File checks can reject known sensitive paths or unsupported data, but they are not a complete data-loss-prevention system. Inspect your files and context before sending them.
- Preview is not execution. Review model output before copying or applying it. Structured references/commands support preview and copy only; plain-text apply uses draft/revision checks and leaves attachments alone.
- DSH Host plugins execute with local host-user authority, outside the workspace sandbox. Install code only from a source you trust, pin a release tag or commit, and inspect build-script requests before approving them.

Cancellation stops obsolete local work and asks the transport to stop. It cannot retract data already delivered to a provider, guarantee that the provider stops processing, or guarantee that no charge occurs. Never send secrets merely to test cancellation.

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
- Host 插件以本机用户权限运行。请使用可信 tag/commit，谨慎授权安装脚本，升级前常规备份。
- 优先通过上述 GitHub 私密漏洞报告入口联系；若未启用，只在公开 issue 中请求私密渠道，不公开漏洞细节、凭证、个人路径或会话内容。
