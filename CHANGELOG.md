# Changelog / 变更记录

[English](<README.md>) | [简体中文](<README.zh-CN.md>)

## 1.2.69 — 供应商列表视图去掉重复行 / Provider list layout（2026-10-26）

- ZCode 风格模型选择器进入「更多供应商」后，顶部不再显示正在浏览的供应商那一行（它与「返回」重复）。
- 「返回」移到供应商列表下方；焦点顺序与键盘导航同步。

## 1.2.68 — ZCode 供应商行显示供应商数 / ZCode provider row counts providers（2026-10-26）

- ZCode 风格模型选择器顶部供应商行的右侧徽标改为显示**供应商总数**，不再显示该供应商的模型数。
- 展开后的供应商列表只列出其他供应商，不再重复顶部已经显示的当前供应商；勾选标记仍表示会话真正使用的供应商。
- 只有一个供应商时该行不可点；目录刷新把可切换项清空时自动退出列表视图，焦点顺序跟随实际渲染的行。

## 1.2.67 — 修复 ZCode 供应商切换 / Provider navigation（2026-10-25）

- 修复在供应商列表选择 Magpie · Responses 后仍显示 Magpie 模型：之前点击只关闭列表，模型列表始终从会话当前模型推导供应商。现在独立记录正在浏览的供应商 ID，标题、模型数、列表与键盘导航一并切换。
- 浏览供应商不自动提交模型；供应商勾选仍反映真实会话路由，明确点击模型后才切换。浏览其他供应商时隐藏原模型的推理控件，避免误改原路由；返回保留浏览位置，关闭重开或切会话时重置，供应商从目录移除时安全回退。
- 新增真实 Chromium 交互回归，覆盖中英文、深浅色、宽窄屏、同模型 ID 跨供应商选择、键盘选择与目录/会话边界；原问题在修复前可稳定触发。

## 1.2.66 — Codex 式收尾契约注入 / Final-answer contract（2026-10-24）

- 新增 `assist/final-answer-contract.js`：在 `agent/pre-step` 把 `decision.kind === 'enter'` 的步骤追加一条 `role:'user'` 的 durable `<system-reminder>` 消息，携带最终答复契约（只给结论、默认 ≤10 行、要点 4–6 条按重要性排序、结尾 ≤3 个下一步；过程进度压到 8–10 词）。这是「梁神模式」硬白名单过滤 system-prompt section 后唯一能到达模型的通道。
- 每会话只注入一次（WeakMap 记 session 对象 + Set 记 sessionId）；`session/event` 的 `compaction/end` 清标记，压缩后自动重注；`kind !== 'enter'` 原样放行，空 decision 不注入。
- 开关：`finalAnswer` 存在**独立存储域**（`local_prompt_assist_final_answer_*`，默认开），enablement 与 controls 的严格记录形状保持不变，旧版本仍可读取；`set-final-answer` 动作与设置页「全局功能开关」第三个开关走 revision CAS；`host-source.js` 以活取值接入，切换下个 step 即生效。`config.finalAnswerContract === false` 仍是硬开关。
- 测试：新增 5 项契约用例（契约原文、reject 放行、每会话一次、压缩后重注、空决策与开关）+ 存储开关用例；全套 1104 项离线测试通过。

## 1.2.65 — 分区标签点了没反应 / Hidden panels（2026-10-24）

- 修复分区标签切换无效果、所有分区仍然平铺：面板以 `hidden` 属性隐藏，但作者样式 `.lpa-settings-panel{display:grid}` 覆盖了浏览器默认的 `[hidden]{display:none}`，于是四个面板始终同时可见，点标签只改了选中态。现在补上 `.lpa-settings-panel[hidden]{display:none}`，切换即刻生效。
- 测试：新增「隐藏面板必须有 display:none」与「assist 面板不带 hidden、update 面板带 hidden」断言；全套 1098 项离线测试通过。

## 1.2.64 — 新会话不再出现空白的模型触发器 / Trigger keeps its label（2026-10-24）

- 修复新会话里模型触发器变成空方框、只显示占位菱形：触发器文字与推理强度的可见性原本跟随宿主的 `--dsh-composer-model-text-display` 与 `--dsh-composer-model-icon-display`，宿主在无当前模型时切到图标模式，于是模型名和档位一起被藏掉。现在触发器自己决定显示——模型名与推理强度始终可见，占位菱形始终隐藏。
- 测试：浏览器回归新增「宿主图标模式下标签仍有宽度」断言（56 用例通过）；全套 1098 项离线测试通过。

