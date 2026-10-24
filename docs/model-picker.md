# 输入框模型选择器（1.2.29）

## 本轮界面

只替换输入框原来的模型选择器，不增加并列按钮：

- 菜单按供应商分组。默认每个供应商标题下直接显示其模型；供应商很多时，可在分组标题右侧点「常驻」把该供应商设为常驻（已常驻显示「已常驻」）（快捷展开）。未常驻的供应商收进同一个「其余模型」行：顶层只显示这一行（名称、模型总数和 ›），鼠标悬停即在其右侧浮出全部未常驻模型，不必点击；也可点该行或按 → 打开、再点一次收起。浮层内的模型行与常驻分组样式一致，供应商之间用横杆分隔，每行供应商名右侧保留「常驻」，取消常驻后该供应商回到常驻分组。浮层放不下时整体翻到菜单左侧，仍留在视口内。常驻记录保存在浏览器 localStorage（键 local-prompt-assist:model-pinned-providers），仅本机本 profile 生效，不写入 profile 或宿主配置。没有常驻供应商时菜单与 1.2.28 完全一致。
- 模型名下显示内置说明；没有自定义说明编辑器，不向 profile 增加说明存储、快照字段或保存接口。
- 菜单底部使用 Claude Style 原版滑块外形与动效：26px 轨道、16×30px 圆角滑块、200ms 吸附过渡、拖拽时 1.1 倍缩放、档位文字进出动画，以及最高档的紫色像素矩阵效果。不是上一版的圆形蓝色滑块。
- 只使用宿主为该模型提供的档位，绝不把所有模型都硬编码为 Low/Medium/High；已知档位（none/off/minimal/low/medium/high/xhigh/max）按「更快→更强」的语义顺序排列，目录里出现自定义档位时保持宿主给出的原顺序。没有推理参数就不显示滑块；只有一个档位则不可拖动。
- 拖动时连续跟手，按原版磁吸曲线靠近档位；松手吸附并只提交一次。等待宿主确认时保持目标落点，失败才回退。键盘同样在释放按键时提交；取消、切换模型或更新目录会使旧手势失效。系统设置减少动态效果时，过渡时长压缩到 0.01ms，最高档点阵改为整体 2.4 秒缓慢呼吸（单个合成动画），不再逐格高频闪烁。
- 点击已经选中的模型只关闭菜单，不重置推理档。切换模型时，如果新模型也声明了当前档位就沿用（不降级、不回到默认）；新模型不支持该档位时不传该字段，由宿主回退到新模型的默认档位。

## 原生挂载与生命周期

使用 `conversation.input.model` 的 single/session 插槽。原生 entry 的优先级为 0，本插件以 -1 注册，卸载后由原生 entry 继续渲染。仅依赖可用的 `slots`、`sessions`、`modelDirectories` 服务，不声明或接管原生 `.label` 子插槽，也不扫描、隐藏或移动别的插件的 DOM。

每个渲染实例从所属 sessionId 取得共享目录；目录、当前选择与模型提交仍归宿主管理。`locked` 时不能切换；addressed subagent 不显示控件。组件卸载或切换会话后，旧请求回调不能重新打开菜单或抢夺焦点。

组件自带样式，因此不必先打开插件设置页。弹层在视口内定位；分组模型区独立滚动，滑块固定在底部。模型行支持方向键、Home/End、Enter；「其余模型」行支持 → 打开浮层，Tab 可进入滑块，滑块使用原生 range 的键盘语义；Esc 或点击外部关闭菜单与浮层。

## 滑块来源与动效

滑块视觉取自同一固定版本 Claude Style 0.16.3 的 `control.ts`、`matrix.ts`、`effort-picker.css`、动效样式及 token。保留原始参考文件与 MIT 许可，[滑块来源记录](<../third-party/claude-style/SLIDER-PROVENANCE.json>)记录提交及文件哈希。测试直接执行参考源码中的纯函数作为对照，并核对原 CSS 声明、关键帧和时间参数；选择请求与会话权限仍使用本插件的原生目录接入。

可通过下面命令查看实际 Chromium 动效回归和录制动态演示，都是模拟目录，不是当前 GUI 的安装结果：

