# Translate FY

<p align="center">
  <img src="icons/logo.png" width="96" height="96" alt="Translate FY Logo" style="border-radius: 20px;">
</p>

<p align="center">
  <strong>极简、安全、专注学术的划词翻译、AI 深度查词与长文档双栏 PDF 对照阅读扩展</strong>
</p>

<p align="center">
  <strong>简体中文</strong> | <a href="README.md">English</a>
</p>

---

## ✨ 核心特性

- **⚡ 沉浸式划词与实时流式翻译**
  - **Shadow DOM 样式隔离**：网页与 PDF 任意划词即现精致浮窗，杜绝宿主页面样式污染；
  - **毫秒级 SSE 打字机流**：长连接流式输出，零感知等待；
  - **双语对照 / 纯净中文切换**：支持一键快速切换对照模式与译文模式；
  - **多语种 TTS 语音朗读**：智能识别文本字符集，精准调用对应语系发音；
  - **生词本一键收录**：浮窗与弹窗均支持一键星标收藏生词。

- **🧠 免 Key 直通与多模型 AI 矩阵**
  - **零门槛免 Key**：内置 Google、Bing、DeepL 免配置极速通道，开箱即用；
  - **主流 AI 深度适配**：支持智谱 GLM（永久免费 flash 系列）、Google Gemini、DeepSeek（Chat / Reasoner）及有道词典；
  - **兼容自定义 OpenAI 接口**：无缝直连 Ollama、LM Studio、vLLM、OpenRouter、SiliconFlow 等本地或云端大模型；
  - **四大翻译人设切换**：专业学术论文、典雅文学翻译、严谨商务技术、自然日常对话。

- **📖 学术级 PDF 双栏沉浸阅读器**
  - **双重对照排版**：支持双栏并排独立滚动与原版位自适应对照覆盖；
  - **智能分栏与连字符断词缝合**：精准识别双栏版面、自动拼接跨栏跨页段落、自动修复行末连字符与页眉页脚噪音；
  - **学术符号拓扑自愈引擎**：无损还原与保护 `λ-外切核酸酶`、`5' → 3'`、`5'-*PO4`、`32P-labeled 5'-end`、`ΔG°` 等希腊字母、核酸链向与同位素标记；
  - **Canvas 视口虚拟化**：支持 1,000+ 页长篇文献丝滑翻阅，内存自动回收；
  - **IndexedDB 本地持久化**：阅读进度与翻译缓存全量离线持久化，支持一键导出双语 Markdown 与批注版 PDF。

- **📚 专属生词本与专业术语库**
  - **本地生词本管理**：内置关键词实时搜索、星标筛选、发音朗读与状态维护；
  - **数据无缝导出**：一键导出 Markdown 与 CSV 格式，便捷同步至 Anki 或 Obsidian；
  - **自定义专业术语库**：支持 `user_glossary.json`，基于 Aho-Corasick 算法在送译前执行精准专有名词屏蔽与保护。

- **🛡️ 纯粹轻量与隐私安全**
  - **Manifest V3 架构**：纯事件驱动，空闲时后台内存驻留严格为 0 MB；
  - **客户端 100% 直连**：无任何中间人中转服务器与遥测打点，API Key 仅保存在浏览器本地加密沙盒中。

---

## 🚀 快速上手

### 方式一：直接安装离线包（推荐）
1. 从 [Releases](../../releases) 或项目 `release/` 目录获取 `translate-fy-v1.0.2.zip`；
2. 解压至本地任意固定文件夹；
3. 打开 Chrome / Edge 浏览器，访问 `chrome://extensions`；
4. 右上角开启 **开发者模式**，点击 **加载已解压的扩展程序**，选择解压后的文件夹即可。

### 方式二：从源码编译
```bash
# 克隆仓库
git clone https://github.com/GeoffLeng/Translation-Tools.git
cd Translation-Tools

# 安装依赖
npm install

# 编译构建生产产物至 /dist 目录
npm run build
```
在浏览器扩展管理页中点击“加载已解压的扩展程序”，选择生成的 `/dist` 目录。

---

## ⚙️ 模型配置指南

扩展安装后即可使用默认的 Google / Bing 免费免 Key 翻译。若需启用 AI 大模型：

1. 点击扩展图标打开弹窗，点击右上角 **设置**（⚙️ 图标）；
2. 根据需求填入智谱 GLM、Google Gemini 或 DeepSeek 的官方 API Key；
3. **本地大模型配置（以 Ollama 为例）**：
   - 接口地址（Base URL）：`http://localhost:11434/v1`
   - 模型名称：填入已拉取的模型名（如 `qwen2.5:7b`、`deepseek-r1:8b` 或 `llama3.2`）
   - API Key：可填 `ollama` 或留空。

---

## 🛠️ 项目常用命令

| 命令 | 说明 |
| :--- | :--- |
| `npm run dev` | 启动 Vite 本地热重载开发服务器 |
| `npm run build` | 全量编译构建生产扩展产物至 `/dist` 目录 |
| `npm run package` | 一键打包便携式离线安装包至 `/release` 目录 |
| `npm run serve:pdf` | （可选）启动本地 Node.js 辅助中转服务（端口 3300） |

---

## 📂 项目结构

```text
Translation-Tools/
├── dist/                # 编译打包输出目录（加载至浏览器运行）
├── icons/               # 扩展高清图标与 Logo 资源
├── release/             # 便携式 zip 离线安装包发布目录
├── scripts/             # 构建与打包脚本
├── server/              # 本地辅助代理服务与术语屏蔽引擎
├── src/
│   ├── background.js    # MV3 后台 Service Worker（请求路由与调度）
│   ├── content.js       # 页面划词浮窗与 Shadow DOM 注入逻辑
│   ├── doc_storage.js   # IndexedDB 文档与生词本存储层
│   ├── options.js       # 设置面板交互与模型管理
│   ├── pdf_viewer.js    # PDF.js 双栏学术阅读器核心逻辑
│   ├── popup.js         # 工具栏弹窗控制器
│   ├── term_matcher.js  # Aho-Corasick 算法专业术语屏蔽器
│   ├── shared/          # 前后端同构共享常量与多语种定义
│   └── styles/          # iOS 质感毛玻璃样式表
├── options.html         # 设置页视图
├── pdf_viewer.html      # PDF 阅读器界面
├── popup.html           # 扩展工具栏弹窗
└── manifest.json        # Chromium Extension MV3 配置文件
```

---

## 📄 开源许可证

本项目基于 [MIT License](LICENSE) 开源。
