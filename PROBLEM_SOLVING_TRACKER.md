# Translate FY 缺陷排查、技术方案与工程演进追踪档案

> **版本**：v1.0.1  
> **更新时间**：2026-10-23  
> **维护责任**：全栈落地研发团队  
> **文档定位**：记录项目全生命周期中所有用户反馈与审计发现的 Bug、工程瓶颈、技术方案、代码落地点及交付进度，作为长期迭代与回归测试的唯一依据。

---

## 一、 档案状态定义与维护规范

| 状态标识 | 含义说明 | 准入/流转条件 |
| :--- | :--- | :--- |
| **`[✅ 已解决]`** | 问题已彻底修复并完成端到端验证 | 代码已落盘至生产分支，自动化编译打包通过，无引入新回归 |
| **`[🔄 进行中]`** | 方案已确定，正在进行编码或测试 | 技术方案已敲定，核心逻辑实现中 |
| **`[📋 规划中]`** | 明确的产品风险或演进项，排期迭代 | 属于已知边界或进阶需求，已制定明确的替代演进方案 |

---

## 二、 全局问题看板 (Dashboard)

| ID | 模块 | 问题摘要 | 严重度 | 解决进度 | 首次解决版本 | 关联文件 |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **ISSUE-01** | 批量翻译 | AI 批量/全文翻译缺少防误触预警 | P1 | `[✅ 已解决]` | v1.0.1 | `pdf_viewer.js` |
| **ISSUE-02** | 术语引擎 | 学科角色与术语库在小语种下的适用性 | P2 | `[✅ 已解决]` | v1.0.1 | `entity_masker.js` |
| **ISSUE-03** | 划词翻译 | 划词图标不弹出、右键菜单翻译弹窗空白 | P0 | `[✅ 已解决]` | v1.0.1 | `content.js`, `background.js` |
| **ISSUE-04** | PDF解析 | PDF 排版折行导致整段被切碎、断句翻译不准 | P0 | `[✅ 已解决]` | v1.0.1 | `pdf_viewer.js` |
| **ISSUE-05** | 交互体验 | 鼠标划过【角色】按钮时悬停误弹窗 | P2 | `[✅ 已解决]` | v1.0.1 | `pdf_viewer.js`, `pdf_viewer.html` |
| **ISSUE-06** | 论文总结 | 添加 API Key 后点击【论文总结】无任何反应 | P0 | `[✅ 已解决]` | v1.0.1 | `pdf_viewer.html`, `pdf_viewer.js` |
| **ISSUE-07** | 排版渲染 | 三栏/双栏 PDF 跨栏断句错位、原位物理框狭窄 | P0 | `[✅ 已解决]` | v1.0.1 | `pdf_viewer.js`, `pdf_viewer.html`, `pdf_viewer.css` |
| **ISSUE-08** | 性能架构 | **双语流视图超长篇文献虚拟滚动与 DOM 显存回收 (原风险 1)** | P1 | `[✅ 已解决]` | v1.0.1 | `pdf_viewer.js`, `pdf_viewer.css` |
| **ISSUE-12** | 符号自愈 | 生化/经济学术特殊符号（λ, 5', 3', ΔG°）识别退化与显示自愈 | P0 | `[✅ 已解决]` | v1.0.2 | `pdf_viewer.js`, `background.js`, `content.js`, `pdf_viewer.css` |
| **ISSUE-13** | 场景隔离 | 专名双语括号标注限制在划词场景、原位覆盖执行防溢出契约 | P1 | `[✅ 已解决]` | v1.0.2 | `prompt_builder.js`, `background.js`, `biochem_terms.json` |
| **ISSUE-09** | 语法解析 | 跨栏末尾文献引用标号（如 `[12].`）断句误切白名单 | P2 | `[📋 规划中]` | 待排期 | `pdf_viewer.js` |
| **ISSUE-10** | 导出中心 | 流式双语卡片排版打印及一键导出 PDF 合成 | P2 | `[📋 规划中]` | 待排期 | `pdf_viewer.js` |

---

## 三、 历史已解决核心问题与技术复盘 (Resolved Issues Ledger)

### ISSUE-01：AI 批量/全文翻译缺少防误触预警
- **问题现象**：用户在选用付费大模型（如 DeepSeek 等）时，点击“全文翻译”或多页选页翻译，若无提示可能在短时间内消耗较多 Token，造成意料之外的调用账单。
- **根本原因**：原逻辑点击按钮后立即触发批量异步队列，缺乏二次防护机制与显式成本提醒。
- **解决方法**：
  1. 在触发批量翻译入口加入非阻塞轻量 Toast 提示与二次确认机制；
  2. 实时估算当前页数与预计耗费 Token 范围，提供明确的【取消翻译】快捷按钮。