```powershell
node scripts/test-model-picker-motion.mjs
node scripts/record-model-picker-motion.mjs
```

## ZCode 样式（1.2.52）

设置页的「模型选择器样式」从开关改为三选一：**DSH 默认**（宿主原生选择器）、**Claude Style**（上文的自定义选择器）、**ZCode**。偏好保存在浏览器 localStorage（键 lpa_model_picker_style），仅本机生效，切换立即生效。

ZCode 样式按 [zai-org/ZCode](https://github.com/zai-org/ZCode)（Apache-2.0，固定提交 `3c5b227649371507ddc4eb46ac5133afe6db1cab`）移植：

- 菜单在按钮上方展开（空间不足时回退到下方，与 Claude Style 相同的定位器）。
- 供应商子菜单：菜单顶部一行显示当前供应商与模型数，点开（或按 Enter）后钻取到供应商列表；选择供应商只切换视图，**不会自动选中该供应商的任何模型**——这是与上游的有意差异，插件不允许替用户提交选择。Claude Style 的常驻与其余模型浮层仅属于 Claude Style，ZCode 用供应商导航替代。
- 菜单底部为思考档滑块：24px 圆角轨道、绿色填充、28px 白色滑块头、逐档圆点；到达最强档时出现 oklch 最短色相路径的渐变与 12 颗白色气泡流动动效；GLM Highspeed/FlashX 模型（按显示名判定）改为蓝色填充与蓝→紫渐变、32 颗更快的气泡。原生 range 承担键盘与拖动，交互手势与 Claude Style 共用同一套实现。
- `prefers-reduced-motion` 下隐藏气泡并去掉全部过渡。颜色使用 ZCode 的 Tailwind 色阶字面值（green-600/500、blue-500、purple-500），文字与表面沿用 DSH 的 `--dsw-alias-*` 主题 token，两套主题都可读。

移植的逐文件来源、Git blob SHA-1、SHA-256 与改动清单见[来源记录](<../third-party/zcode-style/PROVENANCE.json>)与[滑块专项记录](<../third-party/zcode-style/SLIDER-PROVENANCE.json>)；完整 Apache-2.0 许可文本随包分发。

## 说明来源与范围

内置说明原样取自 [Claude Style 0.16.3](https://github.com/Nwflower/dsh-claude-style/tree/33fc20b63d4cbd31cfec98d7952e3c53ec11c832)，固定提交 `33fc20b63d4cbd31cfec98d7952e3c53ec11c832`。数据文件 SHA-256 为 `d815694fb9540e60bc336939d5dc3f87121cc2ce102b14512f5c0492ea1cdd4b`；63 条模型家族规则、4 条档次规则及语言回退逻辑随客户端打包。完整 [MIT 许可](<../third-party/claude-style/LICENSE>)和[来源记录](<../third-party/claude-style/PROVENANCE.json>)随包分发。

运行时不依赖 Claude Style 的安装、网络或 profile 数据。规则未匹配时使用宿主模型 metadata 中的 description；仍无说明则留空，不凭空生成。文案属于上游描述，不是本插件对模型能力的独立评测。没有复制额度、计费倍率或图标数据，也不会伪造这些状态。匹配仅影响显示，不进入请求提示词，不调用模型。

供应商个别目录加载失败时，成功目录仍然可选，失败项同时显示，并提供重新加载。提交失败会留在菜单内说明原因。

## 组合兼容性与验证边界

若另一个主题也接管同一模型选择器，应只保留一种替换功能。当前没有对所有第三方主题组合做实机验证，不保证它们同时启用的结果。

开发验证覆盖真实 React 组件和真实 Chromium 指针、键盘事件。合成页面使用模拟模型目录；截图不是已登录 GUI 截图，也不能证明当前 profile 已升级。测试不会调用真实模型。

```powershell
node --test tests/*.test.js
node scripts/test-model-picker-layout.mjs
node scripts/run-model-picker-browser.mjs
node scripts/screenshot-model-picker.mjs
```

维护者发布与用户升级是独立操作；未经明确授权不安装或升级当前 profile。
