// PDF Viewer Script (pdf_viewer.js v2.0)
import * as pdfjsLib from 'pdfjs-dist';
import { DocStorage, getPdfFingerprint } from './doc_storage.js';

// 1. 设置 Worker
if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('pdf.worker.js');
} else {
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.370/pdf.worker.min.mjs';
}

document.addEventListener('DOMContentLoaded', () => {
  // DOM 元素
  const fileInput = document.getElementById('file-input');
  const pdfTitle = document.getElementById('pdf-title');
  const prevPageBtn = document.getElementById('prev-page');
  const nextPageBtn = document.getElementById('next-page');
  const pageNumInput = document.getElementById('page-num');
  const pageCountSpan = document.getElementById('page-count');
  const zoomInBtn = document.getElementById('zoom-in');
  const zoomOutBtn = document.getElementById('zoom-out');
  const zoomValueSpan = document.getElementById('zoom-value');
  const welcomeScreen = document.getElementById('welcome-screen');
  const viewerContainer = document.getElementById('pdf-viewer-container');
  const viewerContainerTrans = document.getElementById('pdf-viewer-container-trans');
  const loadingOverlay = document.getElementById('loading-overlay');
  const loadingStatus = document.getElementById('loading-status');
  const viewerMain = document.getElementById('viewer-main');
  const pdfPane = document.getElementById('pdf-pane');

  // 对照翻译与工具栏 DOM 元素
  const pdfTranslateEngine = document.getElementById('pdf-translate-engine');
  const pdfTranslateModel = document.getElementById('pdf-translate-model');
  const skipFormulasCheckbox = document.getElementById('skip-formulas');
  const personaSelect = document.getElementById('persona-select');
  const advPersonaSelect = document.getElementById('adv-persona-select');
  const advEditPromptBtn = document.getElementById('adv-edit-prompt-btn');
  const personaPromptModal = document.getElementById('persona-prompt-modal');
  const closePromptModalBtn = document.getElementById('close-prompt-modal-btn');
  const promptModalTitle = document.getElementById('prompt-modal-title');
  const personaPromptTextarea = document.getElementById('persona-prompt-textarea');
  const btnRestorePrompt = document.getElementById('btn-restore-prompt');
  const btnCancelPrompt = document.getElementById('btn-cancel-prompt');
  const btnSavePrompt = document.getElementById('btn-save-prompt');
  const topBackBtn = document.getElementById('top-back-btn');
  let currentPersona = 'biochem'; // 默认角色: 生化学术专家
  const translatePageBtn = document.getElementById('translate-page-btn');
  const translateDocBtn = document.getElementById('translate-doc-btn');
  const summarizeDocBtn = document.getElementById('summarize-doc-btn');
  const paperSummaryModal = document.getElementById('paper-summary-modal') || document.getElementById('paper-summary-drawer');
  const closeSummaryModalBtn = document.getElementById('close-summary-modal-btn') || document.getElementById('close-summary-drawer-btn');
  const copySummaryBtn = document.getElementById('copy-summary-btn');
  const summaryContent = document.getElementById('summary-content');
  const summaryStatusLabel = document.getElementById('summary-status-label');
  const summaryLoadingSpinner = document.getElementById('summary-loading-spinner');
  let currentSummaryPort = null;
  let lastSummaryMarkdown = '';
  const toggleBilingualBtn = document.getElementById('toggle-bilingual-btn');
  const translationPane = document.getElementById('translation-pane');
  const transToolbarActions = document.getElementById('trans-toolbar-actions');
  const transActiveBadge = document.getElementById('trans-active-badge');
  const transProgressCard = document.getElementById('trans-progress-card');
  const transProgressLabel = document.getElementById('trans-progress-label');
  const transProgressFill = document.getElementById('trans-progress-fill');
  const cancelTransBtn = document.getElementById('cancel-trans-btn');
  const copyAllTransBtn = document.getElementById('copy-all-trans-btn');
  const toggleTransPeekBtn = document.getElementById('toggle-trans-peek-btn');
  const exportBilingualBtn = document.getElementById('export-bilingual-btn');
  const scannedPdfAlert = document.getElementById('scanned-pdf-alert');
  const dismissScannedAlert = document.getElementById('dismiss-scanned-alert');
  const viewerWorkspace = document.getElementById('viewer-workspace');

  // 方案 A：沉浸式双语流视图控件
  const viewModeBtn = document.getElementById('view-mode-btn');
  const viewModeLabel = document.getElementById('view-mode-label');
  const viewModeIcon = document.getElementById('view-mode-icon');
  const bilingualReaderFlow = document.getElementById('bilingual-reader-flow');
  let currentViewMode = 'inplace'; // 'inplace' | 'flow'

  // 还原【沉浸式翻译】两层工具栏与缩略图抽屉控件
  const targetLanguageSelect = document.getElementById('target-language-select');
  const toggleSidebarBtn = document.getElementById('toggle-sidebar-btn');
  const viewerSidebar = document.getElementById('viewer-sidebar');
  const sidebarThumbnailsList = document.getElementById('sidebar-thumbnails-list');
  const sidebarPageCount = document.getElementById('sidebar-page-count');
  const controlStyleSelect = document.getElementById('control-style-select');
  const zoomPresetSelect = document.getElementById('zoom-preset-select');
  const searchToolBtn = document.getElementById('search-tool-btn');
  const textToolBtn = document.getElementById('text-tool-btn');
  const drawToolBtn = document.getElementById('draw-tool-btn');
  const penSplitGroup = document.getElementById('pen-split-group');
  const penArrowBtn = document.getElementById('pen-arrow-btn');
  const penColorIndicator = document.getElementById('pen-color-indicator');
  const highlighterSplitGroup = document.getElementById('highlighter-split-group');
  const highlighterToolBtn = document.getElementById('highlighter-tool-btn');
  const highlighterArrowBtn = document.getElementById('highlighter-arrow-btn');
  const highlighterColorIndicator = document.getElementById('highlighter-color-indicator');
  const eraserToolBtn = document.getElementById('eraser-tool-btn');
  const drawActionsGroup = document.getElementById('draw-actions-group');
  const drawUndoBtn = document.getElementById('draw-undo-btn');
  const drawClearBtn = document.getElementById('draw-clear-btn');
  const inkPopover = document.getElementById('ink-popover');
  const inkColorsGrid = document.getElementById('ink-colors-grid');
  const inkPreviewCanvas = document.getElementById('ink-preview-canvas');
  const inkWidthSlider = document.getElementById('ink-width-slider');
  const inkWidthBadge = document.getElementById('ink-width-badge');
  const inkOpacitySection = document.getElementById('ink-opacity-section');
  const inkOpacitySlider = document.getElementById('ink-opacity-slider');
  const inkOpacityBadge = document.getElementById('ink-opacity-badge');

  let currentTool = 'text'; // 'text' | 'pen' | 'highlighter' | 'eraser'
  let isTextMode = true; // 默认开启文本划词选择模式
  let isDrawMode = false; // 批注模式标记 (包含 pen / highlighter / eraser)
  let currentPenColor = '#0078D4'; // Edge 经典蓝
  let currentPenWidth = 3;
  let currentHighlighterColor = '#FFF176'; // Edge 经典荧光黄
  let currentHighlighterWidth = 16;
  let currentHighlighterOpacity = 0.35; // 默认 35% 透明度 (精细控制高光深浅且不遮挡文本)
  let activePopoverTool = null; // 'pen' | 'highlighter' | null

  // Edge 官方经典调色板 (30 色画笔矩阵 + 5 色荧光高亮)
  const PEN_PALETTE = [
    '#000000', '#424242', '#757575', '#9E9E9E', '#E0E0E0', '#FFFFFF',
    '#AD1457', '#D32F2F', '#F57C00', '#FFA000', '#FBC02D', '#FFEB3B',
    '#7CB342', '#388E3C', '#00796B', '#0097A7', '#0078D4', '#1A237E',
    '#7B1FA2', '#4A148C', '#E0BB95', '#A1887F', '#6D4C41', '#3E2723',
    '#F48FB1', '#FFCC80', '#FFF59D', '#A5D6A7', '#81D4FA', '#CE93D8'
  ];

  const HIGHLIGHTER_PALETTE = [
    '#FFF176', // 荧光黄
    '#69F0AE', // 荧光绿
    '#40C4FF', // 荧光蓝
    '#FF80AB', // 荧光粉
    '#FF5252'  // 荧光红
  ];

  const pageDrawings = new Map(); // pageNum -> Array of { tool, color, baseWidth, opacity, points }
  let currentDocId = ''; // 当前文档唯一指纹标识，用于 IndexedDB 本地缓存持久化
  let searchMatchesList = [];
  let currentMatchIdx = -1;
  let activeSearchId = 0; // 检索任务代号：自增即可中止进行中的全文检索
  const pageTextIndexCache = new Map(); // pageNum -> string
  const setupBtn = document.getElementById('setup-btn');
  const hideTopBtn = document.getElementById('hide-top-btn');
  const showTopFloatingBtn = document.getElementById('show-top-floating-btn');
  const viewerHeaderTop = document.getElementById('viewer-header-top');
  const viewerHeaderSub = document.getElementById('viewer-header-sub');
  const welcomeFileInput = document.getElementById('welcome-file-input');
  const advancedTransBtn = document.getElementById('advanced-trans-btn');
  const advancedModal = document.getElementById('advanced-modal');
  const closeAdvancedModalBtn = document.getElementById('close-advanced-modal-btn');
  const advOpacityModeSelect = document.getElementById('adv-opacity-mode-select');
  const advTogglePeekBtn = document.getElementById('adv-toggle-peek-btn');
  const advExportBilingualBtn = document.getElementById('adv-export-bilingual-btn');
  const searchModal = document.getElementById('search-modal');
  const searchInput = document.getElementById('search-input');
  const searchPrevBtn = document.getElementById('search-prev-btn');
  const searchNextBtn = document.getElementById('search-next-btn');
  const searchMatches = document.getElementById('search-matches');
  const closeSearchBtn = document.getElementById('close-search-btn');

  // 沉浸式选页翻译专属 DOM 控件
  const translateRangeBtn = document.getElementById('translate-range-btn');
  const rangeModal = document.getElementById('range-modal');
  const closeRangeModalBtn = document.getElementById('close-range-modal-btn');
  const cancelRangeBtn = document.getElementById('cancel-range-btn');
  const startRangeBtn = document.getElementById('start-range-btn');
  const rangePagesInput = document.getElementById('range-pages-input');
  const rangeCalcStatus = document.getElementById('range-calc-status');

  // 下载与导出中心专属 DOM 控件
  const downloadModal = document.getElementById('download-modal');
  const closeDownloadModalBtn = document.getElementById('close-download-modal-btn');
  const closeDownloadBtn = document.getElementById('close-download-btn');
  const downloadModalTitle = document.getElementById('download-modal-title');
  const downloadModalDesc = document.getElementById('download-modal-desc');
  const btnDownloadHtml = document.getElementById('btn-download-html');
  const btnPrintPdf = document.getElementById('btn-print-pdf');
  const btnDownloadTxt = document.getElementById('btn-download-txt');

  // 显式保存笔记、下拉选项与草稿恢复 DOM 控件
  const saveDocBtn = document.getElementById('save-doc-btn');
  const saveArrowBtn = document.getElementById('save-arrow-btn');
  const saveDropdownMenu = document.getElementById('save-dropdown-menu');
  const menuSaveLocal = document.getElementById('menu-save-local');
  const menuExportPdf = document.getElementById('menu-export-pdf');
  const menuExportBilingual = document.getElementById('menu-export-bilingual');
  const menuExportTxt = document.getElementById('menu-export-txt');
  const drawSaveBtn = document.getElementById('draw-save-btn');
  const unsavedDot = document.getElementById('unsaved-dot');
  const unsavedNotesModal = document.getElementById('unsaved-notes-modal');
  const unsavedModalDesc = document.getElementById('unsaved-modal-desc');
  const closeUnsavedModalBtn = document.getElementById('close-unsaved-modal-btn');
  const btnUnsavedCancel = document.getElementById('btn-unsaved-cancel');
  const btnUnsavedDiscard = document.getElementById('btn-unsaved-discard');
  const btnUnsavedSave = document.getElementById('btn-unsaved-save');

  // 草稿快照横幅控件
  const draftRecoveryBanner = document.getElementById('draft-recovery-banner');
  const draftBannerDesc = document.getElementById('draft-banner-desc');
  const btnDraftDiscard = document.getElementById('btn-draft-discard');
  const btnDraftRestore = document.getElementById('btn-draft-restore');

  // 导出带批注 PDF 范围选择模态框控件
  const exportPdfModal = document.getElementById('export-pdf-modal');
  const closeExportPdfModalBtn = document.getElementById('close-export-pdf-modal-btn');
  const btnExportPdfCancel = document.getElementById('btn-export-pdf-cancel');
  const btnExportPdfConfirm = document.getElementById('btn-export-pdf-confirm');
  const exportPdfCurrentDesc = document.getElementById('export-pdf-current-desc');
  const exportPdfAnnotatedDesc = document.getElementById('export-pdf-annotated-desc');
  const exportPdfAllDesc = document.getElementById('export-pdf-all-desc');
  const exportPdfCustomInput = document.getElementById('export-pdf-custom-input');
  const exportPdfSummary = document.getElementById('export-pdf-summary');
  const labelExportAnnotated = document.getElementById('label-export-annotated');
  const menuExportPdfDesc = document.getElementById('menu-export-pdf-desc');

  // --- PDF 编辑、自动草稿快照与笔记保存状态机 ---
  let hasUnsavedNotes = false;
  let pendingFileToOpen = null;
  let autoDraftTimer = null;
  let autoDraftFirstDirtyTime = 0; // 首次产生未存变动时间戳 (用于 15s MaxWait 强制保底)
  let activeDraftData = null; // 暂存探测到的待恢复草稿
  const AUTO_DRAFT_DEBOUNCE_MS = 4000;
  const AUTO_DRAFT_MAX_WAIT_MS = 15000;

  function markNotesDirty() {
    if (!currentDocId) return;
    hasUnsavedNotes = true;
    updateSaveButtonState();
    scheduleAutoDraft();
  }

  function markNotesSaved() {
    hasUnsavedNotes = false;
    autoDraftFirstDirtyTime = 0;
    if (autoDraftTimer) {
      clearTimeout(autoDraftTimer);
      autoDraftTimer = null;
    }
    updateSaveButtonState();
  }

  // 4 秒空闲防抖 + 15 秒 MaxWait 强制保底静默自动草稿快照 (崩溃恢复与断电容灾)
  function scheduleAutoDraft() {
    if (!currentDocId || !hasUnsavedNotes) return;
    const now = Date.now();
    if (!autoDraftFirstDirtyTime) {
      autoDraftFirstDirtyTime = now;
    }

    if (autoDraftTimer) clearTimeout(autoDraftTimer);

    // 若连续绘制且距首次脏标记已达到 15 秒强制保底阈值，立即执行快照落盘
    if (now - autoDraftFirstDirtyTime >= AUTO_DRAFT_MAX_WAIT_MS) {
      performAutoDraft();
      autoDraftFirstDirtyTime = Date.now();
      return;
    }

    autoDraftTimer = setTimeout(() => {
      performAutoDraft();
      autoDraftFirstDirtyTime = 0;
    }, AUTO_DRAFT_DEBOUNCE_MS);
  }

  async function performAutoDraft() {
    if (!currentDocId || !hasUnsavedNotes) return;
    try {
      await DocStorage.saveDraft(currentDocId, pageDrawings, {
        title: pdfFileName,
        numPages: currentPdf ? currentPdf.numPages : 0
      });
      console.log('[Auto-Draft] 自动草稿快照已静默持久化');
    } catch (e) {
      console.warn('静默草稿快照写入失败:', e);
    }
  }

  function getAnnotatedPages() {
    const list = [];
    if (pageDrawings) {
      pageDrawings.forEach((strokes, p) => {
        if (strokes && strokes.length > 0) list.push(p);
      });
    }
    return list.sort((a, b) => a - b);
  }

  function updateSaveButtonState() {
    if (saveDocBtn) {
      saveDocBtn.disabled = !currentPdf;
      if (hasUnsavedNotes) {
        saveDocBtn.classList.add('is-dirty');
        if (unsavedDot) unsavedDot.classList.remove('hidden');
      } else {
        saveDocBtn.classList.remove('is-dirty');
        if (unsavedDot) unsavedDot.classList.add('hidden');
      }
    }
    if (saveArrowBtn) {
      saveArrowBtn.disabled = !currentPdf;
    }
    if (drawSaveBtn) {
      if (hasUnsavedNotes) {
        drawSaveBtn.classList.add('primary-action');
      } else {
        drawSaveBtn.classList.remove('primary-action');
      }
    }
    if (menuExportPdfDesc && pageDrawings) {
      const count = getAnnotatedPages().length;
      menuExportPdfDesc.textContent = count > 0
        ? `包含手绘笔迹、高光与原文 (当前已批注 ${count} 页)`
        : '包含手绘笔迹、高光与原文，支持自选范围';
    }
  }

  async function saveCurrentNotes() {
    if (!currentDocId) {
      showToast('未打开任何文档，无需保存');
      return;
    }
    try {
      await DocStorage.saveAllDrawings(currentDocId, pageDrawings, {
        title: pdfFileName,
        numPages: currentPdf ? currentPdf.numPages : 0
      });
      // 显式保存成功后，清除临时草稿快照
      await DocStorage.clearDraft(currentDocId);
      markNotesSaved();
      showToast('✅ 笔记与手绘批注已保存至本地数据库');
    } catch (err) {
      console.error('保存笔记失败:', err);
      showToast('❌ 保存笔记失败: ' + err.message);
    }
  }

  // --- 导出带批注 PDF：范围选择与合成引擎 ---
  function openExportPdfModal() {
    if (!exportPdfModal || !currentPdf) return;
    const numPages = currentPdf.numPages;
    const annotatedPages = getAnnotatedPages();

    if (exportPdfCurrentDesc) exportPdfCurrentDesc.textContent = `(第 ${currentPage} 页)`;
    if (exportPdfAllDesc) exportPdfAllDesc.textContent = `(共 ${numPages} 页)`;

    const annotatedRadio = labelExportAnnotated ? labelExportAnnotated.querySelector('input[type="radio"]') : null;
    if (annotatedPages.length > 0) {
      if (exportPdfAnnotatedDesc) {
        const preview = annotatedPages.length > 6 ? annotatedPages.slice(0, 6).join(', ') + '...' : annotatedPages.join(', ');
        exportPdfAnnotatedDesc.textContent = `(共 ${annotatedPages.length} 页: 第 ${preview} 页)`;
        exportPdfAnnotatedDesc.style.color = '#059669';
      }
      if (annotatedRadio) annotatedRadio.disabled = false;
      if (labelExportAnnotated) labelExportAnnotated.classList.remove('disabled');
    } else {
      if (exportPdfAnnotatedDesc) {
        exportPdfAnnotatedDesc.textContent = '(当前文献暂无手绘批注)';
        exportPdfAnnotatedDesc.style.color = '#94a3b8';
      }
      if (annotatedRadio) annotatedRadio.disabled = true;
      if (labelExportAnnotated) labelExportAnnotated.classList.add('disabled');
    }

    // 默认智能优选：若当前页有批注选当前页，否则若有批注选批注页，否则选全部
    const currentHasDrawings = (pageDrawings.get(currentPage) || []).length > 0;
    const radios = exportPdfModal.querySelectorAll('input[name="export-pdf-range"]');
    if (currentHasDrawings) {
      radios.forEach(r => r.checked = (r.value === 'current'));
    } else if (annotatedPages.length > 0) {
      radios.forEach(r => r.checked = (r.value === 'annotated'));
    } else {
      radios.forEach(r => r.checked = (r.value === 'all'));
    }

    updateExportPdfSummary();
    exportPdfModal.classList.remove('hidden');
  }

  function closeExportPdfModal() {
    if (exportPdfModal) exportPdfModal.classList.add('hidden');
  }

  function getExportPdfSelectedPages() {
    if (!currentPdf) return [];
    const checkedRadio = exportPdfModal.querySelector('input[name="export-pdf-range"]:checked');
    const val = checkedRadio ? checkedRadio.value : 'current';
    if (val === 'current') {
      return [currentPage];
    } else if (val === 'annotated') {
      return getAnnotatedPages();
    } else if (val === 'all') {
      const arr = [];
      for (let p = 1; p <= currentPdf.numPages; p++) arr.push(p);
      return arr;
    } else if (val === 'custom') {
      const inputVal = exportPdfCustomInput ? exportPdfCustomInput.value : '';
      return parsePageRanges(inputVal, currentPdf.numPages);
    }
    return [currentPage];
  }

  function updateExportPdfSummary() {
    if (!exportPdfSummary || !currentPdf) return;
    const pages = getExportPdfSelectedPages();
    const checkedRadio = exportPdfModal.querySelector('input[name="export-pdf-range"]:checked');
    const val = checkedRadio ? checkedRadio.value : 'current';

    if (val === 'custom' && pages.length === 0) {
      exportPdfSummary.textContent = '⚠️ 请输入有效的页码范围 (例如 1-5, 8)';
      exportPdfSummary.style.color = '#ef4444';
      exportPdfSummary.style.background = '#fef2f2';
      return;
    }

    if (val === 'annotated' && pages.length === 0) {
      exportPdfSummary.textContent = '⚠️ 当前文献尚无手绘批注页面';
      exportPdfSummary.style.color = '#ef4444';
      exportPdfSummary.style.background = '#fef2f2';
      return;
    }

    exportPdfSummary.style.color = '#2563eb';
    exportPdfSummary.style.background = '#eff6ff';
    if (pages.length > 30) {
      exportPdfSummary.textContent = `预计合成 ${pages.length} 页（页数较多，合成需稍候数秒，请耐心等待）`;
    } else {
      exportPdfSummary.textContent = `预计合成并导出 ${pages.length} 页 (${pages.length > 8 ? pages.slice(0, 8).join(', ') + '...' : pages.join(', ')})`;
    }
  }

  // 另存为 / 打印带手绘批注的高清 PDF 文档
  async function printPdfWithAnnotations(targetPages = null) {
    if (!currentPdf) {
      showToast('请先打开 PDF 文档');
      return;
    }

    // 若未指定具体页码列表且文档超过 1 页，弹出范围选择模态框
    if (!targetPages || !Array.isArray(targetPages) || targetPages.length === 0) {
      if (currentPdf.numPages > 1) {
        openExportPdfModal();
        return;
      }
      targetPages = [1];
    }

    loadingOverlay.classList.remove('hidden');
    loadingStatus.textContent = '正在准备合成批注图层...';

    try {
      const pageImages = [];
      const totalSelected = targetPages.length;

      for (let i = 0; i < totalSelected; i++) {
        const p = targetPages[i];
        loadingStatus.textContent = `正在渲染第 ${i + 1}/${totalSelected} 页 (原文档第 ${p} 页)...`;
        const page = await currentPdf.getPage(p);
        const viewport = page.getViewport({ scale: 1.5 }); // 1.5x 高清采样

        const offCanvas = document.createElement('canvas');
        offCanvas.width = viewport.width;
        offCanvas.height = viewport.height;
        const offCtx = offCanvas.getContext('2d');

        // 1. 渲染原始 PDF 页面
        await page.render({
          canvasContext: offCtx,
          viewport: viewport
        }).promise;

        // 2. 覆盖手绘笔迹与批注 (若该页有批注)
        const strokes = pageDrawings.get(p);
        if (strokes && strokes.length > 0) {
          strokes.forEach(stroke => {
            if (!stroke.points || stroke.points.length === 0) return;
            const isHighlighter = stroke.tool === 'highlighter';
            offCtx.save();
            if (isHighlighter) {
              offCtx.globalCompositeOperation = 'multiply';
            }
            offCtx.strokeStyle = stroke.color || (isHighlighter ? '#FFF176' : '#0078D4');
            offCtx.globalAlpha = isHighlighter ? (stroke.opacity !== undefined ? stroke.opacity : currentHighlighterOpacity) : 1.0;
            offCtx.lineWidth = (stroke.baseWidth || (isHighlighter ? 16 : 3)) * 1.5;
            offCtx.lineCap = isHighlighter ? 'square' : 'round';
            offCtx.lineJoin = 'round';
            offCtx.beginPath();
            stroke.points.forEach((pt, idx) => {
              const x = (pt.nx !== undefined ? pt.nx : pt.x / (offCanvas.width / 1.5)) * offCanvas.width;
              const y = (pt.ny !== undefined ? pt.ny : pt.y / (offCanvas.height / 1.5)) * offCanvas.height;
              if (idx === 0) offCtx.moveTo(x, y);
              else offCtx.lineTo(x, y);
            });
            offCtx.stroke();
            offCtx.restore();
          });
        }

        pageImages.push({
          pageNumber: p,
          width: viewport.width,
          height: viewport.height,
          dataUrl: offCanvas.toDataURL('image/jpeg', 0.92)
        });
      }

      loadingOverlay.classList.add('hidden');

      // 调起打印窗口 (系统自带“另存为 PDF”)
      const printWin = window.open('', '_blank');
      if (!printWin) {
        showToast('⚠️ 打印弹窗被浏览器拦截，请允许弹出式窗口后重试');
        return;
      }

      const imgTags = pageImages.map(img => `
        <div class="print-page">
          <img src="${img.dataUrl}" alt="Page ${img.pageNumber}" />
        </div>
      `).join('');

      printWin.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(pdfFileName || 'PDF 文档')} - 带批注文档</title>
  <style>
    @page {
      margin: 0;
      size: auto;
    }
    html, body {
      margin: 0;
      padding: 0;
      background: #525659;
    }
    .print-toolbar {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      background: #1e293b;
      color: #fff;
      padding: 10px 20px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      z-index: 999;
      box-shadow: 0 2px 8px rgba(0,0,0,0.25);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }
    .print-btn {
      background: #059669;
      color: #fff;
      border: none;
      padding: 7px 18px;
      border-radius: 6px;
      font-weight: 600;
      font-size: 13px;
      cursor: pointer;
    }
    .print-btn:hover { background: #047857; }
    .pages-container {
      margin-top: 55px;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 16px;
      padding: 20px;
    }
    .print-page {
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      background: #fff;
      max-width: 900px;
      width: 100%;
      page-break-after: always;
    }
    .print-page img {
      width: 100%;
      display: block;
    }
    @media print {
      body { background: transparent; }
      .print-toolbar { display: none !important; }
      .pages-container { margin-top: 0; padding: 0; gap: 0; }
      .print-page { box-shadow: none; max-width: none; width: 100%; page-break-after: always; }
    }
  </style>
</head>
<body>
  <div class="print-toolbar">
    <span>${escapeHtml(pdfFileName || 'PDF 文档')} · 共 ${pageImages.length} 页（已合成手绘与高光批注）</span>
    <button class="print-btn" onclick="window.print()">🖨️ 打印 / 另存为 PDF</button>
  </div>
  <div class="pages-container">
    ${imgTags}
  </div>
</body>
</html>`);
      printWin.document.close();
      printWin.focus();
      setTimeout(() => {
        printWin.print();
      }, 500);
    } catch (err) {
      loadingOverlay.classList.add('hidden');
      console.error('合成带批注 PDF 失败:', err);
      showToast('❌ 合成带批注 PDF 失败: ' + err.message);
    }
  }

  function requestOpenFile(file) {
    if (!file) return;
    if (hasUnsavedNotes) {
      pendingFileToOpen = file;
      if (unsavedModalDesc) {
        unsavedModalDesc.textContent = `当前文档【${pdfFileName || '当前文档'}】有未保存的手绘批注与阅读笔记。打开新文档前，是否需要保存现在的笔记？`;
      }
      if (unsavedNotesModal) unsavedNotesModal.classList.remove('hidden');
      return;
    }
    readLocalFile(file);
  }

  function closeUnsavedModal() {
    if (unsavedNotesModal) unsavedNotesModal.classList.add('hidden');
    pendingFileToOpen = null;
    fileInput.value = '';
    if (welcomeFileInput) welcomeFileInput.value = '';
  }

  function openDownloadModal() {
    if (!downloadModal || !currentPdf) return;
    const totalPages = currentPdf.numPages;
    let translatedCount = 0;
    for (let p = 1; p <= totalPages; p++) {
      const cached = pageTranslations.get(p);
      if (cached && cached.length > 0 && cached.some(b => b.transText)) {
        translatedCount++;
      }
    }
    if (downloadModalDesc) {
      downloadModalDesc.textContent = `当前文档共 ${totalPages} 页，已完成 ${translatedCount} 页译文排版。请选择导出或下载格式：`;
    }
    downloadModal.classList.remove('hidden');
  }

  function closeDownloadModal() {
    if (downloadModal) downloadModal.classList.add('hidden');
  }

  // 当前目标语言 (同步读取，供译文缓存有效性判定)
  function getActiveTargetLang() {
    return (targetLanguageSelect && targetLanguageSelect.value) ? targetLanguageSelect.value : 'zh-CN';
  }

  // 统一判定某页译文是否“完整有效”：存在译文、无缺失块、且目标语言与当前一致 (旧缓存无 targetLang 字段视为有效)
  function isPageTranslated(pageNum) {
    const cached = pageTranslations.get(pageNum);
    if (!cached || cached.length === 0) return false;
    if (!cached.some(b => b.transText)) return false;
    if (cached.some(b => b.untranslated)) return false;
    const lang = getActiveTargetLang();
    return !cached.some(b => b.targetLang && b.targetLang !== lang);
  }

  function updateTranslateDocButtonState() {
    if (!translateDocBtn || !currentPdf) return;
    const totalPages = currentPdf.numPages;
    let translatedCount = 0;
    for (let p = 1; p <= totalPages; p++) {
      if (isPageTranslated(p)) translatedCount++;
    }

    if (translatedCount === totalPages && totalPages > 0) {
      translateDocBtn.innerHTML = `
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
        <span>Download Full Translation</span>
      `;
      translateDocBtn.setAttribute('data-tooltip-title', '下载已翻译全文');
      translateDocBtn.setAttribute('data-tooltip-desc', '全文已全部翻译完成！点击立即下载双语对照 HTML 或另存为完整 PDF 文件');
    } else {
      translateDocBtn.innerHTML = `
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
        <span>Translate All & Download</span>
      `;
      translateDocBtn.setAttribute('data-tooltip-title', '一键全文翻译与下载');
      translateDocBtn.setAttribute('data-tooltip-desc', '批量排版翻译整篇文档全部页面，翻译完成后自动下载双语对照文档');
    }
  }

  let toastTimer = null;
  function showToast(msg, duration = 2200) {
    const toast = document.getElementById('pdf-toast');
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.classList.add('hidden');
    }, duration);
  }

  let currentPdf = null;
  let currentScale = 1.2;
  let currentPage = 1;
  let pdfDataBuffer = null;
  let pdfFileName = '';
  let currentRenderId = 0;
  let activeTranslateController = null;
  let isTranslatingDoc = false;
  let isPeekingLocked = false;
  const pageTranslations = new Map(); // pageNum -> Array of { id, type, originalText, transText, box }

  let transFontScale = 1.0;
  let opacityModeIndex = 0;
  const opacityModes = ['', 'mode-semi', 'mode-clear'];
  const opacityTitles = [
    '切换译文底色: 纯白遮罩 (清晰阅读，可长按 Alt 键透视原图)',
    '切换译文底色: 半透明微磨砂 (兼顾原排版与原图)',
    '切换译文底色: 极简纯字 (透视底层公式与背景)'
  ];

  // --- Translation Widget Logic (复制自 content.js，确保在 PDF 阅读器内即开即用) ---
  const brandLogoUrl = (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL)
    ? chrome.runtime.getURL('icons/logo.png')
    : '/icons/logo.png';

  const widgetContainer = document.createElement('div');
  widgetContainer.id = 'pdf-translate-widget-container';
  document.body.appendChild(widgetContainer);
  
  // 注入悬浮翻译浮窗 DOM (统一使用已处理的高清品牌 Logo)
  widgetContainer.innerHTML = `
    <button id="pdf-float-icon" class="pdf-float-icon hidden" title="Translate FY 划词翻译">
      <img src="${brandLogoUrl}" alt="Translate FY" draggable="false" />
    </button>
    <div id="pdf-translate-panel" class="pdf-panel hidden">
      <!-- 左右拉伸调整手柄 -->
      <div class="panel-resize-handle resize-handle-left" title="左右拖动调整宽度"></div>
      <div class="panel-resize-handle resize-handle-right" title="左右拖动调整宽度"></div>
      <div class="panel-header" id="pdf-panel-drag-handle">
        <div class="panel-logo">
          <img src="${brandLogoUrl}" width="16" height="16" alt="logo" style="border-radius:4px; display:block;" />
          <span>翻译</span>
        </div>
        <div class="panel-actions">
          <select id="pdf-panel-engine-select" class="panel-select">
            <option value="google">Google</option>
          </select>
          <select id="pdf-panel-model-select" class="panel-select hidden"></select>
          <button id="pdf-panel-pin-btn" class="panel-icon-btn" title="固定浮窗">
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="17" x2="12" y2="22"></line><path d="M5 17h14v-2l-2-2V5a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v8l-2 2v2z"></path></svg>
          </button>
          <button id="pdf-panel-close-btn" class="panel-close" title="关闭">✕</button>
        </div>
      </div>
      <div class="panel-body">
        <div class="panel-toolbar-row">
          <span style="font-size:11.5px; color:#8e8e93; font-weight:500;">原文</span>
        </div>
        <div class="panel-source-text" id="pdf-panel-source-text">...</div>
        <div class="panel-divider"></div>
        <div class="panel-toolbar-row">
          <span style="font-size:11.5px; color:#8e8e93; font-weight:500;">译文</span>
          <div class="panel-btn-group">
            <button id="pdf-panel-bilingual-btn" class="panel-icon-btn active" title="专有名词双语备注：开启中（点击切换）" style="font-size:10.5px; font-weight:600; width:auto; min-width:22px; padding:0 4px;">双语</button>
            <button id="pdf-copy-res-btn" class="panel-icon-btn" title="复制译文">
              <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
            </button>
          </div>
        </div>
        <div class="panel-result-wrapper">
          <div id="pdf-panel-result-text" class="panel-result">...</div>
          <div id="pdf-panel-loader" class="panel-loader hidden"></div>
        </div>
      </div>
    </div>
  `;

  const floatIcon = document.getElementById('pdf-float-icon');
  const translatePanel = document.getElementById('pdf-translate-panel');
  const panelEngineSelect = document.getElementById('pdf-panel-engine-select');
  const panelModelSelect = document.getElementById('pdf-panel-model-select');
  const panelSourceText = document.getElementById('pdf-panel-source-text');
  const panelResultText = document.getElementById('pdf-panel-result-text');
  const panelLoader = document.getElementById('pdf-panel-loader');
  const panelCloseBtn = document.getElementById('pdf-panel-close-btn');
  const panelPinBtn = document.getElementById('pdf-panel-pin-btn');
  const copyResBtn = document.getElementById('pdf-copy-res-btn');
  const panelBilingualBtn = document.getElementById('pdf-panel-bilingual-btn');
  const dragHandle = document.getElementById('pdf-panel-drag-handle');

  const isHttpHosted = typeof location !== 'undefined' && /^https?:$/.test(location.protocol);
  let currentSelectedText = '';
  let currentSelectionContext = '';
  let selectionTranslateSeq = 0;
  let isDragging = false;
  let isPinned = false;
  let dragOffset = { x: 0, y: 0 };

  // AI 模型内置列表 (智谱 GLM 4/4.5/4.7 Flash 官方模型永久免费，支持 Gemini 与 DeepSeek)
  const AI_MODELS = {
    glm: [
      'glm-4-flash',
      'glm-4.5-flash',
      'glm-4.7-flash',
      'glm-4-flashx'
    ],
    gemini: [
      'gemini-2.0-flash',
      'gemini-1.5-flash',
      'gemini-1.5-pro'
    ],
    deepseek: [
      'deepseek-chat',
      'deepseek-reasoner'
    ]
  };

  function isAIEngine(engine) {
    if (!engine) return false;
    return Boolean(AI_MODELS[engine] || engine === 'glm' || engine === 'gemini' || engine === 'deepseek' || engine.startsWith('custom_'));
  }

  // 多学科/多角色学术论文特殊符号与标点拓扑自愈引擎 (按角色专有生效: biochem/economics/general)
  function healAcademicSymbols(text, persona = currentPersona) {
    if (!text || typeof text !== 'string') return '';
    const targetPersona = persona || currentPersona || 'biochem';
    let s = text;

    // 通用基础排版与连字符断字通用修复
    s = s.replace(/\bwell-\s+characterized\b/gi, 'well-characterized');
    s = s.replace(/\bring-\s+shaped\b/gi, 'ring-shaped');
    s = s.replace(/\binterac-\s*tions\b/gi, 'interactions');
    s = s.replace(/\bposi-\s*tioned\b/gi, 'positioned');
    s = s.replace(/\bmis-\s*matches\b/gi, 'mismatches');

    // 1. 生化学术专家专有符号修复 (Biochem Persona Only)
    if (targetPersona === 'biochem') {
      // 希腊字母 λ (Lambda) 自愈 (解决加粗标题 k-Exonuclease 与正文 l-exo/l-DNA 缺陷)
      s = s.replace(/(\b\d+(?:\.\d+)*\.?\s*)[lk]\s*[-–—]\s*Exonuclease\b/g, '$1λ-Exonuclease');
      s = s.replace(/\b[lk]\s*[-–—]\s*Exonuclease\b/g, 'λ-Exonuclease');
      s = s.replace(/\b[lk]\s*[-–—]\s*exonuclease\b/g, 'λ-exonuclease');
      s = s.replace(/\b[lk]\s*[-–—]\s*exo\b/gi, 'λ-exo');
      s = s.replace(/\b[lk]\s*[-–—]\s*DNA\b/gi, 'λ-DNA');
      s = s.replace(/\b[lk]\s*[-–—]\s*phage\b/gi, 'λ-phage');
      s = s.replace(/(?:bacteriophage|phage)\s+[lk]\b/gi, 'phage λ');

      // 核酸五碳糖末端 5' 和 3' (Prime 撇号) 语义自愈
      // A. 链方向性联动 (5 0 - 3 0 / 50 - 30 -> 5' → 3')
      s = s.replace(/\b(?:5\s*0|50)\s*(?:[-–—]|to|->|→)\s*(?:3\s*0|30)\b/gi, "5' → 3'");
      s = s.replace(/\b(?:3\s*0|30)\s*(?:[-–—]|to|->|→)\s*(?:5\s*0|50)\b/gi, "3' → 5'");
      s = s.replace(/\b5['′]\s*(?:[-–—]|to)\s*3['′]\b/g, "5' → 3'");
      s = s.replace(/\b3['′]\s*(?:[-–—]|to)\s*5['′]\b/g, "3' → 5'");

      // B. 磷酸化基团与常规化学修饰 (5 0 -PO 4 -> 5'-PO4, 3 0 -OH -> 3'-OH)
      s = s.replace(/\b(?:5\s*0|50)\s*[-–—]\s*PO\s*4\b/gi, "5'-PO4");
      s = s.replace(/\b(?:3\s*0|30)\s*[-–—]\s*OH\b/gi, "3'-OH");
      s = s.replace(/\(\s*(?:5\s*0|50)\s*[-–—]\s*PO\s*4\s*\)/gi, "(5'-PO4)");
      s = s.replace(/5'-PO\s+4\b/g, "5'-PO4");
      s = s.replace(/\(5'-PO4\s+\)/g, "(5'-PO4)");

      // B1. 极罕见非标准修饰标记：化学修饰星号 * 硫代骨架 (Phosphorothioate backbone 5'-*PO4 / 5'-*端)
      s = s.replace(/\b(?:5\s*0|50)\s*[-–—]?\s*\*\s*PO\s*4\b/gi, "5'-*PO4");
      s = s.replace(/5['′]\s*[-–—]?\s*\*\s*PO\s*4\b/gi, "5'-*PO4");
      s = s.replace(/\b(?:5\s*0|50)\s*[-–—]?\s*\*\s*[-–—]?\s*([a-zA-Z0-9]+)\b/gi, "5'-*$1");
      s = s.replace(/\b(?:3\s*0|30)\s*[-–—]?\s*\*\s*[-–—]?\s*([a-zA-Z0-9]+)\b/gi, "3'-*$1");
      s = s.replace(/5['′]\s*[-–—]?\s*\*\s*([a-zA-Z0-9]+)\b/gi, "5'-*$1");
      s = s.replace(/3['′]\s*[-–—]?\s*\*\s*([a-zA-Z0-9]+)\b/gi, "3'-*$1");

      // B2. 极罕见学术同位素标记标号 (如 32P-labeled 5'-end / [32P] / γ-32P-ATP)
      s = s.replace(/(?:\[\s*|\b)(?:γ|gamma)\s*[-–—]?\s*(?:32\s*P|33\s*P)\s*\]?\s*[-–—]?\s*ATP\b/gi, 'γ-32P-ATP');
      s = s.replace(/(?:\[\s*|\b)(32|33)\s*P\s*\]?\s*[-–—]?\s*labeled\b/gi, '$1P-labeled');
      s = s.replace(/(?:\[\s*|\b)(35)\s*S\s*\]?\s*[-–—]?\s*labeled\b/gi, '$1S-labeled');
      s = s.replace(/(?:\[\s*|\b)(14)\s*C\s*\]?\s*[-–—]?\s*labeled\b/gi, '$1C-labeled');
      s = s.replace(/(?:\[\s*|\b)(3)\s*H\s*\]?\s*[-–—]?\s*labeled\b/gi, '$1H-labeled');
      s = s.replace(/(?:\[\s*|\b)(125)\s*I\s*\]?\s*[-–—]?\s*labeled\b/gi, '$1I-labeled');
      s = s.replace(/(\b(?:32|33)P|\b(?:35)S)-labeled\s+(?:5\s*0|50)\s*[-–—]?\s*(end|termini|terminus|overhang|PO\s*4)\b/gi, "$1-labeled 5'-$2");
      s = s.replace(/(\b(?:32|33)P|\b(?:35)S)\s*[-–—]?\s*(?:5\s*0|50)\s*[-–—]?\s*(end|termini|terminus|overhang|PO\s*4)\b/gi, "$1-5'-$2");

      // C. 结构末端与酶切特征修饰 (结合上下文白名单精准防误伤，扩充生物标记物与化学修饰)
      const primeContexts = '(?:phosphorylated|phosphate|hydroxyl|end|termini|terminal|terminus|overhang|protruding|carbon|splice|UTR|exonuclease|recessed|flap|stem|arm|tail|strand|dye|fluorophore|quencher|probe|primer|labeled|biotin|thiol|amine|digoxigenin|DIG|Cy3|Cy5|FAM|FITC|HEX|TET|Texas\\s*Red|Alexa\\s*\\d+|ps|phosphorothioate)';
      const re5Prime = new RegExp('\\b(?:5\\s*0|50)\\s*[-–—]\\s*(' + primeContexts + ')\\b', 'gi');
      s = s.replace(re5Prime, "5'-$1");
      const re3Prime = new RegExp('\\b(?:3\\s*0|30)\\s*[-–—]\\s*(' + primeContexts + ')\\b', 'gi');
      s = s.replace(re3Prime, "3'-$1");

      // D. 介词短语修饰 (at/to/near the 50-end -> 5'-end)
      s = s.replace(/\b(the|its|at|from|to|near|close to the|adjacent to the)\s+(?:5\s*0|50)\s*[-–—]?\s*(end|termini|terminus|overhang|side)\b/gi, "$1 5'-$2");
      s = s.replace(/\b(the|its|at|from|to|near|close to the|adjacent to the)\s+(?:3\s*0|30)\s*[-–—]?\s*(end|termini|terminus|overhang|side)\b/gi, "$1 3'-$2");
      s = s.replace(/\b(?:5\s*0|50)\s*[-–—]\s*(end|termini|terminus|overhang)\b/gi, "5'-$1");
      s = s.replace(/\b(?:3\s*0|30)\s*[-–—]\s*(end|termini|terminus|overhang)\b/gi, "3'-$1");

      // 热力学与物理化学自由能差/物理量 (ΔG, ΔΔG, ΔTm, ΔH, ΔS)
      s = s.replace(/\bDD\s*G\s*(?:1|°|o)?\b/g, 'ΔΔG°');
      s = s.replace(/\bD\s*G\s*(?:1|°|o)?\b/g, 'ΔG°');
      s = s.replace(/\bD\s*T\s*(?:m)?\b/g, 'ΔTm');
      s = s.replace(/\bD\s*H\s*(?:1|°|o)?\b/g, 'ΔH°');
      s = s.replace(/\bD\s*S\s*(?:1|°|o)?\b/g, 'ΔS°');

      // 译文中文后处理自愈保护 (纠正模型可能混淆的字符)
      s = s.replace(/(?<=[^\w]|^)[lk]\s*[-–—]\s*(?:外切核酸酶|外切酶)/gi, 'λ-外切核酸酶');
      s = s.replace(/(?:32\s*P|33\s*P)\s*[-–—]?\s*(?:标记|标号)\s*(?:的\s*)?(?:5\s*0|50)\s*端?/gi, "32P-标记 5'端");
      s = s.replace(/(?:5\s*0|50)\s*[-–—]?\s*\*\s*PO4/gi, "5'-*PO4");
      s = s.replace(/(?:5\s*0|50)\s*[-–—]?\s*\*\s*端/gi, "5'-*端");
      s = s.replace(/(?:3\s*0|30)\s*[-–—]?\s*\*\s*端/gi, "3'-*端");
      s = s.replace(/50\s*端/g, "5'端");
      s = s.replace(/30\s*端/g, "3'端");
      s = s.replace(/50\s*[-–—]\s*PO4/g, "5'-PO4");
      s = s.replace(/50\s*(?:到|至|[-–—]|→)\s*30\s*端?/g, "5'到 3'端");
    }

    // 2. 经济金融专家专有符号修复 (Economics Persona Only)
    else if (targetPersona === 'economics') {
      s = s.replace(/\bD\s*GDP\b/g, 'ΔGDP');
      s = s.replace(/\bD\s*CPI\b/g, 'ΔCPI');
      s = s.replace(/\bbeta\s*([0-9]|_i|_t)\b/gi, 'β$1');
      s = s.replace(/\bepsilon\s*([0-9]|_i|_t)\b/gi, 'ε$1');
      s = s.replace(/\bR\s*\^?\s*2\b/g, 'R²');
    }

    return s;
  }

  // 规范化 PDF 提取出的字符与标点符号 (解决连字、软连字符、特殊空白符等排版影响)
  function normalizePdfText(str) {
    if (!str || typeof str !== 'string') return '';
    const basic = str
      .replace(/\uFB00/g, 'ff')
      .replace(/\uFB01/g, 'fi')
      .replace(/\uFB02/g, 'fl')
      .replace(/\uFB03/g, 'ffi')
      .replace(/\uFB04/g, 'ffl')
      .replace(/\uFB05/g, 'ft')
      .replace(/\uFB06/g, 'st')
      .replace(/\u00AD/g, '')       // 软连字符
      .replace(/[\u200B-\u200D\uFEFF]/g, '') // 零宽字符
      .replace(/[\u2010\u2011]/g, '-') // 统一短横线连字符
      .replace(/\u00A0/g, ' ')      // 不换行空格
      .replace(/[\u2018\u2019]/g, "'") // 弯单引号
      .replace(/[\u201C\u201D]/g, '"') // 弯双引号
      .replace(/[ \t]+/g, ' ');     // 压缩多余连续水平空白
    return healAcademicSymbols(basic);
  }

  // 提取划词文本周围的上下文语境 (支持从 .trans-overlay-block、.textLayer 的 span 集合或段落提取)
  function getSelectionSurroundingContext(selection, maxChars = 250) {
    if (!selection || selection.rangeCount === 0) return '';
    try {
      const range = selection.getRangeAt(0);
      const container = range.commonAncestorContainer;
      const el = container.nodeType === Node.ELEMENT_NODE ? container : container.parentElement;
      if (!el) return '';

      // 1. 如果在翻译排版覆盖块内部划词，直接取当前 block 的完整文本作为语境
      const overlayBlock = el.closest('.trans-overlay-block');
      if (overlayBlock) {
        const fullText = (overlayBlock.textContent || '').trim();
        return reconstructPdfParagraphs(fullText).slice(0, maxChars * 2);
      }

      // 2. 如果在 PDF.js 的 textLayer 内部划词
      const textLayer = el.closest('.textLayer');
      if (textLayer) {
        const targetSpan = el.closest('span') || el;
        const spans = Array.from(textLayer.querySelectorAll('span'));
        const idx = spans.indexOf(targetSpan);
        if (idx !== -1) {
          // 提取前后各若干个 span（约 5~8 行）
          const startIdx = Math.max(0, idx - 4);
          const endIdx = Math.min(spans.length, idx + 5);
          const surroundingRaw = spans.slice(startIdx, endIdx).map(s => s.textContent || '').join(' ');
          return reconstructPdfParagraphs(surroundingRaw).slice(0, maxChars * 2);
        }
      }

      // 3. 通用 fallback：如果能找到父容器段落
      const parentBlock = el.closest('p, div, section, article') || el;
      const raw = parentBlock.textContent || '';
      return reconstructPdfParagraphs(raw).slice(0, maxChars * 2);
    } catch (e) {
      return '';
    }
  }

  // PDF 文本语义段落重构与断行清洗函数
  function reconstructPdfParagraphs(rawText) {
    if (!rawText || typeof rawText !== 'string') return '';

    // 1. 规范化字符集并统一换行符
    let text = normalizePdfText(rawText).replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    // 2. 按两个及以上连续换行（段落物理分界）切分为段落块
    const rawParagraphs = text.split(/\n\s*\n+/);

    const cleanParagraphs = rawParagraphs.map(paragraph => {
      const rawLines = paragraph.split('\n').map(l => l.trim()).filter(Boolean);
      if (rawLines.length === 0) return '';
      if (rawLines.length === 1) return rawLines[0];

      let merged = rawLines[0];

      for (let i = 1; i < rawLines.length; i++) {
        const prevLine = rawLines[i - 1];
        const currLine = rawLines[i];

        // 规则 1: 保留明显的列表项、序号标记行
        const isListItem = /^([-*•·]|(?:\d+|[a-zA-Z])[\.)])\s+/.test(currLine);
        if (isListItem) {
          merged += '\n' + currLine;
          continue;
        }

        // 规则 2: 冒号结尾引导行 (如 "For press inquiries, please contact:") 必须硬折行
        if (prevLine.endsWith(':')) {
          merged += '\n' + currLine;
          continue;
        }

        // 规则 3: 元数据/联系方式独立条目识别 (如包含邮箱、电话 Tel/Phone、或独立机构/姓名短行)
        const isMetaLine = /(@|\b(?:Tel|Phone|Fax|Email|Website|Address)\b|^\+\d+)/i.test(prevLine) ||
                           /(@|\b(?:Tel|Phone|Fax|Email|Website|Address)\b|^\+\d+)/i.test(currLine);
        if (isMetaLine && (prevLine.length < 55 || currLine.length < 55)) {
          merged += '\n' + currLine;
          continue;
        }

        // 规则 4: 独立多行短标题或目录项 (两行均较短 < 50 字符，且前行句意独立，后行大写开头)
        const isPrevShortTitle = prevLine.length < 50 && !/(?:and|or|the|of|in|to|for|with|by|a|an)$/i.test(prevLine);
        const isCurrShortTitle = currLine.length < 50 && /^[A-Z0-9]/.test(currLine);
        const endsWithTerminalPunct = /[\.\?!。？！]$/.test(prevLine);

        if (isPrevShortTitle && isCurrShortTitle && (endsWithTerminalPunct || /^[A-Z]/.test(currLine))) {
          merged += '\n' + currLine;
          continue;
        }

        // 规则 5: 英文行末连字符 (Hyphenation) 智能处理与专有名词/复合词保护
        const hyphenMatch = prevLine.match(/([a-zA-Z]+)-$/);
        if (hyphenMatch && /^[a-zA-Z]/.test(currLine)) {
          const rawPrefix = hyphenMatch[1];
          const prefixLower = rawPrefix.toLowerCase();
          const currFirstWord = (currLine.match(/^[a-zA-Z]+/) || [''])[0];

          // 固有连字符前缀与常见复合词白名单 (这些连字符是词汇固有结构，严禁剔除)
          const compoundPrefixes = new Set([
            'anti', 'non', 'self', 'co', 'cross', 'well', 'high', 'low', 'multi',
            'semi', 'post', 'pre', 'pro', 'sub', 'inter', 'intra', 'ultra', 'pseudo',
            'peer', 'cost', 'double', 'single', 'first', 'second', 'all', 'ex', 'neo',
            'short', 'long', 'fast', 'slow', 'real', 'deep', 'full', 'half', 'wide',
            'over', 'under', 'macro', 'micro', 'bio', 'nano', 'open', 'closed'
          ]);

          // 专有名词、首字母大写或短前缀 (如 "Anglo-Saxon", "SARS-CoV", "T-cell", "B-cell") 保留连字符
          const isProperNoun = /^[A-Z]/.test(currFirstWord) || /^[A-Z]/.test(rawPrefix);
          const isShortPrefix = rawPrefix.length <= 2;

          if (compoundPrefixes.has(prefixLower) || isProperNoun || isShortPrefix) {
            // 固有复合词/专有名词连字符保留
            merged += currLine;
          } else {
            // 纯排版换行断字截断 (如 "infor-" + "mation" -> "information")，安全剔除连字符
            merged = merged.slice(0, -1) + currLine;
          }
          continue;
        }

        // 规则 B: 常见英文句尾缩写保护 (例如 "e.g.", "i.e.", "et al.", "Fig.", "Tab.", "Ref.")
        const endsWithAbbr = /(?:e\.g|i\.e|et al|Fig|Table|Tab|Ref|Dr|Mr|Mrs|vs|No|vol|pp)\.$/i.test(prevLine);

        // 规则 C: 判断 CJK 汉字行与西文字符行的智能连接
        const prevEndsCJK = /[\u4e00-\u9fa5\u3040-\u30ff\uac00-\ud7af]$/.test(merged);
        const currStartsCJK = /^[\u4e00-\u9fa5\u3040-\u30ff\uac00-\ud7af]/.test(currLine);

        if (prevEndsCJK && currStartsCJK) {
          // 中文行间直接拼接无空格
          merged += currLine;
        } else {
          // 西文正文段内自然软折行：以单个空格连接为连贯长句，绝不在段内引入人工 \n 导致破碎分行
          merged += ' ' + currLine;
        }
      }

      return merged;
    });

    return cleanParagraphs.filter(Boolean).map(healAcademicSymbols).join('\n\n');
  }

  // 浮窗左右拉伸逻辑
  const handleLeft = translatePanel.querySelector('.resize-handle-left');
  const handleRight = translatePanel.querySelector('.resize-handle-right');

  // 从 storage 读取并恢复用户偏好的浮窗宽度
  chrome.storage.local.get({ pdfPanelWidth: 360 }, (res) => {
    if (res.pdfPanelWidth && res.pdfPanelWidth >= 280) {
      translatePanel.style.width = `${res.pdfPanelWidth}px`;
    }
  });

  function initResize(e, direction) {
    e.preventDefault();
    e.stopPropagation();

    const startX = e.clientX;
    const startWidth = translatePanel.offsetWidth;
    const startLeft = translatePanel.offsetLeft;

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
      chrome.storage.local.set({ pdfPanelWidth: finalWidth });
    }

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }

  if (handleLeft) handleLeft.addEventListener('mousedown', (e) => initResize(e, 'left'));
  if (handleRight) handleRight.addEventListener('mousedown', (e) => initResize(e, 'right'));

  // 动态加载可用引擎列表
  function loadAvailableEngines(callback) {
    chrome.storage.local.get({
      glmApiKey: '',
      glmModels: null,
      geminiApiKey: '',
      geminiModels: null,
      geminiActiveModel: 'gemini-2.0-flash',
      deepseekApiKey: '',
      deepseekModels: null,
      deepseekActiveModel: 'deepseek-chat',
      deeplApiKey: '',
      deeplEndpoint: '',
      youdaoAppKey: '',
      youdaoAppSecret: '',
      pdfTranslateEngine: 'google',
      customModels: []
    }, (result) => {
      // 动态载入用户在设置中启用的模型列表
      if (Array.isArray(result.glmModels) && result.glmModels.length > 0) AI_MODELS.glm = result.glmModels;
      if (Array.isArray(result.geminiModels) && result.geminiModels.length > 0) AI_MODELS.gemini = result.geminiModels;
      if (Array.isArray(result.deepseekModels) && result.deepseekModels.length > 0) AI_MODELS.deepseek = result.deepseekModels;

      const currentPanelVal = panelEngineSelect.value;
      const currentToolbarVal = pdfTranslateEngine ? (pdfTranslateEngine.value || result.pdfTranslateEngine || 'google') : 'google';

      panelEngineSelect.innerHTML = '';
      if (pdfTranslateEngine) pdfTranslateEngine.innerHTML = '';

      const available = [
        { value: 'google', label: 'Google 翻译 (免Key)' },
        { value: 'bing', label: 'Bing 翻译 (免Key·微软)' }
      ];

      if ((result.deeplApiKey && result.deeplApiKey.trim()) || (result.deeplEndpoint && result.deeplEndpoint.trim())) {
        available.push({ value: 'deepl', label: 'DeepL 翻译 (精准自然)' });
      }
      if (result.glmApiKey && result.glmApiKey.trim()) {
        available.push({ value: 'glm', label: '智谱 GLM (免费Flash)' });
      }
      if (result.geminiApiKey && result.geminiApiKey.trim()) {
        available.push({ value: 'gemini', label: 'Google Gemini (终身免费)' });
      }
      if (result.deepseekApiKey && result.deepseekApiKey.trim()) {
        available.push({ value: 'deepseek', label: 'DeepSeek 翻译 (深度推理)' });
      }
      if (result.youdaoAppKey && result.youdaoAppSecret && result.youdaoAppKey.trim() && result.youdaoAppSecret.trim()) {
        available.push({ value: 'youdao', label: '有道词典' });
      }

      result.customModels.forEach(m => {
        if ((m.apiKey && m.apiKey.trim()) || (m.endpoint && m.endpoint.trim())) {
          available.push({ value: `custom_${m.id}`, label: m.name });
        }
      });

      available.forEach(item => {
        const optPanel = document.createElement('option');
        optPanel.value = item.value;
        optPanel.textContent = item.label;
        panelEngineSelect.appendChild(optPanel);

        if (pdfTranslateEngine) {
          const optToolbar = document.createElement('option');
          optToolbar.value = item.value;
          optToolbar.textContent = item.label;
          pdfTranslateEngine.appendChild(optToolbar);
        }
      });

      const availableValues = available.map(a => a.value);
      if (availableValues.includes(currentPanelVal)) {
        panelEngineSelect.value = currentPanelVal;
      } else {
        panelEngineSelect.value = 'google';
      }

      if (pdfTranslateEngine) {
        if (availableValues.includes(currentToolbarVal)) {
          pdfTranslateEngine.value = currentToolbarVal;
        } else {
          pdfTranslateEngine.value = 'google';
        }
        updateToolbarModelSelect(pdfTranslateEngine.value);
      }

      if (callback) callback();
    });
  }

  // 更新顶部工具栏中的 AI 模型选择下拉框 (如 GLM / Gemini / DeepSeek 等)
  function updateToolbarModelSelect(engine) {
    if (!pdfTranslateModel) return;
    pdfTranslateModel.innerHTML = '';

    if (AI_MODELS[engine]) {
      const models = AI_MODELS[engine];
      models.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m;
        opt.textContent = m;
        pdfTranslateModel.appendChild(opt);
      });
      const storageKey = `${engine}ActiveModel`;
      chrome.storage.local.get([storageKey], (res) => {
        const activeM = res[storageKey];
        if (activeM && models.includes(activeM)) {
          pdfTranslateModel.value = activeM;
        } else if (models.length > 0) {
          pdfTranslateModel.value = models[0];
        }
        pdfTranslateModel.classList.remove('hidden');
      });
    } else {
      pdfTranslateModel.classList.add('hidden');
    }
  }

  if (pdfTranslateModel) {
    pdfTranslateModel.addEventListener('change', () => {
      const engine = pdfTranslateEngine ? pdfTranslateEngine.value : '';
      if (engine && AI_MODELS[engine]) {
        chrome.storage.local.set({ [`${engine}ActiveModel`]: pdfTranslateModel.value });
      }
      // 双向联动：同步更新浮窗划词面板的模型选择，并若浮窗开启且有选中文本则即时重译
      if (panelModelSelect && panelModelSelect.value !== pdfTranslateModel.value) {
        if (Array.from(panelModelSelect.options).some(o => o.value === pdfTranslateModel.value)) {
          panelModelSelect.value = pdfTranslateModel.value;
        }
        if (translatePanel && translatePanel.classList.contains('show') && currentSelectedText) {
          doTranslation(currentSelectedText, panelEngineSelect.value, getActiveTargetLang(), panelModelSelect.value, currentSelectionContext);
        }
      }
    });
  }

  loadAvailableEngines();

  // 监听 storage 变更，及时更新可用引擎
  chrome.storage.onChanged.addListener(() => {
    loadAvailableEngines();
  });

  function getSettings(callback) {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get({
        enableSelectionTranslate: true,
        autoShowPanel: false,
        defaultTargetLang: 'zh-CN',
        defaultEngine: 'google',
        enableBilingualNotation: true
      }, (res) => {
        callback(res || { enableSelectionTranslate: true, autoShowPanel: false, defaultTargetLang: 'zh-CN', defaultEngine: 'google', enableBilingualNotation: true });
      });
    } else {
      callback({
        enableSelectionTranslate: true,
        autoShowPanel: false,
        defaultTargetLang: 'zh-CN',
        defaultEngine: 'google',
        enableBilingualNotation: true
      });
    }
  }

  // 全局轻量 Toast 弱提醒组件
  function showToast(message, type = 'info', duration = 3200) {
    let toast = document.getElementById('pdf-toast-notify');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'pdf-toast-notify';
      toast.className = 'pdf-toast-notify';
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.className = `pdf-toast-notify show toast-${type}`;
    if (toast._timer) clearTimeout(toast._timer);
    toast._timer = setTimeout(() => {
      toast.classList.remove('show');
    }, duration);
  }

  // 针对译文选区的 iOS 快捷操作浮条 DOM 与交互逻辑
  const transQuickBar = document.createElement('div');
  transQuickBar.id = 'pdf-trans-quick-bar';
  transQuickBar.className = 'trans-quick-bar hidden';
  transQuickBar.innerHTML = `
    <button id="quick-copy-trans-btn" class="quick-bar-btn" title="复制选中的译文内容">
      <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
      <span>复制</span>
    </button>
    <div class="quick-bar-divider"></div>
    <button id="quick-copy-bilingual-btn" class="quick-bar-btn" title="复制双语对照 (原文+译文)">
      <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path><rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect></svg>
      <span>复制双语</span>
    </button>
    <div class="quick-bar-divider"></div>
    <button id="quick-copy-all-btn" class="quick-bar-btn" title="复制当前段落整段译文">
      <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>
      <span>复制全段</span>
    </button>
  `;
  document.body.appendChild(transQuickBar);

  const quickCopyTransBtn = document.getElementById('quick-copy-trans-btn');
  const quickCopyBilingualBtn = document.getElementById('quick-copy-bilingual-btn');
  const quickCopyAllBtn = document.getElementById('quick-copy-all-btn');

  let currentTransSelectionText = '';
  let currentTransAssociatedBlock = null;

  function hideTransQuickBar() {
    if (transQuickBar && !transQuickBar.classList.contains('hidden')) {
      transQuickBar.classList.add('hidden');
    }
    currentTransSelectionText = '';
    currentTransAssociatedBlock = null;
  }

  function showTransQuickBar(range, text, targetEl) {
    if (!range || !text) return;
    currentTransSelectionText = text;

    const blockEl = targetEl ? targetEl.closest('.trans-overlay-block') : null;
    let foundBlock = null;
    if (blockEl && blockEl.dataset.blockId) {
      const bId = blockEl.dataset.blockId;
      const pageContainer = blockEl.closest('.trans-page-container');
      const pageNum = pageContainer ? parseInt(pageContainer.dataset.pageNum, 10) : currentPage;
      const blocks = pageTranslations.get(pageNum);
      if (blocks && Array.isArray(blocks)) {
        foundBlock = blocks.find(b => b.id === bId);
      }
    }
    currentTransAssociatedBlock = foundBlock;

    const rect = range.getBoundingClientRect();
    const barWidth = 240;
    const barHeight = 36;
    let posX = Math.round(rect.left + (rect.width / 2) - (barWidth / 2));
    let posY = Math.round(rect.top - barHeight - 8);
    if (posY < 12) {
      posY = Math.round(rect.bottom + 8);
    }
    posX = Math.max(12, Math.min(posX, window.innerWidth - barWidth - 12));

    transQuickBar.style.left = `${posX}px`;
    transQuickBar.style.top = `${posY}px`;
    transQuickBar.classList.remove('hidden');
  }

  quickCopyTransBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!currentTransSelectionText) return;
    navigator.clipboard.writeText(currentTransSelectionText).then(() => {
      const span = quickCopyTransBtn.querySelector('span');
      const oldText = span.textContent;
      span.textContent = '✓ 已复制';
      quickCopyTransBtn.classList.add('copied');
      setTimeout(() => {
        span.textContent = oldText;
        quickCopyTransBtn.classList.remove('copied');
        hideTransQuickBar();
      }, 700);
    });
  });

  quickCopyBilingualBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    let textToCopy = currentTransSelectionText;
    if (currentTransAssociatedBlock && currentTransAssociatedBlock.origText) {
      textToCopy = `【原文】\n${currentTransAssociatedBlock.origText}\n\n【译文】\n${currentTransSelectionText}`;
    }
    navigator.clipboard.writeText(textToCopy).then(() => {
      const span = quickCopyBilingualBtn.querySelector('span');
      const oldText = span.textContent;
      span.textContent = '✓ 已复制双语';
      quickCopyBilingualBtn.classList.add('copied');
      setTimeout(() => {
        span.textContent = oldText;
        quickCopyBilingualBtn.classList.remove('copied');
        hideTransQuickBar();
      }, 700);
    });
  });

  quickCopyAllBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const fullText = (currentTransAssociatedBlock && currentTransAssociatedBlock.transText) ? currentTransAssociatedBlock.transText : currentTransSelectionText;
    navigator.clipboard.writeText(fullText).then(() => {
      const span = quickCopyAllBtn.querySelector('span');
      const oldText = span.textContent;
      span.textContent = '✓ 已复制全段';
      quickCopyAllBtn.classList.add('copied');
      setTimeout(() => {
        span.textContent = oldText;
        quickCopyAllBtn.classList.remove('copied');
        hideTransQuickBar();
      }, 700);
    });
  });

  // 获取 PDF 页面当前的有效翻译配置（优先遵循顶部工具栏用户显式选中的引擎与目标语言）
  function getEffectiveTranslateConfig(settings) {
    const effectiveEngine = (pdfTranslateEngine && pdfTranslateEngine.value) 
      ? pdfTranslateEngine.value 
      : ((settings && settings.defaultEngine) ? settings.defaultEngine : 'google');
    const effectiveTargetLang = (targetLanguageSelect && targetLanguageSelect.value)
      ? targetLanguageSelect.value
      : ((settings && settings.defaultTargetLang) ? settings.defaultTargetLang : 'zh-CN');
    return { effectiveEngine, effectiveTargetLang };
  }

  // 监听全工作区划词（原文划词查词，译文选区弹出复制等快捷工具）
  document.addEventListener('mouseup', (e) => {
    if (e.target.closest('#pdf-translate-panel') || e.target.closest('#pdf-float-icon') || e.target.closest('#pdf-trans-quick-bar')) return;
    if (isDrawMode || !isTextMode) return; // 仅在文本模式下触发划词交互
    if (!e.target.closest('#viewer-main') && !e.target.closest('#viewer-workspace')) return;

    setTimeout(() => {
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) {
        hideTransQuickBar();
        return;
      }
      const rawText = selection.toString().trim();

      if (!rawText || rawText.length < 1 || rawText.length > 3000) {
        hideTransQuickBar();
        if (!translatePanel.classList.contains('show')) {
          hideIcon();
        }
        return;
      }

      // 判断选区是否位于【译文呈现层】（如右侧翻译页、无痕原排版译文块等）
      const anchorEl = selection.anchorNode ? (selection.anchorNode.nodeType === 1 ? selection.anchorNode : selection.anchorNode.parentElement) : null;
      const focusEl = selection.focusNode ? (selection.focusNode.nodeType === 1 ? selection.focusNode : selection.focusNode.parentElement) : null;
      const isInsideTrans = !!(
        (anchorEl && anchorEl.closest('#pdf-viewer-container-trans, .trans-overlay-layer, .trans-overlay-block, .trans-page-container')) ||
        (focusEl && focusEl.closest('#pdf-viewer-container-trans, .trans-overlay-layer, .trans-overlay-block, .trans-page-container')) ||
        e.target.closest('#pdf-viewer-container-trans, .trans-overlay-layer, .trans-overlay-block, .trans-page-container')
      );

      if (isInsideTrans) {
        // 选中译文：严格禁止弹出划词翻译浮窗，而是唤起针对译文的常用快捷操作条 (复制、复制双语等)
        hideIcon();
        if (!isPinned && translatePanel.classList.contains('show')) {
          hidePanel();
        }
        const range = selection.getRangeAt(0);
        showTransQuickBar(range, rawText, anchorEl || focusEl);
        return;
      }

      // 普通原文划词：关闭译文快捷栏，进入划词翻译
      hideTransQuickBar();

      // 语义重构段落，消除 PDF 硬换行和断字
      const text = reconstructPdfParagraphs(rawText);
      currentSelectedText = text;
      currentSelectionContext = getSelectionSurroundingContext(selection, 250);

      getSettings((settings) => {
        if (settings && settings.enableSelectionTranslate === false) return; // 尊重设置页的划词翻译开关
        if (selection.rangeCount === 0) return;
        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        
        // 浮标位置（相对于当前浏览器视口 Fixed 定位，防 0 坐标回退至光标位置）
        let posX = e.clientX + 8;
        let posY = e.clientY + 8;

        if (rect && (rect.width > 0 || rect.height > 0)) {
          posX = Math.round(rect.right + 6);
          posY = Math.round(rect.bottom + 6);
        } else {
          const clientRects = range.getClientRects();
          if (clientRects && clientRects.length > 0) {
            const lastR = clientRects[clientRects.length - 1];
            posX = Math.round(lastR.right + 6);
            posY = Math.round(lastR.bottom + 6);
          }
        }

        const { effectiveEngine, effectiveTargetLang } = getEffectiveTranslateConfig(settings);

        if (settings && settings.autoShowPanel) {
          showPanel(posX, posY, text, effectiveEngine, effectiveTargetLang, currentSelectionContext);
        } else {
          showIcon(posX, posY);
        }
      });
    }, 25);
  });

  // 点击空白关闭浮窗与快捷栏
  document.addEventListener('mousedown', (e) => {
    if (e.target.closest('#pdf-trans-quick-bar')) return;
    hideTransQuickBar();
    if (e.target.closest('#pdf-translate-widget-container')) return;
    hideIcon();
    if (!isPinned && translatePanel.classList.contains('show')) {
      hidePanel();
    }
  });

  function showIcon(x, y) {
    const safeX = Math.max(10, Math.min(x, window.innerWidth - 45));
    const safeY = Math.max(10, Math.min(y, window.innerHeight - 45));

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

  function showPanel(x, y, text, engine, targetLang, context = '') {
    hideIcon();
    hideTransQuickBar();
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }

    const panelWidth = translatePanel.offsetWidth || 360;
    const panelHeight = translatePanel.offsetHeight || 220;
    let safeX = Math.max(12, Math.min(x, window.innerWidth - panelWidth - 16));
    let safeY = Math.max(12, Math.min(y + 8, window.innerHeight - panelHeight - 16));
    if (y + panelHeight + 20 > window.innerHeight && y - panelHeight - 12 >= 10) {
      safeY = y - panelHeight - 12;
    }

    translatePanel.style.left = `${safeX}px`;
    translatePanel.style.top = `${safeY}px`;
    panelSourceText.textContent = text;
    currentSelectionContext = context || '';

    loadAvailableEngines(() => {
      const availableValues = Array.from(panelEngineSelect.options).map(o => o.value);
      // 优先与顶部栏引擎完全对齐
      const chosenEngine = availableValues.includes(engine) ? engine : (availableValues[0] || 'google');
      panelEngineSelect.value = chosenEngine;
      
      updateModelSelect(chosenEngine, () => {
        // 若顶部栏有指定模型，浮窗下拉框同步赋予该模型
        if (pdfTranslateModel && !pdfTranslateModel.classList.contains('hidden') && pdfTranslateModel.value) {
          if (Array.from(panelModelSelect.options).some(o => o.value === pdfTranslateModel.value)) {
            panelModelSelect.value = pdfTranslateModel.value;
          }
        }
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
          doTranslation(text, chosenEngine, targetLang, activeModel, currentSelectionContext);
        });
      });
    });
  }

  function hidePanel() {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    translatePanel.classList.remove('show');
    setTimeout(() => {
      if (!translatePanel.classList.contains('show')) {
        translatePanel.classList.add('hidden');
      }
    }, 250);
  }

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

  async function fetchLocalTranslate(text, targetLang, context, persona) {
    const res = await fetch('/api/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, targetLang, context, persona })
    });
    const data = await res.json();
    if (data && data.success && data.translation) {
      return data.translation;
    }
    throw new Error(data.error || '本地服务翻译未返回有效结果');
  }

  function doTranslation(text, engine, targetLang, modelName, context = currentSelectionContext) {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    const seq = ++selectionTranslateSeq;
    panelLoader.classList.remove('hidden');
    panelResultText.classList.add('hidden');
    panelResultText.classList.remove('error');

    // 超时熔断保护：25 秒内若未响应，自动解除 loading 并提示
    const timeoutId = setTimeout(() => {
      if (seq === selectionTranslateSeq && !panelLoader.classList.contains('hidden')) {
        panelLoader.classList.add('hidden');
        panelResultText.classList.remove('hidden');
        panelResultText.textContent = '翻译超时，请检查网络连接或接口配置';
        panelResultText.classList.add('error');
      }
    }, 25000);

    const onTranslateSuccess = (translation) => {
      clearTimeout(timeoutId);
      if (seq !== selectionTranslateSeq) return; // 序列号不匹配，丢弃过期竞态响应
      panelLoader.classList.add('hidden');
      panelResultText.classList.remove('hidden');
      panelResultText.textContent = healAcademicSymbols(translation, currentPersona);
      panelResultText.classList.remove('error');
    };

    const onTranslateError = (errMsg) => {
      clearTimeout(timeoutId);
      if (seq !== selectionTranslateSeq) return;
      panelLoader.classList.add('hidden');
      panelResultText.classList.remove('hidden');
      const errStr = String(errMsg || '未知错误');
      panelResultText.textContent = `出错: ${errStr}`;
      panelResultText.classList.add('error');

      // 弱提醒：若当前引擎对目标语言不支持或受限，给予友好提示
      if (errStr.includes('语言') || errStr.includes('lang') || errStr.includes('unsupported') || errStr.includes('Not supported')) {
        showToast('⚠️ 当前引擎对该目标语言支持受限，建议切换为谷歌翻译或 AI 大模型', 'warning', 4500);
      }
    };

    // 优先通过 Chrome 扩展底层通道通信
    getSettings((settings) => {
      const enableBilingual = settings.enableBilingualNotation !== false;
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({
          action: 'translate',
          text: text,
          engine: engine,
          targetLang: targetLang,
          model: modelName,
          context: context,
          persona: currentPersona,
          enableBilingualNotation: enableBilingual
        }, (response) => {
          if (chrome.runtime.lastError) {
            if (isHttpHosted) {
              // 本地 HTTP 托管模式兜底
              fetchLocalTranslate(text, targetLang, context, currentPersona)
                .then(onTranslateSuccess)
                .catch(e => onTranslateError(e.message));
            } else {
              onTranslateError(chrome.runtime.lastError.message);
            }
            return;
          }

          if (!response) {
            onTranslateError('翻译超时或服务未响应');
            return;
          }

          if (response.success) {
            onTranslateSuccess(response.translation);
          } else {
            onTranslateError(response.error);
          }
        });
      } else if (isHttpHosted) {
        // 本地独立 HTTP 服务模式直接请求后端 API
        fetchLocalTranslate(text, targetLang, context, currentPersona)
          .then(onTranslateSuccess)
          .catch(e => onTranslateError(e.message));
      } else {
        onTranslateError('翻译服务通道不可用');
      }
    });
  }

  floatIcon.addEventListener('click', (e) => {
    e.stopPropagation();
    const x = parseFloat(floatIcon.style.left);
    const y = parseFloat(floatIcon.style.top);
    getSettings((settings) => {
      const { effectiveEngine, effectiveTargetLang } = getEffectiveTranslateConfig(settings);
      showPanel(x, y, currentSelectedText, effectiveEngine, effectiveTargetLang, currentSelectionContext);
    });
  });

  // 面板关闭按钮
  panelCloseBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    hidePanel();
  });

  // 浮窗固定按键
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
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
          chrome.storage.local.set({ enableBilingualNotation: nextVal }, () => {
            panelBilingualBtn.classList.toggle('active', nextVal);
            panelBilingualBtn.title = nextVal ? '专有名词双语备注：开启中（点击切换）' : '专有名词双语备注：已关闭（点击切换）';
            if (currentSelectedText && !translatePanel.classList.contains('hidden')) {
              const activeModel = panelModelSelect ? panelModelSelect.value : '';
              const { effectiveEngine, effectiveTargetLang } = getEffectiveTranslateConfig(settings);
              doTranslation(currentSelectedText, effectiveEngine, effectiveTargetLang, activeModel, currentSelectionContext);
            }
          });
        }
      });
    });
  }

  // 监听 storage 变更，同步浮窗开关状态
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener((changes) => {
      if (changes.enableBilingualNotation && panelBilingualBtn) {
        const isBilingual = changes.enableBilingualNotation.newValue !== false;
        panelBilingualBtn.classList.toggle('active', isBilingual);
        panelBilingualBtn.title = isBilingual ? '专有名词双语备注：开启中（点击切换）' : '专有名词双语备注：已关闭（点击切换）';
      }
    });
  }

  // Escape 键快捷关闭浮层
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (translatePanel.classList.contains('show')) {
        hidePanel();
      }
      if (!floatIcon.classList.contains('hidden')) {
        hideIcon();
      }
    }
  });

  // 复制译文
  copyResBtn.addEventListener('click', () => {
    const text = panelResultText.textContent;
    if (text && !panelResultText.classList.contains('error')) {
      navigator.clipboard.writeText(text).then(() => {
        copyResBtn.style.color = '#34c759';
        setTimeout(() => {
          copyResBtn.style.color = '';
        }, 1500);
      }).catch(err => {
        showToast('复制失败: ' + err.message);
      });
    }
  });

  panelEngineSelect.addEventListener('change', () => {
    const engine = panelEngineSelect.value;
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    // 双向联动：同步更新顶部工具栏中的引擎设置
    if (pdfTranslateEngine && pdfTranslateEngine.value !== engine) {
      pdfTranslateEngine.value = engine;
      chrome.storage.local.set({ pdfTranslateEngine: engine });
      updateToolbarModelSelect(engine);
    }
    updateModelSelect(engine, () => {
      const activeModel = panelModelSelect.value;
      doTranslation(currentSelectedText, engine, getActiveTargetLang(), activeModel, currentSelectionContext);
    });
  });

  panelModelSelect.addEventListener('change', () => {
    const engine = panelEngineSelect.value;
    const model = panelModelSelect.value;
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    // 双向联动：同步更新顶部工具栏中的模型设置
    if (pdfTranslateModel && pdfTranslateModel.value !== model) {
      pdfTranslateModel.value = model;
    }
    const storageKey = `${engine}ActiveModel`;
    chrome.storage.local.set({ [storageKey]: model });
    doTranslation(currentSelectedText, engine, getActiveTargetLang(), model, currentSelectionContext);
  });

  // 弹窗面板拖拽 (修复 fixed 视口坐标偏移与边界吸附限制)
  dragHandle.addEventListener('mousedown', (e) => {
    if (e.target.closest('.panel-actions')) return;
    isDragging = true;
    const rect = translatePanel.getBoundingClientRect();
    dragOffset.x = e.clientX - rect.left;
    dragOffset.y = e.clientY - rect.top;
    document.body.style.cursor = 'move';
    e.preventDefault();
  });

  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    const panelWidth = translatePanel.offsetWidth || 360;
    const panelHeight = translatePanel.offsetHeight || 220;
    const rawX = e.clientX - dragOffset.x;
    const rawY = e.clientY - dragOffset.y;
    const safeX = Math.max(8, Math.min(rawX, window.innerWidth - panelWidth - 8));
    const safeY = Math.max(8, Math.min(rawY, window.innerHeight - panelHeight - 8));
    translatePanel.style.left = `${safeX}px`;
    translatePanel.style.top = `${safeY}px`;
  });

  document.addEventListener('mouseup', () => {
    if (isDragging) {
      isDragging = false;
      document.body.style.cursor = '';
    }
  });

  // --- PDF.js 核心渲染逻辑 ---

  // 从 URL 获取并加载 PDF
  const urlParams = new URLSearchParams(window.location.search);
  const fileUrl = urlParams.get('file');
  if (fileUrl) {
    loadingOverlay.classList.remove('hidden');
    loadingStatus.textContent = '正在获取网络 PDF 文件...';
    
    fetch(fileUrl)
      .then(res => {
        if (!res.ok) throw new Error(`HTTP 错误: ${res.status}`);
        return res.arrayBuffer();
      })
      .then(buffer => {
        pdfDataBuffer = new Uint8Array(buffer);
        pdfFileName = decodeURIComponent(fileUrl.substring(fileUrl.lastIndexOf('/') + 1));
        loadPdf(pdfDataBuffer, pdfFileName);
      })
      .catch(err => {
        console.error(err);
        loadingOverlay.classList.add('hidden');
        alert('读取 PDF 链接失败: ' + err.message);
      });
  }

  // 本地文件拖拽
  viewerMain.addEventListener('dragover', (e) => {
    e.preventDefault();
    viewerMain.style.background = 'rgba(0, 122, 255, 0.04)';
  });

  viewerMain.addEventListener('dragleave', () => {
    viewerMain.style.background = '';
  });

  viewerMain.addEventListener('drop', (e) => {
    e.preventDefault();
    viewerMain.style.background = '';
    const file = e.dataTransfer.files[0];
    if (file && file.type === 'application/pdf') {
      requestOpenFile(file);
    }
  });

  // 本地选择打开 PDF
  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      requestOpenFile(file);
    }
  });

  if (welcomeFileInput) {
    welcomeFileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        requestOpenFile(file);
      }
    });
  }

  function readLocalFile(file) {
    loadingOverlay.classList.remove('hidden');
    loadingStatus.textContent = '正在解析本地 PDF 文件...';
    
    const fileReader = new FileReader();
    fileReader.onload = function() {
      pdfDataBuffer = new Uint8Array(this.result);
      pdfFileName = file.name;
      loadPdf(pdfDataBuffer, pdfFileName, { lastModified: file.lastModified, size: file.size });
    };
    fileReader.readAsArrayBuffer(file);
  }


  // --- PDF 本地离线持久化存储引擎 (IndexedDB v2) 与抗碰撞指纹算法已模块化迁移至 src/doc_storage.js ---

  // --- PDF.js 核心虚拟化渲染架构 (IntersectionObserver 视口按需挂载) ---
  let pageObserver = null;
  const renderedPages = new Map(); // pageNum -> { isRendered, isRendering, canvas }

  // 加载 PDF 数据并初始化占位 DOM
  async function loadPdf(data, title, fileMeta = null) {
    pdfTitle.textContent = title;
    viewerContainer.innerHTML = '';
    viewerContainer.classList.remove('hidden');
    welcomeScreen.classList.add('hidden');
    loadingOverlay.classList.remove('hidden');
    loadingStatus.textContent = '正在解析文档结构...';

    if (pageObserver) {
      pageObserver.disconnect();
      pageObserver = null;
    }
    renderedPages.clear();

    // 切换文档时清空上一份文档的全部页级状态，防止译文/批注/检索索引串档
    if (activeTranslateController) activeTranslateController.aborted = true;
    pageTranslations.clear();
    pageDrawings.clear();
    pageTextIndexCache.clear();
    resetSearchState();
    markNotesSaved();
    if (draftRecoveryBanner) draftRecoveryBanner.classList.add('hidden');
    activeDraftData = null;

    const renderId = ++currentRenderId;

    try {
      const loadingTask = pdfjsLib.getDocument({ data: data });
      currentPdf = await loadingTask.promise;
      if (renderId !== currentRenderId) return;

      currentDocId = getPdfFingerprint(currentPdf, data, title || pdfFileName, fileMeta);
      DocStorage.touchDocMeta(currentDocId, {
        title: title || pdfFileName,
        numPages: currentPdf.numPages,
        fileSize: (data.byteLength || data.length || 0)
      });

      // 异步读取本地历史持久化缓存 (批注与译文)，刷新页面后 0 延迟秒级自动还原
      DocStorage.loadDocCache(currentDocId).then(async (cached) => {
        let restoredCount = 0;
        if (cached.translations && cached.translations.size > 0) {
          cached.translations.forEach((blocks, p) => {
            pageTranslations.set(p, blocks);
            updateThumbnailStatus(p);
          });
          restoredCount += cached.translations.size;
          // 若当前可见页已有历史译文，立即渲染右侧对照舞台
          if (pageTranslations.has(currentPage)) {
            renderTransStageForPage(currentPage);
          }
          if (currentViewMode === 'flow') {
            renderBilingualReaderFlow();
          }
        }
        if (cached.drawings && cached.drawings.size > 0) {
          cached.drawings.forEach((strokes, p) => {
            pageDrawings.set(p, strokes);
          });
          // 刷新当前可见页批注画布
          refreshPageAnnotationCanvas(currentPage);
        }
        if (restoredCount > 0 || (cached.drawings && cached.drawings.size > 0)) {
          showToast(`已从本地自动恢复历史记录 (${cached.translations.size} 页译文，${cached.drawings.size} 页批注)`);
        }
        updateTranslateDocButtonState();
        markNotesSaved();

        // 探测未正常持久化的崩溃 / 断电草稿快照
        try {
          const draft = await DocStorage.loadDraft(currentDocId);
          if (draft && draft.timestamp > (cached.lastSavedAt || 0) && draft.drawings && draft.drawings.size > 0) {
            activeDraftData = draft;
            if (draftRecoveryBanner && draftBannerDesc) {
              const draftTimeStr = new Date(draft.timestamp).toLocaleTimeString();
              draftBannerDesc.textContent = `检测到该文献在 ${draftTimeStr} 有未正常保存的手绘批注草稿快照（共 ${draft.drawings.size} 页）。是否立即恢复？`;
              draftRecoveryBanner.classList.remove('hidden');
            }
          } else {
            if (draftRecoveryBanner) draftRecoveryBanner.classList.add('hidden');
            activeDraftData = null;
          }
        } catch (e) {
          console.warn('探测草稿快照异常:', e);
        }
      });

      currentPage = 1;
      pageNumInput.value = currentPage;
      pageCountSpan.textContent = currentPdf.numPages;

      prevPageBtn.disabled = false;
      nextPageBtn.disabled = false;
      if (translatePageBtn) translatePageBtn.disabled = false;
      if (translateDocBtn) translateDocBtn.disabled = false;
      if (translateRangeBtn) translateRangeBtn.disabled = false;
      if (summarizeDocBtn) summarizeDocBtn.disabled = false;
      updateSaveButtonState();

      // 提取第 1 页基准比例，预计算所有页面的骨架占位
      const firstPage = await currentPdf.getPage(1);
      const firstViewport = firstPage.getViewport({ scale: currentScale });
      const defaultW = Math.round(firstViewport.width);
      const defaultH = Math.round(firstViewport.height);

      // 高效批量创建左侧原文与右侧译文对称占位（双栏 1:1 同步滚动与绝对排版对齐）
      const fragment = document.createDocumentFragment();
      const fragmentTrans = document.createDocumentFragment();

      for (let i = 1; i <= currentPdf.numPages; i++) {
        // 左侧原文容器
        const pageContainer = document.createElement('div');
        pageContainer.id = `page-container-${i}`;
        pageContainer.className = 'page-container pdf-page-container is-unloaded';
        pageContainer.dataset.pageNum = i;
        pageContainer.style.width = `${defaultW}px`;
        pageContainer.style.height = `${defaultH}px`;
        pageContainer.innerHTML = `<div class="page-skeleton"><span class="page-skeleton-badge">第 ${i} 页 原文</span></div>`;
        fragment.appendChild(pageContainer);

        // 右侧译文容器（1:1 对称槽位）
        const transContainer = document.createElement('div');
        transContainer.id = `page-trans-container-${i}`;
        transContainer.className = 'page-container pdf-page-container trans-page-container is-unloaded';
        transContainer.dataset.pageNum = i;
        transContainer.style.width = `${defaultW}px`;
        transContainer.style.height = `${defaultH}px`;
        transContainer.innerHTML = `<div class="page-skeleton"><span class="page-skeleton-badge">第 ${i} 页 译文</span></div>`;
        fragmentTrans.appendChild(transContainer);
      }
      viewerContainer.appendChild(fragment);

      if (viewerContainerTrans) {
        viewerContainerTrans.innerHTML = '';
        viewerContainerTrans.appendChild(fragmentTrans);
        renderTransStageForPage(currentPage);
      }

      // 还原沉浸式翻译：异步懒加载生成左侧页面缩略图导航抽屉
      generateThumbnails(currentPdf);

      // 创建视口按需加载 Observer (上下扩展 400px 缓冲带)
      setupVirtualObserver(renderId);
      setupScrollSpy();
    } catch (err) {
      if (renderId === currentRenderId) {
        console.error(err);
        alert('解析 PDF 失败：' + err.message);
      }
    } finally {
      if (renderId === currentRenderId) {
        loadingOverlay.classList.add('hidden');
      }
    }
  }

  // 高清屏 / Windows 150% 屏幕缩放物理像素比安全获取函数 (上限限制 3x 兼顾极速与低显存)
  function getOutputScale() {
    return Math.max(1, Math.min(window.devicePixelRatio || 1, 3));
  }

  // --- 缩略图生成器 (异步懒加载) ---
  let thumbnailObserver = null;
  function generateThumbnails(pdf) {
    if (!sidebarThumbnailsList) return;
    sidebarThumbnailsList.innerHTML = '';
    if (sidebarPageCount) sidebarPageCount.textContent = `${pdf.numPages} 页`;

    if (thumbnailObserver) {
      thumbnailObserver.disconnect();
      thumbnailObserver = null;
    }

    const fragment = document.createDocumentFragment();

    for (let i = 1; i <= pdf.numPages; i++) {
      const card = document.createElement('div');
      card.className = `thumb-card ${i === currentPage ? 'active' : ''}`;
      card.dataset.pageNum = i;

      const canvas = document.createElement('canvas');
      canvas.id = `thumb-canvas-${i}`;

      const label = document.createElement('span');
      label.className = 'thumb-label';
      label.textContent = `${i}`;

      const badge = document.createElement('span');
      badge.id = `thumb-badge-${i}`;
      const isDone = pageTranslations.has(i) && pageTranslations.get(i).length > 0 && pageTranslations.get(i).some(b => b.transText);
      badge.className = `thumb-badge ${isDone ? '' : 'hidden'}`;
      badge.textContent = '✓';

      card.appendChild(canvas);
      card.appendChild(label);
      card.appendChild(badge);

      card.addEventListener('click', () => {
        scrollToPage(i);
      });

      fragment.appendChild(card);
    }

    sidebarThumbnailsList.appendChild(fragment);

    // 缩略图视口按需绘制 Observer
    thumbnailObserver = new IntersectionObserver((entries) => {
      entries.forEach(async (entry) => {
        if (entry.isIntersecting) {
          const card = entry.target;
          thumbnailObserver.unobserve(card);
          const pNum = parseInt(card.dataset.pageNum, 10);
          try {
            const page = await pdf.getPage(pNum);
            const vp = page.getViewport({ scale: 0.22 });
            const canvas = card.querySelector('canvas');
            if (canvas) {
              const outScale = Math.min(getOutputScale(), 2);
              canvas.width = Math.floor(vp.width * outScale);
              canvas.height = Math.floor(vp.height * outScale);
              canvas.style.width = `${Math.floor(vp.width)}px`;
              canvas.style.height = `${Math.floor(vp.height)}px`;
              const ctx = canvas.getContext('2d');
              const transform = outScale !== 1 ? [outScale, 0, 0, outScale, 0, 0] : null;
              await page.render({ canvasContext: ctx, transform, viewport: vp }).promise;
            }
          } catch (e) {
            console.warn(`缩略图第 ${pNum} 页渲染跳过:`, e);
          }
        }
      });
    }, {
      root: viewerSidebar,
      rootMargin: '250px'
    });

    sidebarThumbnailsList.querySelectorAll('.thumb-card').forEach(card => {
      thumbnailObserver.observe(card);
    });
  }

  function updateActiveThumbnail(pageNum) {
    if (!sidebarThumbnailsList) return;
    const cards = sidebarThumbnailsList.querySelectorAll('.thumb-card');
    cards.forEach(c => {
      const p = parseInt(c.dataset.pageNum, 10);
      c.classList.toggle('active', p === pageNum);
    });
  }

  function updateThumbnailStatus(pageNum) {
    if (!sidebarThumbnailsList) return;
    const badge = document.getElementById(`thumb-badge-${pageNum}`);
    if (badge) {
      const cached = pageTranslations.get(pageNum);
      const isDone = cached && cached.length > 0 && cached.some(b => b.transText);
      badge.classList.toggle('hidden', !isDone);
    }
    updateTranslateDocButtonState();
  }

  // 虚拟化视口监听器：进入视口挂载渲染，移出视口彻底销毁 Canvas 回收显存
  // 虚拟化视口监听器：进入视口挂载渲染，移出视口彻底销毁 Canvas 回收显存
  function setupVirtualObserver(renderId) {
    if (pageObserver) pageObserver.disconnect();

    pageObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        const pageNum = parseInt(entry.target.dataset.pageNum, 10);
        if (entry.isIntersecting) {
          mountPage(pageNum, renderId);
        } else {
          unmountPage(pageNum);
        }
      });
    }, {
      root: viewerMain,
      rootMargin: '600px 0px', // 上下缓冲一页，平滑滚屏无白屏闪烁
      threshold: 0
    });

    const pages = viewerContainer.querySelectorAll('.page-container');
    pages.forEach(p => pageObserver.observe(p));
  }

  // 页面阅读位置追踪与页码同步 (精准捕获主视口真实滚动位置)
  function setupScrollSpy() {
    if (!viewerMain) return;
    let ticking = false;

    viewerMain.addEventListener('scroll', () => {
      if (!currentPdf || ticking) return;
      ticking = true;

      requestAnimationFrame(() => {
        ticking = false;
        const pages = viewerContainer.querySelectorAll('.page-container');
        if (pages.length === 0) return;

        const mainRect = viewerMain.getBoundingClientRect();
        // 视口锚定线：顶部向下 80px
        const targetLine = mainRect.top + 80;

        let closestPage = currentPage;
        let minDistance = Infinity;

        pages.forEach(p => {
          const rect = p.getBoundingClientRect();
          if (rect.top <= targetLine && rect.bottom >= targetLine) {
            closestPage = parseInt(p.dataset.pageNum, 10);
            minDistance = 0;
          } else {
            const dist = Math.abs(rect.top - targetLine);
            if (dist < minDistance) {
              minDistance = dist;
              closestPage = parseInt(p.dataset.pageNum, 10);
            }
          }
        });

        if (closestPage !== currentPage) {
          currentPage = closestPage;
          if (pageNumInput) pageNumInput.value = currentPage;
          updatePaginationButtons();
          updateActiveThumbnail(currentPage);

          // 更新状态指示徽章
          if (pageTranslations.has(currentPage) && pageTranslations.get(currentPage).length > 0) {
            if (transActiveBadge) transActiveBadge.textContent = `已翻译 (第 ${currentPage} 页)`;
          } else {
            if (transActiveBadge) transActiveBadge.textContent = `第 ${currentPage} 页 (未翻译)`;
          }

          // 保持右侧双语对照联动
          if (translationPane && !translationPane.classList.contains('hidden')) {
            renderTransStageForPage(currentPage);
          }
        }
      });
    }, { passive: true });
  }

  function updatePaginationButtons() {
    if (!currentPdf) return;
    if (prevPageBtn) prevPageBtn.disabled = (currentPage <= 1);
    if (nextPageBtn) nextPageBtn.disabled = (currentPage >= currentPdf.numPages);
  }

  function scrollToPage(pageNum) {
    if (!currentPdf) return;
    const clamped = Math.max(1, Math.min(pageNum, currentPdf.numPages));
    currentPage = clamped;
    if (pageNumInput) pageNumInput.value = currentPage;
    updatePaginationButtons();
    updateActiveThumbnail(currentPage);

    const targetLeft = viewerContainer.querySelector(`.page-container[data-page-num="${currentPage}"]`);
    if (targetLeft && viewerMain) {
      // 安全容器内平滑滚动，绝不触发 window / document 级偏移，保障顶栏坚如磐石
      const targetOffsetTop = targetLeft.offsetTop;
      viewerMain.scrollTo({
        top: Math.max(0, targetOffsetTop - 16),
        behavior: 'smooth'
      });
    }
    if (translationPane && !translationPane.classList.contains('hidden')) {
      renderTransStageForPage(currentPage);
    }
  }

  // 右侧 1:1 对称槽位页面渲染引擎
  let currentTransStageRenderTask = null;

  async function renderTransStageForPage(pageNum) {
    if (!viewerContainerTrans || !currentPdf) return null;
    const targetPageNum = Math.max(1, Math.min(pageNum || currentPage, currentPdf.numPages));

    let stageContainer = viewerContainerTrans.querySelector(`.page-container[data-page-num="${targetPageNum}"]`);
    if (!stageContainer) {
      stageContainer = document.createElement('div');
      stageContainer.id = `page-trans-container-${targetPageNum}`;
      stageContainer.className = 'page-container pdf-page-container trans-page-container is-unloaded';
      stageContainer.dataset.pageNum = targetPageNum;
      viewerContainerTrans.appendChild(stageContainer);
    }

    stageContainer.dataset.pageNum = targetPageNum;

    // 更新状态指示
    const hasTrans = pageTranslations.has(targetPageNum) && pageTranslations.get(targetPageNum).length > 0;
    if (targetPageNum === currentPage && transActiveBadge) {
      if (hasTrans) {
        transActiveBadge.textContent = `已翻译 (第 ${targetPageNum} 页)`;
      } else {
        transActiveBadge.textContent = `第 ${targetPageNum} 页 (未翻译)`;
      }
    }

    try {
      const page = await currentPdf.getPage(targetPageNum);
      const viewport = page.getViewport({ scale: currentScale });
      const wPx = Math.round(viewport.width);
      const hPx = Math.round(viewport.height);
      const outputScale = getOutputScale();

      stageContainer.style.width = `${wPx}px`;
      stageContainer.style.height = `${hPx}px`;

      let canvas = stageContainer.querySelector('canvas');
      if (!canvas) {
        stageContainer.innerHTML = '';
        canvas = document.createElement('canvas');
        stageContainer.appendChild(canvas);
      }
      canvas.width = Math.floor(wPx * outputScale);
      canvas.height = Math.floor(hPx * outputScale);
      canvas.style.width = `${wPx}px`;
      canvas.style.height = `${hPx}px`;
      const ctx = canvas.getContext('2d');

      // 极速硬件加速：优先复用左侧已渲染 Canvas 图像（0延迟、无闪烁）
      const leftContainer = viewerContainer.querySelector(`.page-container[data-page-num="${targetPageNum}"]`);
      const leftCanvas = leftContainer ? leftContainer.querySelector('canvas') : null;
      if (leftCanvas && leftCanvas.width === canvas.width && leftCanvas.height === canvas.height) {
        ctx.drawImage(leftCanvas, 0, 0);
      } else {
        if (currentTransStageRenderTask) {
          try { currentTransStageRenderTask.cancel(); } catch(e){}
        }
        const transform = outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : null;
        currentTransStageRenderTask = page.render({ canvasContext: ctx, transform, viewport });
        await currentTransStageRenderTask.promise;
        currentTransStageRenderTask = null;
      }

      stageContainer.classList.remove('is-unloaded');

      let overlayLayer = stageContainer.querySelector('.trans-overlay-layer');
      if (!overlayLayer) {
        overlayLayer = document.createElement('div');
        overlayLayer.className = 'trans-overlay-layer';
        stageContainer.appendChild(overlayLayer);
      }

      // 存在译文缓存时直接重绘原排版覆盖译文块
      if (hasTrans) {
        const blocks = pageTranslations.get(targetPageNum);
        renderOverlayBlocksOnLayer(overlayLayer, blocks, page.getViewport({ scale: 1.0 }).height, currentScale, canvas);
      } else {
        overlayLayer.innerHTML = '';
      }

      return { stageContainer, canvas, overlayLayer, page, viewport };
    } catch (err) {
      if (err && err.name === 'RenderingCancelledException') return null;
      console.error(`渲染第 ${targetPageNum} 页舞台失败:`, err);
      return null;
    }
  }

  // --- 画笔批注涂鸦引擎 (Annotation Canvas Engine) ---
  function drawSingleStroke(ctx, stroke, cw, ch) {
    if (!stroke || !stroke.points || stroke.points.length === 0) return;
    const isHighlighter = (stroke.tool === 'highlighter');
    ctx.save();
    ctx.beginPath();
    if (isHighlighter) {
      ctx.globalCompositeOperation = 'multiply';
    }
    ctx.strokeStyle = stroke.color || (isHighlighter ? '#FFF176' : '#0078D4');
    ctx.globalAlpha = isHighlighter ? (stroke.opacity !== undefined ? stroke.opacity : currentHighlighterOpacity) : 1.0;
    const dpr = getOutputScale();
    ctx.lineWidth = (stroke.baseWidth || (isHighlighter ? 16 : 3)) * (currentScale || 1.0) * dpr;
    ctx.lineCap = isHighlighter ? 'square' : 'round';
    ctx.lineJoin = 'round';

    const firstX = stroke.points[0].nx !== undefined ? stroke.points[0].nx * cw : stroke.points[0].x * dpr;
    const firstY = stroke.points[0].ny !== undefined ? stroke.points[0].ny * ch : stroke.points[0].y * dpr;
    ctx.moveTo(firstX, firstY);

    if (stroke.points.length === 1) {
      ctx.lineTo(firstX + 0.2, firstY);
    } else {
      for (let i = 1; i < stroke.points.length; i++) {
        const px = stroke.points[i].nx !== undefined ? stroke.points[i].nx * cw : stroke.points[i].x * dpr;
        const py = stroke.points[i].ny !== undefined ? stroke.points[i].ny * ch : stroke.points[i].y * dpr;
        ctx.lineTo(px, py);
      }
    }
    ctx.stroke();
    ctx.restore();
  }

  function redrawPageAnnotations(pageNum, canvas) {
    const strokes = pageDrawings.get(pageNum);
    if (!strokes || strokes.length === 0) return;
    const ctx = canvas.getContext('2d');
    const cw = canvas.width;
    const ch = canvas.height;
    strokes.forEach(stroke => {
      drawSingleStroke(ctx, stroke, cw, ch);
    });
  }

  // 点到线段距离平方计算 (几何碰撞检测)
  function distToSegmentSquared(p, v, w) {
    const l2 = (v.x - w.x) * (v.x - w.x) + (v.y - w.y) * (v.y - w.y);
    if (l2 === 0) return (p.x - v.x) * (p.x - v.x) + (p.y - v.y) * (p.y - v.y);
    let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
    t = Math.max(0, Math.min(1, t));
    const projX = v.x + t * (w.x - v.x);
    const projY = v.y + t * (w.y - v.y);
    return (p.x - projX) * (p.x - projX) + (p.y - projY) * (p.y - projY);
  }

  // 判断触点是否碰撞命中笔画 (用于整笔橡皮擦)
  function isPointHitStroke(pt, stroke, cw, ch) {
    if (!stroke.points || stroke.points.length === 0) return false;
    const dpr = getOutputScale();
    const strokeWidth = (stroke.baseWidth || 3) * (currentScale || 1.0) * dpr;
    const tolerance = Math.max(12 * dpr, strokeWidth / 2 + 10 * dpr);
    const tol2 = tolerance * tolerance;

    for (let i = 0; i < stroke.points.length - 1; i++) {
      const p1 = { x: stroke.points[i].nx !== undefined ? stroke.points[i].nx * cw : stroke.points[i].x, y: stroke.points[i].ny !== undefined ? stroke.points[i].ny * ch : stroke.points[i].y };
      const p2 = { x: stroke.points[i + 1].nx !== undefined ? stroke.points[i + 1].nx * cw : stroke.points[i + 1].x, y: stroke.points[i + 1].ny !== undefined ? stroke.points[i + 1].ny * ch : stroke.points[i + 1].y };
      if (distToSegmentSquared(pt, p1, p2) <= tol2) {
        return true;
      }
    }
    if (stroke.points.length === 1) {
      const p = { x: stroke.points[0].nx !== undefined ? stroke.points[0].nx * cw : stroke.points[0].x, y: stroke.points[0].ny !== undefined ? stroke.points[0].ny * ch : stroke.points[0].y };
      const d2 = (pt.x - p.x) * (pt.x - p.x) + (pt.y - p.y) * (pt.y - p.y);
      if (d2 <= tol2) return true;
    }
    return false;
  }

  function setupAnnotationDrawing(canvas, pageNum) {
    let drawing = false;
    let currentStroke = null;
    let eraserModified = false;
    const ctx = canvas.getContext('2d');

    const toCanvasPoint = (e) => {
      const rect = canvas.getBoundingClientRect();
      const x = (e.clientX - rect.left) * (canvas.width / rect.width);
      const y = (e.clientY - rect.top) * (canvas.height / rect.height);
      return { x, y, nx: x / canvas.width, ny: y / canvas.height };
    };

    // 橡皮擦碰撞擦除逻辑
    const eraseAtPoint = (pt) => {
      const strokes = pageDrawings.get(pageNum);
      if (!strokes || strokes.length === 0) return;
      let hitIdx = -1;
      for (let i = strokes.length - 1; i >= 0; i--) {
        if (isPointHitStroke(pt, strokes[i], canvas.width, canvas.height)) {
          hitIdx = i;
          break;
        }
      }
      if (hitIdx !== -1) {
        strokes.splice(hitIdx, 1);
        eraserModified = true;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        redrawPageAnnotations(pageNum, canvas);
      }
    };

    canvas.addEventListener('pointerdown', (e) => {
      if (!isDrawMode || e.button !== 0) return;
      e.preventDefault();
      drawing = true;
      eraserModified = false;
      try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* 忽略旧环境 */ }
      const pt = toCanvasPoint(e);

      if (currentTool === 'eraser') {
        eraseAtPoint(pt);
        return;
      }

      const isHighlighter = (currentTool === 'highlighter');
      currentStroke = {
        tool: currentTool,
        color: isHighlighter ? currentHighlighterColor : currentPenColor,
        baseWidth: isHighlighter ? currentHighlighterWidth : currentPenWidth,
        opacity: isHighlighter ? currentHighlighterOpacity : 1.0,
        points: [pt]
      };

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      redrawPageAnnotations(pageNum, canvas);
      drawSingleStroke(ctx, currentStroke, canvas.width, canvas.height);
    });

    canvas.addEventListener('pointermove', (e) => {
      if (!drawing || !isDrawMode) return;
      const pt = toCanvasPoint(e);

      if (currentTool === 'eraser') {
        eraseAtPoint(pt);
        return;
      }

      if (!currentStroke) return;
      currentStroke.points.push(pt);

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      redrawPageAnnotations(pageNum, canvas);
      drawSingleStroke(ctx, currentStroke, canvas.width, canvas.height);
    });

    const finishStroke = () => {
      if (!drawing) return;
      drawing = false;

      if (currentTool === 'eraser') {
        if (eraserModified && currentDocId) {
          markNotesDirty();
        }
        return;
      }

      if (currentStroke && currentStroke.points.length >= 1) {
        if (currentStroke.points.length === 1) {
          const pt = currentStroke.points[0];
          currentStroke.points.push({ ...pt, x: pt.x + 0.2, nx: (pt.x + 0.2) / (canvas.width || 1) });
        }
        if (!pageDrawings.has(pageNum)) {
          pageDrawings.set(pageNum, []);
        }
        pageDrawings.get(pageNum).push(currentStroke);
        markNotesDirty();
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        redrawPageAnnotations(pageNum, canvas);
      }
      currentStroke = null;
    };

    canvas.addEventListener('pointerup', finishStroke);
    canvas.addEventListener('pointercancel', finishStroke);
  }

  // 视口内挂载页面 (渲染左侧原文 Canvas、文本层与批注层)
  async function mountPage(pageNum, renderId) {
    if (renderId && renderId !== currentRenderId) return;
    const pageState = renderedPages.get(pageNum);
    if (pageState && (pageState.isRendered || pageState.isRendering)) {
      return;
    }

    renderedPages.set(pageNum, { isRendering: true, isRendered: false });
    const pageContainer = viewerContainer.querySelector(`.page-container[data-page-num="${pageNum}"]`);
    if (!pageContainer) return;

    try {
      const page = await currentPdf.getPage(pageNum);
      if (renderId && renderId !== currentRenderId) return;

      const viewport = page.getViewport({ scale: currentScale });
      const wPx = Math.round(viewport.width);
      const hPx = Math.round(viewport.height);
      const outputScale = getOutputScale();

      pageContainer.style.width = `${wPx}px`;
      pageContainer.style.height = `${hPx}px`;

      const canvas = document.createElement('canvas');
      canvas.width = Math.floor(wPx * outputScale);
      canvas.height = Math.floor(hPx * outputScale);
      canvas.style.width = `${wPx}px`;
      canvas.style.height = `${hPx}px`;
      const context = canvas.getContext('2d');

      const transform = outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : null;
      await page.render({ canvasContext: context, transform: transform, viewport: viewport }).promise;
      if (renderId && renderId !== currentRenderId) return;

      // 文本选择层构建
      const textContent = await page.getTextContent();
      if (renderId && renderId !== currentRenderId) return;

      const textLayerDiv = document.createElement('div');
      textLayerDiv.className = 'textLayer';
      textLayerDiv.style.width = `${wPx}px`;
      textLayerDiv.style.height = `${hPx}px`;
      textLayerDiv.style.setProperty('--scale-factor', viewport.scale);

      const textLayer = new pdfjsLib.TextLayer({
        textContentSource: textContent,
        container: textLayerDiv,
        viewport: viewport
      });
      await textLayer.render();
      if (renderId && renderId !== currentRenderId) return;

      // 组装并移除骨架占位
      pageContainer.innerHTML = '';
      pageContainer.classList.remove('is-unloaded');
      pageContainer.appendChild(canvas);
      pageContainer.appendChild(textLayerDiv);

      // 挂载画笔批注 Canvas 图层
      const annotCanvas = document.createElement('canvas');
      annotCanvas.className = 'annotation-canvas';
      annotCanvas.width = Math.floor(wPx * outputScale);
      annotCanvas.height = Math.floor(hPx * outputScale);
      annotCanvas.style.width = `${wPx}px`;
      annotCanvas.style.height = `${hPx}px`;
      annotCanvas.dataset.pageNum = pageNum;
      pageContainer.appendChild(annotCanvas);
      redrawPageAnnotations(pageNum, annotCanvas);
      setupAnnotationDrawing(annotCanvas, pageNum);

      renderedPages.set(pageNum, { isRendering: false, isRendered: true, canvas: canvas, annotCanvas: annotCanvas });

      // 若当前页处于活跃检索状态，即时高亮匹配
      if (pageNum === currentPage && searchMatchesList && searchMatchesList.length > 0) {
        highlightMatchesOnCurrentPage();
      }

      // 若右侧处于显示态且该页已翻译或恰好是活动页，同步渲染右侧对称页
      if (translationPane && !translationPane.classList.contains('hidden')) {
        if (pageTranslations.has(pageNum) || pageNum === currentPage) {
          renderTransStageForPage(pageNum);
        }
      }
    } catch (e) {
      console.error(e);
      renderedPages.delete(pageNum);
    }
  }

  // 移出视口卸载回收显存 (保持双栏对称轻量)
  function unmountPage(pageNum) {
    if (pageNum === currentPage) return;

    const pageState = renderedPages.get(pageNum);
    if (!pageState || !pageState.isRendered) return;

    const pageContainer = viewerContainer.querySelector(`.page-container[data-page-num="${pageNum}"]`);
    if (pageContainer) {
      if (pageState.canvas) {
        pageState.canvas.width = 0;
        pageState.canvas.height = 0;
      }
      if (pageState.annotCanvas) {
        pageState.annotCanvas.width = 0;
        pageState.annotCanvas.height = 0;
      }
      pageContainer.innerHTML = `<div class="page-skeleton"><span class="page-skeleton-badge">第 ${pageNum} 页 原文</span></div>`;
      pageContainer.classList.add('is-unloaded');
    }

    // 右侧译文槽位离屏卸载重型 Canvas 回收 GPU 显存（译文数据结构保留在内存中，重返视口 0 延迟复原）
    if (viewerContainerTrans && pageNum !== currentPage) {
      const transContainer = viewerContainerTrans.querySelector(`.page-container[data-page-num="${pageNum}"]`);
      if (transContainer && !transContainer.classList.contains('is-unloaded')) {
        const transCanvas = transContainer.querySelector('canvas');
        if (transCanvas) {
          transCanvas.width = 0;
          transCanvas.height = 0;
        }
        const hasTrans = pageTranslations.has(pageNum);
        transContainer.innerHTML = `<div class="page-skeleton"><span class="page-skeleton-badge">第 ${pageNum} 页 译文${hasTrans ? ' (已就绪)' : ''}</span></div>`;
        transContainer.classList.add('is-unloaded');
      }
    }

    renderedPages.delete(pageNum);
  }

  // 绑定译文块交互：悬停联动、双击复制、点击对齐左侧原文并弹出光环
  function bindOverlayBlockInteractions(overlayBlock, block, pageNum, pageHeight, scale) {
    overlayBlock.addEventListener('mouseenter', () => {
      overlayBlock.classList.add('highlight-linked');
    });
    overlayBlock.addEventListener('mouseleave', () => {
      overlayBlock.classList.remove('highlight-linked');
    });
    overlayBlock.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      navigator.clipboard.writeText(block.transText);
      const originalBg = overlayBlock.style.background;
      overlayBlock.style.background = '#d1fadf';
      setTimeout(() => { overlayBlock.style.background = originalBg; }, 1000);
      showToast('✓ 译文已复制到剪贴板');
    });
    overlayBlock.addEventListener('click', (e) => {
      e.stopPropagation();
      document.querySelectorAll('.highlight-linked').forEach(el => el.classList.remove('highlight-linked'));
      overlayBlock.classList.add('highlight-linked');

      const pageContainerLeft = viewerContainer.querySelector(`.page-container[data-page-num="${pageNum}"]`);
      if (pageContainerLeft && viewerMain) {
        const targetTop = (pageHeight - block.box.y - block.box.h) * scale;
        const containerTop = pageContainerLeft.offsetTop;
        const targetScrollY = containerTop + targetTop - (viewerMain.clientHeight / 2) + 40;
        viewerMain.scrollTo({ top: Math.max(0, targetScrollY), behavior: 'smooth' });

        let focusBox = pageContainerLeft.querySelector(`.focus-linked-box[data-block-id="${block.id}"]`);
        if (!focusBox) {
          focusBox = document.createElement('div');
          focusBox.className = 'focus-linked-box';
          focusBox.dataset.blockId = block.id;
          focusBox.style.left = `${Math.round(block.box.x * scale)}px`;
          focusBox.style.top = `${Math.round(targetTop)}px`;
          focusBox.style.width = `${Math.max(Math.round(block.box.w * scale), 40)}px`;
          focusBox.style.height = `${Math.max(Math.round(block.box.h * scale), 16)}px`;
          pageContainerLeft.appendChild(focusBox);
        }
        focusBox.classList.remove('active');
        void focusBox.offsetWidth;
        focusBox.classList.add('active');
        setTimeout(() => focusBox.classList.remove('active'), 2500);
      }
    });
  }

  // 采样页面背景基色 (4个角落+顶部边缘采样，兼容暗黑主题与深色幻灯片)
  function getPageDominantBg(canvas) {
    if (!canvas || !canvas.width || !canvas.height) return '#ffffff';
    try {
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      const pts = [
        [15, 15],
        [canvas.width - 15, 15],
        [15, canvas.height - 15],
        [canvas.width - 15, canvas.height - 15],
        [Math.round(canvas.width / 2), 20]
      ];
      for (const [px, py] of pts) {
        const d = ctx.getImageData(Math.max(0, Math.min(canvas.width - 1, px)), Math.max(0, Math.min(canvas.height - 1, py)), 1, 1).data;
        if (d[3] > 120) {
          return `rgb(${d[0]}, ${d[1]}, ${d[2]})`;
        }
      }
    } catch (e) {}
    return '#ffffff';
  }

  // 采样指定包围盒区域的文字前景色与背景色
  function sampleBlockColors(canvas, box, pageHeight, scale) {
    const pageBg = getPageDominantBg(canvas);
    const result = { color: '#1c1c1e', bgColor: pageBg };
    if (!canvas || !canvas.width || !canvas.height) return result;

    try {
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      const cW = canvas.width;
      const cH = canvas.height;

      const canvasOutputScale = (canvas.style && canvas.style.width)
        ? (canvas.width / parseFloat(canvas.style.width))
        : 1;

      const left = Math.round(box.x * scale * canvasOutputScale);
      const top = Math.round((pageHeight - box.y - box.h) * scale * canvasOutputScale);
      const width = Math.round(box.w * scale * canvasOutputScale);
      const height = Math.round(box.h * scale * canvasOutputScale);

      // 1. 围绕包围盒四周多点采样底色 (上、下、左、右)
      const bgCandidates = [
        [left + Math.round(width / 2), top - 3],
        [left - 3, top + Math.round(height / 2)],
        [left + width + 3, top + Math.round(height / 2)],
        [left + Math.round(width / 2), top + height + 3],
        [left + 4, top - 3]
      ];

      for (const [bx, by] of bgCandidates) {
        if (bx >= 0 && bx < cW && by >= 0 && by < cH) {
          const d = ctx.getImageData(bx, by, 1, 1).data;
          if (d[3] > 120) {
            result.bgColor = `rgb(${d[0]}, ${d[1]}, ${d[2]})`;
            break;
          }
        }
      }

      // 解析背景 RGB
      let bgR = 255, bgG = 255, bgB = 255;
      const bgMatch = result.bgColor.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
      if (bgMatch) {
        bgR = parseInt(bgMatch[1], 10);
        bgG = parseInt(bgMatch[2], 10);
        bgB = parseInt(bgMatch[3], 10);
      }

      // 2. 采样文字前景色：在文字框内部采样，寻找对比度最高、具有色彩倾向或最深/最亮色
      const sampleX = Math.max(0, Math.min(cW - 8, left + Math.min(width * 0.2, 16)));
      const sampleY = Math.max(0, Math.min(cH - 8, top + Math.min(height * 0.4, 16)));
      const sampleW = Math.min(32, Math.max(6, Math.round(width * 0.5)));
      const sampleH = Math.min(24, Math.max(6, Math.round(height * 0.5)));

      const imgData = ctx.getImageData(sampleX, sampleY, sampleW, sampleH).data;
      let bestColor = null;
      let maxDist = 0;

      for (let i = 0; i < imgData.length; i += 4) {
        const r = imgData[i];
        const g = imgData[i + 1];
        const b = imgData[i + 2];
        const a = imgData[i + 3];
        if (a < 128) continue;

        const dist = Math.abs(r - bgR) + Math.abs(g - bgG) + Math.abs(b - bgB);
        const colorSpread = Math.max(Math.abs(r - g), Math.abs(r - b), Math.abs(g - b));

        // 强色彩倾向优先（如红、蓝、绿等强调标题色）
        if (colorSpread > 35 && dist > 70) {
          result.color = `rgb(${r}, ${g}, ${b})`;
          return result;
        }

        if (dist > 50 && dist > maxDist) {
          maxDist = dist;
          bestColor = `rgb(${r}, ${g}, ${b})`;
        }
      }

      if (bestColor) {
        result.color = bestColor;
      } else {
        const isDarkBg = (bgR * 299 + bgG * 587 + bgB * 114) / 1000 < 128;
        result.color = isDarkBg ? '#ffffff' : '#1c1c1e';
      }
    } catch (e) {
      console.warn('色彩采样异常:', e);
    }
    return result;
  }

  // 重新绘制并挂载无痕原排版译文块 (底图原生擦除 Inpainting + 1:1 字号/颜色还原 + 智能自适应防重叠)
  function renderOverlayBlocksOnLayer(overlayLayer, blocks, pageHeight, scale, stageCanvas) {
    if (!overlayLayer || !blocks) return;
    overlayLayer.innerHTML = '';
    const pageNum = overlayLayer.parentElement ? parseInt(overlayLayer.parentElement.dataset.pageNum, 10) : currentPage;

    // 1. 如果提供了舞台底图 Canvas，先执行无痕底色擦除 (Inpainting)，抹除原版英文，防止透光重叠
    if (stageCanvas && stageCanvas.getContext && opacityModeIndex !== 2) {
      const ctx = stageCanvas.getContext('2d');
      const canvasOutputScale = (stageCanvas.style && stageCanvas.style.width)
        ? (stageCanvas.width / parseFloat(stageCanvas.style.width))
        : 1;

      ctx.save();
      if (canvasOutputScale && canvasOutputScale !== 1) {
        ctx.scale(canvasOutputScale, canvasOutputScale);
      }

      blocks.forEach(block => {
        if (!block.box || block.type === 'formula' || !block.transText) return;
        const left = Math.round(block.box.x * scale);
        const top = Math.round((pageHeight - block.box.y - block.box.h) * scale);
        const width = Math.round(block.box.w * scale);
        const height = Math.round(block.box.h * scale);

        // 如果用户选择了对比衬底框 (mode-contrast)，则不需要在底图上生硬擦除
        if (opacityModeIndex !== 1) {
          ctx.fillStyle = block.style?.bgColor || '#ffffff';
          // 扩展 2px 覆盖边缘微小抗锯齿及字根外溢
          ctx.fillRect(Math.max(0, left - 2), Math.max(0, top - 2), width + 4, height + 4);
        }
      });
      ctx.restore();
    }

    // 2. 原位挂载排版文本
    blocks.forEach(block => {
      if (!block.box) return;
      if (block.type === 'formula') return; // 公式保持原图渲染
      if (!block.transText) return;

      const overlayBlock = document.createElement('div');
      overlayBlock.className = 'trans-overlay-block';
      if (opacityModeIndex === 1) {
        overlayBlock.classList.add('mode-contrast');
      } else if (opacityModeIndex === 2) {
        overlayBlock.classList.add('mode-clear');
      }
      overlayBlock.dataset.blockId = block.id;

      const left = Math.round(block.box.x * scale);
      const top = Math.round((pageHeight - block.box.y - block.box.h) * scale);
      const width = Math.max(Math.round(block.box.w * scale), 20);
      const minHeight = Math.max(Math.round(block.box.h * scale), 12);

      // 原文字号 1:1 动态还原 (根据实际 PDF 变换矩阵计算的真实物理字号)
      const baseFontSize = block.style?.fontSize ? Math.round(block.style.fontSize * scale) : 13;
      const isBold = block.style?.isBold || false;
      const textColor = (opacityModeIndex === 1) ? '#111827' : (block.style?.color || '#1c1c1e');

      // 自适应弹性微调：根据译文字数与物理框高动态轻微微调字号，严丝合缝绝不挤压溢出下一段
      const textLen = block.transText.length;
      const charW = Math.max(8, baseFontSize * 0.95);
      const charsPerLine = Math.max(1, Math.floor(width / charW));
      const neededLines = Math.ceil(textLen / charsPerLine);
      const targetLineHeight = baseFontSize >= 22 ? 1.2 : (baseFontSize >= 15 ? 1.28 : 1.35);
      const estTotalHeight = neededLines * baseFontSize * targetLineHeight;

      let finalFontSize = baseFontSize;
      if (estTotalHeight > minHeight * 1.25 && minHeight >= 20) {
        finalFontSize = Math.max(9, Math.round(baseFontSize * Math.sqrt(minHeight / estTotalHeight)));
      }

      overlayBlock.style.left = `${left}px`;
      overlayBlock.style.top = `${top}px`;
      overlayBlock.style.width = `${width}px`;
      overlayBlock.style.minHeight = `${minHeight}px`;

      overlayBlock.style.fontSize = `${finalFontSize}px`;
      overlayBlock.style.fontWeight = isBold ? '700' : 'normal';
      overlayBlock.style.color = textColor;
      overlayBlock.style.lineHeight = finalFontSize >= 22 ? '1.2' : (finalFontSize >= 15 ? '1.28' : '1.35');
      if (block.type === 'heading') {
        overlayBlock.style.letterSpacing = '-0.2px';
      }

      overlayBlock.textContent = block.transText;
      overlayBlock.title = `原文: ${block.originalText}\n(双击复制译文，点击联动对齐原文)`;

      bindOverlayBlockInteractions(overlayBlock, block, pageNum, pageHeight, scale);

      overlayLayer.appendChild(overlayBlock);
    });
  }

  // --- 方案 A：沉浸式双语对照流视图核心引擎 (Bilingual Flow Reader Engine) ---
  let flowVirtualObserver = null;

  function createFlowCardsForPage(p, blocks) {
    const fragment = document.createDocumentFragment();
    blocks.forEach(b => {
      if (!b.originalText && !b.transText) return;
      const isFormula = (b.type === 'formula');
      const isHeading = (b.type === 'heading');
      const card = document.createElement('div');
      card.className = `flow-card ${isFormula ? 'is-formula-card' : ''} ${isHeading ? 'heading-card' : ''}`;
      card.dataset.blockId = b.id;
      card.dataset.pageNum = p;

      let badgeClass = 'paragraph';
      let badgeText = '段落';
      if (b.type === 'heading') { badgeClass = 'heading'; badgeText = '章节标题'; }
      else if (b.type === 'caption') { badgeClass = 'caption'; badgeText = '图表说明'; }
      else if (b.type === 'formula') { badgeClass = 'formula'; badgeText = '数学公式'; }
      else if (b.isCrossColumn) { badgeClass = 'cross-col'; badgeText = '跨栏缝合段落'; }

      const header = document.createElement('div');
      header.className = 'flow-card-header';
      header.innerHTML = `
        <span class="flow-card-badge ${badgeClass}">${badgeText}</span>
        <div class="flow-card-tools">
          <button type="button" class="flow-tool-btn btn-copy-trans" title="仅复制中文译文">复制译文</button>
          <button type="button" class="flow-tool-btn btn-copy-both" title="复制英文原文与中文译文">双语复制</button>
          <button type="button" class="flow-tool-btn btn-locate-orig" title="在左侧原版 PDF 中高亮定位此段">📍 定位原文</button>
        </div>
      `;

      const body = document.createElement('div');
      body.className = 'flow-card-body';
      body.innerHTML = `
        <div class="flow-col flow-orig">${escapeHtml(b.originalText)}</div>
        <div class="flow-col flow-trans">${escapeHtml(b.transText || b.originalText)}</div>
      `;

      card.appendChild(header);
      card.appendChild(body);

      // 按钮交互绑定
      const copyTransBtn = card.querySelector('.btn-copy-trans');
      if (copyTransBtn) {
        copyTransBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          navigator.clipboard.writeText(b.transText || b.originalText).then(() => {
            showToast('✓ 译文已复制到剪贴板');
          });
        });
      }

      const copyBothBtn = card.querySelector('.btn-copy-both');
      if (copyBothBtn) {
        copyBothBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          navigator.clipboard.writeText(`${b.originalText}\n\n${b.transText || ''}`).then(() => {
            showToast('✓ 双语对照已复制到剪贴板');
          });
        });
      }

      const locateBtn = card.querySelector('.btn-locate-orig');
      if (locateBtn) {
        locateBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          locateAndHighlightBlockInOriginal(b.pageNum || p, b.box, b.lineBoxes);
        });
      }

      card.addEventListener('click', () => {
        locateAndHighlightBlockInOriginal(b.pageNum || p, b.box, b.lineBoxes);
      });

      fragment.appendChild(card);
    });
    return fragment;
  }

  function renderBilingualReaderFlow() {
    if (!bilingualReaderFlow) return;
    bilingualReaderFlow.innerHTML = '';

    if (flowVirtualObserver) {
      flowVirtualObserver.disconnect();
      flowVirtualObserver = null;
    }

    if (pageTranslations.size === 0) {
      bilingualReaderFlow.innerHTML = `
        <div class="flow-empty-hint">
          <div class="flow-empty-hint-icon">📖</div>
          <div style="font-size: 16px; font-weight: 700; color: #1e293b; margin-bottom: 8px;">双语流视图 · 沉浸式阅读模式</div>
          <div style="font-size: 13.5px; color: #64748b; max-width: 480px; margin: 0 auto 16px; line-height: 1.6;">
            专为多栏、三栏复杂排版文献设计。彻底摆脱 PDF 原位狭窄物理框限制，跨栏跨页语义无缝缝合。
          </div>
          <div style="display: flex; justify-content: center; gap: 12px;">
            <button id="flow-start-trans-page" class="modal-action-btn primary" style="padding: 6px 16px; font-size: 12.5px;">翻译当前页 (第 ${currentPage} 页)</button>
            <button id="flow-start-trans-doc" class="modal-action-btn" style="padding: 6px 16px; font-size: 12.5px;">全文翻译</button>
          </div>
        </div>
      `;
      const btnPage = bilingualReaderFlow.querySelector('#flow-start-trans-page');
      const btnDoc = bilingualReaderFlow.querySelector('#flow-start-trans-doc');
      if (btnPage && translatePageBtn) btnPage.addEventListener('click', () => translatePageBtn.click());
      if (btnDoc && translateDocBtn) btnDoc.addEventListener('click', () => translateDocBtn.click());
      return;
    }

    const sortedPages = Array.from(pageTranslations.keys()).sort((a, b) => a - b);
    const fragment = document.createDocumentFragment();
    const totalPages = sortedPages.length;

    // 当总翻译页数 > 6 时开启长篇轻量化虚拟观察器，严格回收视口外 DOM 显存
    const enableVirtualization = (totalPages > 6);

    flowVirtualObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        const section = entry.target;
        const pageNum = parseInt(section.dataset.pageNum, 10);
        const cardsContainer = section.querySelector('.flow-page-cards');
        if (!cardsContainer) return;

        if (entry.isIntersecting) {
          if (section.dataset.isRendered !== 'true') {
            const blocks = pageTranslations.get(pageNum) || [];
            cardsContainer.innerHTML = '';
            cardsContainer.appendChild(createFlowCardsForPage(pageNum, blocks));
            section.dataset.isRendered = 'true';
            section.style.minHeight = '';
          }
        } else if (enableVirtualization) {
          if (section.dataset.isRendered === 'true') {
            // 记录已量测的物理高度，防止滚动条抖动跳跃
            const measuredHeight = section.offsetHeight;
            if (measuredHeight > 80) {
              section.style.minHeight = `${measuredHeight}px`;
            }
            cardsContainer.innerHTML = `<div class="flow-cards-placeholder"><span>第 ${pageNum} 页 (已就绪 · 视口外显存已回收)</span></div>`;
            section.dataset.isRendered = 'false';
          }
        }
      });
    }, {
      root: bilingualReaderFlow,
      rootMargin: '800px 0px'
    });

    sortedPages.forEach(p => {
      const blocks = pageTranslations.get(p) || [];
      if (blocks.length === 0) return;

      const section = document.createElement('div');
      section.className = 'flow-page-section';
      section.dataset.pageNum = p;

      const divider = document.createElement('div');
      divider.className = 'flow-page-divider';
      divider.dataset.pageNum = p;
      divider.innerHTML = `<span>第 ${p} 页 (${blocks.length} 个语义段落)</span>`;
      section.appendChild(divider);

      const cardsContainer = document.createElement('div');
      cardsContainer.className = 'flow-page-cards';

      // 若不启用虚拟化或为前两页，直接挂载；否则留给 observer 按需挂载
      if (!enableVirtualization || p <= 2 || p === currentPage) {
        cardsContainer.appendChild(createFlowCardsForPage(p, blocks));
        section.dataset.isRendered = 'true';
      } else {
        const estHeight = Math.max(160, blocks.length * 110);
        section.style.minHeight = `${estHeight}px`;
        cardsContainer.innerHTML = `<div class="flow-cards-placeholder"><span>第 ${p} 页 (滚动至此自动挂载)</span></div>`;
        section.dataset.isRendered = 'false';
      }

      section.appendChild(cardsContainer);
      fragment.appendChild(section);

      flowVirtualObserver.observe(section);
    });

    bilingualReaderFlow.appendChild(fragment);
  }

  function locateAndHighlightBlockInOriginal(pageNum, box, lineBoxes) {
    if (!currentPdf || !box) return;
    const targetPageNum = pageNum || currentPage;
    const pageContainer = viewerContainer.querySelector(`.page-container[data-page-num="${targetPageNum}"]`);
    if (!pageContainer || !viewerMain) return;

    // 清除已存在的流视图高光
    viewerContainer.querySelectorAll('.flow-locate-highlight').forEach(el => el.remove());

    const pageH = pageContainer.offsetHeight / currentScale;
    const blockTop = (pageH - box.y - box.h) * currentScale;
    const targetScrollY = pageContainer.offsetTop + blockTop - (viewerMain.clientHeight / 2) + 60;

    viewerMain.scrollTo({
      top: Math.max(0, targetScrollY),
      behavior: 'smooth'
    });

    // 绘制高亮矩形
    const boxesToHighlight = (Array.isArray(lineBoxes) && lineBoxes.length > 0) ? lineBoxes : [box];
    boxesToHighlight.forEach(bx => {
      const hl = document.createElement('div');
      hl.className = 'flow-locate-highlight active-locate';
      hl.style.position = 'absolute';
      hl.style.left = `${Math.max(0, Math.round(bx.x * currentScale) - 4)}px`;
      hl.style.top = `${Math.max(0, Math.round((pageH - bx.y - bx.h) * currentScale) - 3)}px`;
      hl.style.width = `${Math.max(30, Math.round(bx.w * currentScale) + 8)}px`;
      hl.style.height = `${Math.max(14, Math.round(bx.h * currentScale) + 6)}px`;
      hl.style.pointerEvents = 'none';
      hl.style.zIndex = '90';
      pageContainer.appendChild(hl);

      setTimeout(() => {
        hl.classList.remove('active-locate');
        setTimeout(() => hl.remove(), 400);
      }, 2600);
    });
  }

  function setViewMode(mode) {
    currentViewMode = mode;
    if (mode === 'flow') {
      if (viewerContainerTrans) viewerContainerTrans.classList.add('hidden');
      if (bilingualReaderFlow) bilingualReaderFlow.classList.remove('hidden');
      if (viewModeLabel) viewModeLabel.textContent = '原位排版';
      if (viewModeIcon) viewModeIcon.textContent = '📄';
      if (controlStyleSelect && controlStyleSelect.value !== 'flow') {
        controlStyleSelect.value = 'flow';
      }
      renderBilingualReaderFlow();
    } else {
      if (viewerContainerTrans) viewerContainerTrans.classList.remove('hidden');
      if (bilingualReaderFlow) bilingualReaderFlow.classList.add('hidden');
      if (viewModeLabel) viewModeLabel.textContent = '双语流视图';
      if (viewModeIcon) viewModeIcon.textContent = '📖';
      if (controlStyleSelect && controlStyleSelect.value === 'flow') {
        controlStyleSelect.value = 'default';
      }
    }
    chrome.storage.local.set({ pdfViewMode: mode });
  }

  // 导出离线双语对照文档 (含独立可打印/存为PDF样式)
  function exportBilingualDocument(mode = 'download') {
    if (pageTranslations.size === 0) {
      alert('暂无可导出的翻译内容，请先翻译当前页或全文');
      return;
    }

    const sortedPages = Array.from(pageTranslations.keys()).sort((a, b) => a - b);
    let rowsHtml = '';

    sortedPages.forEach(p => {
      const blocks = pageTranslations.get(p) || [];
      if (blocks.length === 0) return;

      rowsHtml += `<div class="bilingual-page-break"><span>第 ${p} 页</span></div>`;

      blocks.forEach(b => {
        if (!b.transText && !b.originalText) return;
        const isFormula = (b.type === 'formula');
        rowsHtml += `
          <div class="bilingual-row ${isFormula ? 'is-formula-row' : ''}">
            <div class="bilingual-col col-orig">
              ${isFormula ? '<span class="badge formula">公式</span>' : ''}
              <div class="col-text">${escapeHtml(b.originalText)}</div>
            </div>
            <div class="bilingual-col col-trans">
              ${isFormula ? '<span class="badge formula">公式 (原样保留)</span>' : '<span class="badge trans">译文</span>'}
              <div class="col-text">${escapeHtml(b.transText || b.originalText)}</div>
            </div>
          </div>
        `;
      });
    });

    const fullHtml = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(pdfFileName || 'PDF 文档')} - 双语对照阅读笔记</title>
  <style>
    :root {
      --primary: #007aff;
      --bg: #f9f9fb;
      --card-bg: #ffffff;
      --text: #1c1c1e;
      --text-sec: #636366;
      --border: rgba(0, 0, 0, 0.08);
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
      margin: 0;
      padding: 30px 20px;
      background: var(--bg);
      color: var(--text);
      line-height: 1.6;
    }
    .container {
      max-width: 1080px;
      margin: 0 auto;
    }
    .header {
      background: var(--card-bg);
      padding: 24px 30px;
      border-radius: 16px;
      border: 1px solid var(--border);
      box-shadow: 0 4px 20px rgba(0,0,0,0.03);
      margin-bottom: 24px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .header h1 {
      margin: 0 0 6px 0;
      font-size: 20px;
      color: var(--text);
    }
    .header p {
      margin: 0;
      font-size: 13px;
      color: var(--text-sec);
    }
    .print-btn {
      background: var(--primary);
      color: #fff;
      border: none;
      padding: 8px 16px;
      border-radius: 8px;
      font-weight: 600;
      cursor: pointer;
    }
    .bilingual-page-break {
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 30px 0 16px 0;
    }
    .bilingual-page-break span {
      background: rgba(0, 122, 255, 0.1);
      color: var(--primary);
      font-size: 12px;
      font-weight: 700;
      padding: 4px 16px;
      border-radius: 20px;
      letter-spacing: 0.5px;
    }
    .bilingual-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
      background: var(--card-bg);
      padding: 16px 20px;
      border-radius: 12px;
      border: 1px solid var(--border);
      margin-bottom: 12px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.02);
      transition: all 0.15s ease;
    }
    .bilingual-row:hover {
      box-shadow: 0 4px 16px rgba(0,122,255,0.08);
      border-color: rgba(0,122,255,0.3);
    }
    .bilingual-col {
      font-size: 14.5px;
      word-break: break-word;
    }
    .col-orig {
      color: var(--text-sec);
      border-right: 1px solid var(--border);
      padding-right: 16px;
    }
    .col-trans {
      color: var(--text);
      font-weight: 500;
    }
    .badge {
      display: inline-block;
      font-size: 10px;
      font-weight: 600;
      padding: 1px 6px;
      border-radius: 4px;
      margin-bottom: 6px;
    }
    .badge.formula {
      background: rgba(88, 86, 214, 0.12);
      color: #5856d6;
    }
    .badge.trans {
      background: rgba(52, 199, 89, 0.12);
      color: #34c759;
    }
    @media print {
      body { background: #fff; padding: 0; }
      .print-btn { display: none; }
      .bilingual-row { page-break-inside: avoid; border: 1px solid #ccc; box-shadow: none; }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div>
        <h1>${escapeHtml(pdfFileName || 'PDF 文档')} · 双语对照阅读笔记</h1>
        <p>导出时间：${new Date().toLocaleString()} · 智能段落重组排版对照</p>
      </div>
      <button class="print-btn" onclick="window.print()">打印 / 另存为 PDF</button>
    </div>
    <div class="bilingual-content">
      ${rowsHtml}
    </div>
  </div>
</body>
</html>`;

    if (mode === 'print') {
      const printWin = window.open('', '_blank');
      if (printWin) {
        printWin.document.write(fullHtml);
        printWin.document.close();
        printWin.focus();
        setTimeout(() => {
          printWin.print();
        }, 400);
      }
      return;
    }

    const blob = new Blob([fullHtml], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const baseName = (pdfFileName || 'document').replace(/\.[^/.]+$/, '');
    a.download = `${baseName}_双语对照笔记.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('✓ 已下载双语对照文档');
  }

  function exportPlainText() {
    if (pageTranslations.size === 0) {
      alert('暂无可导出的翻译内容');
      return;
    }
    const sortedPages = Array.from(pageTranslations.keys()).sort((a, b) => a - b);
    let text = `# ${pdfFileName || 'PDF 文档'} - 全文中文译文\n\n`;
    sortedPages.forEach(p => {
      const blocks = pageTranslations.get(p) || [];
      if (blocks.length === 0) return;
      text += `\n==================== 第 ${p} 页 ====================\n\n`;
      blocks.forEach(b => {
        if (b.transText) {
          text += b.transText + '\n\n';
        }
      });
    });
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const baseName = (pdfFileName || 'document').replace(/\.[^/.]+$/, '');
    a.download = `${baseName}_中文译文.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('✓ 已导出纯中文文本');
  }

  // 缩放逻辑：秒级响应，仅调整占位骨架并在当前视口中重绘
  async function changeZoom(newScale) {
    if (!currentPdf) return;
    currentScale = Math.min(Math.max(newScale, 0.5), 3.0);
    const scalePercent = Math.round(currentScale * 100);
    if (zoomValueSpan) {
      zoomValueSpan.textContent = `${scalePercent}%`;
    }

    if (zoomPresetSelect) {
      const matchVal = currentScale.toFixed(1);
      const matchVal2 = currentScale.toFixed(2);
      let found = false;
      for (const opt of zoomPresetSelect.options) {
        if (opt.value === matchVal || opt.value === matchVal2 || Math.round(parseFloat(opt.value) * 100) === scalePercent) {
          zoomPresetSelect.value = opt.value;
          found = true;
          break;
        }
      }
      if (!found) {
        let customOpt = zoomPresetSelect.querySelector('option[data-custom="true"]');
        if (!customOpt) {
          customOpt = document.createElement('option');
          customOpt.dataset.custom = 'true';
          zoomPresetSelect.appendChild(customOpt);
        }
        customOpt.value = (Math.round(currentScale * 100) / 100).toString();
        customOpt.textContent = `${scalePercent}%`;
        zoomPresetSelect.value = customOpt.value;
      }
    }

    const lastPage = currentPage;
    const renderId = ++currentRenderId;

    if (pageObserver) {
      pageObserver.disconnect();
    }
    renderedPages.clear();

    // 更新左右所有页面占位容器尺寸
    const firstPage = await currentPdf.getPage(1);
    const firstViewport = firstPage.getViewport({ scale: currentScale });
    const defaultW = Math.round(firstViewport.width);
    const defaultH = Math.round(firstViewport.height);

    const pages = viewerContainer.querySelectorAll('.page-container');
    pages.forEach(p => {
      p.style.width = `${defaultW}px`;
      p.style.height = `${defaultH}px`;
      p.innerHTML = `<div class="page-skeleton"><span class="page-skeleton-badge">第 ${p.dataset.pageNum} 页 原文</span></div>`;
      p.classList.add('is-unloaded');
    });

    if (viewerContainerTrans) {
      const transPages = viewerContainerTrans.querySelectorAll('.page-container');
      transPages.forEach(p => {
        p.style.width = `${defaultW}px`;
        p.style.height = `${defaultH}px`;
        p.innerHTML = `<div class="page-skeleton"><span class="page-skeleton-badge">第 ${p.dataset.pageNum} 页 译文</span></div>`;
        p.classList.add('is-unloaded');
      });
    }

    setupVirtualObserver(renderId);

    const targetPageElement = viewerContainer.querySelector(`.page-container[data-page-num="${lastPage}"]`);
    if (targetPageElement && viewerMain) {
      const targetOffsetTop = targetPageElement.offsetTop;
      viewerMain.scrollTo({ top: Math.max(0, targetOffsetTop - 16) });
    }

    if (translationPane && !translationPane.classList.contains('hidden')) {
      renderTransStageForPage(currentPage);
    }
  }
  // --- 论文/学术 PDF 段落、图表及公式识别与保护算法 ---

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // 1. 公式特征识别
  function isFormulaText(str) {
    if (!str || typeof str !== 'string') return false;
    const trimmed = str.trim();
    if (trimmed.length === 0) return false;

    // 独立公式编号结尾，例如 "(1)", "(2.3)", "(A.1)"
    if (/\(\s*(\d+(\.\d+)?|[a-zA-Z](\.\d+)?)\s*\)$/.test(trimmed)) {
      if (/[=><\+\-\*\/\^_\\]/.test(trimmed)) return true;
    }

    // 常见数学特殊符号字符集 (Unicode 数学符号区、希腊字母区)
    const mathSymbolsRegex = /[\u2200-\u22FF\u2A00-\u2AFF\u27C0-\u27EF\u2980-\u29FF\u2100-\u214F\u0370-\u03FF]/;
    const hasMathSymbols = mathSymbolsRegex.test(trimmed);

    // LaTeX 命令特征或算符特征
    const hasLatexCmd = /\\[a-zA-Z]+|\b\w+\s*=\s*|\b\w+_[0-9a-zA-Z]|\b\w+\^[0-9a-zA-Z]/.test(trimmed);

    // 统计标准英文单词数量（4个字母以上）
    const words = trimmed.match(/[a-zA-Z]{4,}/g) || [];
    
    // 如果数学符号密集且正常自然语言单词很少，判定为独立公式
    if ((hasMathSymbols || hasLatexCmd) && words.length <= 4) {
      return true;
    }

    // 包含明显的方程结构：变量 = 表达式，并且无连续自然语言句子
    if (/^[A-Za-z0-9_\\\^]+\s*=\s*[^,\.\?!]+$/.test(trimmed) && words.length <= 3) {
      return true;
    }

    return false;
  }

  // 2. 图表、表格标题识别
  function isChartCaption(str) {
    if (!str || typeof str !== 'string') return false;
    const trimmed = str.trim();
    return /^(Figure|Fig\.|Table|Tab\.|Chart|Diagram|图|表)\s*(\d+|[A-Z]|\d+\.\d+)/i.test(trimmed);
  }

  // 3. 行内数学公式占位保护
  function protectInlineFormulas(text) {
    const tokenMap = new Map();
    let counter = 0;

    // 保护 $...$ 或 \(...\) 或 $$...$$
    let protectedText = text.replace(/(\$\$[\s\S]+?\$\$|\$[^\$]+?\$|\\\(.+?\\\)|\\\[[\s\S]+?\\\])/g, (match) => {
      const token = `__FORMULA_TOKEN_${counter++}__`;
      tokenMap.set(token, match);
      return token;
    });

    // 保护单独的显式方程式表达式 (例如 "x_t = \alpha x_{t-1} + \epsilon_t")
    protectedText = protectedText.replace(/(\b[a-zA-Z]_[0-9a-zA-Z]+\s*=\s*[a-zA-Z0-9_\+\-\*\/\^\\\(\)\s]+)/g, (match) => {
      if (match.length > 5 && match.length < 100 && !/\b(the|and|for|that|with)\b/i.test(match)) {
        const token = `__FORMULA_TOKEN_${counter++}__`;
        tokenMap.set(token, match);
        return token;
      }
      return match;
    });

    return { text: protectedText, tokenMap };
  }

  // 4. 还原被保护的行内数学公式
  function restoreInlineFormulas(text, tokenMap) {
    if (!text || !tokenMap || tokenMap.size === 0) return text;
    let restored = text;
    tokenMap.forEach((origFormula, token) => {
      // 兼容某些翻译引擎在下划线周围插入多余空格的情况 (例如 "__ FORMULA_TOKEN_0 __")
      const safeTokenPattern = token.replace(/_/g, '_?\\s*');
      const reg = new RegExp(safeTokenPattern, 'gi');
      restored = restored.replace(reg, origFormula);
    });
    return restored;
  }

  // 5. 页面语义块解析算法 (精准识别行、段落、图表、公式，支持双栏学术排版与标点清洗)
  async function extractPageBlocks(page, skipFormulas) {
    const textContent = await page.getTextContent();
    const items = textContent.items;
    if (!items || items.length === 0) return [];

    const viewport = page.getViewport({ scale: 1.0 });
    const pageHeight = viewport.height;
    const pageWidth = viewport.width;

    const validItems = items
      .filter(item => item.str && item.str.trim())
      .map(item => {
        const cleanStr = normalizePdfText(item.str);
        // 计算实际物理字号: 根据 transform 仿射变换矩阵
        const fontSize = Math.round(Math.hypot(item.transform[0], item.transform[1]) * 10) / 10 || item.height || 12;
        const isBold = /bold|black|heavy|700/i.test(item.fontName || '');
        return {
          str: cleanStr,
          x: item.transform[4],
          y: item.transform[5],
          w: item.width,
          h: item.height || Math.abs(item.transform[3]) || fontSize,
          fontSize: fontSize,
          isBold: isBold,
          fontName: item.fontName || ''
        };
      })
      .filter(item => item.str.trim().length > 0);

    if (validItems.length === 0) return [];

    const pageNum = page.pageNumber || currentPage;

    function isHeaderOrFooterItem(item) {
      const str = item.str.trim();
      if (!str) return false;

      // 1. 底部页脚区域判断 (距页面底部 48pt 以内)
      if (item.y < 48) {
        // A. 纯页码或页码标记 (如 "12", "12 / 64", "Page 12 of 64", "- 12 -", "· 12 ·")
        if (/^[-—•·\s]*\d+[\s/–—•·\d]*$/i.test(str) || /^Page\s*\d+/i.test(str) || /^\d+\s*[\/|]\s*\d+$/i.test(str)) {
          return true;
        }
        // B. 版权声明、出版日期、机构标记与免责声明 (如 "Copyright © 2024 Capgemini", "All rights reserved", "September 2024")
        if (/copyright|all\s*rights\s*reserved|©|issn|isbn|doi:|https?:|www\.|\.com\b|confidential|draft/i.test(str)) {
          return true;
        }
        // C. 月份+年份的出版时间戳 (如 "September 2024", "Jan 2023")
        if (/^(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\.?\s+\d{4}\b/i.test(str)) {
          return true;
        }
        // D. 底部极端边界 (< 36pt) 且字号 <= 11pt 的短文字行
        if (item.y < 36 && item.fontSize <= 11) {
          return true;
        }
      }

      // 2. 顶部页眉区域判断 (距页面顶部 50pt 以内)
      if (item.y > pageHeight - 50) {
        // 第一页的正文大标题通常字号很大 (>= 15pt)，绝不能误判为页眉
        if (pageNum === 1 && item.fontSize >= 15) {
          return false;
        }
        // 顶部纯页码、章节、期刊名或 DOI
        if (/^[-—•·\s]*\d+[\s/–—•·\d]*$/i.test(str) || /^Page\s*\d+/i.test(str)) {
          return true;
        }
        // 顶部小字号单行标题/期号/DOI
        if (item.fontSize <= 11.5) {
          return true;
        }
      }

      return false;
    }

    // 聚合成物理 Y 分组 (Y 容差 3pt，并绝对过滤页眉与页脚，保留原生排版底色)
    const rawYGroups = [];
    for (const item of validItems) {
      // 忽略页眉页脚（正文之外的页码、版权、顶底跑头）
      if (isHeaderOrFooterItem(item)) {
        continue;
      }

      let group = rawYGroups.find(g => Math.abs(g.y - item.y) <= 3);
      if (group) {
        group.items.push(item);
      } else {
        rawYGroups.push({ y: item.y, items: [item] });
      }
    }

    // 针对每个物理 Y 行，依据水平 X 间隙 (X-Gap) 与字号差异分割为独立线段，彻底避免左右分栏与图表被粘连
    const processedLines = [];
    for (const group of rawYGroups) {
      group.items.sort((a, b) => a.x - b.x);

      const segments = [];
      let currSeg = [group.items[0]];

      for (let i = 1; i < group.items.length; i++) {
        const prev = group.items[i - 1];
        const curr = group.items[i];
        const xGap = curr.x - (prev.x + prev.w);
        const refFont = Math.max(prev.fontSize, curr.fontSize);

        // 阈值：水平间隙超过 1.6 倍字号且绝对距离 > 14pt，或字号差距大于 5pt，分割为不同线段
        const maxGap = Math.max(14, refFont * 1.6);
        if (xGap > maxGap || Math.abs(curr.fontSize - prev.fontSize) > 5) {
          segments.push(currSeg);
          currSeg = [curr];
        } else {
          currSeg.push(curr);
        }
      }
      segments.push(currSeg);

      for (const seg of segments) {
        let text = seg[0].str;
        for (let i = 1; i < seg.length; i++) {
          const prev = seg[i - 1];
          const curr = seg[i];
          const gap = curr.x - (prev.x + prev.w);
          if (gap > 1.8 && !text.endsWith(' ') && !curr.str.startsWith(' ')) {
            text += ' ' + curr.str;
          } else {
            text += curr.str;
          }
        }

        const minX = Math.min(...seg.map(it => it.x));
        const maxX = Math.max(...seg.map(it => it.x + it.w));
        const minY = Math.min(...seg.map(it => it.y));
        const maxY = Math.max(...seg.map(it => it.y + it.h));
        const avgFontSize = seg.reduce((s, it) => s + it.fontSize, 0) / seg.length;
        const anyBold = seg.some(it => it.isBold);
        const fontName = seg[0].fontName;

        processedLines.push({
          text: text.trim(),
          x: minX,
          y: minY,
          w: maxX - minX,
          h: maxY - minY,
          fontSize: avgFontSize,
          isBold: anyBold,
          fontName: fontName,
          box: { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
        });
      }
    }

    // 1. 宽幅贯穿行识别 (页面主标题、通栏说明，宽度 > 56% 页面宽度)
    const topWideSpans = [];
    const bottomWideSpans = [];
    const columnLineCandidates = [];

    for (const line of processedLines) {
      if (line.w > pageWidth * 0.56) {
        if (line.y > pageHeight * 0.55) {
          topWideSpans.push(line);
        } else {
          bottomWideSpans.push(line);
        }
      } else {
        columnLineCandidates.push(line);
      }
    }

    // 2. 动态多栏自适应聚类 (支持 1 栏、2 栏、3 栏及任意多栏排版)
    // 根据非贯穿行的水平位置 (X 与 X+W) 聚合为独立的纵向栏轨道 (Column Tracks)
    const columns = [];
    const sortedCandidates = [...columnLineCandidates].sort((a, b) => a.x - b.x);

    for (const line of sortedCandidates) {
      let matchedCol = null;
      for (const col of columns) {
        const isLeftAligned = Math.abs(line.x - col.minX) < 40;
        const colOverlap = Math.min(col.maxX, line.x + line.w) - Math.max(col.minX, line.x);
        // 水平左边缘高度对齐，或者与该栏水平投影有显著重叠
        if (isLeftAligned || colOverlap > 12) {
          matchedCol = col;
          break;
        }
      }

      if (matchedCol) {
        matchedCol.lines.push(line);
        matchedCol.minX = Math.min(matchedCol.minX, line.x);
        matchedCol.maxX = Math.max(matchedCol.maxX, line.x + line.w);
      } else {
        columns.push({
          minX: line.x,
          maxX: line.x + line.w,
          lines: [line]
        });
      }
    }

    // 从左到右排序列
    columns.sort((a, b) => a.minX - b.minX);

    // 每列内部按 Y 从上到下排布
    for (const col of columns) {
      col.lines.sort((a, b) => b.y - a.y);
    }

    topWideSpans.sort((a, b) => b.y - a.y);
    bottomWideSpans.sort((a, b) => b.y - a.y);

    // 合成自然阅读顺序：顶部大标题 -> 第一栏从上到下 -> 第二栏从上到下 -> 第三栏从上到下 -> 底部注脚
    const orderedLines = [
      ...topWideSpans,
      ...columns.flatMap(col => col.lines),
      ...bottomWideSpans
    ];

    // 按段落、行距、标题、图表将行聚合成语义块，并保留精确包围盒与字号样式
    const blocks = [];
    let currentParagraphLines = [];

    function flushParagraph() {
      if (currentParagraphLines.length === 0) return;
      const mergedText = healAcademicSymbols(reconstructPdfParagraphs(currentParagraphLines.map(l => l.text).join('\n')));
      if (mergedText && mergedText.trim()) {
        const minX = Math.min(...currentParagraphLines.map(l => l.box.x));
        const maxX = Math.max(...currentParagraphLines.map(l => l.box.x + l.box.w));
        const minY = Math.min(...currentParagraphLines.map(l => l.box.y));
        const maxY = Math.max(...currentParagraphLines.map(l => l.box.y + l.box.h));

        const avgFontSize = currentParagraphLines.reduce((s, l) => s + l.fontSize, 0) / currentParagraphLines.length;
        const isBold = currentParagraphLines.some(l => l.isBold);
        const fontName = currentParagraphLines[0].fontName || '';

        // 核心过滤：绝对排除页眉页脚语义块（正文之外不遮挡、不翻译，保留原版图层）
        const isBlockFooter = (minY < 48 && (avgFontSize <= 11.5 || /copyright|all\s*rights|©/i.test(mergedText)));
        const isBlockHeader = (maxY > pageHeight - 50 && avgFontSize <= 11.5 && !(pageNum === 1 && avgFontSize >= 15));
        if (isBlockFooter || isBlockHeader) {
          currentParagraphLines = [];
          return;
        }

        let blockType = 'paragraph';
        if (avgFontSize >= 16 || (isBold && avgFontSize >= 12.5 && currentParagraphLines.length <= 2)) {
          blockType = 'heading';
        } else if (avgFontSize <= 9.5 || isChartCaption(mergedText)) {
          blockType = 'caption';
        }

        // 识别是否跨栏 (多栏跨度突变)
        const isCrossColumn = (maxX - minX > pageWidth * 0.45) && (maxY - minY > pageHeight * 0.35);

        let blockBox = {
          x: Math.max(0, minX - 1),
          y: minY,
          w: Math.min(pageWidth - minX, maxX - minX + 2),
          h: maxY - minY
        };

        // 若跨栏合并导致包围盒横跨半个以上页面，原位排版回退为起点栏包围盒，避免遮蔽中间区域；完整双语在 Flow 流视图中呈现
        if (isCrossColumn && currentParagraphLines.length > 0) {
          const firstLine = currentParagraphLines[0];
          blockBox = {
            x: Math.max(0, firstLine.box.x - 1),
            y: firstLine.box.y,
            w: Math.min(pageWidth - firstLine.box.x, firstLine.box.w + 2),
            h: firstLine.box.h
          };
        }

        blocks.push({
          id: `block-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
          pageNum: pageNum,
          pageHeight: pageHeight,
          type: blockType,
          originalText: mergedText.trim(),
          isCrossColumn: isCrossColumn,
          lineBoxes: currentParagraphLines.map(l => ({ ...l.box })),
          box: blockBox,
          style: {
            fontSize: Math.round(avgFontSize * 10) / 10,
            isBold: isBold,
            fontName: fontName
          }
        });
      }
      currentParagraphLines = [];
    }

    for (let i = 0; i < orderedLines.length; i++) {
      const lineObj = orderedLines[i];
      const text = lineObj.text;

      // 1) 独立数学公式检测
      if (isFormulaText(text)) {
        flushParagraph();
        blocks.push({
          id: `block-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
          pageNum: pageNum,
          pageHeight: pageHeight,
          type: 'formula',
          originalText: text,
          box: lineObj.box,
          style: {
            fontSize: Math.round(lineObj.fontSize * 10) / 10,
            isBold: lineObj.isBold,
            fontName: lineObj.fontName
          }
        });
        continue;
      }

      // 2) 图表/表格说明检测
      if (isChartCaption(text)) {
        flushParagraph();
        blocks.push({
          id: `block-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
          pageNum: pageNum,
          pageHeight: pageHeight,
          type: 'caption',
          originalText: text,
          box: lineObj.box,
          style: {
            fontSize: Math.round(lineObj.fontSize * 10) / 10,
            isBold: lineObj.isBold,
            fontName: lineObj.fontName
          }
        });
        continue;
      }

      // 3) 段落分界检测：基于句法标点闭合、排版连字符、跨栏检测与段距综合判断
      if (currentParagraphLines.length > 0) {
        const prevLine = currentParagraphLines[currentParagraphLines.length - 1];
        const lineGap = prevLine.y - lineObj.y;
        const avgH = (prevLine.h + lineObj.h) / 2;
        const fontDiff = Math.abs(prevLine.fontSize - lineObj.fontSize);
        const xOffset = Math.abs(prevLine.x - lineObj.x);

        const prevText = prevLine.text.trim();
        const currText = lineObj.text.trim();

        // 句法语义特征：
        // 前行是否以断句标点结尾 (. ! ? : 。 ！ ？)
        const prevEndsWithTerminal = /[\.\?!。？！:：]$/.test(prevText);
        // 前行是否以连字符切词换行 (如 "infra-")
        const prevEndsWithHyphen = /[-—]\s*$/.test(prevText);
        // 当前行是否以小写字母开头 (说明属于前一句话的半截未完从句)
        const currStartsWithLower = /^[a-z]/.test(currText);
        // 当前行是否为独立列表项 (如 "1.", "•", "- ")
        const currIsListItem = /^([-*•·]|(?:\d+|[a-zA-Z])[\.)])\s+/.test(currText);
        // 样式突变 (字号差超过 2.2pt 或 粗细变化且为短行标题)
        const isHeaderStyleChange = fontDiff > 2.2 || (prevLine.isBold !== lineObj.isBold && (prevText.length < 50 || currText.length < 50));
        // 跨越纵向栏轨道 (Y 逆向上跳或 X 跨栏突变 > 60pt)
        const isColumnJump = (lineGap < -5) || (xOffset > 60);

        let shouldBreak = false;

        // 核心突破：跨栏未闭合句子与切词连字符无缝缝合 (Cross-Column Stitching)
        // 论文/研报从栏1底跳转至栏2顶时，若前行未以终结标点结束或前行有连字符或后行小写开头，绝对属于同一完整句子与段落，不可切碎！
        const isCrossColumnContinuation = isColumnJump && !isHeaderStyleChange && !currIsListItem &&
          (prevEndsWithHyphen || currStartsWithLower || !prevEndsWithTerminal);

        if (isCrossColumnContinuation) {
          shouldBreak = false;
        } else if (isColumnJump || isHeaderStyleChange || currIsListItem) {
          shouldBreak = true;
        } else if (prevEndsWithHyphen || currStartsWithLower) {
          // 极高优先级连贯规则：前行连字符截断或当前行小写字母开头，语法上绝不可拆成两段！
          // 除非垂直间距巨大 (超过 3.2 倍行高，说明版面存在插入图表)
          shouldBreak = (lineGap > avgH * 3.2);
        } else if (!prevEndsWithTerminal) {
          // 前行未出现任何结束标点 (句子在行尾自然折行): 必须作为同一段合并！
          // 仅在垂直间隙明显大于段落正常行距 (>= 2.4 倍) 时切断
          shouldBreak = (lineGap > avgH * 2.4);
        } else {
          // 前行确实存在结束标点 (. ! ? :):
          // 仅当存在明显的段间留白 (lineGap > avgH * 1.85) 或 首行缩进 (lineObj.x - prevLine.x > 14) 时才断开
          shouldBreak = (lineGap > avgH * 1.85) || (lineObj.x - prevLine.x > 14);
        }

        if (shouldBreak) {
          flushParagraph();
        }
      }

      currentParagraphLines.push(lineObj);
    }

    flushParagraph();
    return blocks;
  }

  // 6. 异步调用后台翻译 API (支持指定具体模型如 GLM-4-Flash)
  function requestTranslation(text, engine, targetLang, model) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({
        action: 'translate',
        text: text,
        engine: engine,
        targetLang: targetLang,
        model: model
      }, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else if (!response) {
          reject(new Error('翻译超时或服务未响应'));
        } else if (response.success) {
          resolve(response.translation);
        } else {
          reject(new Error(response.error || '翻译失败'));
        }
      });
    });
  }

  // 6.4 提取相邻页边缘语境（前页末尾或后页开头约 180~250 字符，用于跨页断句与代词滑动窗口补齐）
  async function getPageEdgeContext(pageNum, edge = 'bottom') {
    if (!currentPdf || pageNum < 1 || pageNum > currentPdf.numPages) return '';
    try {
      const page = await currentPdf.getPage(pageNum);
      const textContent = await page.getTextContent();
      const rawItems = (textContent.items || [])
        .filter(item => item.str && item.str.trim())
        .map(item => normalizePdfText(item.str).trim())
        .filter(s => s && !/^\d+$/.test(s) && !/^Page\s*\d+/i.test(s)); // 排除纯页码
      
      if (rawItems.length === 0) return '';

      if (edge === 'bottom') {
        const sliceItems = rawItems.slice(-15);
        const joined = sliceItems.join(' ');
        if (/^(Fig\.|Figure|Table|Ref\.|\[\d+\])/i.test(joined.trim())) {
          return '';
        }
        return joined.slice(-250).trim();
      } else {
        const sliceItems = rawItems.slice(0, 15);
        const joined = sliceItems.join(' ');
        if (/^(Fig\.|Figure|Table)/i.test(joined.trim())) {
          return '';
        }
        return joined.slice(0, 250).trim();
      }
    } catch (e) {
      console.warn(`提取第 ${pageNum} 页边缘语境异常:`, e);
      return '';
    }
  }

  // 6.5 整页 JSON 结构化批量翻译 API (优先走本地学术引擎，无 Node 环境时 0 延迟秒级回退至扩展 Background)
  let localServerReachable = null; // null: 未探测, true: 本地 Node 可用, false: 纯扩展模式直连
  let localServerRetryAt = 0; // 本地服务不可达后的重新探测时间点 (避免会话内永久降级)
  const LOCAL_SERVER_TIMEOUT_MS = 90000;
  const LOCAL_SERVER_REPROBE_MS = 60000;

  // 按用户所选引擎解析本地学术引擎所需凭据；返回 null 表示该引擎不走本地服务 (如 Gemini 非 OpenAI 兼容协议)
  function resolveLocalEngineCredentials(engine, model, settings) {
    if (engine && engine.startsWith('custom_')) {
      const customId = engine.substring(7);
      const cm = (settings.customModels || []).find(m => m.id === customId);
      if (!cm) return null;
      return { apiKey: cm.apiKey || '', endpoint: cm.endpoint, model: model || cm.modelName };
    }
    if (engine === 'glm') {
      return {
        apiKey: settings.glmApiKey || '',
        endpoint: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
        model: model || settings.glmActiveModel || 'glm-4-flash'
      };
    }
    if (engine === 'deepseek') {
      return {
        apiKey: settings.deepseekApiKey || '',
        endpoint: 'https://api.deepseek.com/chat/completions',
        model: model || settings.deepseekActiveModel || 'deepseek-chat'
      };
    }
    if (engine === 'gemini') return null;
    // 免 Key 公共通道 (google 等)：交由本地引擎混合分流的免费线路
    return { apiKey: '', endpoint: 'https://api.deepseek.com/chat/completions', model: 'deepseek-chat' };
  }

  function requestBatchTranslation(items, engine, targetLang, model, context = null, persona = 'biochem') {
    return new Promise((resolve, reject) => {
      // 统一角色标识 (向后兼容 boolean 参数: true -> 'biochem', false -> 'general')
      const activePersona = typeof persona === 'string' ? persona : (persona ? 'biochem' : 'general');
      const viaChrome = () => fallbackChromeBatch(items, engine, targetLang, model, context, activePersona).then(resolve).catch(reject);

      // 已确认无本地 Node 服务且未到重新探测窗口：直接由扩展 Background 承接
      if (localServerReachable === false && Date.now() < localServerRetryAt) {
        viaChrome();
        return;
      }

      chrome.storage.local.get({
        deepseekApiKey: '',
        glmApiKey: '',
        glmActiveModel: '',
        deepseekActiveModel: '',
        customModels: []
      }, (settings) => {
        const creds = resolveLocalEngineCredentials(engine, model, settings);
        if (!creds) {
          viaChrome();
          return;
        }

        const ctrl = new AbortController();
        const timeoutId = setTimeout(() => ctrl.abort(), LOCAL_SERVER_TIMEOUT_MS);

        fetch('http://localhost:3300/api/translate/bio', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: ctrl.signal,
          body: JSON.stringify({
            items,
            targetLang,
            crossPageContext: context,
            apiKey: creds.apiKey,
            endpoint: creds.endpoint,
            model: creds.model,
            persona: activePersona,
            enableHybrid: true
          })
        }).then(r => {
          clearTimeout(timeoutId);
          localServerReachable = true; // 能收到 HTTP 响应即说明服务在线，即便返回非 2xx
          return r.ok ? r.json() : null;
        }).then(res => {
          if (res && res.success && Array.isArray(res.translations)) {
            if (res.dispatchStats) {
              console.log(`[${activePersona} 智能分流] ${res.dispatchStats.totalCount} 段落处理完毕: ${res.dispatchStats.freeCount} 段免Key直达，${res.dispatchStats.aiCount} 段大模型推理 (节约 Token: ${res.dispatchStats.savedTokenRatio})`);
            }
            if (res.dispatchStats && res.dispatchStats.rateLimited) {
              const freeQuotaHint = document.getElementById('free-quota-hint');
              if (freeQuotaHint) freeQuotaHint.classList.remove('hidden');
              showToast('⚠️ 免Key公共通道触发频次限制，已自动启用备用线路与平滑排队；配置免费密钥可提速10倍。', 4500);
            }
            if (res.matchedTerms && res.matchedTerms.length > 0) {
              console.log(`[${activePersona} 术语增强] 命中 ${res.matchedTerms.length} 个权威专有词条:`, res.matchedTerms.slice(0, 5).map(t => `${t.term} -> ${t.translation}`).join('; '));
            }
            resolve(res.translations);
            return;
          }
          // 本地接口异常时无缝回退到扩展 background
          viaChrome();
        }).catch((err) => {
          clearTimeout(timeoutId);
          if (err && err.name === 'AbortError') {
            // 服务在线但响应超时：不标记离线，仅本次回退
            console.warn(`[本地学术引擎] 响应超过 ${LOCAL_SERVER_TIMEOUT_MS / 1000}s，本次回退扩展通道`);
          } else {
            // 本地未安装/未启动 Node 服务：标记离线，60s 后允许重新探测
            localServerReachable = false;
            localServerRetryAt = Date.now() + LOCAL_SERVER_REPROBE_MS;
          }
          viaChrome();
        });
      });
    });
  }

  // 仅当页面由本地 HTTP 服务托管 (server.js) 时，相对路径 /api/translate-batch 才有意义


  function fallbackChromeBatch(items, engine, targetLang, model, context, persona) {
    return new Promise((resolve, reject) => {
      const lastResort = (originalErr) => {
        if (isHttpHosted) {
          fallbackLocalBatch(items, targetLang, context).then(resolve).catch(reject);
        } else {
          // 扩展页内无本地 HTTP 兜底：透传真实错误 (如 API Key 无效 / 额度耗尽)，避免被无关的 Failed to fetch 掩盖
          reject(new Error(originalErr || '翻译服务未响应'));
        }
      };
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({
          action: 'translateBatch',
          items: items,
          engine: engine,
          targetLang: targetLang,
          model: model,
          context: context,
          persona: persona
        }, (response) => {
          if (chrome.runtime.lastError) {
            lastResort(chrome.runtime.lastError.message);
          } else if (response && response.success && Array.isArray(response.translations)) {
            resolve(response.translations);
          } else {
            lastResort(response && response.error);
          }
        });
      } else {
        lastResort('扩展运行时不可用');
      }
    });
  }

  async function fallbackLocalBatch(items, targetLang, context = null) {
    try {
      const res = await fetch('/api/translate-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items, targetLang, context })
      });
      const data = await res.json();
      if (data && data.success && Array.isArray(data.translations)) {
        return data.translations;
      }
      throw new Error(data.error || '本地后端翻译异常');
    } catch (e) {
      throw new Error('批量翻译失败: ' + e.message);
    }
  }

  // 7. 翻译单页核心方法 (原排版独立靶向舞台 + 批量 JSON 协议)
  const translatingPages = new Set(); // `${docId}#${page}` 在途去重，防止重复点击重复扣费与覆盖层互相覆盖

  async function translatePage(pageNum, isBatch = false) {
    if (!currentPdf) return;
    const targetPageNum = Math.max(1, Math.min(pageNum || currentPage, currentPdf.numPages));

    // 批量任务进行中禁止插入单页任务，否则会替换全局控制器，导致“停止”按钮无法中止批量任务
    if (!isBatch && isTranslatingDoc) {
      showToast('正在批量翻译中，请稍候或先停止当前任务');
      return;
    }

    const inflightKey = `${currentDocId}#${targetPageNum}`;
    if (translatingPages.has(inflightKey)) {
      if (!isBatch) showToast(`第 ${targetPageNum} 页正在翻译中，请稍候`);
      return;
    }

    // 单页任务始终使用全新控制器；批量任务沿用调度器控制器
    const ctrl = (isBatch && activeTranslateController) ? activeTranslateController : { aborted: false };
    if (!isBatch) activeTranslateController = ctrl;
    const docIdAtStart = currentDocId;
    const isStale = () => ctrl.aborted || !currentPdf || currentDocId !== docIdAtStart;

    translatingPages.add(inflightKey);
    try {
      await translatePageInner(targetPageNum, isBatch, isStale);
    } finally {
      translatingPages.delete(inflightKey);
    }
  }

  async function translatePageInner(targetPageNum, isBatch, isStale) {
    const skipFormulas = skipFormulasCheckbox ? skipFormulasCheckbox.checked : true;

    // 1. 展开并显示右侧排版对照栏及顶部操作区
    translationPane.classList.remove('hidden');
    toggleBilingualBtn.classList.add('active');
    if (transToolbarActions) transToolbarActions.classList.remove('hidden');
    if (transActiveBadge) transActiveBadge.textContent = isBatch ? '全文翻译中...' : `第 ${targetPageNum} 页 (准备中...)`;

    // 2. 渲染右侧当前页独立靶向画板（Stage）
    const stage = await renderTransStageForPage(targetPageNum);
    if (isStale()) return;
    if (!stage) {
      console.error(`挂载第 ${targetPageNum} 页舞台失败`);
      return;
    }

    const { overlayLayer, page } = stage;
    const pageHeight = page.getViewport({ scale: 1.0 }).height;

    // 3. 提取并结构化页面内容块与物理边界
    const blocks = await extractPageBlocks(page, skipFormulas);
    if (isStale()) return;

    if (!blocks || blocks.length === 0) {
      if (scannedPdfAlert) {
        const alertText = scannedPdfAlert.querySelector('.scanned-alert-text');
        if (alertText) {
          alertText.textContent = `检测到第 ${targetPageNum} 页为扫描件/纯图片 PDF（无可选文本层），暂无法直接提取文字。建议使用 OCR 工具识别文本后再进行排版翻译。`;
        }
        scannedPdfAlert.classList.remove('hidden');
      }
      transActiveBadge.textContent = '无可选文本';
      return;
    } else {
      if (scannedPdfAlert) {
        scannedPdfAlert.classList.add('hidden');
      }
    }

    const engine = (pdfTranslateEngine && pdfTranslateEngine.value) ? pdfTranslateEngine.value : 'google';
    const selectedModel = (pdfTranslateModel && !pdfTranslateModel.classList.contains('hidden')) ? pdfTranslateModel.value : null;

    const settings = await new Promise(resolve => {
      chrome.storage.local.get({ defaultTargetLang: 'zh-CN' }, resolve);
    });
    const targetLang = (targetLanguageSelect && targetLanguageSelect.value) ? targetLanguageSelect.value : (settings.defaultTargetLang || 'zh-CN');

    // 3.5 采样当前页面各块的文字前景色与底色
    blocks.forEach(b => {
      if (b.box) {
        const colors = sampleBlockColors(stage.canvas, b.box, pageHeight, currentScale);
        b.style = b.style || {};
        b.style.color = colors.color;
        b.style.bgColor = colors.bgColor;
      }
    });

    // 4. 创建原位排版占位框（立即显示半透明磨砂气泡，感知0等待）
    overlayLayer.innerHTML = '';
    const tasksToTranslate = [];

    for (const block of blocks) {
      if (block.type === 'formula' && skipFormulas) {
        block.transText = block.originalText;
        continue;
      }

      let textToTranslate = block.originalText;
      let tokenMap = null;
      if (skipFormulas) {
        const protectedObj = protectInlineFormulas(textToTranslate);
        textToTranslate = protectedObj.text;
        tokenMap = protectedObj.tokenMap;
      }

      const overlayBlock = document.createElement('div');
      overlayBlock.className = 'trans-overlay-block is-translating';
      overlayBlock.dataset.blockId = block.id;

      const left = Math.round(block.box.x * currentScale);
      const top = Math.round((pageHeight - block.box.y - block.box.h) * currentScale);
      const width = Math.max(Math.round(block.box.w * currentScale), 20);
      const minHeight = Math.max(Math.round(block.box.h * currentScale), 12);
      const placeholderFont = Math.round((block.style?.fontSize || 12) * currentScale);

      overlayBlock.style.left = `${left}px`;
      overlayBlock.style.top = `${top}px`;
      overlayBlock.style.width = `${width}px`;
      overlayBlock.style.minHeight = `${minHeight}px`;
      overlayBlock.style.fontSize = `${Math.min(placeholderFont, 14)}px`;
      overlayBlock.textContent = '翻译中...';

      overlayLayer.appendChild(overlayBlock);

      tasksToTranslate.push({
        block,
        overlayBlock,
        textToTranslate,
        tokenMap
      });
    }

    if (tasksToTranslate.length === 0) {
      renderOverlayBlocksOnLayer(overlayLayer, blocks, pageHeight, currentScale, stage.canvas);
      pageTranslations.set(targetPageNum, blocks);
      transActiveBadge.textContent = isBatch ? '全文翻译中...' : `第 ${targetPageNum} 页 (无需翻译)`;
      if (currentViewMode === 'flow') {
        renderBilingualReaderFlow();
      }
      return;
    }

    transActiveBadge.textContent = isBatch ? '全文翻译中...' : `第 ${targetPageNum} 页 (AI 翻译中...)`;

    // 5. 跨页断句滑动窗口上下文注入与结构化批量请求 (Context-Aware Sliding Window)
    try {
      let crossPageContext = null;
      try {
        const [prefixContext, suffixContext] = await Promise.all([
          targetPageNum > 1 ? getPageEdgeContext(targetPageNum - 1, 'bottom') : Promise.resolve(''),
          targetPageNum < currentPdf.numPages ? getPageEdgeContext(targetPageNum + 1, 'top') : Promise.resolve('')
        ]);

        if (prefixContext || suffixContext) {
          crossPageContext = {
            prefix: prefixContext,
            suffix: suffixContext
          };
        }
      } catch (ctxErr) {
        console.warn('获取跨页上下文忽略:', ctxErr);
      }

      // 使用短小的顺序索引作为请求 id：降低 Token 消耗，并规避大模型篡改长随机 id / 数字与字符串 id 类型不一致导致的回填失配
      const payload = tasksToTranslate.map((t, idx) => ({ id: idx, text: t.textToTranslate }));
      let transResults;
      try {
        transResults = await requestBatchTranslation(payload, engine, targetLang, selectedModel, crossPageContext, currentPersona);
      } catch (firstErr) {
        if (isStale()) throw firstErr;
        console.warn(`第 ${targetPageNum} 页批量翻译遇阻，正在退避重试:`, firstErr.message);
        if (isBatch) showToast(`通道繁忙，第 ${targetPageNum} 页启动退避重试...`);
        await new Promise(r => setTimeout(r, 1200));
        transResults = await requestBatchTranslation(payload, engine, targetLang, selectedModel, crossPageContext, currentPersona);
      }

      if (isStale()) {
        // 已中止或已切换文档：丢弃结果并清理“翻译中...”占位，绝不写入新文档的缓存
        tasksToTranslate.forEach(t => t.overlayBlock && t.overlayBlock.remove());
        return;
      }

      const transMap = new Map();
      if (Array.isArray(transResults)) {
        transResults.forEach(r => {
          if (r && typeof r.text === 'string' && r.text.trim()) transMap.set(String(r.id), r.text);
        });
      }
      if (transMap.size === 0) {
        throw new Error('翻译服务返回空结果');
      }

      let missingCount = 0;
      tasksToTranslate.forEach((task, idx) => {
        const rawTrans = transMap.get(String(idx));
        // 缺失块以原文占位展示，但标记 untranslated，使断点续译可自动重试该页
        task.block.untranslated = !rawTrans;
        if (!rawTrans) missingCount++;
        const base = rawTrans || task.block.originalText;
        const restored = task.tokenMap ? restoreInlineFormulas(base, task.tokenMap) : base;
        task.block.transText = healAcademicSymbols(restored, currentPersona);
      });
      blocks.forEach(b => { b.targetLang = targetLang; });
      if (missingCount > 0) {
        console.warn(`第 ${targetPageNum} 页有 ${missingCount} 个段落未返回译文，已保留原文并标记待重译`);
      }

      // 再次确认色彩采样
      blocks.forEach(b => {
        if (b.box && (!b.style?.color || !b.style?.bgColor)) {
          const colors = sampleBlockColors(stage.canvas, b.box, pageHeight, currentScale);
          b.style = b.style || {};
          b.style.color = colors.color;
          b.style.bgColor = colors.bgColor;
        }
      });

      // 原排版无痕覆盖渲染：底图 Inpainting 擦除原英文 + 1:1 字号颜色还原
      renderOverlayBlocksOnLayer(overlayLayer, blocks, pageHeight, currentScale, stage.canvas);

      pageTranslations.set(targetPageNum, blocks);
      if (currentDocId) DocStorage.saveTranslation(currentDocId, targetPageNum, blocks);
      transActiveBadge.textContent = isBatch ? '全文翻译中...' : `已翻译 (第 ${targetPageNum} 页)`;
      updateThumbnailStatus(targetPageNum);
      if (!isBatch) {
        showToast(`✓ 第 ${targetPageNum} 页翻译完成`);
      }
      if (currentViewMode === 'flow') {
        renderBilingualReaderFlow();
      }

      // 超长篇批量翻译优化：若当前页不在视口内，立即释放重型 Canvas 显存，保留轻量骨架与已就绪状态
      if (isBatch && targetPageNum !== currentPage) {
        const stageElem = document.getElementById(`page-trans-container-${targetPageNum}`);
        if (stageElem) {
          const rect = stageElem.getBoundingClientRect();
          const isVisible = (rect.bottom >= -200 && rect.top <= window.innerHeight + 200);
          if (!isVisible) {
            const c = stageElem.querySelector('canvas');
            if (c) { c.width = 0; c.height = 0; }
            stageElem.innerHTML = `<div class="page-skeleton"><span class="page-skeleton-badge">第 ${targetPageNum} 页 译文 (已就绪)</span></div>`;
            stageElem.classList.add('is-unloaded');
          }
        }
      }
    } catch (err) {
      console.error('批量翻译失败:', err);
      transActiveBadge.textContent = `翻译失败: ${err.message}`;
      tasksToTranslate.forEach(t => {
        if (t.overlayBlock) {
          t.overlayBlock.classList.remove('is-translating');
          t.overlayBlock.classList.add('error');
          t.overlayBlock.textContent = `翻译失败: ${err.message}`;
        }
      });
    }
  }

  // 8. 全文自动翻译核心方法
  async function translateFullDocument() {
    if (!currentPdf || isTranslatingDoc) return;

    const totalPages = currentPdf.numPages;

    // 检查是否所有页面都已经翻译完成
    let untranslatedPages = [];
    for (let p = 1; p <= totalPages; p++) {
      if (!isPageTranslated(p)) untranslatedPages.push(p);
    }

    // 核心优化：若全文已经 100% 翻译完毕，再次点击不再空转，而是直接执行下载与打开导出面板！
    if (untranslatedPages.length === 0) {
      showToast('✓ 全文已完成翻译，正在为你下载导出的双语对照文件...');
      exportBilingualDocument('download');
      openDownloadModal();
      updateTranslateDocButtonState();
      return;
    }

    isTranslatingDoc = true;
    activeTranslateController = { aborted: false };

    // 动态检测是否配置个人 API Key
    const settings = await new Promise(resolve => {
      chrome.storage.local.get({
        glmApiKey: '',
        deepseekApiKey: '',
        geminiApiKey: '',
        customModels: []
      }, resolve);
    });
    const hasPersonalKey = Boolean(settings.glmApiKey || settings.deepseekApiKey || settings.geminiApiKey || (settings.customModels && settings.customModels.length > 0));

    const freeQuotaHint = document.getElementById('free-quota-hint');
    if (!hasPersonalKey && freeQuotaHint) {
      freeQuotaHint.classList.remove('hidden');
    } else if (freeQuotaHint) {
      freeQuotaHint.classList.add('hidden');
    }

    const activeEngine = (pdfTranslateEngine && pdfTranslateEngine.value) ? pdfTranslateEngine.value : (settings.defaultEngine || 'google');

    if (isAIEngine(activeEngine)) {
      showToast(`💡 提示：当前正在使用 AI 模型 (${activeEngine}) 全文翻译，长文档处理耗时与 Token 消耗较多，可在进度条随时中止`, 'info', 4500);
    } else if (!hasPersonalKey) {
      showToast('ℹ️ 正在使用免Key公共通道，已开启防 429 智能平滑调度；配置免费 Gemini/GLM 密钥可享极速！', 'info', 4000);
    }

    transProgressCard.classList.remove('hidden');
    transActiveBadge.textContent = '全文翻译中...';
    if (translateDocBtn) translateDocBtn.disabled = true;
    if (translatePageBtn) translatePageBtn.disabled = true;
    if (translateRangeBtn) translateRangeBtn.disabled = true;
    if (summarizeDocBtn) summarizeDocBtn.disabled = true;

    for (let p = 1; p <= totalPages; p++) {
      if (activeTranslateController.aborted) break;

      const percent = Math.round(((p - 1) / totalPages) * 100);
      transProgressFill.style.width = `${percent}%`;
      transProgressLabel.textContent = `正在翻译第 ${p} / ${totalPages} 页 (${percent}%)...`;

      // 智能断点续译：已翻译完成且与目标语言一致的页面直接跳过，避免重复消耗 API 额度与时间
      if (isPageTranslated(p)) {
        updateThumbnailStatus(p);
        continue;
      }

      await translatePage(p, true);
      updateThumbnailStatus(p);

      // 防限流自适应平滑调度延迟：免Key模式延缓至 850ms 冷却，有Key极速模式 250ms
      const pageCooldownMs = hasPersonalKey ? 250 : 850;
      await new Promise(r => setTimeout(r, pageCooldownMs));
    }

    if (activeTranslateController.aborted) {
      transProgressLabel.textContent = '翻译已停止';
      transActiveBadge.textContent = '已停止';
      showToast('全文翻译已中止');
    } else {
      transProgressFill.style.width = '100%';
      transProgressLabel.textContent = '全文翻译完成，正在启动下载...';
      transActiveBadge.textContent = '已完成';
      showToast('✓ 全文翻译已全部完成，已自动触发双语对照文件下载！');
      
      // 翻译完成后自动触发文件下载与弹窗！
      exportBilingualDocument('download');
      openDownloadModal();
      updateTranslateDocButtonState();
    }

    renderTransStageForPage(currentPage);

    setTimeout(() => {
      transProgressCard.classList.add('hidden');
    }, 2500);

    isTranslatingDoc = false;
    if (translateDocBtn) translateDocBtn.disabled = false;
    if (translatePageBtn) translatePageBtn.disabled = false;
    if (translateRangeBtn) translateRangeBtn.disabled = false;
    if (summarizeDocBtn) summarizeDocBtn.disabled = false;
  }

  // 8.5 沉浸式选页范围解析与批量调度器
  function parsePageRanges(rangeStr, maxPages) {
    if (!rangeStr || !rangeStr.trim() || !maxPages) return [];
    const parts = rangeStr.split(/[,，\s]+/);
    const pagesSet = new Set();

    for (const part of parts) {
      const trimmed = part.trim();
      if (!trimmed) continue;
      if (trimmed.includes('-')) {
        const [startStr, endStr] = trimmed.split('-');
        const start = parseInt(startStr, 10);
        const end = parseInt(endStr, 10);
        if (!isNaN(start) && !isNaN(end)) {
          const from = Math.max(1, Math.min(start, end));
          const to = Math.min(maxPages, Math.max(start, end));
          for (let p = from; p <= to; p++) {
            pagesSet.add(p);
          }
        }
      } else {
        const p = parseInt(trimmed, 10);
        if (!isNaN(p) && p >= 1 && p <= maxPages) {
          pagesSet.add(p);
        }
      }
    }
    return Array.from(pagesSet).sort((a, b) => a - b);
  }

  async function translatePageList(pages) {
    if (!currentPdf || isTranslatingDoc || !pages || pages.length === 0) return;
    isTranslatingDoc = true;
    activeTranslateController = { aborted: false };

    transProgressCard.classList.remove('hidden');
    transActiveBadge.textContent = '选页翻译中...';
    if (translateDocBtn) translateDocBtn.disabled = true;
    if (translatePageBtn) translatePageBtn.disabled = true;
    if (translateRangeBtn) translateRangeBtn.disabled = true;
    if (summarizeDocBtn) summarizeDocBtn.disabled = true;

    const total = pages.length;
    const settings = await new Promise(r => getSettings(r));
    const activeEngine = (pdfTranslateEngine && pdfTranslateEngine.value) ? pdfTranslateEngine.value : (settings.defaultEngine || 'google');

    if (isAIEngine(activeEngine) && total >= 2) {
      showToast(`💡 提示：当前正在使用 AI 模型 (${activeEngine}) 批量翻译 (${total} 页)，耗时与 Token 消耗较多，可在上方随时中止`, 'info', 4500);
    }

    for (let idx = 0; idx < total; idx++) {
      if (activeTranslateController.aborted) break;
      const p = pages[idx];
      const percent = Math.round((idx / total) * 100);
      transProgressFill.style.width = `${percent}%`;
      transProgressLabel.textContent = `正在翻译第 ${p} 页 (${idx + 1}/${total} 页, ${percent}%)...`;

      if (!isPageTranslated(p)) {
        await translatePage(p, true);
      }
      updateThumbnailStatus(p);

      // 防限流自适应平滑调度延迟 (350ms 冷却)，保障公共翻译通道不被封禁
      await new Promise(r => setTimeout(r, 350));
    }

    if (activeTranslateController.aborted) {
      transProgressLabel.textContent = '选页翻译已停止';
      transActiveBadge.textContent = '已停止';
      showToast('选页翻译已中止');
    } else {
      transProgressFill.style.width = '100%';
      transProgressLabel.textContent = `选页翻译完成 (共 ${total} 页)！`;
      transActiveBadge.textContent = '已完成';
      showToast(`✓ 选页翻译完成 (共 ${total} 页)`);
    }

    renderTransStageForPage(currentPage);

    setTimeout(() => {
      transProgressCard.classList.add('hidden');
    }, 2500);

    isTranslatingDoc = false;
    if (translateDocBtn) translateDocBtn.disabled = false;
    if (translatePageBtn) translatePageBtn.disabled = false;
    if (translateRangeBtn) translateRangeBtn.disabled = false;
    if (summarizeDocBtn) summarizeDocBtn.disabled = false;
  }

  // 9. 绑定沉浸式翻译双层工具栏与视图模式事件
  if (toggleSidebarBtn && viewerSidebar) {
    toggleSidebarBtn.addEventListener('click', () => {
      const isCollapsed = viewerSidebar.classList.toggle('collapsed');
      toggleSidebarBtn.classList.toggle('active', !isCollapsed);
    });
  }

  // 对照显示模式切换: 双语对照 / 仅原文 / 仅译文
  if (controlStyleSelect) {
    controlStyleSelect.addEventListener('change', () => {
      const mode = controlStyleSelect.value;
      if (mode === 'bilingual') {
        pdfPane.classList.remove('hidden');
        translationPane.classList.remove('hidden');
        renderTransStageForPage(currentPage);
      } else if (mode === 'original') {
        pdfPane.classList.remove('hidden');
        translationPane.classList.add('hidden');
      } else if (mode === 'translation') {
        pdfPane.classList.add('hidden');
        translationPane.classList.remove('hidden');
        renderTransStageForPage(currentPage);
      }
    });
  }

  // 预设缩放与适合页宽计算
  if (zoomPresetSelect) {
    zoomPresetSelect.addEventListener('change', () => {
      const val = zoomPresetSelect.value;
      if (val === 'fit-width') {
        if (currentPdf) {
          currentPdf.getPage(currentPage).then(p => {
            const vp = p.getViewport({ scale: 1.0 });
            const isBilingual = (controlStyleSelect && controlStyleSelect.value === 'bilingual');
            const availableW = viewerMain.clientWidth - (viewerSidebar.classList.contains('collapsed') ? 60 : 260);
            const targetScale = Math.max(0.5, Math.min(2.5, availableW / (vp.width * (isBilingual ? 2.1 : 1.05))));
            changeZoom(Math.round(targetScale * 100) / 100);
          });
        }
      } else if (val === 'fit-page') {
        if (currentPdf) {
          currentPdf.getPage(currentPage).then(p => {
            const vp = p.getViewport({ scale: 1.0 });
            const availableH = viewerMain.clientHeight - 90;
            const targetScale = Math.max(0.4, Math.min(2.0, availableH / vp.height));
            changeZoom(Math.round(targetScale * 100) / 100);
          });
        }
      } else {
        changeZoom(parseFloat(val));
      }
    });
  }

  // 步长放大缩小按钮监听 (+ / -)
  if (zoomInBtn) {
    zoomInBtn.addEventListener('click', () => {
      const nextScale = Math.min(3.0, Math.round((currentScale + 0.1) * 10) / 10);
      changeZoom(nextScale);
    });
  }

  if (zoomOutBtn) {
    zoomOutBtn.addEventListener('click', () => {
      const nextScale = Math.max(0.5, Math.round((currentScale - 0.1) * 10) / 10);
      changeZoom(nextScale);
    });
  }

  // Ctrl + 滚轮缩放支持
  if (viewerMain) {
    viewerMain.addEventListener('wheel', (e) => {
      if (e.ctrlKey) {
        e.preventDefault();
        const delta = e.deltaY < 0 ? 0.1 : -0.1;
        const nextScale = Math.min(3.0, Math.max(0.5, Math.round((currentScale + delta) * 10) / 10));
        changeZoom(nextScale);
      }
    }, { passive: false });
  }

  // 顶栏沉浸式隐藏与一键浮动唤回 + 回到顶部
  if (topBackBtn) {
    topBackBtn.addEventListener('click', () => {
      scrollToPage(1);
    });
  }

  if (hideTopBtn && showTopFloatingBtn) {
    hideTopBtn.addEventListener('click', () => {
      if (viewerHeaderTop) viewerHeaderTop.classList.add('hidden');
      if (viewerHeaderSub) viewerHeaderSub.classList.add('hidden');
      showTopFloatingBtn.classList.remove('hidden');
    });

    showTopFloatingBtn.addEventListener('click', () => {
      if (viewerHeaderTop) viewerHeaderTop.classList.remove('hidden');
      if (viewerHeaderSub) viewerHeaderSub.classList.remove('hidden');
      showTopFloatingBtn.classList.add('hidden');
    });

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (viewerHeaderTop && viewerHeaderTop.classList.contains('hidden')) {
          viewerHeaderTop.classList.remove('hidden');
          if (viewerHeaderSub) viewerHeaderSub.classList.remove('hidden');
          showTopFloatingBtn.classList.add('hidden');
        }
      }
    });
  }

  // 目标语言切换联动
  if (targetLanguageSelect) {
    chrome.storage.local.get({ defaultTargetLang: 'zh-CN' }, (res) => {
      if (res.defaultTargetLang) targetLanguageSelect.value = res.defaultTargetLang;
    });

    targetLanguageSelect.addEventListener('change', () => {
      chrome.storage.local.set({ defaultTargetLang: targetLanguageSelect.value });
      updateTranslateDocButtonState();
      if (pageTranslations.has(currentPage)) {
        translatePage(currentPage, false);
      }
      // 若当前划词翻译面板处于打开状态，同步使用新目标语言即时重译选中文本
      if (translatePanel && translatePanel.classList.contains('show') && currentSelectedText) {
        const engine = panelEngineSelect ? panelEngineSelect.value : (pdfTranslateEngine ? pdfTranslateEngine.value : 'google');
        const model = panelModelSelect ? panelModelSelect.value : '';
        doTranslation(currentSelectedText, engine, targetLanguageSelect.value, model, currentSelectionContext);
      }
    });
  }

  // 内置权威学术提示词模板 (轻量化高保真架构，Token 节约 70%+)
  const DEFAULT_PERSONA_PROMPTS = {
    biochem: `你是一名国际顶级期刊 (Nature/Cell/JACS) 的资深生化与分子生物学文献学术评审与翻译专家。
请将待翻译的学术文本精准严谨地翻译为目标语言，强制遵守以下核心规范：
1. 术语规范：严格符合《中国化学会命名原则》与《生物化学名词》标准，严禁字面硬翻实验标准方法（如 Western blot 译为 免疫印迹法；RT-qPCR 译为 逆转录定量PCR）。
2. 符号与单位保真：5'、3'、λ、ΔG°、ΔTm 等生物物理与希腊符号原样保留，严禁篡改或退化；数字、SI 单位与 __NUM_0__ 占位符严禁汉化或变动。
3. 核心专名双语对照：核心学术专有名词输出为【中文定名 (英文原文/缩写)】双语标注形态（例如：“野生型 (wild-type, WT)”），便于查词与索引溯源。
4. 排版结构一致：遇到多行标题或条目清单（以 \\n 分隔），严格保持相同行数与换行；普通正文自然流畅。
直接输出翻译结果，严禁包含任何前导解释、注脚或说明。`,

    economics: `你是一名国际顶级期刊 (AER/JPE/QJE/JF) 的经济学与金融学资深评审兼专业翻译家。
请将待翻译的学术文本精准严谨地翻译为目标语言，强制遵守以下核心规范：
1. 术语规范：严格符合经典经济学与金融工程规范审定名词（如 Quantitative Easing 译为 量化宽松；Phillips Curve 译为 菲利普斯曲线）。
2. 计量与符号保真：精确传达计量因果推断（OLS、DID、IV、RDD）与统计显著性；Δ、β、ε、R²、%、货币符号及阿拉伯数字 100% 原始保留。
3. 核心专名双语对照：核心经济金融专有名词输出为【中文定名 (英文原文)】双语标注，便于查词与概念对照。
4. 排版结构一致：遇到多行标题或条目清单，严格保持相同换行结构；普通正文保持语义流畅连贯。
直接输出翻译结果，严禁包含任何前导解释、注脚或说明。`
  };

  let editingPersona = 'biochem';

  function updateEditPromptButtonVisibility(persona) {
    if (!advEditPromptBtn) return;
    if (persona === 'general') {
      advEditPromptBtn.classList.add('hidden');
    } else {
      advEditPromptBtn.classList.remove('hidden');
      advEditPromptBtn.setAttribute('title', `修改【${persona === 'biochem' ? '生化学术专家' : '经济学专家'}】系统提示词`);
    }
  }

  // 翻译专家角色体系管理与多处联动
  function syncPersona(newVal) {
    currentPersona = newVal || 'general';
    if (personaSelect) personaSelect.value = currentPersona;
    if (advPersonaSelect) advPersonaSelect.value = currentPersona;
    updateEditPromptButtonVisibility(currentPersona);
    chrome.storage.local.set({ translationPersona: currentPersona });

    const personaLabels = {
      general: '默认通用翻译',
      biochem: '生化学术专家',
      economics: '经济学专家'
    };
    showToast(`翻译角色已切换为: ${personaLabels[currentPersona] || currentPersona}`);
  }

  if (personaSelect) {
    personaSelect.addEventListener('change', (e) => syncPersona(e.target.value));
  }
  if (advPersonaSelect) {
    advPersonaSelect.addEventListener('change', (e) => syncPersona(e.target.value));
  }

  chrome.storage.local.get({ translationPersona: 'biochem' }, (res) => {
    if (res.translationPersona) {
      currentPersona = res.translationPersona;
      if (personaSelect) personaSelect.value = currentPersona;
      if (advPersonaSelect) advPersonaSelect.value = currentPersona;
    }
    updateEditPromptButtonVisibility(currentPersona);
  });

  // 角色系统提示词在线编辑器 (Prompt Editor)
  if (advEditPromptBtn) {
    advEditPromptBtn.addEventListener('click', () => {
      editingPersona = currentPersona === 'general' ? 'biochem' : currentPersona;
      const personaNames = {
        biochem: '生化学术专家',
        economics: '经济学专家'
      };
      if (promptModalTitle) {
        promptModalTitle.textContent = `修改【${personaNames[editingPersona] || editingPersona}】系统提示词`;
      }
      chrome.storage.local.get({ customPersonaPrompts: {} }, (res) => {
        const customPrompts = res.customPersonaPrompts || {};
        const currentPrompt = customPrompts[editingPersona] || DEFAULT_PERSONA_PROMPTS[editingPersona] || '';
        if (personaPromptTextarea) {
          personaPromptTextarea.value = currentPrompt;
        }
        if (personaPromptModal) {
          personaPromptModal.classList.remove('hidden');
        }
      });
    });
  }

  if (closePromptModalBtn && personaPromptModal) {
    closePromptModalBtn.addEventListener('click', () => {
      personaPromptModal.classList.add('hidden');
    });
  }

  if (btnCancelPrompt && personaPromptModal) {
    btnCancelPrompt.addEventListener('click', () => {
      personaPromptModal.classList.add('hidden');
    });
  }

  if (btnRestorePrompt) {
    btnRestorePrompt.addEventListener('click', () => {
      const personaNames = {
        biochem: '生化学术专家',
        economics: '经济学专家'
      };
      if (confirm(`确定恢复【${personaNames[editingPersona] || editingPersona}】默认权威提示词吗？`)) {
        if (personaPromptTextarea) {
          personaPromptTextarea.value = DEFAULT_PERSONA_PROMPTS[editingPersona] || '';
        }
      }
    });
  }

  if (btnSavePrompt) {
    btnSavePrompt.addEventListener('click', () => {
      const newPrompt = (personaPromptTextarea ? personaPromptTextarea.value : '').trim();
      chrome.storage.local.get({ customPersonaPrompts: {} }, (res) => {
        const customPrompts = res.customPersonaPrompts || {};
        if (newPrompt && newPrompt !== (DEFAULT_PERSONA_PROMPTS[editingPersona] || '').trim()) {
          customPrompts[editingPersona] = newPrompt;
        } else {
          delete customPrompts[editingPersona];
        }
        chrome.storage.local.set({ customPersonaPrompts: customPrompts }, () => {
          if (personaPromptModal) {
            personaPromptModal.classList.add('hidden');
          }
          const personaNames = {
            biochem: '生化学术专家',
            economics: '经济学专家'
          };
          showToast(`✓ 【${personaNames[editingPersona] || editingPersona}】提示词已更新并即时生效`);
        });
      });
    });
  }

  // 高级翻译设置模态框
  if (advancedTransBtn && advancedModal) {
    advancedTransBtn.addEventListener('click', () => {
      advancedModal.classList.remove('hidden');
    });
  }

  if (closeAdvancedModalBtn && advancedModal) {
    closeAdvancedModalBtn.addEventListener('click', () => {
      advancedModal.classList.add('hidden');
    });
  }

  if (advOpacityModeSelect) {
    advOpacityModeSelect.addEventListener('change', () => {
      opacityModeIndex = parseInt(advOpacityModeSelect.value, 10);
      renderTransStageForPage(currentPage);
    });
  }

  if (advTogglePeekBtn) {
    advTogglePeekBtn.addEventListener('click', () => {
      isPeekingLocked = !isPeekingLocked;
      viewerWorkspace.classList.toggle('is-peeking', isPeekingLocked);
      advTogglePeekBtn.textContent = isPeekingLocked ? '恢复正常显示 (已锁定透视)' : '锁定透视原图';
    });
  }

  if (advExportBilingualBtn) {
    advExportBilingualBtn.addEventListener('click', () => {
      exportBilingualDocument();
    });
  }

  // 欢迎屏幕文件选择框
  if (welcomeFileInput) {
    welcomeFileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) requestOpenFile(file);
    });
  }

  // --- 模式切换与墨迹调色系统 (Edge 风格：文本、画笔、高光、橡皮擦) ---

  // 动态绘制正弦波墨迹预览曲线
  function updateInkWavePreview(color, width, isHighlighter, opacity) {
    if (!inkPreviewCanvas) return;
    const ctx = inkPreviewCanvas.getContext('2d');
    const w = inkPreviewCanvas.width;
    const h = inkPreviewCanvas.height;
    ctx.clearRect(0, 0, w, h);

    ctx.save();
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.min(width, 24);
    ctx.lineCap = isHighlighter ? 'square' : 'round';
    ctx.lineJoin = 'round';
    const effectiveOpacity = opacity !== undefined ? opacity : (isHighlighter ? currentHighlighterOpacity : 1.0);
    ctx.globalAlpha = isHighlighter ? effectiveOpacity : 1.0;

    const centerY = h / 2;
    const amplitude = 7;
    const startX = 14;
    const endX = w - 14;

    ctx.moveTo(startX, centerY);
    for (let x = startX; x <= endX; x++) {
      const norm = (x - startX) / (endX - startX);
      const y = centerY + Math.sin(norm * Math.PI * 2) * amplitude;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();
  }

  // 渲染调色板矩阵 (30 色画笔 vs 5 色荧光笔)
  function renderInkPalette(tool) {
    if (!inkColorsGrid) return;
    inkColorsGrid.innerHTML = '';
    const isHighlighter = (tool === 'highlighter');
    const palette = isHighlighter ? HIGHLIGHTER_PALETTE : PEN_PALETTE;
    const currentColor = isHighlighter ? currentHighlighterColor : currentPenColor;

    if (isHighlighter) {
      inkColorsGrid.classList.add('highlighter-mode');
    } else {
      inkColorsGrid.classList.remove('highlighter-mode');
    }

    // 控制透明度控制区显示/隐藏 (仅高光荧光笔显示)
    if (inkOpacitySection) {
      if (isHighlighter) {
        inkOpacitySection.classList.remove('hidden');
        if (inkOpacitySlider && inkOpacityBadge) {
          const pct = Math.round(currentHighlighterOpacity * 100);
          inkOpacitySlider.value = pct.toString();
          inkOpacityBadge.textContent = `${pct}%`;
        }
      } else {
        inkOpacitySection.classList.add('hidden');
      }
    }

    palette.forEach(color => {
      const btn = document.createElement('button');
      btn.className = 'ink-color-btn';
      btn.style.backgroundColor = color;
      btn.title = color;
      if (color.toUpperCase() === currentColor.toUpperCase()) {
        btn.classList.add('selected');
      }

      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        inkColorsGrid.querySelectorAll('.ink-color-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');

        if (isHighlighter) {
          currentHighlighterColor = color;
          if (highlighterColorIndicator) highlighterColorIndicator.style.backgroundColor = color;
          updateInkWavePreview(currentHighlighterColor, currentHighlighterWidth, true, currentHighlighterOpacity);
        } else {
          currentPenColor = color;
          if (penColorIndicator) penColorIndicator.style.backgroundColor = color;
          updateInkWavePreview(currentPenColor, currentPenWidth, false, 1.0);
        }

        chrome.storage.local.set({
          inkPenColor: currentPenColor,
          inkPenWidth: currentPenWidth,
          inkHighlighterColor: currentHighlighterColor,
          inkHighlighterWidth: currentHighlighterWidth,
          inkHighlighterOpacity: currentHighlighterOpacity
        });
      });

      inkColorsGrid.appendChild(btn);
    });

    // 初始化粗细滑块与波浪线
    if (inkWidthSlider && inkWidthBadge) {
      if (isHighlighter) {
        inkWidthSlider.min = '8';
        inkWidthSlider.max = '36';
        inkWidthSlider.value = currentHighlighterWidth.toString();
        inkWidthBadge.textContent = `${currentHighlighterWidth}px`;
        updateInkWavePreview(currentHighlighterColor, currentHighlighterWidth, true, currentHighlighterOpacity);
      } else {
        inkWidthSlider.min = '1';
        inkWidthSlider.max = '24';
        inkWidthSlider.value = currentPenWidth.toString();
        inkWidthBadge.textContent = `${currentPenWidth}px`;
        updateInkWavePreview(currentPenColor, currentPenWidth, false, 1.0);
      }
    }
  }

  function openInkPopover(tool, triggerEl) {
    if (!inkPopover || !triggerEl) return;
    if (activePopoverTool === tool && !inkPopover.classList.contains('hidden')) {
      closeInkPopover();
      return;
    }

    activePopoverTool = tool;
    renderInkPalette(tool);

    const rect = triggerEl.getBoundingClientRect();
    inkPopover.style.top = `${rect.bottom + 6}px`;
    let left = rect.left + rect.width / 2 - 128;
    left = Math.max(10, Math.min(window.innerWidth - 270, left));
    inkPopover.style.left = `${left}px`;

    inkPopover.classList.remove('hidden');
  }

  function closeInkPopover() {
    if (inkPopover) {
      inkPopover.classList.add('hidden');
      activePopoverTool = null;
    }
  }

  // 绑定粗细滑块输入
  if (inkWidthSlider) {
    inkWidthSlider.addEventListener('input', () => {
      const val = parseInt(inkWidthSlider.value, 10) || 3;
      if (inkWidthBadge) inkWidthBadge.textContent = `${val}px`;
      if (activePopoverTool === 'highlighter') {
        currentHighlighterWidth = val;
        updateInkWavePreview(currentHighlighterColor, currentHighlighterWidth, true, currentHighlighterOpacity);
      } else {
        currentPenWidth = val;
        updateInkWavePreview(currentPenColor, currentPenWidth, false, 1.0);
      }
      chrome.storage.local.set({
        inkPenWidth: currentPenWidth,
        inkHighlighterWidth: currentHighlighterWidth
      });
    });
  }

  // 绑定高光透明度滑块输入 (10% - 100%)
  if (inkOpacitySlider) {
    inkOpacitySlider.addEventListener('input', () => {
      const val = parseInt(inkOpacitySlider.value, 10) || 35;
      currentHighlighterOpacity = Math.max(0.1, Math.min(1.0, val / 100));
      if (inkOpacityBadge) inkOpacityBadge.textContent = `${val}%`;
      updateInkWavePreview(currentHighlighterColor, currentHighlighterWidth, true, currentHighlighterOpacity);
      chrome.storage.local.set({
        inkHighlighterOpacity: currentHighlighterOpacity
      });
    });
  }

  // 点击外部自动收起浮层
  document.addEventListener('click', (e) => {
    if (inkPopover && !inkPopover.classList.contains('hidden')) {
      if (!inkPopover.contains(e.target) && 
          !e.target.closest('#pen-split-group') && 
          !e.target.closest('#highlighter-split-group')) {
        closeInkPopover();
      }
    }
  });

  // 读取已保存的墨迹属性偏好
  chrome.storage.local.get({
    inkPenColor: '#0078D4',
    inkPenWidth: 3,
    inkHighlighterColor: '#FFF176',
    inkHighlighterWidth: 16,
    inkHighlighterOpacity: 0.35
  }, (res) => {
    currentPenColor = res.inkPenColor || '#0078D4';
    currentPenWidth = res.inkPenWidth || 3;
    currentHighlighterColor = res.inkHighlighterColor || '#FFF176';
    currentHighlighterWidth = res.inkHighlighterWidth || 16;
    currentHighlighterOpacity = (res.inkHighlighterOpacity !== undefined) ? res.inkHighlighterOpacity : 0.35;
    if (inkOpacitySlider) inkOpacitySlider.value = Math.round(currentHighlighterOpacity * 100).toString();
    if (inkOpacityBadge) inkOpacityBadge.textContent = `${Math.round(currentHighlighterOpacity * 100)}%`;
    if (penColorIndicator) penColorIndicator.style.backgroundColor = currentPenColor;
    if (highlighterColorIndicator) highlighterColorIndicator.style.backgroundColor = currentHighlighterColor;
  });

  // 全局统一工具模式切换
  function setToolMode(tool, silent) {
    currentTool = tool;
    isTextMode = (tool === 'text');
    isDrawMode = (tool !== 'text');

    // 工具按钮高亮状态联动
    if (textToolBtn) textToolBtn.classList.toggle('active', tool === 'text');
    if (penSplitGroup) penSplitGroup.classList.toggle('active', tool === 'pen');
    if (highlighterSplitGroup) highlighterSplitGroup.classList.toggle('active', tool === 'highlighter');
    if (eraserToolBtn) eraserToolBtn.classList.toggle('active', tool === 'eraser');

    // 辅助按钮组 (撤销/清空)
    if (drawActionsGroup) {
      drawActionsGroup.classList.toggle('hidden', tool === 'text');
    }

    // 画布与文本层交互状态
    if (viewerWorkspace) {
      viewerWorkspace.classList.toggle('mode-draw', tool === 'pen' || tool === 'highlighter');
      viewerWorkspace.classList.toggle('mode-eraser', tool === 'eraser');
    }

    if (tool !== 'text') {
      const sel = window.getSelection();
      if (sel) sel.removeAllRanges();
      hideIcon();
      hidePanel();
    }

    if (!silent) {
      const toolTips = {
        text: '已进入文本选择模式：滑选段落即显翻译气泡',
        pen: '已进入画笔绘制模式：支持 30 色彩绘与微调',
        highlighter: '已进入高光荧光笔：半透明高亮，不遮挡文字',
        eraser: '已进入橡皮擦：点击或划过即可整笔擦除'
      };
      if (toolTips[tool]) showToast(toolTips[tool]);
    }
  }

  function setTextMode(silent) {
    setToolMode('text', silent);
  }

  function setDrawMode() {
    setToolMode('pen', false);
  }

  function refreshPageAnnotationCanvas(pageNum) {
    const pageContainer = viewerContainer.querySelector(`.page-container[data-page-num="${pageNum}"]`);
    if (!pageContainer) return;
    const canvas = pageContainer.querySelector('.annotation-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    redrawPageAnnotations(pageNum, canvas);
  }

  function undoLastStroke() {
    const strokes = pageDrawings.get(currentPage);
    if (!strokes || strokes.length === 0) {
      showToast(`第 ${currentPage} 页暂无手绘批注可撤销`);
      return;
    }
    strokes.pop();
    if (strokes.length === 0) {
      pageDrawings.delete(currentPage);
    }
    markNotesDirty();
    refreshPageAnnotationCanvas(currentPage);
    showToast(`已撤销第 ${currentPage} 页最后一笔批注`);
  }

  function clearCurrentPageAnnotations() {
    const strokes = pageDrawings.get(currentPage);
    if (!strokes || strokes.length === 0) {
      showToast(`第 ${currentPage} 页暂无手绘批注`);
      return;
    }
    pageDrawings.delete(currentPage);
    markNotesDirty();
    refreshPageAnnotationCanvas(currentPage);
    showToast(`已清空第 ${currentPage} 页手绘批注`);
  }

  // 挂载按钮交互监听
  if (textToolBtn) {
    textToolBtn.addEventListener('click', () => {
      closeInkPopover();
      setToolMode('text', false);
    });
  }

  if (drawToolBtn) {
    drawToolBtn.addEventListener('click', () => {
      if (currentTool === 'pen') {
        openInkPopover('pen', penSplitGroup || drawToolBtn);
      } else {
        setToolMode('pen', false);
      }
    });
  }

  if (penArrowBtn) {
    penArrowBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      setToolMode('pen', true);
      openInkPopover('pen', penSplitGroup || penArrowBtn);
    });
  }

  if (highlighterToolBtn) {
    highlighterToolBtn.addEventListener('click', () => {
      if (currentTool === 'highlighter') {
        openInkPopover('highlighter', highlighterSplitGroup || highlighterToolBtn);
      } else {
        setToolMode('highlighter', false);
      }
    });
  }

  if (highlighterArrowBtn) {
    highlighterArrowBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      setToolMode('highlighter', true);
      openInkPopover('highlighter', highlighterSplitGroup || highlighterArrowBtn);
    });
  }

  if (eraserToolBtn) {
    eraserToolBtn.addEventListener('click', () => {
      closeInkPopover();
      setToolMode('eraser', false);
    });
  }

  if (drawUndoBtn) {
    drawUndoBtn.addEventListener('click', undoLastStroke);
  }

  if (drawClearBtn) {
    drawClearBtn.addEventListener('click', clearCurrentPageAnnotations);
  }

  if (drawSaveBtn) {
    drawSaveBtn.addEventListener('click', saveCurrentNotes);
  }

  if (saveDocBtn) {
    saveDocBtn.addEventListener('click', saveCurrentNotes);
  }

  // 保存下拉拆分按钮与菜单交互
  if (saveArrowBtn) {
    saveArrowBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!currentPdf || saveArrowBtn.disabled) return;
      if (saveDropdownMenu) {
        saveDropdownMenu.classList.toggle('hidden');
      }
    });
  }

  // 点击外部收起保存下拉菜单
  document.addEventListener('click', (e) => {
    if (saveDropdownMenu && !saveDropdownMenu.classList.contains('hidden')) {
      if (!e.target.closest('.save-split-btn-group')) {
        saveDropdownMenu.classList.add('hidden');
      }
    }
  });

  // 保存下拉菜单各项动作绑定
  if (menuSaveLocal) {
    menuSaveLocal.addEventListener('click', () => {
      if (saveDropdownMenu) saveDropdownMenu.classList.add('hidden');
      saveCurrentNotes();
    });
  }

  if (menuExportPdf) {
    menuExportPdf.addEventListener('click', () => {
      if (saveDropdownMenu) saveDropdownMenu.classList.add('hidden');
      printPdfWithAnnotations();
    });
  }

  if (menuExportBilingual) {
    menuExportBilingual.addEventListener('click', () => {
      if (saveDropdownMenu) saveDropdownMenu.classList.add('hidden');
      exportBilingualDocument('download');
    });
  }

  if (menuExportTxt) {
    menuExportTxt.addEventListener('click', () => {
      if (saveDropdownMenu) saveDropdownMenu.classList.add('hidden');
      exportPlainText();
    });
  }

  // 导出带批注 PDF 范围选择模态框交互绑定
  if (closeExportPdfModalBtn) closeExportPdfModalBtn.addEventListener('click', closeExportPdfModal);
  if (btnExportPdfCancel) btnExportPdfCancel.addEventListener('click', closeExportPdfModal);

  if (exportPdfModal) {
    const rangeRadios = exportPdfModal.querySelectorAll('input[name="export-pdf-range"]');
    rangeRadios.forEach(radio => {
      radio.addEventListener('change', () => {
        updateExportPdfSummary();
      });
    });

    if (exportPdfCustomInput) {
      exportPdfCustomInput.addEventListener('focus', () => {
        const customRadio = exportPdfModal.querySelector('input[value="custom"]');
        if (customRadio) {
          customRadio.checked = true;
          updateExportPdfSummary();
        }
      });
      exportPdfCustomInput.addEventListener('input', () => {
        updateExportPdfSummary();
      });
    }
  }

  if (btnExportPdfConfirm) {
    btnExportPdfConfirm.addEventListener('click', () => {
      const pages = getExportPdfSelectedPages();
      if (!pages || pages.length === 0) {
        showToast('⚠️ 未选择任何有效页码，请重新指定');
        return;
      }
      closeExportPdfModal();
      printPdfWithAnnotations(pages);
    });
  }

  // 草稿快照恢复与丢弃交互
  if (btnDraftRestore) {
    btnDraftRestore.addEventListener('click', () => {
      if (!activeDraftData || !activeDraftData.drawings) return;
      let restoredPages = 0;
      activeDraftData.drawings.forEach((strokes, p) => {
        pageDrawings.set(p, strokes);
        restoredPages++;
      });
      refreshPageAnnotationCanvas(currentPage);
      markNotesDirty();
      if (draftRecoveryBanner) draftRecoveryBanner.classList.add('hidden');
      activeDraftData = null;
      showToast(`已成功恢复 ${restoredPages} 页草稿手绘批注（请及时保存）`);
    });
  }

  if (btnDraftDiscard) {
    btnDraftDiscard.addEventListener('click', async () => {
      if (currentDocId) {
        await DocStorage.clearDraft(currentDocId);
      }
      if (draftRecoveryBanner) draftRecoveryBanner.classList.add('hidden');
      activeDraftData = null;
      showToast('已放弃临时草稿快照');
    });
  }

  // 确认未保存弹窗交互
  if (closeUnsavedModalBtn) closeUnsavedModalBtn.addEventListener('click', closeUnsavedModal);
  if (btnUnsavedCancel) btnUnsavedCancel.addEventListener('click', closeUnsavedModal);

  if (btnUnsavedDiscard) {
    btnUnsavedDiscard.addEventListener('click', () => {
      const nextFile = pendingFileToOpen;
      hasUnsavedNotes = false;
      updateSaveButtonState();
      if (unsavedNotesModal) unsavedNotesModal.classList.add('hidden');
      pendingFileToOpen = null;
      if (nextFile) {
        readLocalFile(nextFile);
      }
    });
  }

  if (btnUnsavedSave) {
    btnUnsavedSave.addEventListener('click', async () => {
      const nextFile = pendingFileToOpen;
      if (unsavedNotesModal) unsavedNotesModal.classList.add('hidden');
      pendingFileToOpen = null;
      await saveCurrentNotes();
      if (nextFile) {
        readLocalFile(nextFile);
      }
    });
  }

  // 关闭窗口/标签页前未保存拦截提醒
  window.addEventListener('beforeunload', (e) => {
    if (hasUnsavedNotes) {
      e.preventDefault();
      e.returnValue = '';
      return '';
    }
  });

  // 全局 Ctrl+S / Cmd+S 快捷保存手绘与阅读笔记
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 's') {
      if (currentPdf) {
        e.preventDefault();
        saveCurrentNotes();
      }
    }
  });

  // 画笔/批注模式下全局 Ctrl+Z 撤销最后一笔
  window.addEventListener('keydown', (e) => {
    if (isDrawMode && (e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      undoLastStroke();
    }
  });

  // --- PDF 全文检索与高亮导航引擎 ---
  // 匹配基于整页归一化文本（折叠空白 + 小写），可命中被 PDF 拆分到多个文本片段的词组
  function normalizeSearchText(str) {
    return (str || '').replace(/\s+/g, ' ').toLowerCase();
  }

  function isSearchOpen() {
    return !!(searchModal && !searchModal.classList.contains('hidden'));
  }

  function positionSearchModal() {
    if (!searchToolBtn || !searchModal) return;
    const rect = searchToolBtn.getBoundingClientRect();
    const modalW = searchModal.offsetWidth || 320;
    const left = Math.max(12, Math.min(rect.left, window.innerWidth - modalW - 12));
    searchModal.style.position = 'fixed';
    searchModal.style.top = `${Math.round(rect.bottom + 6)}px`;
    searchModal.style.left = `${Math.round(left)}px`;
    searchModal.style.right = 'auto';
  }

  async function getPageTextData(pageNum) {
    if (pageTextIndexCache.has(pageNum)) {
      return pageTextIndexCache.get(pageNum);
    }
    if (!currentPdf) return { normText: '' };
    const pdfAtStart = currentPdf;
    try {
      const page = await pdfAtStart.getPage(pageNum);
      const textContent = await page.getTextContent();
      const raw = textContent.items.map(it => (it.str || '') + (it.hasEOL ? ' ' : '')).join('');
      const data = { normText: normalizeSearchText(raw) };
      // 文档已切换则丢弃结果，避免旧文档文本写入新文档缓存
      if (pdfAtStart === currentPdf) pageTextIndexCache.set(pageNum, data);
      return data;
    } catch (e) {
      console.warn(`提取第 ${pageNum} 页文本失败:`, e);
      return { normText: '' };
    }
  }

  function clearSearchHighlights() {
    const highlights = document.querySelectorAll('.search-highlight');
    highlights.forEach(h => {
      const parent = h.parentNode;
      if (parent) {
        parent.replaceChild(document.createTextNode(h.textContent), h);
        parent.normalize();
      }
    });
  }

  function updateSearchCounter(scanning) {
    if (!searchMatches) return;
    const total = searchMatchesList.length;
    if (total === 0) {
      searchMatches.textContent = scanning ? '检索中…' : '0/0';
    } else {
      const cur = currentMatchIdx >= 0 ? currentMatchIdx + 1 : 0;
      searchMatches.textContent = `${cur}/${total}${scanning ? '…' : ''}`;
    }
  }

  // 中止进行中的检索并清空匹配状态（保留输入框内容，重新打开可直接复搜）
  function resetSearchState() {
    activeSearchId++;
    searchMatchesList = [];
    currentMatchIdx = -1;
    clearSearchHighlights();
    updateSearchCounter(false);
  }

  function closeSearch() {
    if (searchModal) searchModal.classList.add('hidden');
    if (searchToolBtn) searchToolBtn.classList.remove('active');
    resetSearchState();
  }

  // 仅在 viewerMain 容器内滚动，避免 scrollIntoView 连带滚动 window 导致顶栏偏移
  function scrollElementIntoViewer(el) {
    if (!el || !viewerMain) return;
    const r = el.getBoundingClientRect();
    const box = viewerMain.getBoundingClientRect();
    const margin = 80;
    let dy = 0;
    let dx = 0;
    if (r.top < box.top + margin) dy = r.top - box.top - margin;
    else if (r.bottom > box.bottom - margin) dy = r.bottom - box.bottom + margin;
    if (r.left < box.left) dx = r.left - box.left - 24;
    else if (r.right > box.right) dx = r.right - box.right + 24;
    if (dx || dy) viewerMain.scrollBy({ top: dy, left: dx, behavior: 'smooth' });
  }

  function highlightMatchesOnCurrentPage() {
    clearSearchHighlights();
    if (!isSearchOpen() || !searchInput || searchMatchesList.length === 0) return;
    const rawQuery = searchInput.value.trim();
    if (!rawQuery) return;
    const query = normalizeSearchText(rawQuery);
    if (!query) return;

    const currentContainer = viewerContainer.querySelector(`.page-container[data-page-num="${currentPage}"]`);
    if (!currentContainer) return;
    const textLayer = currentContainer.querySelector('.textLayer');
    if (!textLayer) return;

    // 筛选无嵌套子元素的叶子 span 节点
    const spans = Array.from(textLayer.querySelectorAll('span')).filter(s => s.children.length === 0);
    if (spans.length === 0) return;

    // 1. 构建流式字符映射表（映射到对应 span 与局部字符下标，支持跨 span 词组无缝匹配）
    const charMap = [];
    let stream = '';

    const queryHasSpace = /\s/.test(query);

    spans.forEach((span, sIdx) => {
      const text = span.textContent || '';
      if (text.length === 0) return;

      // 若检索词包含空格且两 span 间未以空白分隔，插入虚拟空格隔开词组
      if (queryHasSpace && stream.length > 0 && !/\s$/.test(stream) && !/^\s/.test(text)) {
        stream += ' ';
        charMap.push(null);
      }

      for (let i = 0; i < text.length; i++) {
        stream += text[i];
        charMap.push({ span, sIdx, charIdx: i });
      }
    });

    const streamLower = stream.toLowerCase();
    const curMatch = searchMatchesList[currentMatchIdx];

    // 2. 在全页连续文本流中检索所有匹配区间
    const pageMatches = [];
    let sPos = 0;
    let ord = 0;
    while ((sPos = streamLower.indexOf(query, sPos)) !== -1) {
      const ePos = sPos + query.length;
      const isActive = (curMatch && curMatch.pageNum === currentPage && curMatch.ordinal === ord);
      pageMatches.push({ start: sPos, end: ePos, isActive });
      sPos += query.length;
      ord++;
    }

    if (pageMatches.length === 0) return;

    // 3. 将各匹配项切分投影到对应的 span 节点上
    const spanHighlightMap = new Map(); // span -> Array of { start, end, isActive }

    pageMatches.forEach(pm => {
      for (let pos = pm.start; pos < pm.end; pos++) {
        const entry = charMap[pos];
        if (!entry) continue; // 虚拟空格跳过
        const { span, charIdx } = entry;
        if (!spanHighlightMap.has(span)) spanHighlightMap.set(span, []);
        const ranges = spanHighlightMap.get(span);
        const lastRange = ranges[ranges.length - 1];
        if (lastRange && lastRange.end === charIdx && lastRange.isActive === pm.isActive) {
          lastRange.end = charIdx + 1;
        } else {
          ranges.push({ start: charIdx, end: charIdx + 1, isActive: pm.isActive });
        }
      }
    });

    // 4. 重构参与高亮的 span DOM 结构
    let activeElementToScroll = null;

    spanHighlightMap.forEach((ranges, span) => {
      const origText = span.textContent;
      const frag = document.createDocumentFragment();
      let curIdx = 0;

      ranges.forEach(r => {
        if (r.start > curIdx) {
          frag.appendChild(document.createTextNode(origText.substring(curIdx, r.start)));
        }
        const mark = document.createElement('mark');
        mark.className = 'search-highlight';
        if (r.isActive) {
          mark.classList.add('active-match');
          if (!activeElementToScroll) activeElementToScroll = mark;
        }
        mark.textContent = origText.substring(r.start, r.end);
        frag.appendChild(mark);
        curIdx = r.end;
      });

      if (curIdx < origText.length) {
        frag.appendChild(document.createTextNode(origText.substring(curIdx)));
      }

      span.textContent = '';
      span.appendChild(frag);
    });

    // 5. 焦点项平滑视口滚动
    if (activeElementToScroll) {
      scrollElementIntoViewer(activeElementToScroll);
    }
  }

  function jumpToSearchMatch(index) {
    if (searchMatchesList.length === 0) return;
    if (index < 0) index = searchMatchesList.length - 1;
    if (index >= searchMatchesList.length) index = 0;
    currentMatchIdx = index;
    updateSearchCounter(false);
    const match = searchMatchesList[currentMatchIdx];
    if (match.pageNum !== currentPage) {
      // 目标页挂载完成后 mountPage 会再次触发高亮；此处兜底已挂载页的情况
      scrollToPage(match.pageNum);
      setTimeout(highlightMatchesOnCurrentPage, 350);
    } else {
      highlightMatchesOnCurrentPage();
    }
  }

  async function performPdfSearch(rawQuery) {
    const thisSearchId = ++activeSearchId;
    const query = normalizeSearchText((rawQuery || '').trim());
    searchMatchesList = [];
    currentMatchIdx = -1;
    clearSearchHighlights();

    if (!currentPdf || !query) {
      updateSearchCounter(false);
      return;
    }
    updateSearchCounter(true);

    const totalPages = currentPdf.numPages;
    const startPage = currentPage;
    const pageOrder = [startPage];
    for (let i = 1; i <= totalPages; i++) {
      if (i !== startPage) pageOrder.push(i);
    }

    const matchesByPage = new Map();
    let scanned = 0;

    for (const p of pageOrder) {
      const { normText } = await getPageTextData(p);
      if (thisSearchId !== activeSearchId) return; // 已被新检索/关闭/切换文档中止
      scanned++;

      let found = false;
      if (normText) {
        let start = 0;
        let ordinal = 0;
        while ((start = normText.indexOf(query, start)) !== -1) {
          if (!matchesByPage.has(p)) matchesByPage.set(p, []);
          matchesByPage.get(p).push({ pageNum: p, ordinal: ordinal++ });
          start += query.length;
          found = true;
        }
      }

      if (found) {
        // 仅在本页有新命中时重建有序列表，并按对象引用保持当前选中项
        const selected = searchMatchesList[currentMatchIdx];
        const sorted = [];
        for (let i = 1; i <= totalPages; i++) {
          if (matchesByPage.has(i)) sorted.push(...matchesByPage.get(i));
        }
        searchMatchesList = sorted;
        if (selected) {
          currentMatchIdx = searchMatchesList.indexOf(selected);
        } else if (p === startPage) {
          currentMatchIdx = 0 + searchMatchesList.findIndex(m => m.pageNum === startPage);
          highlightMatchesOnCurrentPage();
        }
      }

      if (found || scanned % 20 === 0) updateSearchCounter(true);
    }

    if (searchMatchesList.length === 0) {
      updateSearchCounter(false);
      return;
    }
    if (currentMatchIdx < 0) {
      const firstAfter = searchMatchesList.findIndex(m => m.pageNum >= startPage);
      currentMatchIdx = firstAfter !== -1 ? firstAfter : 0;
    }
    jumpToSearchMatch(currentMatchIdx);
  }

  function openSearch() {
    if (!searchModal) return;
    searchModal.classList.remove('hidden');
    if (searchToolBtn) searchToolBtn.classList.add('active');
    positionSearchModal();
    if (searchInput) {
      searchInput.focus();
      searchInput.select();
      if (searchInput.value.trim()) performPdfSearch(searchInput.value);
    }
  }

  // 页面关键词检索悬浮窗交互
  if (searchToolBtn && searchModal) {
    searchToolBtn.addEventListener('click', () => {
      if (isSearchOpen()) closeSearch();
      else openSearch();
    });

    window.addEventListener('resize', () => {
      if (isSearchOpen()) positionSearchModal();
    });

    // Ctrl/Cmd + F 唤起文档内检索（与按钮 Tooltip 中标注的快捷键保持一致）
    window.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'f') {
        if (!currentPdf) return;
        e.preventDefault();
        openSearch();
      }
    });
  }

  if (closeSearchBtn) {
    closeSearchBtn.addEventListener('click', closeSearch);
  }

  if (searchPrevBtn) {
    searchPrevBtn.addEventListener('click', () => jumpToSearchMatch(currentMatchIdx - 1));
  }

  if (searchNextBtn) {
    searchNextBtn.addEventListener('click', () => jumpToSearchMatch(currentMatchIdx + 1));
  }

  if (searchInput) {
    let searchDebounce = null;
    searchInput.addEventListener('input', () => {
      clearTimeout(searchDebounce);
      searchDebounce = setTimeout(() => performPdfSearch(searchInput.value), 250);
    });

    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        jumpToSearchMatch(currentMatchIdx + (e.shiftKey ? -1 : 1));
      } else if (e.key === 'Escape') {
        e.stopPropagation();
        closeSearch();
      }
    });
  }

  // 设置中心直达
  function openOptionsCenter() {
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.openOptionsPage) {
      chrome.runtime.openOptionsPage();
    } else {
      window.open('/options.html', '_blank');
    }
  }

  if (setupBtn) {
    setupBtn.addEventListener('click', openOptionsCenter);
  }

  const openSettingsFromProgress = document.getElementById('open-settings-from-progress');
  if (openSettingsFromProgress) {
    openSettingsFromProgress.addEventListener('click', (e) => {
      e.preventDefault();
      openOptionsCenter();
    });
  }

  // 翻译控制按钮
  if (translatePageBtn) {
    translatePageBtn.addEventListener('click', () => {
      if (!currentPdf) return;
      activeTranslateController = { aborted: false };
      translatePage(currentPage, false);
    });
  }

  if (translateDocBtn) {
    translateDocBtn.addEventListener('click', () => {
      if (!currentPdf) return;

      // 检查当前已翻译页面数量
      const totalPages = currentPdf.numPages;
      let translatedCount = 0;
      for (let p = 1; p <= totalPages; p++) {
        if (isPageTranslated(p)) {
          translatedCount++;
        }
      }

      // 如果全部 100% 已经翻译完成：再次点击立即触发自动下载，并弹出下载中心！
      if (translatedCount === totalPages) {
        showToast('✓ 全文已完成翻译，正在启动下载...');
        exportBilingualDocument('download');
        openDownloadModal();
        return;
      }

      // 否则启动全文自动翻译（已翻译的页会自动跳过）
      translateFullDocument();
    });
  }

  // 绑定下载模态框各选项与关闭事件
  if (btnDownloadHtml) {
    btnDownloadHtml.addEventListener('click', () => {
      exportBilingualDocument('download');
      closeDownloadModal();
    });
  }

  if (btnPrintPdf) {
    btnPrintPdf.addEventListener('click', () => {
      exportBilingualDocument('print');
      closeDownloadModal();
    });
  }

  if (btnDownloadTxt) {
    btnDownloadTxt.addEventListener('click', () => {
      exportPlainText();
      closeDownloadModal();
    });
  }

  if (closeDownloadModalBtn) {
    closeDownloadModalBtn.addEventListener('click', closeDownloadModal);
  }

  if (closeDownloadBtn) {
    closeDownloadBtn.addEventListener('click', closeDownloadModal);
  }

  // 选页翻译交互与模态框绑定
  function updateRangeModalSummary() {
    if (!rangePagesInput || !rangeCalcStatus || !currentPdf) return;
    const pages = parsePageRanges(rangePagesInput.value, currentPdf.numPages);
    if (pages.length === 0) {
      rangeCalcStatus.textContent = '未匹配到有效页码 (有效范围 1 - ' + currentPdf.numPages + ')';
      rangeCalcStatus.style.color = '#ef4444';
    } else {
      rangeCalcStatus.style.color = '#2563eb';
      const preview = pages.length > 8 ? pages.slice(0, 8).join(', ') + '...' : pages.join(', ');
      rangeCalcStatus.textContent = `已选取：${pages.length} 页 (${preview})`;
    }
  }

  if (translateRangeBtn && rangeModal) {
    translateRangeBtn.addEventListener('click', () => {
      if (!currentPdf) return;
      rangeModal.classList.remove('hidden');
      if (rangePagesInput && (!rangePagesInput.value || rangePagesInput.value.trim() === '')) {
        rangePagesInput.value = `${currentPage}`;
      }
      updateRangeModalSummary();
      if (rangePagesInput) rangePagesInput.focus();
    });
  }

  if (closeRangeModalBtn && rangeModal) {
    closeRangeModalBtn.addEventListener('click', () => {
      rangeModal.classList.add('hidden');
    });
  }

  if (cancelRangeBtn && rangeModal) {
    cancelRangeBtn.addEventListener('click', () => {
      rangeModal.classList.add('hidden');
    });
  }

  if (rangePagesInput) {
    rangePagesInput.addEventListener('input', () => {
      updateRangeModalSummary();
    });
    rangePagesInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        if (startRangeBtn) startRangeBtn.click();
      }
    });
  }

  // 绑定预设按钮
  const presetBtns = document.querySelectorAll('.range-preset-btn');
  presetBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      if (!currentPdf || !rangePagesInput) return;
      const preset = btn.dataset.preset;
      const total = currentPdf.numPages;
      if (preset === 'current') {
        rangePagesInput.value = `${currentPage}`;
      } else if (preset === '1-3') {
        rangePagesInput.value = `1-${Math.min(3, total)}`;
      } else if (preset === '1-10') {
        rangePagesInput.value = `1-${Math.min(10, total)}`;
      } else if (preset === 'all') {
        rangePagesInput.value = `1-${total}`;
      }
      updateRangeModalSummary();
    });
  });

  if (startRangeBtn && rangeModal) {
    startRangeBtn.addEventListener('click', () => {
      if (!currentPdf || !rangePagesInput) return;
      const pages = parsePageRanges(rangePagesInput.value, currentPdf.numPages);
      if (pages.length === 0) {
        showToast('请输入有效的页码范围');
        return;
      }
      rangeModal.classList.add('hidden');
      translatePageList(pages);
    });
  }

  if (cancelTransBtn) {
    cancelTransBtn.addEventListener('click', () => {
      if (activeTranslateController) {
        activeTranslateController.aborted = true;
      }
    });
  }

  if (pdfTranslateEngine) {
    pdfTranslateEngine.addEventListener('change', () => {
      chrome.storage.local.set({ pdfTranslateEngine: pdfTranslateEngine.value });
      updateToolbarModelSelect(pdfTranslateEngine.value);
      // 双向联动：顶部工具栏引擎切换时，同步更新划词浮窗中的引擎及模型
      if (panelEngineSelect && panelEngineSelect.value !== pdfTranslateEngine.value) {
        panelEngineSelect.value = pdfTranslateEngine.value;
        updateModelSelect(pdfTranslateEngine.value, () => {
          if (pdfTranslateModel && pdfTranslateModel.value && Array.from(panelModelSelect.options).some(o => o.value === pdfTranslateModel.value)) {
            panelModelSelect.value = pdfTranslateModel.value;
          }
          if (translatePanel && translatePanel.classList.contains('show') && currentSelectedText) {
            doTranslation(currentSelectedText, panelEngineSelect.value, getActiveTargetLang(), panelModelSelect.value, currentSelectionContext);
          }
        });
      }
    });
  }

  // --- 论文核心框架与学术大纲总结 (骨干抽取与流式输出) ---
  function formatSummaryMarkdown(md) {
    if (!md) return '';
    const lines = md.split('\n');
    let html = '';
    let inList = false;

    for (let line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('### ')) {
        if (inList) { html += '</ul>'; inList = false; }
        html += `<h3>${escapeHtml(trimmed.substring(4))}</h3>`;
      } else if (trimmed.startsWith('## ')) {
        if (inList) { html += '</ul>'; inList = false; }
        html += `<h2>${escapeHtml(trimmed.substring(3))}</h2>`;
      } else if (trimmed.startsWith('# ')) {
        if (inList) { html += '</ul>'; inList = false; }
        html += `<h1>${escapeHtml(trimmed.substring(2))}</h1>`;
      } else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
        if (!inList) { html += '<ul>'; inList = true; }
        let content = escapeHtml(trimmed.substring(2));
        content = content.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        content = content.replace(/`([^`]+)`/g, '<code>$1</code>');
        html += `<li>${content}</li>`;
      } else if (trimmed === '') {
        if (inList) { html += '</ul>'; inList = false; }
      } else {
        if (inList) { html += '</ul>'; inList = false; }
        let content = escapeHtml(trimmed);
        content = content.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        content = content.replace(/`([^`]+)`/g, '<code>$1</code>');
        html += `<p>${content}</p>`;
      }
    }
    if (inList) { html += '</ul>'; }
    return html;
  }

  async function extractPaperBackbone(pdf) {
    const totalPages = pdf.numPages;

    // 1. 抽取 Head 样本 (第 1-2 页：标题、作者、摘要、前言贡献)
    let headText = '';
    for (let p = 1; p <= Math.min(2, totalPages); p++) {
      try {
        const page = await pdf.getPage(p);
        const tc = await page.getTextContent();
        const pageStr = tc.items.map(it => (it.str || '') + (it.hasEOL ? '\n' : ' ')).join('');
        headText += `\n--- [Page ${p}] ---\n` + pageStr;
      } catch (e) {
        console.warn(`提取第 ${p} 页文本失败:`, e);
      }
    }
    const headSample = headText.trim().substring(0, 3500);

    // 2. 扫描前 10 页抽取章节骨架 (Section Headings)
    const headingLines = [];
    const headingRegex = /^(?:(?:[0-9IVX]+|[A-Z])\.\s+[A-Z][A-Za-z0-9\s\-:]{2,50}$|(?:Abstract|Introduction|Related\s+Work|Methodology|Method|Architecture|System\s+Overview|Experiments?|Results|Evaluation|Discussion|Conclusion|Future\s+Work)\b)/i;

    for (let p = 1; p <= Math.min(10, totalPages); p++) {
      try {
        const page = await pdf.getPage(p);
        const tc = await page.getTextContent();
        const pageStr = tc.items.map(it => (it.str || '') + (it.hasEOL ? '\n' : ' ')).join('');
        const lines = pageStr.split('\n');
        for (const rawLine of lines) {
          const l = rawLine.trim();
          if (l.length >= 3 && l.length <= 60 && headingRegex.test(l)) {
            if (!headingLines.includes(l)) {
              headingLines.push(l);
            }
          }
        }
      } catch (e) {}
    }
    const headings = headingLines.slice(0, 20).join('\n');

    // 3. 抽取 Tail 样本 (最后 2 页：结论与未来展望，截断 References 引用列表)
    let tailText = '';
    const tailStart = Math.max(1, totalPages - 1);
    for (let p = tailStart; p <= totalPages; p++) {
      try {
        const page = await pdf.getPage(p);
        const tc = await page.getTextContent();
        const pageStr = tc.items.map(it => (it.str || '') + (it.hasEOL ? '\n' : ' ')).join('');
        tailText += `\n--- [Page ${p}] ---\n` + pageStr;
      } catch (e) {
        console.warn(`提取末尾第 ${p} 页失败:`, e);
      }
    }

    const refIdx = tailText.search(/\n\s*(?:References|Bibliography|Literature\s+Cited|Acknowledgements?)\b/i);
    if (refIdx !== -1) {
      tailText = tailText.substring(0, refIdx);
    }
    const tailSample = tailText.trim().substring(0, 2500);

    return { headings, headSample, tailSample };
  }

  if (summarizeDocBtn) {
    summarizeDocBtn.addEventListener('click', async () => {
      if (!currentPdf) {
        showToast('⚠️ 请先打开并加载一份 PDF 文档后再进行学术总结', 'warning');
        return;
      }

      if (!paperSummaryModal) return;
      paperSummaryModal.classList.remove('hidden');

      if (summaryContent) summaryContent.innerHTML = '';
      lastSummaryMarkdown = '';
      if (summaryLoadingSpinner) summaryLoadingSpinner.classList.remove('hidden');
      if (summaryStatusLabel) summaryStatusLabel.textContent = '正在抽取论文核心骨架...';

      if (currentSummaryPort) {
        try { currentSummaryPort.disconnect(); } catch (e) {}
        currentSummaryPort = null;
      }

      try {
        const backbone = await extractPaperBackbone(currentPdf);
        if (summaryStatusLabel) summaryStatusLabel.textContent = 'AI 正在精读并生成架构总结...';

        const port = chrome.runtime.connect({ name: 'paper-summary-stream' });
        currentSummaryPort = port;

        port.onMessage.addListener((msg) => {
          if (msg.type === 'start') {
            if (summaryStatusLabel) summaryStatusLabel.textContent = 'AI 正在精读并生成架构总结...';
          } else if (msg.type === 'chunk') {
            lastSummaryMarkdown += msg.delta;
            if (summaryLoadingSpinner) summaryLoadingSpinner.classList.add('hidden');
            if (summaryContent) {
              summaryContent.innerHTML = formatSummaryMarkdown(lastSummaryMarkdown);
            }
          } else if (msg.type === 'done') {
            if (summaryLoadingSpinner) summaryLoadingSpinner.classList.add('hidden');
            if (summaryStatusLabel) summaryStatusLabel.textContent = '✓ 总结生成完毕 (极速骨干模式)';
            if (summaryContent && (!lastSummaryMarkdown || lastSummaryMarkdown.trim() === '')) {
              summaryContent.innerHTML = formatSummaryMarkdown(msg.fullText || '');
              lastSummaryMarkdown = msg.fullText || '';
            }
            currentSummaryPort = null;
          } else if (msg.type === 'error') {
            if (summaryLoadingSpinner) summaryLoadingSpinner.classList.add('hidden');
            if (summaryStatusLabel) summaryStatusLabel.textContent = '总结生成出错';
            const isKeyError = String(msg.error || '').includes('API Key') || String(msg.error || '').includes('设置');
            const setupBtnHtml = isKeyError
              ? `<div style="margin-top:10px;"><button id="summary-quick-options-btn" style="background:#2563eb; color:#ffffff; border:none; border-radius:6px; padding:6px 14px; font-size:12px; font-weight:600; cursor:pointer;">⚙️ 立即前往设置配置免费 Key (智谱永久免费)</button></div>`
              : '';
            if (summaryContent) {
              summaryContent.innerHTML = `<div style="color:#ef4444; padding:12px; background:rgba(239,68,68,0.08); border-radius:8px; font-size:12.5px; line-height:1.5;">⚠️ 总结提炼失败: ${escapeHtml(msg.error || '未知错误')}${setupBtnHtml}</div>`;
              const btn = summaryContent.querySelector('#summary-quick-options-btn');
              if (btn) {
                btn.addEventListener('click', () => {
                  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.openOptionsPage) {
                    chrome.runtime.openOptionsPage();
                  } else {
                    window.open('/options.html');
                  }
                });
              }
            }
            showToast(`提炼失败: ${msg.error || '未知错误'}`, 'error', 4500);
            currentSummaryPort = null;
          }
        });

        port.onDisconnect.addListener(() => {
          if (currentSummaryPort === port) {
            currentSummaryPort = null;
          }
        });

        const activeEngine = (pdfTranslateEngine && pdfTranslateEngine.value) ? pdfTranslateEngine.value : 'glm';
        const activeModel = (pdfTranslateModel && pdfTranslateModel.value) ? pdfTranslateModel.value : '';

        port.postMessage({
          backbone,
          engine: isAIEngine(activeEngine) ? activeEngine : 'glm',
          targetLang: 'zh-CN',
          model: activeModel
        });
      } catch (err) {
        if (summaryLoadingSpinner) summaryLoadingSpinner.classList.add('hidden');
        if (summaryStatusLabel) summaryStatusLabel.textContent = '骨架抽取失败';
        if (summaryContent) {
          summaryContent.innerHTML = `<div style="color:#ef4444; padding:12px; background:rgba(239,68,68,0.08); border-radius:8px; font-size:12.5px;">⚠️ 抽取失败: ${escapeHtml(err.message)}</div>`;
        }
      }
    });
  }

  if (closeSummaryModalBtn && paperSummaryModal) {
    closeSummaryModalBtn.addEventListener('click', () => {
      if (currentSummaryPort) {
        try { currentSummaryPort.disconnect(); } catch (e) {}
        currentSummaryPort = null;
      }
      paperSummaryModal.classList.add('hidden');
    });
  }

  if (paperSummaryModal) {
    paperSummaryModal.addEventListener('click', (e) => {
      if (e.target === paperSummaryModal) {
        if (currentSummaryPort) {
          try { currentSummaryPort.disconnect(); } catch (e) {}
          currentSummaryPort = null;
        }
        paperSummaryModal.classList.add('hidden');
      }
    });
  }

  if (copySummaryBtn) {
    copySummaryBtn.addEventListener('click', () => {
      if (!lastSummaryMarkdown) {
        showToast('暂无总结内容可复制', 'warning');
        return;
      }
      navigator.clipboard.writeText(lastSummaryMarkdown).then(() => {
        showToast('✓ 论文总结 Markdown 已复制到剪贴板', 'success');
      }).catch(() => {
        showToast('复制失败，请手动选择复制', 'error');
      });
    });
  }

  // --- 角色切换器交互：点击胶囊任意区域即聚焦并呼出角色下拉菜单，彻底消除悬停误弹浮窗 ---
  const personaSelectGroup = document.querySelector('.persona-select-group');
  if (personaSelectGroup && personaSelect) {
    personaSelectGroup.addEventListener('click', (e) => {
      if (e.target !== personaSelect) {
        personaSelect.focus();
        if (typeof personaSelect.showPicker === 'function') {
          try { personaSelect.showPicker(); } catch (err) {}
        }
      }
    });
  }

  // --- 方案 A：沉浸式双语流视图切换按钮与控制栏联动 ---
  if (viewModeBtn) {
    viewModeBtn.addEventListener('click', () => {
      setViewMode(currentViewMode === 'flow' ? 'inplace' : 'flow');
    });
  }

  if (controlStyleSelect) {
    controlStyleSelect.addEventListener('change', () => {
      if (controlStyleSelect.value === 'flow') {
        setViewMode('flow');
      } else if (currentViewMode === 'flow') {
        setViewMode('inplace');
      }
    });
  }

  // 读取已保存的视图模式偏好
  chrome.storage.local.get({ pdfViewMode: 'inplace' }, (res) => {
    if (res.pdfViewMode === 'flow') {
      setViewMode('flow');
    }
  });

  // --- 监听屏幕缩放 / DPI 变化动态高清自适应更新 ---
  let lastDevicePixelRatio = window.devicePixelRatio || 1;
  function handleDprChange() {
    const currentDpr = window.devicePixelRatio || 1;
    if (Math.abs(currentDpr - lastDevicePixelRatio) > 0.05) {
      lastDevicePixelRatio = currentDpr;
      if (currentPdf) {
        renderedPages.clear();
        setupVirtualObserver(++currentRenderId);
        if (translationPane && !translationPane.classList.contains('hidden')) {
          renderTransStageForPage(currentPage);
        }
      }
    }
  }

  window.addEventListener('resize', handleDprChange);
  if (window.matchMedia) {
    try {
      const dprMedia = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
      if (dprMedia && dprMedia.addEventListener) {
        dprMedia.addEventListener('change', handleDprChange);
      }
    } catch (e) {}
  }
});