- **解决进度**：`[✅ 已解决 100%]`
- **核心文件**：[src/pdf_viewer.js](file:///f:/FORTEST/Translation-Tools/src/pdf_viewer.js)

---

### ISSUE-02：学科角色与学术术语库在小语种下的适用性风险
- **问题现象**：生化医药与有机催化专业术语库默认针对英汉双语互译。当目标语言切换为西语、德语或小语种时，术语替换可能发生语法性冲突或乱码。
- **根本原因**：术语掩码引擎未校验目标语种白名单，强制执行实体占位替换。
- **解决方法**：
  1. 服务端实体掩码模块 [entity_masker.js](file:///f:/FORTEST/Translation-Tools/server/engine/entity_masker.js) 增加目标语言校验；
  2. 非中/英小语种自动降级为“大模型内置系统提示词注入（Prompt Injection）”进行术语约束，停止机械字符串强行替换。
- **解决进度**：`[✅ 已解决 100%]`
- **核心文件**：[server/engine/entity_masker.js](file:///f:/FORTEST/Translation-Tools/server/engine/entity_masker.js)

---

### ISSUE-03：网页端划词翻译图标未弹出、右键“翻译选中内容”弹窗为空
- **问题现象**：用户在浏览器网页划词时，浮动翻译图标未能正常显示；通过右键上下文菜单选择【翻译选中内容】，打开的弹窗内无待翻译文本。
- **根本原因**：
  1. `content.js` 在多层 iframe 或复杂富文本容器中计算选中范围坐标出现 `NaN`，触发坐标边界保护被隐藏；
  2. 右键菜单事件在向 `background.js` 派发消息时，未能正确提取当前激活页面的 `selectionText` 缓存。
- **解决方法**：
  1. 重构 `content.js` 划词选区监听，采用 `clientX/Y` 降级兜底方案；
  2. `background.js` 在右键点击触发后，主动向当前标签页发送查询指令取回最新选中文本并即时打开弹窗发起请求。
- **解决进度**：`[✅ 已解决 100%]`
- **核心文件**：[src/content.js](file:///f:/FORTEST/Translation-Tools/src/content.js), [src/background.js](file:///f:/FORTEST/Translation-Tools/src/background.js)

---

### ISSUE-04：PDF 原始排版折行导致整段被切碎为短行、断句错译
- **问题现象**：PDF 原生排版包含大量物理硬折行换行符。翻译引擎将一个完整段落切成 4~5 行独立碎片分次翻译，导致语法丢失、半句只有一半、译文生硬混乱。
- **根本原因**：PDF 提取器按文本流中的物理换行 `\n` 切分块，未进行自然语言语义段落重构（Paragraph Reconstruction）。
- **解决方法**：
  1. 研发 [reconstructPdfParagraphs](file:///f:/FORTEST/Translation-Tools/src/pdf_viewer.js#L875-L975) 智能重构算法；
  2. 识别连字符换行断词（Hyphenation）并依据专有名词白名单智能消除或保留；
  3. 判定行尾句法标点（`. ! ? :`），西文段内软折行拼接为单空格连贯长句，CJK 汉字无缝紧密连接。
- **解决进度**：`[✅ 已解决 100%]`
- **核心文件**：[src/pdf_viewer.js](file:///f:/FORTEST/Translation-Tools/src/pdf_viewer.js)

---

### ISSUE-05：顶部【角色】按钮悬停（Hover）误弹出菜单干扰阅读
- **问题现象**：鼠标快速划过顶部工具栏【角色】胶囊时，容易误触悬停事件弹出下拉浮层，遮挡文献第一页标题。
- **根本原因**：原交互绑定了 `mouseenter/mouseover` 延时弹出逻辑，容错阈值过小。
- **解决方法**：
  1. 彻底移除 CSS 和 JS 中的 hover 弹窗绑定；
  2. 统一改为 `click` 显式点击触发，点击胶囊任意区域即聚焦并调用原生 `showPicker()` 弹出菜单。
- **解决进度**：`[✅ 已解决 100%]`
- **核心文件**：[src/pdf_viewer.js#L6120-L6132](file:///f:/FORTEST/Translation-Tools/src/pdf_viewer.js#L6120-L6132), [pdf_viewer.html](file:///f:/FORTEST/Translation-Tools/pdf_viewer.html)

---

### ISSUE-06：配置 API Key 后点击【论文总结】无任何响应
- **问题现象**：用户在设置页面配置好智谱/DeepSeek Key 后，在 PDF 界面点击【论文总结】，界面完全静默无反应。
- **根本原因**：在 [pdf_viewer.html](file:///f:/FORTEST/Translation-Tools/pdf_viewer.html) 中，前置的手绘调色板容器 `#ink-popover` 遗漏了闭合标签 `</div>`，导致随后的 `#paper-summary-drawer` 整体被吞噬在具有 `.hidden`（`display: none !important`）属性的元素内部。
- **解决方法**：
  1. 闭合未闭合的 DOM 标签；
  2. 将原侧边抽屉升级为标准的居中模态对话框 `#paper-summary-modal`；
  3. 内置骨架抽取进度状态、Markdown 流式渲染器与一键复制 Markdown 结果按钮；
  4. 未打开 PDF 时点击加入弱提示弹窗拦截。
- **解决进度**：`[✅ 已解决 100%]`
- **核心文件**：[pdf_viewer.html#L708-L745](file:///f:/FORTEST/Translation-Tools/pdf_viewer.html#L708-L745), [src/pdf_viewer.js#L5800-L5920](file:///f:/FORTEST/Translation-Tools/src/pdf_viewer.js#L5800-L5920), [src/styles/pdf_viewer.css#L2555-L2575](file:///f:/FORTEST/Translation-Tools/src/styles/pdf_viewer.css#L2555-L2575)

---

### ISSUE-07：三栏/双栏 PDF 跨栏断句错位、原位物理框狭窄
- **问题现象**：多栏（如 3 栏 IEEE/研报）排版中，栏 1 末尾（如 `Simultaneously, stablecoin`）流向栏 2 顶部（如 `legislation, notably the US GENIUS Act...`），被当作两段分别翻译，语义彻底错乱；原位排版在仅 180px 宽的窄栏中文字严重重叠挤压。
- **根本原因**：
  1. 跨栏时因 Y 坐标大幅上跳及 X 坐标跨栏突变，被旧分词算法无条件切断；
  2. PDF 原位 1:1 坐标定位无法容纳长于英文 1.5 倍的中文译文。
- **解决方法（落地方案 A：沉浸式双语流视图）**：
  1. **跨栏句子缝合**：在 [extractPageBlocks](file:///f:/FORTEST/Translation-Tools/src/pdf_viewer.js#L3571-L3610) 中增加 `isCrossColumnContinuation`，栏尾无终结标点或小写开头时绝不切断，全量缝合为完整语义长句；
  2. **双语卡片流**：实现 [renderBilingualReaderFlow](file:///f:/FORTEST/Translation-Tools/src/pdf_viewer.js#L2848-L2975)，在右侧排版为高可读性的双语对照卡片，彻底打破物理框限制；
  3. **原位光环联动**：点击卡片“📍 定位原文”，平滑滚动左侧 PDF 并向原文对应各分行附加 2.6 秒脉冲动态高亮；
  4. **顶栏双向联动**：提供 `[ 📖 双语流视图 ]` / `[ 📄 原位排版 ]` 快捷切换，状态持久化至 `chrome.storage.local`。
- **解决进度**：`[✅ 已解决 100%]`
- **核心文件**：[src/pdf_viewer.js](file:///f:/FORTEST/Translation-Tools/src/pdf_viewer.js), [pdf_viewer.html](file:///f:/FORTEST/Translation-Tools/pdf_viewer.html), [src/styles/pdf_viewer.css](file:///f:/FORTEST/Translation-Tools/src/styles/pdf_viewer.css)

---

### ISSUE-08：双语流视图超长篇文献虚拟滚动与 DOM 显存回收（风险 1 彻底攻克）
- **问题现象**：原位排版具有 Canvas 显存回收，但新落地的流视图若翻译 100+ 页长篇文献，一次性挂载数千张卡片会导致页面 DOM 节点数暴增，可能引起低配设备滚动卡顿。
- **根本原因**：流视图初版采用扁平循环直接 append 全量卡片，缺少视口检测机制。
- **解决方法**：
  1. 在 [src/pdf_viewer.js](file:///f:/FORTEST/Translation-Tools/src/pdf_viewer.js#L2850-L2950) 为流视图设计专属轻量级 `FlowVirtualObserver`；
  2. 按页分段包装为 `.flow-page-section`，总页数 > 6 时开启长篇虚拟化；
  3. 设置上下 `800px` 缓冲视口，视口内即时动态挂载 `.flow-card`，离开视口的页面卡片自动卸载并固定测量高度（`minHeight`），保证滚动条绝对稳定不跳动；
  4. 内存占用被锁定在 $O(1)$ 常数级，支持数百页长文献丝滑翻阅。
- **解决进度**：`[✅ 已解决 100%]`
- **核心文件**：[src/pdf_viewer.js#L2850-L2950](file:///f:/FORTEST/Translation-Tools/src/pdf_viewer.js#L2850-L2950), [src/styles/pdf_viewer.css#L2840-L2860](file:///f:/FORTEST/Translation-Tools/src/styles/pdf_viewer.css#L2840-L2860)

---

### ISSUE-12：生化与计量学术特殊符号（λ, 5', 3', ΔG°）识别退化与全链路拓扑自愈
- **问题现象**：在生化学术论文（以 CSR.pdf 为参照样本）中，希腊字母 `λ` 易被误识别为英文字母 `l` 或 `k`（如 `l-exo`、`k-Exonuclease`）；核酸 5' 与 3' 撇号易退化为普通数字 `50`、`30`；物理化学自由能变 `ΔG°`、`ΔΔG°`、`ΔTm` 易被错误篡改或省略。
- **根本原因**：
  1. PDF.js 文本抽取层在特定数学字体编码映射下字形代码丢失，产生退化 ASCII；
  2. 译文输出容器缺少针对 Unicode 数学区段的后备字体栈，导致特殊符号显示缺失；
  3. 翻译模型缺乏角色隔离的学科符号强保护提示词约束。
- **解决方法**：
  1. 在 [src/pdf_viewer.js](file:///f:/FORTEST/Translation-Tools/src/pdf_viewer.js#L822-L895) 和 [src/background.js](file:///f:/FORTEST/Translation-Tools/src/background.js#L577-L646) 实现角色专有的 `healAcademicSymbols` 自愈引擎；
  2. 制定上下文白名单修饰语拓扑正则，精准修复 `5' → 3'`、`5'-PO4`、`λ-Exonuclease`、`ΔG°` 等；
  3. 全链路更新 CSS 字体栈，注入 `"Times New Roman", "Cambria Math"`；
  4. 扩充 3,102 条生化权威专业术语库。
- **解决进度**：`[✅ 已解决 100%]`
- **核心文件**：[src/pdf_viewer.js](file:///f:/FORTEST/Translation-Tools/src/pdf_viewer.js), [src/background.js](file:///f:/FORTEST/Translation-Tools/src/background.js), [src/content.js](file:///f:/FORTEST/Translation-Tools/src/content.js), [src/styles/pdf_viewer.css](file:///f:/FORTEST/Translation-Tools/src/styles/pdf_viewer.css)

---

### ISSUE-13：专名双语括号标注场景隔离与原排版空间防溢出契约
- **问题现象**：原先为查词便利在所有译文中对专有名词附加英文全称和缩写括号，导致 PDF 整页原排版（In-place Overlay）中字符长度暴增 2~3 倍，严重挤压排版空间，触发字号极度缩微或物理文本框重叠溢出。
- **根本原因**：未将“独立划词精读”与“整页原位覆盖排版”两种完全不同的业务场景在 Prompt 编排与词条输出层进行隔离。
- **解决方法**：
  1. **场景隔离**：在 [server/engine/prompt_builder.js](file:///f:/FORTEST/Translation-Tools/server/engine/prompt_builder.js#L3-L33) 与 [src/background.js](file:///f:/FORTEST/Translation-Tools/src/background.js#L561-L574) 引入 `isSelection` 开关；
  2. **划词独立翻译场景**：保留完整的双语对照标注规范，输出形如 `单核苷酸变异 (single nucleotide variant, SNV)`；
  3. **PDF 原排版批量翻译场景**：强制执行《原排版空间防溢出契约》，术语仅采用规范中文定名，严禁附加冗长英文全称括号（仅首见极短缩写允许紧随小括号），杜绝原位排版溢出。
- **解决进度**：`[✅ 已解决 100%]`
- **核心文件**：[server/engine/prompt_builder.js](file:///f:/FORTEST/Translation-Tools/server/engine/prompt_builder.js), [src/background.js](file:///f:/FORTEST/Translation-Tools/src/background.js), [src/content.js](file:///f:/FORTEST/Translation-Tools/src/content.js)

---

### ISSUE-14：划词翻译专名双语备注自由开关与极罕见修饰标记/同位素标号自愈
- **问题现象**：
  1. 用户在划词翻译时需要根据个人阅读习惯自由选择“是否在翻译结果中备注专有词汇原文”，避免被括号英文打扰；
  2. 学术论文中包含极罕见的非标准修饰标记（如化学修饰星号 `*` 硫代骨架 `5'-*PO4`、`5'-*端`、`3'-*端`）或同位素标号（如 `32P-labeled 5'-end`、`[32P]`、`γ-32P-ATP`），在抽取中易被拆碎或误识别为普通数字 `50`。
- **根本原因**：
  1. 划词翻译此前缺少用户级双语对照持久化配置与浮窗一键即时切换控制；
  2. 学术符号拓扑自愈引擎对包含化学星号 `*` 与同位素放射性标号的前置模式未纳入覆盖。
- **解决方法**：
  1. **双语备注自由开关**：
     - 在 [options.html](file:///f:/FORTEST/Translation-Tools/options.html#L51-L61) 与 [src/options.js](file:///f:/FORTEST/Translation-Tools/src/options.js#L29-L35) 增加全局配置项 `enableBilingualNotation`；
     - 在网页划词浮窗 [src/content.js](file:///f:/FORTEST/Translation-Tools/src/content.js#L469-L473) 与 PDF 划词浮窗 [src/pdf_viewer.js](file:///f:/FORTEST/Translation-Tools/src/pdf_viewer.js#L761-L768) 增加一键交互式 `[双语]` 胶囊按钮，点击即持久化并即时重新翻译当前文本；
     - 在后台服务 [src/background.js](file:///f:/FORTEST/Translation-Tools/src/background.js#L1675-L1735) 与流式通道中，根据开关决定输出 `中文定名 (英文原文/缩写)` 或纯净规范中文定名；
  2. **极罕见非标准修饰与同位素自愈**：
     - 升级 [src/pdf_viewer.js](file:///f:/FORTEST/Translation-Tools/src/pdf_viewer.js#L860-L875) 与 [src/background.js](file:///f:/FORTEST/Translation-Tools/src/background.js#L615-L635) 的 `healAcademicSymbols` 引擎；
     - 全面覆盖硫代骨架化学星号 `5'-*PO4`、`5'-*端`、`3'-*端`、`5'-*X`，以及同位素标号 `32P-labeled 5'-end`、`[32P]`、`γ-32P-ATP` 和中文后处理自愈。
- **解决进度**：`[✅ 已解决 100%]`
- **核心文件**：[options.html](file:///f:/FORTEST/Translation-Tools/options.html), [src/options.js](file:///f:/FORTEST/Translation-Tools/src/options.js), [src/content.js](file:///f:/FORTEST/Translation-Tools/src/content.js), [src/pdf_viewer.js](file:///f:/FORTEST/Translation-Tools/src/pdf_viewer.js), [src/background.js](file:///f:/FORTEST/Translation-Tools/src/background.js)

---

## 四、 后续待演进需求排期池 (Backlog Tracker)

### ISSUE-09：期刊跨栏末尾文献引用标号（如 `[12].`）断句语法白名单优化
- **背景描述**：部分学术期刊跨栏最末行以引用编号结尾（如 `suggested by Smith et al. [14].`），虽然存在句号，但次栏开头可能是后半从句。
- **方案设想**：在断句判断中增加正则过滤 `/(?:\[\d+(?:[–—,-]\d+)*\]|\(\d{4}\))[\.\s]*$/`，仅在真正语义终结时断开。
- **优先级**：P2
- **排期状态**：`[📋 规划中]`

---

### ISSUE-10：双语阅读流专属离屏打印与高保真 PDF 导出
- **背景描述**：当前导出中心主要支持原位排版及纯文本，用户可能需要直接将“双语流卡片排版”打印或导出为带格式的 PDF。
- **方案设想**：利用现有的离屏打印通道，增加针对 `.bilingual-reader-flow` 的专用打印 CSS 样式表与分页断点（`page-break-inside: avoid`）。
- **优先级**：P2
- **排期状态**：`[📋 规划中]`

---

### ISSUE-11：本地离网环境私有模型（Ollama / vLLM）直连协议
- **背景描述**：企业或高保密环境科研人员无法连接公网 API，需本地运行 Llama3、Qwen 等模型进行文献翻译。
- **方案设想**：在自定义模型设置面板中，增强对 `http://localhost:11434`（Ollama）的预置探测，无需外网 Key 即可完成本地整页文献翻译。
- **优先级**：P2
- **排期状态**：`[📋 规划中]`