## 1.2.63 — 检测到新版后卡片内直接「下载并安装」 / Install from the version card（2026-10-24）

- 版本卡片检测到新版后，原先的「检查更新」按钮直接变为风险确认复选框 + 主按钮「下载并安装」，不再需要向下翻到「在线更新」区。安装沿用同一控制器：一次点击内部串行准备 → 带同意提交安装。
- 下方「在线更新」区不再重复安装按钮（只显示进度、版本、错误码与复核），文案同步改写，避免与卡片里的入口冲突。
- 测试：新增「可用版本把安装动作移到卡片」「在线更新区不重复安装动作」两条断言；全套 1098 项离线测试通过。

## 1.2.62 — 分区标签带描边 / Bordered tabs（2026-10-24）

- 与「电脑操控」页一致：每个分区标签改为 1px 描边的圆角按钮（半径 10px、内边距 7×14），选中态填充浅灰并加深字色；未选中悬停才出现底色，避免与选中态混淆。
- 测试：新增标签描边与纯 token 配色断言；全套 1096 项离线测试通过。

## 1.2.61 — 分区标签移到页面标题之上 / Tabs above the title（2026-10-24）

- 与内置「电脑操控」页完全一致：分区标签位于内容区最上方，标题与说明在其下，正文占满整宽。
- 测试：全套 1095 项离线测试通过。

## 1.2.60 — 设置分区改为顶部标签 / Top tabs（2026-10-24）

- 按内置「电脑操控」页的摆放方式，把提示词辅助的分区导航从左侧竖排改为顶部横向标签：内容不再被左侧导航挤压，卡片恢复整宽；方向键左右与 Home/End 切换，窄屏标签自动换行。
- 测试：分区结构断言改为横向；全套 1095 项离线测试通过。

## 1.2.59 — 菜单内容统一左缩进、悬浮面板对齐所属行 / Menu alignment（2026-10-24）

- 修复菜单内三处内容各用一套缩进、看起来歪斜：分组标题（4px）、模型行（7px）、推理强度标签与滑轨（15px）现在统一到同一 7px 内边距；实测四处左边界完全一致。
- 修复「其余模型」悬浮面板在视口偏下时被整体上移、与所属行脱节（最多偏一整个面板高度）：改为顶部与行对齐、超出部分限制高度由面板内部滚动承担。
- 测试：浏览器回归新增「所有区域共享同一左缩进」断言，55 用例通过；全套 1095 项离线测试通过。

## 1.2.58 — 设置分区导航 + 一键在线更新 / Tabbed settings（2026-10-24）

- 设置页从「一列平铺到底」改为分区导航：左侧列出「辅助参数 / Priority 授权 / 模型选择器 / 版本与更新」，右侧只显示当前分区；窄屏自动变成横向可滚动标签，记住上次停留的分区。
- 在线更新从三步收敛为一步：勾选默认未选中的风险确认后，点一次「检查并安装更新」即完成准备与安装提交。准备失败或确认被拒时停在复核区并显示版本、不可变提交与错误码，可手动重试；不会自动重连或重发。
- 文案与文档同步：新增分区标签、安装按钮与同意说明的中英文案，`docs/confirmed-online-update.md` 改写为用户路径（协议仍是准备与确认两个独立请求）。
- 测试：新增导航结构断言（tablist、3 个分区、仅一个面板可见）与更新同意门槛断言（未勾选时按钮禁用、渲染中不再出现独立的「准备」按钮）；全套 1095 项离线测试通过。

## 1.2.57 — 调整推理档位不再闪一下 / No dim flash（2026-10-24）

- 修复档位确认瞬间整个菜单「闪一下」：提交期间所有模型行被禁用，而 `.lpa-model-option:disabled` 与 `.lpa-zt-row:disabled` 会把透明度降到 45%/50%，于是整片内容先变淡再恢复。现在静默提交期间给菜单打 `data-silent`，抑制这些行的变淡；行的禁用语义（不可点击）保持不变。
- 测试：浏览器回归新增断言——确认期间模型行仍禁用但透明度必须为 1；54 用例通过，全套 1093 项离线测试通过。

