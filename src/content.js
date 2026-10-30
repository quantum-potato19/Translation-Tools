// Content Script for iOS Translate Lite (v2.0)

(function () {
  // 清理上一实例（若存在热重载或重新注入情况）
  if (window.__iosTranslateCleanup) {
    try { window.__iosTranslateCleanup(); } catch (e) {}
  }

  // 清理遗留或因扩展更新失效的旧 Shadow Host
  const existingHost = document.getElementById('ios-translate-shadow-host');
  if (existingHost) {
    try { existingHost.remove(); } catch (e) {}
  }

  // 1. 创建 Shadow Host (采用 fixed 视口穿透，彻底杜绝 body 样式与滚动偏移影响)
  const host = document.createElement('div');
  host.id = 'ios-translate-shadow-host';
  host.style.position = 'fixed';
  host.style.top = '0';
  host.style.left = '0';
  host.style.width = '0';
  host.style.height = '0';
  host.style.pointerEvents = 'none';
  host.style.zIndex = '2147483647';
  (document.body || document.documentElement).appendChild(host);

  const shadowRoot = host.attachShadow({ mode: 'open' });

  // 2. 注入 iOS 26 极简玻璃拟态样式
  const style = document.createElement('style');
  style.textContent = `
    :host {
      all: initial;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Times New Roman", "Cambria Math", sans-serif;
    }

    .hidden {
      display: none !important;
    }

    /* 悬浮小图标 (品牌 Logo 视觉重构) */
    .ios-float-icon {
      position: fixed;
      pointer-events: auto;
      width: 32px;
      height: 32px;
      padding: 0;
      border: none;
      border-radius: 9px;
      background: transparent;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.16);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.15s ease, box-shadow 0.2s ease;
      transform: scale(0.9);
      opacity: 0;
      z-index: 10000;
      overflow: hidden;
      user-select: none;
    }
    
    .ios-float-icon.show {
      transform: scale(1);
      opacity: 1;
    }

    .ios-float-icon:hover {
      transform: scale(1.12);
      box-shadow: 0 6px 18px rgba(0, 0, 0, 0.26);
    }

    .ios-float-icon:active {
      transform: scale(0.94);
    }

    .ios-float-icon img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
      border-radius: 9px;
      pointer-events: none;
    }

    /* 翻译面板 - iOS 26 毛玻璃卡片 */
    .ios-panel {
      position: fixed;
      pointer-events: auto;
      width: 360px;
      min-height: 160px;
      border-radius: 20px;
      border: 1px solid rgba(255, 255, 255, 0.4);
      background: rgba(255, 255, 255, 0.75);
      backdrop-filter: blur(20px) saturate(190%);
      -webkit-backdrop-filter: blur(20px) saturate(190%);
      box-shadow: 0 16px 40px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0, 0, 0, 0.04), inset 0 0 0 1px rgba(255, 255, 255, 0.2);
      overflow: hidden;
      display: flex;
      flex-direction: column;
      font-size: 14px;
      color: #1c1c1e;
      z-index: 10001;
      opacity: 0;
      transform: scale(0.95) translateY(10px);
      transition: opacity 0.25s cubic-bezier(0.16, 1, 0.3, 1), transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);
    }

    .ios-panel.show {
      opacity: 1;
      transform: scale(1) translateY(0);
    }

    /* 左右拉伸手柄 */
    .panel-resize-handle {
      position: absolute;
      top: 0;
      bottom: 0;
      width: 10px;
      cursor: ew-resize;
      z-index: 100;
    }

    .resize-handle-left {
      left: 0;
    }

    .resize-handle-right {
      right: 0;
    }

    .panel-resize-handle:hover,
    .panel-resize-handle.active {
      background: rgba(0, 122, 255, 0.15);
    }

    /* 面板头部 */
    .panel-header {
      padding: 12px 16px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 1px solid rgba(0, 0, 0, 0.06);
      cursor: move;
      user-select: none;
    }

    .panel-logo {
      display: flex;
      align-items: center;
      gap: 6px;
      font-weight: 600;
      font-size: 13px;
      letter-spacing: -0.2px;
      color: #3a3a3c;
    }

    .panel-logo svg {
      width: 14px;
      height: 14px;
      stroke: currentColor;
      stroke-width: 2.5;
    }

    .panel-actions {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    /* 精美 iOS 下拉选择器 */
    .panel-select {
      background: rgba(0, 0, 0, 0.05);
      border: none;
      outline: none;
      font-size: 12px;
      font-weight: 500;
      padding: 4px 8px;
      border-radius: 8px;
      color: #3a3a3c;
      cursor: pointer;
      max-width: 110px;
      transition: background 0.15s ease;
    }

    .panel-select:hover {
      background: rgba(0, 0, 0, 0.08);
    }

    .panel-close {
      width: 20px;
      height: 20px;
      border-radius: 50%;
      background: rgba(0, 0, 0, 0.06);
      border: none;
      color: #8e8e93;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      font-size: 11px;
      font-weight: bold;
      transition: background 0.15s ease, color 0.15s ease;
    }

    .panel-close:hover {
      background: rgba(0, 0, 0, 0.12);
      color: #3a3a3c;
    }

    .panel-icon-btn {
      width: 22px;
      height: 22px;
      border-radius: 6px;
      background: rgba(0, 0, 0, 0.05);
      border: none;
      color: #8e8e93;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: all 0.15s ease;
      padding: 0;
    }

    .panel-icon-btn:hover {
      background: rgba(0, 0, 0, 0.1);
      color: #1c1c1e;
    }

    .panel-icon-btn.active {
      background: rgba(0, 122, 255, 0.15);
      color: #007AFF;
    }

    .panel-icon-btn.starred {
      background: rgba(255, 149, 0, 0.15);
      color: #ff9500;
    }

    .panel-toolbar-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .panel-btn-group {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    /* 面板内容 */
    .panel-body {
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .panel-source-text {
      color: #8e8e93;
      font-size: 13px;
      line-height: 1.5;
      max-height: 80px;
      overflow-y: auto;
      word-break: break-word;
    }

    .panel-divider {
      height: 1px;
      background: rgba(0, 0, 0, 0.06);
      margin: 2px 0;
    }

    .panel-result-wrapper {
      position: relative;
      min-height: 48px;
    }

    .panel-result {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Times New Roman", "Cambria Math", sans-serif;
      font-size: 14.5px;
      line-height: 1.5;
      font-weight: 400;
      color: #1c1c1e;
      word-break: break-word;
      white-space: pre-wrap;
    }

    .panel-result.error {
      color: #ff3b30;
      font-size: 13px;
    }

    .panel-loader {
      display: inline-block;
      width: 18px;
      height: 18px;
      border: 2px solid rgba(0, 122, 255, 0.15);
      border-radius: 50%;
      border-top-color: #007AFF;
      animation: spin 0.8s linear infinite;
      position: absolute;
      top: 50%;
      left: 50%;
      margin-top: -9px;
      margin-left: -9px;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    /* PDF 链接询问模态弹窗 */
    .ios-modal {
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 200000;
    }

    .modal-overlay {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.15);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      animation: fadeIn 0.25s ease-out;
    }

    .modal-box {
      position: relative;
      width: 320px;
      border-radius: 20px;
      border: 1px solid rgba(255, 255, 255, 0.4);
      background: rgba(255, 255, 255, 0.85);
      backdrop-filter: blur(25px);
      -webkit-backdrop-filter: blur(25px);
      box-shadow: 0 20px 50px rgba(0, 0, 0, 0.15);
      padding: 24px;
      text-align: center;
      display: flex;
      flex-direction: column;
      gap: 12px;
      transform: scale(0.95);
      animation: modalPop 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
      color: #1c1c1e;
    }

    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    @keyframes modalPop {
      to { transform: scale(1); }
    }

    .modal-box h3 {
      margin: 0;
      font-size: 17px;
      font-weight: 600;
      letter-spacing: -0.2px;
    }

    .modal-desc {
      font-size: 13px;
      color: #8e8e93;
      margin: 0;
      line-height: 1.4;
    }

    .modal-file-info {
      font-size: 12px;
      font-family: monospace;
      background: rgba(0, 0, 0, 0.05);
      padding: 6px 10px;
      border-radius: 8px;
      word-break: break-all;
      color: #555;
    }

    .modal-actions {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-top: 8px;
    }

    .modal-btn {
      border: none;
      outline: none;
      padding: 12px;
      border-radius: 12px;
      font-size: 14.5px;
      font-weight: 500;
      cursor: pointer;
      transition: background 0.15s ease, transform 0.1s ease;
      background: rgba(0, 0, 0, 0.05);
      color: #1c1c1e;
    }

    .modal-btn:hover {
      background: rgba(0, 0, 0, 0.08);
    }

    .modal-btn:active {
      transform: scale(0.98);
    }

    .modal-btn.primary {
      background: linear-gradient(135deg, #0A84FF, #5E5CE6);
      color: white;
      font-weight: 600;
    }

    .modal-btn.primary:hover {
      opacity: 0.95;
    }
  `;
  shadowRoot.appendChild(style);

  // 3. 构建 DOM 骨架 (引入已处理的高清品牌 Logo)
  const brandLogoUrl = (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL)
    ? chrome.runtime.getURL('icons/logo.png')
    : '/icons/logo.png';

  const container = document.createElement('div');
  container.className = 'ios-translate-root';
  container.innerHTML = `
    <button id="float-icon" class="ios-float-icon hidden" title="Translate FY 划词翻译">
      <img src="${brandLogoUrl}" alt="Translate FY" draggable="false" />
    </button>

    <div id="translate-panel" class="ios-panel hidden">
      <!-- 左右拉伸调整手柄 -->
      <div class="panel-resize-handle resize-handle-left" title="左右拖动调整宽度"></div>
      <div class="panel-resize-handle resize-handle-right" title="左右拖动调整宽度"></div>
      <div class="panel-header" id="panel-drag-handle">
        <div class="panel-logo">
          <img src="${brandLogoUrl}" width="16" height="16" alt="logo" style="border-radius:4px; display:block;" />
          <span>翻译</span>
        </div>
        <div class="panel-actions">
          <select id="panel-engine-select" class="panel-select">
            <option value="google">Google</option>
          </select>
          <select id="panel-model-select" class="panel-select hidden"></select>
          <button id="panel-pin-btn" class="panel-icon-btn" title="固定浮窗">
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="17" x2="12" y2="22"></line><path d="M5 17h14v-2l-2-2V5a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v8l-2 2v2z"></path></svg>
          </button>
          <button id="panel-close-btn" class="panel-close" title="关闭">✕</button>
        </div>
      </div>
      <div class="panel-body">
        <div class="panel-toolbar-row">
          <span style="font-size:11.5px; color:#8e8e93; font-weight:500;">原文</span>
          <button id="panel-speak-src-btn" class="panel-icon-btn" title="朗读原文">
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>
          </button>
        </div>
        <div class="panel-source-text" id="panel-source-text">...</div>
        <div class="panel-divider"></div>
        <div class="panel-toolbar-row">
          <span style="font-size:11.5px; color:#8e8e93; font-weight:500;">译文</span>
          <div class="panel-btn-group">
            <button id="panel-bilingual-btn" class="panel-icon-btn active" title="专有名词双语备注：开启中（点击切换）" style="font-size:10.5px; font-weight:600; width:auto; min-width:22px; padding:0 4px;">双语</button>
            <button id="panel-speak-res-btn" class="panel-icon-btn" title="朗读译文">
              <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>
            </button>
            <button id="panel-copy-res-btn" class="panel-icon-btn" title="复制译文">
              <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
            </button>
            <button id="panel-star-btn" class="panel-icon-btn" title="收藏到生词本">
              <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
            </button>
          </div>
        </div>
        <div class="panel-result-wrapper">
          <div id="panel-result-text" class="panel-result">...</div>
          <div id="panel-loader" class="panel-loader hidden"></div>
        </div>
      </div>
    </div>

    <div id="pdf-modal" class="ios-modal hidden">
      <div class="modal-overlay" id="pdf-modal-overlay"></div>
      <div class="modal-box">
        <h3>打开 PDF 文件</h3>
        <p class="modal-file-info" id="pdf-link-display">file.pdf</p>
        <p class="modal-desc">检测到 PDF 文档，您希望如何打开它？</p>
        <div class="modal-actions">
          <button id="pdf-opt-extension" class="modal-btn primary">用扩展翻译阅读</button>
          <button id="pdf-opt-native" class="modal-btn">浏览器原生打开</button>
          <button id="pdf-opt-download" class="modal-btn">下载文件</button>
        </div>
      </div>
    </div>
  `;
  shadowRoot.appendChild(container);

  // 获取 DOM 引用
  const floatIcon = shadowRoot.getElementById('float-icon');
  const translatePanel = shadowRoot.getElementById('translate-panel');
  const panelEngineSelect = shadowRoot.getElementById('panel-engine-select');
  const panelModelSelect = shadowRoot.getElementById('panel-model-select');
  const panelSourceText = shadowRoot.getElementById('panel-source-text');
  const panelResultText = shadowRoot.getElementById('panel-result-text');
  const panelLoader = shadowRoot.getElementById('panel-loader');
  const panelCloseBtn = shadowRoot.getElementById('panel-close-btn');
  const panelPinBtn = shadowRoot.getElementById('panel-pin-btn');
  const speakSrcBtn = shadowRoot.getElementById('panel-speak-src-btn');
  const speakResBtn = shadowRoot.getElementById('panel-speak-res-btn');
  const copyResBtn = shadowRoot.getElementById('panel-copy-res-btn');
  const panelStarBtn = shadowRoot.getElementById('panel-star-btn');
  const panelBilingualBtn = shadowRoot.getElementById('panel-bilingual-btn');
  const dragHandle = shadowRoot.getElementById('panel-drag-handle');

  const pdfModal = shadowRoot.getElementById('pdf-modal');
  const pdfLinkDisplay = shadowRoot.getElementById('pdf-link-display');
  const pdfOptExtension = shadowRoot.getElementById('pdf-opt-extension');
  const pdfOptNative = shadowRoot.getElementById('pdf-opt-native');
  const pdfOptDownload = shadowRoot.getElementById('pdf-opt-download');
  const pdfModalOverlay = shadowRoot.getElementById('pdf-modal-overlay');

  let currentSelectedText = '';
  let activePdfLink = '';
  let isDragging = false;
  let isPinned = false;
  let currentStreamPort = null;
  let dragOffset = { x: 0, y: 0 };

  // 浮窗左右拉伸逻辑
  const handleLeft = shadowRoot.querySelector('.resize-handle-left');
  const handleRight = shadowRoot.querySelector('.resize-handle-right');

  // 从 storage 读取并恢复用户偏好的浮窗宽度
  chrome.storage.local.get({ contentPanelWidth: 360 }, (res) => {
    if (res.contentPanelWidth && res.contentPanelWidth >= 280) {
      translatePanel.style.width = `${res.contentPanelWidth}px`;
    }
  });

  function initResize(e, direction) {
    e.preventDefault();
    e.stopPropagation();

    const startX = e.clientX;
    const startWidth = translatePanel.offsetWidth;
    const startLeft = translatePanel.getBoundingClientRect().left;

    document.body.style.cursor = 'ew-resize';
    document.body.style.userSelect = 'none';
    if (direction === 'left' && handleLeft) handleLeft.classList.add('active');
    if (direction === 'right' && handleRight) handleRight.classList.add('active');

    function onMouseMove(moveEvent) {
      const deltaX = moveEvent.clientX - startX;

      if (direction === 'right') {
        const maxW = Math.max(280, window.innerWidth - startLeft - 20);
        const newWidth = Math.max(280, Math.min(maxW, startWidth + deltaX));
        translatePanel.style.width = `${newWidth}px`;
      } else if (direction === 'left') {
        const newWidth = Math.max(280, startWidth - deltaX);
        const newLeft = startLeft + (startWidth - newWidth);
        if (newLeft >= 10) {
          translatePanel.style.width = `${newWidth}px`;
          translatePanel.style.left = `${newLeft}px`;
        }
      }
    }

    function onMouseUp() {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      if (handleLeft) handleLeft.classList.remove('active');
      if (handleRight) handleRight.classList.remove('active');

      const finalWidth = translatePanel.offsetWidth;
      chrome.storage.local.set({ contentPanelWidth: finalWidth });
    }

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }

  if (handleLeft) handleLeft.addEventListener('mousedown', (e) => initResize(e, 'left'));
  if (handleRight) handleRight.addEventListener('mousedown', (e) => initResize(e, 'right'));

  // 网页文本语义段落重构与断行清洗函数
  function reconstructParagraphs(rawText) {
    if (!rawText || typeof rawText !== 'string') return '';
    let text = rawText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const rawParagraphs = text.split(/\n\s*\n+/);
    const cleanParagraphs = rawParagraphs.map(paragraph => {
      const rawLines = paragraph.split('\n').map(l => l.trim()).filter(Boolean);
      if (rawLines.length === 0) return '';
      if (rawLines.length === 1) return rawLines[0];

      let merged = rawLines[0];
      for (let i = 1; i < rawLines.length; i++) {
        const prevLine = rawLines[i - 1];
        const currLine = rawLines[i];
        const isListItem = /^([-*•·]|(?:\d+|[a-zA-Z])[\.)])\s+/.test(currLine);
        if (isListItem) {
          merged += '\n' + currLine;
          continue;
        }
        if (/([a-zA-Z]+)-$/.test(prevLine) && /^[a-zA-Z]/.test(currLine)) {
          merged = merged.slice(0, -1) + currLine;
          continue;
        }
        const prevEndsCJK = /[\u4e00-\u9fa5\u3040-\u30ff\uac00-\ud7af]$/.test(merged);
        const currStartsCJK = /^[\u4e00-\u9fa5\u3040-\u30ff\uac00-\ud7af]/.test(currLine);
        if (prevEndsCJK && currStartsCJK) {
          merged += currLine;
        } else {
          merged += ' ' + currLine;
        }
      }
      return merged;
    });
    return cleanParagraphs.filter(Boolean).join('\n\n');
  }

  // AI 模型内置字典 (智谱 GLM 4/4.5/4.7 Flash 官方模型永久免费)
  const AI_MODELS = {
    glm: [
      'glm-4-flash',
      'glm-4.5-flash',
      'glm-4.7-flash',
      'glm-4-flashx'
    ]
  };

  // 4. 动态加载可用引擎列表
  function loadAvailableEngines(callback) {
    chrome.storage.local.get({
      glmApiKey: '',
      glmModels: null,
      deeplApiKey: '',
      youdaoAppKey: '',
      youdaoAppSecret: '',
      customModels: []
    }, (result) => {
      // 动态载入用户在设置中启用的模型列表
      if (Array.isArray(result.glmModels) && result.glmModels.length > 0) AI_MODELS.glm = result.glmModels;

      const currentVal = panelEngineSelect.value;
      panelEngineSelect.innerHTML = '';

      const available = [
        { value: 'google', label: 'Google' },
        { value: 'bing', label: 'Bing' }
      ];

      if ((result.deeplApiKey && result.deeplApiKey.trim()) || (result.deeplEndpoint && result.deeplEndpoint.trim())) {
        available.push({ value: 'deepl', label: 'DeepL' });
      }
      if (result.glmApiKey && result.glmApiKey.trim()) {
        available.push({ value: 'glm', label: '智谱GLM' });
      }
      if (result.youdaoAppKey && result.youdaoAppSecret && result.youdaoAppKey.trim() && result.youdaoAppSecret.trim()) {
        available.push({ value: 'youdao', label: '有道' });
      }

      result.customModels.forEach(m => {
        if ((m.apiKey && m.apiKey.trim()) || (m.endpoint && m.endpoint.trim())) {
          available.push({ value: `custom_${m.id}`, label: m.name });
        }
      });

      available.forEach(item => {
        const opt = document.createElement('option');
        opt.value = item.value;
        opt.textContent = item.label;
        panelEngineSelect.appendChild(opt);
      });

      const availableValues = available.map(a => a.value);
      if (availableValues.includes(currentVal)) {
        panelEngineSelect.value = currentVal;
      } else {
        panelEngineSelect.value = 'google';
      }

      if (callback) callback();
    });
  }

  loadAvailableEngines();

  // 监听 storage 变更，及时更新可用引擎及双语按钮状态
  chrome.storage.onChanged.addListener((changes) => {
    loadAvailableEngines();
    if (changes.enableBilingualNotation && panelBilingualBtn) {
      const isBilingual = changes.enableBilingualNotation.newValue !== false;
      panelBilingualBtn.classList.toggle('active', isBilingual);
      panelBilingualBtn.title = isBilingual ? '专有名词双语备注：开启中（点击切换）' : '专有名词双语备注：已关闭（点击切换）';
    }
  });

  // 读取偏好设置 (带异常容错降级)
  function getSettings(callback) {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.get({
          enableSelectionTranslate: true,
          autoShowPanel: false,
          defaultTargetLang: 'zh-CN',
          defaultEngine: 'google',
          triggerMode: 'direct',
          translationPersona: 'biochem',
          enableBilingualNotation: true
        }, (res) => {
          if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.lastError) {
            callback({
              enableSelectionTranslate: true,
              autoShowPanel: false,
              defaultTargetLang: 'zh-CN',
              defaultEngine: 'google',
              triggerMode: 'direct',
              translationPersona: 'biochem',
              enableBilingualNotation: true
            });
          } else {
            callback(res || {
              enableSelectionTranslate: true,
              autoShowPanel: false,
              defaultTargetLang: 'zh-CN',
              defaultEngine: 'google',
              triggerMode: 'direct',
              translationPersona: 'biochem',
              enableBilingualNotation: true
            });
          }
        });
        return;
      }
    } catch (e) {}
    callback({
      enableSelectionTranslate: true,
      autoShowPanel: false,
      defaultTargetLang: 'zh-CN',
      defaultEngine: 'google',
      triggerMode: 'direct',
      translationPersona: 'biochem',
      enableBilingualNotation: true
    });
  }

  // 5. 网页划词事件监听
  const handleMouseUp = (e) => {
    const isClickedInsideHost = e.target === host || (e.composedPath && e.composedPath().includes(host)) || host.contains(e.target);
    if (isClickedInsideHost) return;

    // 输入框、文本域与富文本编辑器防误触抑制
    const isEditable = e.target && (
      e.target.tagName === 'INPUT' ||
      e.target.tagName === 'TEXTAREA' ||
      e.target.isContentEditable ||
      (e.target.closest && e.target.closest('input, textarea, [contenteditable="true"], [role="textbox"], .monaco-editor'))
    );
    if (isEditable) return;

    setTimeout(() => {
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) return;
      const rawText = selection.toString().trim();

      if (!rawText || rawText.length < 1 || rawText.length > 2000) {
        if (!translatePanel.classList.contains('show')) {
          hideIcon();
        }
        return;
      }

      const text = reconstructParagraphs(rawText);
      currentSelectedText = text;

      getSettings((settings) => {
        if (!settings.enableSelectionTranslate) return;

        // 快捷键触发控制 (直接 / Alt+划词 / Ctrl+划词)
        if (settings.triggerMode === 'alt' && !e.altKey) return;
        if (settings.triggerMode === 'ctrl' && !(e.ctrlKey || e.metaKey)) return;

        if (!selection || selection.rangeCount === 0) return;
        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) return;

        // 由于 host、floatIcon、translatePanel 均为 fixed 定位，直接使用视口客户区坐标
        const posX = rect.right + 6;
        const posY = rect.bottom + 6;

        if (settings.autoShowPanel) {
          showPanel(posX, posY, text, settings.defaultEngine, settings.defaultTargetLang);
        } else {
          showIcon(posX, posY);
        }
      });
    }, 20);
  };
  document.addEventListener('mouseup', handleMouseUp);

  // 点击其它区域隐藏翻译组件
  const handleMouseDown = (e) => {
    const isClickedInsideHost = e.target === host || (e.composedPath && e.composedPath().includes(host)) || host.contains(e.target);
    if (isClickedInsideHost) return;

    if (!floatIcon.classList.contains('hidden')) {
      hideIcon();
    }
    if (!isPinned && translatePanel.classList.contains('show')) {
      hidePanel();
    }
  };
  document.addEventListener('mousedown', handleMouseDown);

  function showIcon(x, y) {
    const safeX = Math.max(10, Math.min(x, window.innerWidth - 44));
    const safeY = Math.max(10, Math.min(y, window.innerHeight - 44));

    floatIcon.style.left = `${safeX}px`;
    floatIcon.style.top = `${safeY}px`;
    floatIcon.classList.remove('hidden');
    floatIcon.getBoundingClientRect();
    floatIcon.classList.add('show');
  }

  function hideIcon() {
    floatIcon.classList.remove('show');
    setTimeout(() => {
      if (!floatIcon.classList.contains('show')) {
        floatIcon.classList.add('hidden');
      }
    }, 150);
  }

  function showPanel(x, y, text, engine, targetLang) {
    hideIcon();
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    
    const panelWidth = translatePanel.offsetWidth || 360;
    const panelHeight = translatePanel.offsetHeight || 220;
    const safeX = Math.max(10, Math.min(x, window.innerWidth - panelWidth - 16));
    const safeY = Math.max(10, Math.min(y, window.innerHeight - panelHeight - 16));

    translatePanel.style.left = `${safeX}px`;
    translatePanel.style.top = `${safeY}px`;
    
    panelSourceText.textContent = text;
    
    loadAvailableEngines(() => {
      const availableValues = Array.from(panelEngineSelect.options).map(o => o.value);
      const chosenEngine = availableValues.includes(engine) ? engine : (availableValues[0] || 'google');
      panelEngineSelect.value = chosenEngine;
      
      // 更新模型二级选择器状态
      updateModelSelect(chosenEngine, () => {
        const activeModel = panelModelSelect.value;
        translatePanel.classList.remove('hidden');
        translatePanel.getBoundingClientRect();
        translatePanel.classList.add('show');
        getSettings((settings) => {
          if (panelBilingualBtn) {
            const isBilingual = settings.enableBilingualNotation !== false;
            panelBilingualBtn.classList.toggle('active', isBilingual);
            panelBilingualBtn.title = isBilingual ? '专有名词双语备注：开启中（点击切换）' : '专有名词双语备注：已关闭（点击切换）';
          }
          doTranslation(text, chosenEngine, targetLang, activeModel);
        });
      });
    });
  }

  function hidePanel() {
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    if (currentStreamPort) {
      try { currentStreamPort.disconnect(); } catch (e) {}
      currentStreamPort = null;
    }
    translatePanel.classList.remove('show');
    setTimeout(() => {
      if (!translatePanel.classList.contains('show')) {
        translatePanel.classList.add('hidden');
      }
    }, 250);
  }

  // 更新模型二级下拉选择器
  function updateModelSelect(engine, callback) {
    panelModelSelect.innerHTML = '';
    
    if (AI_MODELS[engine]) {
      let models = AI_MODELS[engine];
      // 划词翻译下拉框中：GLM 仅显示免费模型 (flash 免费系列)
      if (engine === 'glm') {
        const freeModels = models.filter(m => m.toLowerCase().includes('flash'));
        models = freeModels.length > 0 ? freeModels : ['glm-4-flash', 'glm-4.5-flash', 'glm-4.7-flash', 'glm-4-flashx'];
      }

      models.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m;
        opt.textContent = m;
        panelModelSelect.appendChild(opt);
      });
      
      // 读取该引擎的已选模型版本
      const storageKey = `${engine}ActiveModel`;
      chrome.storage.local.get([storageKey], (res) => {
        if (res[storageKey] && models.includes(res[storageKey])) {
          panelModelSelect.value = res[storageKey];
        } else if (models.length > 0) {
          panelModelSelect.value = models[0];
        }
        panelModelSelect.classList.remove('hidden');
        if (callback) callback();
      });
    } else {
      panelModelSelect.classList.add('hidden');
      if (callback) callback();
    }
  }

  // 本地生词本与历史持久化存储
  function saveVocabularyRecord(word, translation, engine, isStarred = false) {
    if (!word || !translation) return;
    chrome.storage.local.get({ vocabularyHistory: [] }, (res) => {
      let list = Array.isArray(res.vocabularyHistory) ? res.vocabularyHistory : [];
      const cleanWord = word.trim();
      const existingIndex = list.findIndex(item => item.word.toLowerCase() === cleanWord.toLowerCase());
      if (existingIndex >= 0) {
        list[existingIndex].translation = translation.trim();
        list[existingIndex].engine = engine;
        list[existingIndex].timestamp = Date.now();
        if (isStarred !== undefined) list[existingIndex].starred = isStarred;
      } else {
        list.unshift({
          id: Date.now() + '_' + Math.random().toString(36).substr(2, 5),
          word: cleanWord,
          translation: translation.trim(),
          engine: engine,
          timestamp: Date.now(),
          starred: !!isStarred,
          url: window.location.href
        });
        if (list.length > 2000) {
          const starred = list.filter(item => item.starred);
          const unstarred = list.filter(item => !item.starred);
          list = [...starred, ...unstarred.slice(0, 2000 - starred.length)];
        }
      }
      chrome.storage.local.set({ vocabularyHistory: list });
    });
  }

  // 发起翻译请求 (支持长连接 SSE 逐字打字机流式输出)
  function doTranslation(text, engine, targetLang, modelName) {
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    if (panelStarBtn) {
      panelStarBtn.classList.remove('active', 'starred');
      panelStarBtn.style.color = '';
    }

    // 若上一个流式请求尚未结束，立刻切断中断信号，防止 Token 泄露
    if (currentStreamPort) {
      try { currentStreamPort.disconnect(); } catch (e) {}
      currentStreamPort = null;
    }

    panelLoader.classList.remove('hidden');
    panelResultText.classList.add('hidden');
    panelResultText.classList.remove('error');
    panelResultText.textContent = '';

    let streamedText = '';

    getSettings((settings) => {
      const activePersona = settings.translationPersona || 'biochem';
      const enableBilingual = settings.enableBilingualNotation !== false;
      try {
        currentStreamPort = chrome.runtime.connect({ name: 'translate-stream' });
        currentStreamPort.postMessage({
          text: text,
          engine: engine,
          targetLang: targetLang,
          model: modelName,
          persona: activePersona,
          enableBilingualNotation: enableBilingual
        });

        currentStreamPort.onMessage.addListener((msg) => {
          if (msg.type === 'start') {
            panelLoader.classList.add('hidden');
            panelResultText.classList.remove('hidden');
            panelResultText.textContent = '';
          } else if (msg.type === 'chunk') {
            panelLoader.classList.add('hidden');
            panelResultText.classList.remove('hidden');
            streamedText += msg.delta;
            panelResultText.textContent = streamedText;
          } else if (msg.type === 'done') {
            panelLoader.classList.add('hidden');
            panelResultText.classList.remove('hidden');
            const finalText = msg.fullText || streamedText;
            panelResultText.textContent = finalText;
            saveVocabularyRecord(text, finalText, engine, false);
            if (currentStreamPort) {
              try { currentStreamPort.disconnect(); } catch (e) {}
              currentStreamPort = null;
            }
          } else if (msg.type === 'error') {
            panelLoader.classList.add('hidden');
            panelResultText.classList.remove('hidden');
            panelResultText.textContent = `出错: ${msg.error}`;
            panelResultText.classList.add('error');
            if (currentStreamPort) {
              try { currentStreamPort.disconnect(); } catch (e) {}
              currentStreamPort = null;
            }
          }
        });

        currentStreamPort.onDisconnect.addListener(() => {
          currentStreamPort = null;
        });
      } catch (err) {
        // 兼容环境异常降级回退
        chrome.runtime.sendMessage({
          action: 'translate',
          text: text,
          engine: engine,
          targetLang: targetLang,
          model: modelName,
          persona: activePersona,
          enableBilingualNotation: enableBilingual
        }, (response) => {
          panelLoader.classList.add('hidden');
          panelResultText.classList.remove('hidden');

          if (!response) {
            panelResultText.textContent = '翻译超时或服务未响应';
            panelResultText.classList.add('error');
            return;
          }

          if (response.success) {
            panelResultText.textContent = response.translation;
            panelResultText.classList.remove('error');
            saveVocabularyRecord(text, response.translation, engine, false);
          } else {
            panelResultText.textContent = `出错: ${response.error}`;
            panelResultText.classList.add('error');
          }
        });
      }
    });
  }

  // 点击悬浮图标触发翻译
  floatIcon.addEventListener('click', (e) => {
    e.stopPropagation();
    const rect = floatIcon.getBoundingClientRect();
    const x = rect.left;
    const y = rect.bottom + 6;
    getSettings((settings) => {
      showPanel(x, y, currentSelectedText, settings.defaultEngine, settings.defaultTargetLang);
    });
  });

  // 面板关闭按钮
  panelCloseBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    hidePanel();
  });

  // 浮窗常驻固定
  panelPinBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    isPinned = !isPinned;
    panelPinBtn.classList.toggle('active', isPinned);
    panelPinBtn.title = isPinned ? '取消固定' : '固定浮窗';
  });

  // 专有名词双语对照开关
  if (panelBilingualBtn) {
    panelBilingualBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      getSettings((settings) => {
        const nextVal = !(settings.enableBilingualNotation !== false);
        chrome.storage.local.set({ enableBilingualNotation: nextVal }, () => {
          panelBilingualBtn.classList.toggle('active', nextVal);
          panelBilingualBtn.title = nextVal ? '专有名词双语备注：开启中（点击切换）' : '专有名词双语备注：已关闭（点击切换）';
          if (currentSelectedText && !translatePanel.classList.contains('hidden')) {
            const activeModel = panelModelSelect ? panelModelSelect.value : '';
            doTranslation(currentSelectedText, panelEngineSelect.value, settings.defaultTargetLang || 'zh-CN', activeModel);
          }
        });
      });
    });
  }

  // TTS 语音朗读
  function speakText(text) {
    if (!text || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = /[一-龥]/.test(text) ? 'zh-CN' : 'en-US';
    window.speechSynthesis.speak(utterance);
  }

  speakSrcBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    speakText(panelSourceText.textContent);
  });

  speakResBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    speakText(panelResultText.textContent);
  });

  // 复制译文
  copyResBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const text = panelResultText.textContent;
    if (text && !panelResultText.classList.contains('error')) {
      navigator.clipboard.writeText(text).then(() => {
        copyResBtn.style.color = '#34c759';
        setTimeout(() => {
          copyResBtn.style.color = '';
        }, 1500);
      });
    }
  });

  // 收藏到生词本
  if (panelStarBtn) {
    panelStarBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const word = currentSelectedText;
      const trans = panelResultText.textContent;
      if (!word || !trans || panelResultText.classList.contains('error')) return;

      const isStarred = panelStarBtn.classList.toggle('starred');
      panelStarBtn.style.color = isStarred ? '#ff9500' : '';
      saveVocabularyRecord(word, trans, panelEngineSelect.value, isStarred);
    });
  }

  // 面板内切换引擎
  panelEngineSelect.addEventListener('change', () => {
    const engine = panelEngineSelect.value;
    updateModelSelect(engine, () => {
      getSettings((settings) => {
        doTranslation(currentSelectedText, engine, settings.defaultTargetLang, panelModelSelect.value);
      });
    });
  });

  // 面板内切换模型
  panelModelSelect.addEventListener('change', () => {
    const engine = panelEngineSelect.value;
    const model = panelModelSelect.value;
    
    // 保存当前选中的模型为该引擎的活跃模型
    const storageKey = `${engine}ActiveModel`;
    chrome.storage.local.set({ [storageKey]: model });

    getSettings((settings) => {
      doTranslation(currentSelectedText, engine, settings.defaultTargetLang, model);
    });
  });

  // 右键菜单唤起监听
  const messageListener = (message, sender, sendResponse) => {
    if (message.action === 'showSelectionTranslatePopup') {
      currentSelectedText = message.text;
      const x = Math.max(20, Math.round((window.innerWidth - 360) / 2));
      const y = Math.max(40, Math.round(window.innerHeight / 4));
      getSettings((settings) => {
        showPanel(x, y, message.text, settings.defaultEngine, settings.defaultTargetLang);
      });
      sendResponse({ status: 'ok' });
    }
  };
  chrome.runtime.onMessage.addListener(messageListener);

  // 面板拖拽逻辑
  dragHandle.addEventListener('mousedown', (e) => {
    if (e.target.closest('.panel-actions')) return;
    
    isDragging = true;
    const rect = translatePanel.getBoundingClientRect();
    dragOffset.x = e.clientX - rect.left;
    dragOffset.y = e.clientY - rect.top;
    
    document.body.style.cursor = 'move';
    e.preventDefault();
  });

  const handleMouseMove = (e) => {
    if (!isDragging) return;
    const panelWidth = translatePanel.offsetWidth || 360;
    const panelHeight = translatePanel.offsetHeight || 220;
    const posX = Math.max(5, Math.min(window.innerWidth - panelWidth - 5, e.clientX - dragOffset.x));
    const posY = Math.max(5, Math.min(window.innerHeight - panelHeight - 5, e.clientY - dragOffset.y));
    
    translatePanel.style.left = `${posX}px`;
    translatePanel.style.top = `${posY}px`;
  };
  document.addEventListener('mousemove', handleMouseMove);

  const handleDragMouseUp = () => {
    if (isDragging) {
      isDragging = false;
      document.body.style.cursor = '';
    }
  };
  document.addEventListener('mouseup', handleDragMouseUp);

  // 实例清理钩子 (支持插件热重载与无刷新重注)
  window.__iosTranslateCleanup = () => {
    try { host.remove(); } catch (e) {}
    document.removeEventListener('mouseup', handleMouseUp);
    document.removeEventListener('mousedown', handleMouseDown);
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleDragMouseUp);
    try {
      chrome.runtime.onMessage.removeListener(messageListener);
    } catch (e) {}
  };

  // PDF 链接拦截功能
  document.addEventListener('click', (e) => {
    const link = e.target.closest('a');
    if (!link) return;

    const href = link.href;
    if (href) {
      const cleanHref = href.split('?')[0].split('#')[0].toLowerCase();
      if (cleanHref.endsWith('.pdf') || href.toLowerCase().includes('/pdf/')) {
        chrome.storage.local.get({ pdfAction: 'native' }, (result) => {
          if (result.pdfAction === 'ask') {
            e.preventDefault();
            activePdfLink = href;
            pdfLinkDisplay.textContent = decodeURIComponent(cleanHref.substring(cleanHref.lastIndexOf('/') + 1) || 'document.pdf');
            pdfModal.classList.remove('hidden');
          } else if (result.pdfAction === 'extension') {
            e.preventDefault();
            const viewerUrl = chrome.runtime.getURL('pdf_viewer.html') + '?file=' + encodeURIComponent(href);
            window.open(viewerUrl, '_blank');
          }
          // 默认 'native' 模式：不拦截，完全由 Chrome 原生阅读器打开
        });
      }
    }
  });

  // PDF Modal 交互处理
  pdfOptExtension.addEventListener('click', () => {
    const viewerUrl = chrome.runtime.getURL('pdf_viewer.html') + '?file=' + encodeURIComponent(activePdfLink);
    window.open(viewerUrl, '_blank');
    pdfModal.classList.add('hidden');
  });

  pdfOptNative.addEventListener('click', () => {
    window.open(activePdfLink, '_blank');
    pdfModal.classList.add('hidden');
  });

  pdfOptDownload.addEventListener('click', () => {
    const a = document.createElement('a');
    a.href = activePdfLink;
    a.download = activePdfLink.substring(activePdfLink.lastIndexOf('/') + 1);
    a.click();
    pdfModal.classList.add('hidden');
  });

  pdfModalOverlay.addEventListener('click', () => {
    pdfModal.classList.add('hidden');
  });

  // Escape 键快捷关闭浮层
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (!pdfModal.classList.contains('hidden')) {
        pdfModal.classList.add('hidden');
      }
      if (translatePanel.classList.contains('show') && !isPinned) {
        hidePanel();
      }
      if (!floatIcon.classList.contains('hidden')) {
        hideIcon();
      }
    }
  });
})();
