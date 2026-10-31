# Translate FY

<p align="center">
  <img src="icons/logo.png" width="96" height="96" alt="Translate FY Logo" style="border-radius: 20px;">
</p>

<p align="center">
  <strong>A minimalist, privacy-first AI translation & academic bilingual PDF reading extension.</strong>
</p>

<p align="center">
  <a href="README.zh-CN.md">简体中文</a> | <strong>English</strong>
</p>

---

## ✨ Features

- **⚡ Fast Selection & Real-Time Streaming**
  - Instant popup translation on any webpage or PDF.
  - SSE typewriter-style streaming with dynamic **[Bilingual / Clean Chinese]** toggle.
- **🧠 Free & AI Matrix**
  - **Zero-Key Channels**: Built-in Google, Bing, and DeepL for instant out-of-the-box lookup.
  - **AI Engines**: Native support for Zhipu GLM (free flash models), Google Gemini, DeepSeek, and custom OpenAI-compatible endpoints (Ollama, OpenRouter, SiliconFlow, etc.).
- **📖 Academic PDF Reader**
  - Parallel split-view with in-place overlay and responsive bilingual cards.
  - **Academic Symbol Healing Engine**: Auto-recovers Greek letters, nucleic acid directions, and chemical/isotope markers (`λ-exonuclease`, `5' → 3'`, `5'-*PO4`, `32P-labeled 5'-end`, `ΔG°`).
  - Virtualized canvas rendering for smooth reading across 1,000+ pages.
- **🛡️ Privacy & Performance**
  - Built with Manifest V3; 0 background memory when idle.
  - 100% direct client-to-API requests. Keys remain strictly in local sandbox storage.

---

## 🚀 Quick Start

### Option A: Install from Pre-built Zip (Recommended)
1. Download or grab `release/translate-fy-v1.0.2.zip`.
2. Unpack the zip file into a local folder.
3. Open `chrome://extensions` (or `edge://extensions`), enable **Developer mode**, click **Load unpacked**, and select the unpacked folder.

### Option B: Build from Source
```bash
# Clone repository
git clone https://github.com/GeoffLeng/Translation-Tools.git
cd Translation-Tools

# Install dependencies & build
npm install
npm run build
```
Load the generated `/dist` directory into your Chromium browser.

---

## 🛠️ Commands

| Command | Description |
| :--- | :--- |
| `npm run dev` | Start local development server |
| `npm run build` | Build production extension into `/dist` |
| `npm run package` | Build and package portable `.zip` into `/release` |

---

## 📄 License

Licensed under the [MIT License](LICENSE).