## 1.2.56 — 调整推理档位不再闪跳 / Stable effort popup（2026-10-24）

- 修复调整推理档位时整个弹窗闪烁并跳动：提交期间菜单底部会临时插入「正在切换…」状态行，菜单因此高出一行，又因为菜单底对齐触发器，整个弹窗上跳再落回。档位提交改为静默（不渲染该状态行），禁用与焦点恢复语义保持原样。
- 同时修掉两处相关闪动：滑块落点在宿主确认前不再被清空（此前会先弹回旧档、状态到达后再跳一次）；菜单定位在打开期间冻结锚点，触发器因档位文案变宽时不再重新定位。
- 测试：新增浏览器回归断言（落点不回弹、确认期间与确认后菜单矩形不变），真实 Chromium 53 用例通过；全套 1093 项离线测试通过。

## 1.2.55 — ZCode 思考档边界只留一条分割线 / Single divider（2026-10-24）

- 修复 ZCode 样式在模型列表与思考档之间出现两条叠线：思考档外框 `.lpa-effort-frame` 为 Claude Style 自带一条 `border-top`，ZCode 的分割线又叠在上面。ZCode 样式下移除外框自带的那条，只保留 ZCode 配方的 10% 前景色通栏线。
- 测试：新增断言锁住「ZCode 下 effort 外框无 border-top」；真实 Chromium 实测该边界为 0px 边框 + 两条区域分割线（供应商行下、思考档上）。全套 1093 项离线测试通过。

## 1.2.54 — ZCode 菜单补回区域分割线 / Menu dividers（2026-10-24）

- 补上 ZCode 原版菜单的区域分割线：供应商行下方与子菜单返回行下方各一条，模型列表与思考档之间一条。配方与 ZCode 的 `--color-border` 一致（10% 前景色、1px、通栏），深浅主题自动跟随。
- 测试：新增分割线契约断言（CSS 配方 + 三处接线）；全套 1093 项离线测试通过。

## 1.2.53 — 选择器背景跟随主题并去掉横向滚动条 / Theme surface（2026-10-24）

- 修复模型菜单（Claude Style 与 ZCode 都受影响）的背景：不再用「body 底色 + bg-overlay 渐变」自行调色，改为优先使用 DSH 主题的面板表面 token `--dsw-alias-bg-layer-1`，菜单、分组吸顶标题与其余模型浮层直接跟随当前主题；主题插件破坏该 token 时仍回退到既有的防透明兜底（body 底色），不会变透明。
- 修复 ZCode 菜单底部的横向滚动条：模型行基础样式宽度为 100%，ZCode 覆盖又加了 2px 左右外边距，每行溢出 4px；行宽改为 `calc(100% - 4px)`，滚动区加 `overflow-x:hidden` 兜底。
- 菜单表面新增契约断言（bg-layer-1 优先、兜底链完整、overflow-x:hidden、ZCode 行宽）；全套 1092 项离线测试通过，真实 Chromium 选择器检查通过。

## 1.2.52 — 新增 ZCode 模型选择器样式 / ZCode picker style（2026-10-24）

- 设置页的「模型选择器样式」从开关改为三选一：DSH 默认 / Claude Style / ZCode，偏好仍存本机（localStorage），切换立即生效。
- 新增 ZCode 样式，按 zai-org/ZCode（Apache-2.0，固定提交 `3c5b227649371507ddc4eb46ac5133afe6db1cab`）移植：菜单在按钮上方展开；顶部供应商行点开钻取供应商列表（选择供应商只切换视图，不自动选中任何模型——与上游的有意差异）；菜单底部为思考档滑块：24px 圆角轨道、绿色填充、28px 白色滑块头、逐档圆点。
- 推理强度动效完整移植：最强档 oklch 最短色相路径渐变 + 12 颗白色气泡流动（气泡种子逐项照搬）；GLM Highspeed/FlashX 按显示名判定改为蓝色填充、蓝→紫 oklab 渐变与 32 颗更快气泡；`prefers-reduced-motion` 下隐藏气泡、去掉过渡。思考档交互手势（拖拽/键盘/单次提交）与 Claude Style 共用同一实现。
- 颜色使用 ZCode 的 Tailwind 色阶字面值，文字与表面沿用 DSH 的 `--dsw-alias-*` 主题 token，深浅两套主题都可读。第三方出处按 claude-style 先例随包分发：完整 Apache-2.0 许可、逐文件 Git blob SHA-1 与 SHA-256 的 [PROVENANCE](<third-party/zcode-style/PROVENANCE.json>) 与[滑块专项记录](<third-party/zcode-style/SLIDER-PROVENANCE.json>)。
- 测试：新增 9 项 ZCode 契约断言（偏好三值往返、Highspeed 判定、气泡种子、视觉树状态属性、来源记录）；全套 1091 项离线测试通过；文档 `docs/model-picker.md` 增加 ZCode 章节。

