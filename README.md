# Translate FY

<p align="center">
  <img src="icons/logo.png" width="96" height="96" alt="Translate FY Logo" style="border-radius: 20px;">
</p>

<p align="center">
  <strong>A minimalist, privacy-first AI translation & academic bilingual PDF reading extension for Chromium browsers.</strong>
</p>

<p align="center">
  <a href="README.zh-CN.md">简体中文</a> | <strong>English</strong>
</p>

---

## ✨ Features

- **⚡ Instant Selection & SSE Streaming Translation**
  - Smooth floating bubble with Shadow DOM style isolation on any webpage.
  - Millisecond-level SSE typewriter streaming response with zero perceived latency.
  - One-click dynamic toggle between **[Bilingual Comparison]** and **[Clean Target Language]**.
  - Built-in TTS audio pronunciation with automatic source language detection.
  - Instant one-click bookmarking to local Vocabulary Notebook.

- **🧠 Multi-Engine & Large Language Model (LLM) Matrix**
  - **Zero-Key Channels**: Built-in Google Translate, Bing, and DeepL web proxies for instant, out-of-the-box lookup without API keys.
  - **Native AI Models**: Native integration for Zhipu GLM (including free GLM-4-Flash series), Google Gemini, DeepSeek (Chat / Reasoner), and Youdao.
  - **Custom OpenAI-Compatible Endpoints**: Full compatibility with Ollama, LM Studio, vLLM, OpenRouter, SiliconFlow, and Groq.
  - **Adaptive Translation Personas**: 4 specialized translation personas (Academic Paper, Literary, Professional/Business, Casual).

- **📖 Academic PDF Dual-Column Reader**
  - Dual viewing modes: Parallel split-view and responsive in-place overlay.
  - **Dual-Column & Hyphen Stitching**: Automatic layout detection, cross-column continuation merging, hyphen reconnect, and running header/footer filtering.
  - **Academic Symbol Healing Engine**: Preserves and recovers complex scientific notations, Greek letters, nucleic acid directions (`5' → 3'`), chemical subscripts, and radioisotope labels (`32P-labeled`, `5'-*PO4`, `λ-exonuclease`, `ΔG°`).
  - Virtualized canvas rendering capable of smoothly scrolling 1,000+ pages.
  - Document caching via IndexedDB; one-click export to Bilingual Markdown and annotated PDF.

- **📚 Local Vocabulary Notebook & Custom Glossaries**
  - Built-in searchable vocabulary manager with audio pronunciation and starred filter.
  - One-click export to Markdown and CSV for Anki or Obsidian sync.
  - Custom user glossary (`user_glossary.json`) powered by Aho-Corasick exact terminology masking.

- **🛡️ Privacy & Performance First**
  - Manifest V3 event-driven architecture; strictly 0 MB background memory when idle.
  - 100% direct client-side requests to official APIs. No intermediate servers, telemetry, or user tracking. API keys remain safely encrypted in browser local sandbox storage.

---

## 🚀 Quick Start

### Method 1: Install Pre-built Package (Recommended)
1. Download `translate-fy-v1.0.2.zip` from the [Releases](../../releases) section (or from `release/`).
2. Unpack the `.zip` archive into a local folder.
3. Open `chrome://extensions` (or `edge://extensions`) in your browser.
4. Enable **Developer mode** in the top-right corner.
5. Click **Load unpacked** and select the unzipped directory.

### Method 2: Build from Source
```bash
# Clone repository
git clone https://github.com/GeoffLeng/Translation-Tools.git
cd Translation-Tools

# Install dependencies
npm install

# Compile production extension into /dist
npm run build
```
Load the generated `/dist` folder as an unpacked extension in your browser.

---

## ⚙️ Configuration & Custom Models

Translate FY works immediately out of the box with built-in free engines (Google / Bing). To unlock AI capabilities:

1. Click the extension icon and open **Settings** (⚙️ icon).
2. Configure your API keys for Zhipu GLM, Google Gemini, or DeepSeek.
3. **Local LLM with Ollama**:
   - Set Base URL: `http://localhost:11434/v1`
   - Model name: e.g. `llama3.2`, `qwen2.5:7b`, or `deepseek-r1:8b`
   - API Key: `ollama` (or leave empty)

---

## 🛠️ Project Commands

| Command | Description |
| :--- | :--- |
| `npm run dev` | Launch Vite local development server |
| `npm run build` | Build production extension bundle into `/dist` |
| `npm run package` | Package ready-to-distribute `.zip` into `/release` |
| `npm run serve:pdf` | (Optional) Start local Node.js proxy server on port 3300 |

---

## 📂 Project Structure

```text
Translation-Tools/
├── dist/                # Production build output (load this in browser)
├── icons/               # Extension icons and logos
├── release/             # Pre-packaged distributable zip files
├── scripts/             # Release packaging scripts
├── server/              # Optional local proxy server & term matching engine
├── src/
│   ├── background.js    # MV3 Service Worker (message router & API caller)
│   ├── content.js       # Webpage selection bubble & Shadow DOM injector
│   ├── doc_storage.js   # IndexedDB document & vocabulary persistence
│   ├── options.js       # Extension settings & model manager
│   ├── pdf_viewer.js    # PDF.js dual-column academic reader
│   ├── popup.js         # Toolbar popup controller
│   ├── term_matcher.js  # Aho-Corasick domain entity masker
│   ├── shared/          # Isomorphic constants and language definitions
│   └── styles/          # iOS-inspired glassmorphism stylesheets
├── options.html         # Settings page
├── pdf_viewer.html      # PDF reader interface
├── popup.html           # Extension toolbar popup
└── manifest.json        # Chromium Extension Manifest V3 configuration
```

---

## 📄 License

Distributed under the [MIT License](LICENSE).
