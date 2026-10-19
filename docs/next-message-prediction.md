# 下一条消息预测：Codex 客户端参考与本插件取舍

## 来源与限制

2026-10-19 只读检查本机 OpenAI.Codex 安装包 26.1013.4894.0，内部应用版本 26.1013.40934、production build 20770。检查的是随应用发布的编译代码，不是公开源码仓库；未读取账号凭证、聊天记录，未执行客户端代码或调用模型。代码包 SHA-256：`bbec1d64e135b718a154b31655bb8ad9a39472bac1b2cabba991a9d97a339dd8`。

以下定位为 ASAR 内部路径。研究摘录只存放在工作区忽略目录，不把第三方实现复制进插件。

## 可直接确认的机制

- `.vite/build/main-C4DYk222.js`：composer prediction 控制器从远端 `/wham/predictions/config` 获取 prompt、prompt_version、开关及推理档配置。因此本次**未获得实际提示词正文**，不能声称复刻其生成策略或评估质量。
- 同模块按 host/thread/latestTurn 去重缓存，retry=false；新 turn 使旧预测失效。输出是 nullable suggestion，因此 Codex 也允许没有预测。
- 同模块沿用父会话模型，存在 provider、plan mode 和配置禁用模型等门控。不能据此认为所有账号、模型都启用同一功能。
- `.vite/build/src-DsLVGakC.js`：预测使用源 thread 的 experimental ephemeral fork，经 app-server 发起 turn；本路径不在 fork 失败时退回无上下文新线程。公共代码未证明完整上下文裁剪规则，excludeTurns 不能解释为模型没有历史。
- `webview/assets/app-initial-5851df3f6cb1.js`：turn-completed 触发 live 预测；检查 owner、最新 turn、临时/侧会话等条件。null 文本不显示输入框预测；存在 suggested/abstained 的不同内部状态。
- 同模块只在空输入框等适用条件展示预测，接受预测是填入可编辑草稿，不等于发送或授权执行。
- `webview/assets/app-primary-fe8a450b3b04.js`：另有 catch-up 请求路径；显式关闭自动重试。首页任务推荐、绘图建议、闪卡建议不是此功能。

## 本插件采用的设计

1. 改写自有提示词：预测用户自然的下一条消息、贴近语气与长度，而不是机械提出下一项工作。优先承接未回答的原目标、具体缺口或用户明确约定的后续。
2. 完成声明、待授权或多种方向不再自动等于 none；可提出有依据的只读问题，但不代用户选方案、批准发布/安装/删除或增加付费测试。
3. 自动 none 安静结束，仍保留真实 no-suggestion 状态；手动 none 明确反馈。错误、超时、截断与非法输出仍是错误，不被静默伪装成 none。
4. 保留当前 JSON 协议、每轮去重、取消与过期保护，不新增模型重试，也不改用户设置的模型、推理、Fast 或 QA 轮数。
5. 不照搬 Codex 私有预测分支 API，不访问其认证配置。当前实现仍使用用户选取的完整 QA，不声称等同于 Codex 的上下文或质量。

## 验证口径

离线测试验证请求上下文、提示词契约、结构化输出校验、每轮单次请求、自动/手动反馈差异和权限边界。语料中的 suggestion/none 是人工评估参考，不是模型实测结果，不能用于宣称弃答率下降。真实改善需要在用户选择的模型上另行对比评测；本次没有为此产生模型调用费用。