## 1.2.51 — 修复空档位标签吞掉推理强度显示 / Effort label fallback（2026-10-24）

- 修复触发器推理强度的标签回退：供应商目录可能给出无名自定义档位，语言包也可能把某个档位置空；此前活动行的空标签会因 `??` 不穿透空串而吞掉整个推理强度显示，即使会话还保存着可用档位。现在空标签被跳过，回退到会话保存的档位或目录元数据；目录里的空 id 档位项（`{id:""}`）也不再进入档位列表。
- 澄清「英文 + 暗色不显示推理强度」的报告：真实 Chrome 按 {中文/英文}×{浅色/暗色}×{有/无档位目录} 八组实测，英文+暗色下推理强度一直正常显示（对比度 7.51:1，四组合同色）。「触发器只有模型名」的真实机制是当前模型目录没有 reasoning 元数据且会话未保存档位——此时宿主原生选择器同样不显示档位，插件行为与宿主一致，不虚构档位。
- 测试：新增双语档位字典完整性与空标签回退链断言；浏览器布局回归新增 zh/en×暗/浅四组合的存在性、文本、display、跨语言同色与暗色对比度 ≥4.5 断言组，以及无档位模型在不同语言/主题下同样隐藏的奇偶性锁；全套 1082 项离线测试通过。

## 1.2.50 — 未常驻供应商收进「其余模型」/ Other-models flyout（2026-10-23）

- 模型选择器：未常驻的供应商不再各自折叠成二级列表，统一收进顶层一行「其余模型」（模型总数 + ›）；悬停即在右侧浮出全部未常驻模型，供应商之间用横杆分隔、行内保留「常驻」可随时拉回；点击该行或按 → 也可展开，160ms 悬停宽限不闪烁。浮层贴行右侧，放不下退到菜单边缘、再翻到左侧，始终留在视口内。
- 切换模型时，仅在新模型支持当前推理档时沿用，否则交还该模型自己的默认档。
- 二级菜单的返回行与相关样式移除。

## 1.2.49 — 去掉插件页的「打开设置」按钮 / Detail-page button removed（2026-10-23）

- 设置入口已在 Harness 设置弹窗的左侧导航（设置 → 提示词辅助与 Fast 加速），插件页里的「打开设置」按钮不再需要，已移除。

## 1.2.48 — 模型选择器不再透明，样式可切换 / Opaque picker + style switch（2026-10-23）

- 修复 Windows 用户反馈的模型选择器透明：下拉菜单与分组标题的背景改为「宿主实色基底 + 主题色着色层」双层结构。此前背景纯靠主题 token，主题插件删除/重定义 token 时整条声明失效变透明，玻璃拟态主题把 token 定义成半透明时也会透出下层文字。任何情况下菜单都不再透明。
- 新增「模型选择器样式」开关（设置 → 提示词辅助 → 模型选择器样式）：关闭 Claude Style 即恢复 DSH 自带的模型选择器，立即生效，无需重启。偏好按机器保存在本机。

## 1.2.47 — 新装开箱即用，修复保存后卡片变长 / Fresh-install fixes（2026-10-23）

- 新装用户开箱即用：出厂默认参数（跟随会话模型与推理档）现在即视为「已配置」。此前全局开关默认开启后，聊天框按钮仍被「未保存全局参数」挡住，必须逐卡点一次保存才生效。
- 修复保存后卡片突然变长：设置卡片的行结构按四个子元素对齐，而「未保存参数」提示是条件渲染的——保存后提示消失，卡片少一行导致表单错位、卡片被拉长。提示改为常驻占位渲染，任何状态下结构不变（该错位在旧默认时代保存一次后同样会出现）。
- 「全局功能开关」的迁移说明文案对齐新行为。

