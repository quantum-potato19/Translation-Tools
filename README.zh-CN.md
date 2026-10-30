# Translate FY

<p align="center">
  <img src="icons/logo.png" width="96" height="96" alt="Translate FY Logo" style="border-radius: 20px;">
</p>

<p align="center">
  <strong>极简、安全、专注学术的划词翻译与长文档双栏 PDF 对照阅读扩展</strong>
</p>

<p align="center">
  <strong>简体中文</strong> | <a href="README.md">English</a>
</p>

---

## ✨ 核心特性

- **⚡ 沉浸式划词与实时流式翻译**
  - 网页与 PDF 任意划词即现精致浮窗；
  - 毫秒级 SSE 打字机流式长连接输出；
  - 支持一键快捷切换 **[双语对照 / 纯净中文]** 专名备注，即切即译。
- **🧠 零门槛免 Key 与 AI 矩阵**
  - **免 Key 直通**：内置 Google、Bing、DeepL 免配置极速通道。
  - **AI 矩阵**：深度适配智谱 GLM（永久免费 flash 系列）、Google Gemini、DeepSeek 及自定义 OpenAI 兼容接口（Ollama、OpenRouter、SiliconFlow 等）。
- **📖 学术级 PDF 双栏阅读器**
  - 原排版原位对照覆盖与自适应双语对齐流卡片；
  - **学术符号拓扑自愈引擎**：无损还原 `λ-外切核酸酶`、`5' → 3'`、`5'-*PO4`、`32P-labeled 5'-end`、`ΔG°` 等希腊字母、链向及同位素标记；
  - 视口 Canvas 虚拟化回收，支持 1,000+ 页长篇文献丝滑翻阅。
- **🛡️ 纯粹轻量与隐私安全**
  - Manifest V3 事件驱动架构，空闲时后台内存驻留为 0 MB；
  - 100% 浏览器本地直连官方 API，绝无中间人代理，API Key 严格保存在本地沙盒。

---

## 🚀 快速上手

### 方式一：直接安装离线包（推荐）
1. 获取已打包好的 `release/translate-fy-v1.0.1.zip`；
2. 解压至本地任意固定文件夹；
3. 打开 Chrome / Edge 浏览器，访问 `chrome://extensions`，右上角开启 **开发者模式**，点击 **加载已解压的扩展程序** 并选择解压目录。

### 方式二：从源码编译
```bash
# 克隆仓库
git clone https://github.com/GeoffLeng/Translation-Tools.git
cd Translation-Tools

# 安装依赖并编译构建
npm install
npm run build
```
在浏览器中加载生成的 `/dist` 目录即可。

---

## 🛠️ 常用命令

| 命令 | 说明 |
| :--- | :--- |
| `npm run dev` | 启动本地开发服务 |
| `npm run build` | 编译打包全量扩展产物至 `/dist` |
| `npm run package` | 一键打包便携离线安装包至 `/release` |

---

## 📄 开源许可证

本项目基于 [MIT License](LICENSE) 开源。