## 1.2.46 — 全局开关默认开启 / Global switches on by default（2026-10-23）

- 「全局启用下一问建议」与「全局启用提示词增强」两个开关的默认值改为开启，只影响全新 profile；已有 profile 的持久化设置不变。注意：下一问建议会在新的完整问答结束后自动请求模型并产生费用。

## 1.2.45 — 设置并入 Harness 设置导航 / Settings in the settings dialog（2026-10-23）

- 提示词辅助的设置现在也出现在 Harness 设置弹窗的左侧导航里（设置 → 提示词辅助与 Fast 加速），不用再从插件页绕。插件页里的「打开设置」入口保留。

## 1.2.44 — 在线更新不再被网络抖动打断 / Retried update metadata（2026-10-23）

- 有用户反馈（macOS 15 Intel）点「安装更新」经常失败，安全错误码 `metadata-unavailable`。根因是安装前的版本解析对 GitHub 只发一次请求：直连不稳或代理冷启动时一次失败就整体失败。
- 现在每次元数据请求自带 3.5 秒短超时并最多重试 3 次；限流（403/429）、明确失败（404、清单不合法）与调用方中断不重试。错误码保持不变。

## 1.2.43 — 增强把口语吐槽润色成专业书面反馈 / Professional polish（2026-10-22）

- 修复增强提示词「几乎原样返回」的问题：模型只加引号、挪标点就交差，口语原文没有真正被润色成专业表达。根因是两个润色示例都是单句微调，教给模型的实际行为是轻抠两个字，再叠加一长串「不得新增」的边界，模型选择最安全的照抄。
- 【润色表达】新增硬规则：口语评价必须升级为规范的专业表述——“很难找到”是可发现性差、“要多点一下”是需要额外一次操作、“藏在最下面”是位置过深、“设计的就非常有问题了”是交互设计存在明显问题；替换只改说法，不添加原文没有的判断。
- 【重组表达】新增抱怨类原文的处理规则：把不满落成清楚的问题反馈——准确指认对象、把口语原因整理成有条理的陈述、收尾到明确的改进诉求；原文没有具体改法时不替用户发明改法，不把反馈改成方案设计。
- 【结构示例】新增与该场景同构的完整示例：一句口语吐槽改写成「对象 + 两个编号问题 + 改进诉求」的专业反馈，教排版而非可复制的内容。
- 【输出前检查】新增反照抄判定：输出与原稿几乎逐字相同（只有标点、引号或个别虚词差异）即视为未完成润色，除非原稿本身已是规范书面表达。
- 测试：增强角色契约新增 9 项断言锁住上述规则与示例；全套 1076 项离线测试通过。
## 1.2.42 — Fast 按路由授权 / Route-scoped Fast（2026-10-21）

- Fast/Priority 的授权单位从「供应商名单」改为「路由」`(供应商, 模型, 协议, 来源)`。给 Magpie 这类网关授权后，它下面带前缀的 OpenAI 模型（如 `cpa/gpt-6.1-sol`）不再隐藏开关；同一网关的 `cpa/glm-5.3-flash`、`cpa/deepseek-v4.1-flash` 也永远不会被顺带加速。
- 每条路由解析为 `ready`、`needs-verification`、`grant-missing`、`rejected`、`api-incompatible`、`not-candidate`。只有「协议无法承载 `service_tier`」与「非 OpenAI/Grok 4+ 家族」隐藏控件，其余一律可见并说明原因（新增「尚未验证」「上游拒绝」文案）。开关显示、Host 状态、辅助运行时与桥接注入共用同一个解析器，不会再出现按钮与实际上线行为不一致。
- 授权支持供应商、该供应商上的家族、精确模型三种粒度，精确模型优先。默认的 `openai` / `openai-codex` / `cpa` 名单仍按供应商级授权处理，已有配置与已保存的 Fast 偏好升级后保持原行为，无需迁移。
- 模型 ID 改为统一语法解析：命名空间可含 CJK，家族只由最后一段决定；`cpa/../gpt-6.1-sol`、空段、反斜杠、`?`、`#`、空白等非法 ID 直接判为不可用，不会被当成 OpenAI 路由。前缀 ID 上行时保持原样，不做改写。
- `openai_fast` 的 `status` 返回值新增 `state`/`family`/`api`/`grant`/`evidence`，可以直接看出某条路由为什么没有开启 Fast。
- 测试：新增 31 条路由真值表用例 + 家族×授权×证据网格、模型 ID 语法用例，以及授权网关后的反向集成用例（其他家族请求绝不带 `service_tier`，前缀 ID 原样上行，撤销授权立即停止注入）。`pnpm run fast:truth-table` 可打印全部用例。
- 文档：新增 `docs/fast-route-authorization.md`，中英文 README 与安全说明同步更新。
- 范围说明：本轮只实现解析器、Host/Client 接线与测试。`grant-missing` 与 `rejected` 两种状态已定义并有测试覆盖，但上游预检证据尚未接入（下一步实现），因此当前运行时不会出现这两态；设置面板仍是供应商级授权，路由级授权的界面在下一版。
## 1.2.41 — 提示词辅助不再占侧栏位置 / Out of the sidebar（2026-10-21）

- 提示词辅助不再在侧栏占一行。设置改为从「插件」页里这个插件自己的页面打开，侧栏只留一个应用入口。

## 1.2.40 — 可同时常驻多个供应商 / Multiple pins（2026-10-20）

- 常驻从来不是只能一个：收起的供应商行上之前没有开关，所以第二个只能钻进子菜单才能点到。现在每一行收起的供应商旁边都有「常驻」，点它不会进入子菜单，可以连续常驻多个；已展开的仍留在上面，其余继续收起。

## 1.2.39 — 模型选择器对齐 Claude Style / Claude Style picker（2026-10-20）

- 供应商分组不再使用自绘的浅底标题和描边「常驻」胶囊。标题改成 Claude Style 0.16.3 的写法：11px 说明色、字距 0.02em，右侧一条 0.5px 分隔线。模型名保持 13px、字重 500、主色；说明 11px。
- 「常驻」仍在，但降成和标题同一行的说明文字，不再抢成另一颗按钮。
- 模型按钮的下拉标记改成 Claude Style 的 12px 描边折线（向下），不再用 0 高度边框三角。

## 1.2.38 — 暗色下区分供应商与模型 / Provider contrast（2026-10-20）

- 供应商分组名不再使用和模型名相同的主色。标题改为次级文字色、字距略开，并铺一条 7% 的浅底，暗色模式下不再和模型名一样都是白字。模型名明确使用主色、13px、字重 500。折叠成一行的供应商也用同样的次级色。

## 1.2.37 — 模型名与推理档对齐 / Trigger effort alignment（2026-10-20）

- 按钮里模型名是 13px，右侧推理档（如「超高」）是 11px，字框中线对不齐。推理档改为同样的 13px 和 `line-height: 1`，与模型名、下拉三角处在同一条中线上。颜色仍用次级文字色，用来和模型名区分。

## 1.2.36 — 供应商分组标题与常驻按钮 / Provider headings（2026-10-20）

- 分组标题旁的小圆圈是「常驻」开关，原先只画 ○/◎，11px 且半透明，看不出作用。改为描边胶囊，未常驻写「常驻」，已常驻写「已常驻」。悬停仍说明：常驻后该供应商保持展开，其余收起。
- 供应商名称从 10px 浅色改为 12px、字重 600 的主色，分组更容易一眼分开。

## 1.2.35 — 模型按钮箭头垂直居中 / Chevron alignment（2026-10-20）

- 模型按钮右侧的下拉箭头不再使用字符 `⌄`。这个字形画在字框下半部，按钮虽然用了居中对齐，箭头看起来仍贴在「超高」下面。改为 4px 的 CSS 三角，并上移 2px，与模型名、推理档在同一条中线上。

## 1.2.34 — 增强改用最快可用推理档 / Fast polish effort（2026-10-20）

- 增强在未单独指定推理档时，显式选用目录里最快且仍能遵循指令的档位，顺序为 `low → minimal → off → none`。你当前的 `grok-4.6` 会落到 `low`，不再按会话的 `xhigh` 做一次短改写。
- 根因：v1.2.32 只是不再把会话档传给宿主。宿主在字段为空时会自己补上会话默认档，所以 `xhigh` 仍在生效，等待时间和深度任务差不多。
- 用户在增强设置里显式选过的档位保持不变。目录里只有 `high/xhigh` 这类高档时不发明档位，仍交给宿主默认。自动建议（suggest）仍跟随会话档。

## 1.2.33 — 短句润色修复 / Short-request polish（2026-10-20）

- 修复短句增强仍然原样返回：提示词「结构示例」末尾原写着「单一且清晰的短请求……可保持原样，不强行扩展成模板」，模型据此把「其实我也不需要感知到。」这类短句直接回显。该句改为「不需要扩展成模板，但仍要按【润色表达】检查填充词与冗余虚词；只有逐项检查后确实无可改善时才保留原句」。
- 明确口语化表达默认属于可改善项：填充词（其实／我觉得／就是／然后／反正）、冗余虚词（也／到／一下）、松散短句与含糊指代都应收拢为准确简洁的书面表达；短句同样要过这一关，不得以「原文已经通顺」为由跳过。原先「确实已经通顺准确时保留原文」改为「逐项检查后确实没有任何可改善之处时才保留」。
- 新增【润色示例】两组（「其实我也不需要感知到。」→「这部分我不需要感知到。」；「这个提示我觉得没必要每次都弹出来。」→「这个提示不需要每次弹出。」）：示例比规则更能引导模型行为。
- 增强角色重定位：提示词开头的身份从「需求表达编辑者」改为「提示词润色编辑」，任务从「把真正想做的事情说清楚」改为「用更清楚、更自然、更专业的书面表达写出来」，并同步为「润色表达，不改变意图」。
- 测试：新增短句润色契约断言（示例文本存在、旧的「可保持原样」表述已移除）。

## 1.2.32 — 增强润色与等待上限优化 / Enhancement polish and deadline（2026-10-20）

- 增强现在会**润色表达**，而不只是整理结构：提示词新增【润色表达】一节，要求在不改变事实、约束和意图的前提下，把口语化、碎片化的原稿改写成通顺准确的书面请求，调整用词与句式使指代清楚、句子连贯。同时保留边界——润色只作用于「怎么说」，不得新增要求、扩大或缩小范围、改变优先级、把建议改成要求、把可选项改成必选项；技术内容（代码、命令、路径、标识符、数值、版本号、错误信息）一律原样保留，也不添加原文没有的客套话。原先「改变措辞本身不是收益」「不要只做同义替换」的抑制性表述改为「润色是本职」。
- 增强不再继承会话的推理档位：跟随会话时只沿用模型，推理强度使用模型自身默认档。原实现继承会话滑块的「最高」档，使一次短改写也要等到 120 秒上限并报超时。自动建议（suggest）行为不变。
- 「辅助请求达到等待上限，未应用结果；原文保持不变，不会自动重试」的含义不变：它表示模型在该次请求的 120 秒内没有返回结果，原文未被修改，也不会自动重试；增强改用默认档后应显著减少出现。
- 测试：更新增强提示词契约（润色规则、抑制性表述移除）与跟随会话的档位断言（增强只沿用模型、不继承档位）。

## 1.2.31 — 推理档位方向修复 / Effort scale direction（2026-10-20）

- 修复部分供应商的推理强度滑块方向颠倒：滑块左侧「更快」、右侧「更强」，但档位顺序原先完全照搬宿主返回的 `reasoning.efforts` 数组；若供应商按「最强→最弱」给出（如 `[max, xhigh, high, medium, low]`），最左端就成了最高档——选最高档却显示「低」，拖到最左反而显示「超高」。现在已知档位按「更快→更强」的语义顺序排列（`none/off/minimal/low/medium/high/xhigh/max`），「服务商默认」仍固定在最左；只要目录里出现任何自定义档位，就保持宿主给出的原始顺序（只有供应商自己知道该刻度）。档位集合与当前值匹配逻辑不变。
- 新增 2 项单元测试（最强优先的目录仍按更快→更强排列、含自定义档位的目录保持原序）与 1 项真实 Chromium 交互回归（当前 `low` 时滑块在最左且显示「低」，拖到最右提交 `max` 并显示「最高」）；「手势期间目录更新」回归改用含自定义档位的列表，以继续覆盖顺序变化路径。

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
