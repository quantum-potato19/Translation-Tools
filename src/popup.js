// Script for Toolbar Popup (popup.js v2.1)
import {
  LANGUAGES,
  DEFAULT_PERSONA,
  ENGINE_STORAGE_DEFAULTS,
  AI_MODELS as CONST_AI_MODELS,
  detectTtsLang,
  escapeHtml
} from './shared/constants.js';

document.addEventListener('DOMContentLoaded', () => {
  const sourceText = document.getElementById('source-text');
  const resultText = document.getElementById('result-text');
  const clearBtn = document.getElementById('clear-btn');
  const srcLang = document.getElementById('src-lang');
  const tgtLang = document.getElementById('tgt-lang');
  const engineSelect = document.getElementById('engine-select');
  const modelSelect = document.getElementById('model-select');
  const modelSelectContainer = document.getElementById('model-select-container');
  const swapLangBtn = document.getElementById('swap-lang-btn');
  const copyBtn = document.getElementById('copy-btn');
  const starBtn = document.getElementById('star-btn');
  const speakSrcBtn = document.getElementById('speak-src-btn');
  const speakResBtn = document.getElementById('speak-res-btn');
  const settingsBtn = document.getElementById('settings-btn');
  const loadingSpinner = document.getElementById('loading-spinner');
  const currentEngineBadge = document.getElementById('current-engine-badge');
  const pdfNavBtn = document.getElementById('pdf-nav-btn');
  const vocabNavBtn = document.getElementById('vocab-nav-btn');
  const vocabOverlay = document.getElementById('vocab-overlay');
  const closeVocabBtn = document.getElementById('close-vocab-btn');
  const vocabSearchInput = document.getElementById('vocab-search-input');
  const tabVocabAll = document.getElementById('tab-vocab-all');
  const tabVocabStarred = document.getElementById('tab-vocab-starred');
  const countAll = document.getElementById('count-all');
  const countStarred = document.getElementById('count-starred');
  const vocabList = document.getElementById('vocab-list');
  const exportVocabMdBtn = document.getElementById('export-vocab-md-btn');
  const exportVocabCsvBtn = document.getElementById('export-vocab-csv-btn');
  const clearUnstarredBtn = document.getElementById('clear-unstarred-btn');

  let currentRequestId = 0;
  let debounceTimer;

  const AI_MODELS = { ...CONST_AI_MODELS };

  // 动态填充语言下拉菜单 (支持 16 种国际语言)
  function populateLanguageSelects() {
    srcLang.innerHTML = '<option value="auto">自动检测</option>';
    tgtLang.innerHTML = '';

    LANGUAGES.forEach((l) => {
      const optSrc = document.createElement('option');
      optSrc.value = l.code;
      optSrc.textContent = l.label;
      srcLang.appendChild(optSrc);

      const optTgt = document.createElement('option');
      optTgt.value = l.code;
      optTgt.textContent = l.label;
      tgtLang.appendChild(optTgt);
    });
  }
  populateLanguageSelects();

  // 一键直达本地 PDF 沉浸式翻译 Web 页面
  if (pdfNavBtn) {
    pdfNavBtn.addEventListener('click', () => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        let viewerUrl = chrome.runtime.getURL('pdf_viewer.html');
        if (tabs && tabs[0] && tabs[0].url) {
          const tabUrl = tabs[0].url;
          const cleanUrl = tabUrl.split('?')[0].split('#')[0].toLowerCase();
          if (cleanUrl.endsWith('.pdf') || tabUrl.toLowerCase().includes('.pdf?') || tabUrl.toLowerCase().includes('/pdf/')) {
            viewerUrl += '?file=' + encodeURIComponent(tabUrl);
          }
        }
        chrome.tabs.create({ url: viewerUrl });
        window.close();
      });
    });
  }

  // 1. 检测当前活动 Tab 是否为 PDF，如果是，展示原生 PDF 阅读引导
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs && tabs[0]) {
      const tab = tabs[0];
      const url = tab.url || '';
      if (url.includes('pdf_viewer.html')) return;
      const cleanUrl = url.split('?')[0].split('#')[0].toLowerCase();
      const isPdf = cleanUrl.endsWith('.pdf') || 
                    url.toLowerCase().includes('.pdf?') || 
                    url.toLowerCase().includes('/pdf/');
      
      if (isPdf) {
        const warningCard = document.getElementById('pdf-warning-card');
        const workspaceMain = document.getElementById('workspace-main');
        const openPdfBtn = document.getElementById('open-pdf-btn');
        const openPdfNewTabBtn = document.getElementById('open-pdf-newtab-btn');
        const dismissBtn = document.getElementById('dismiss-pdf-card-btn');
        const filePermHint = document.getElementById('file-perm-hint');
        const openExtManageBtn = document.getElementById('open-ext-manage-btn');

        if (warningCard) warningCard.classList.remove('hidden');
        if (workspaceMain) workspaceMain.classList.add('hidden');

        // 当前页打开
        if (openPdfBtn) {
          openPdfBtn.onclick = () => {
            const viewerUrl = chrome.runtime.getURL('pdf_viewer.html') + '?file=' + encodeURIComponent(url);
            chrome.tabs.update(tab.id, { url: viewerUrl });
            window.close();
          };
        }

        // 新标签页打开
        if (openPdfNewTabBtn) {
          openPdfNewTabBtn.onclick = () => {
            const viewerUrl = chrome.runtime.getURL('pdf_viewer.html') + '?file=' + encodeURIComponent(url);
            chrome.tabs.create({ url: viewerUrl });
            window.close();
          };
        }

        // 切换回文本查词
        if (dismissBtn) {
          dismissBtn.onclick = () => {
            if (warningCard) warningCard.classList.add('hidden');
            if (workspaceMain) workspaceMain.classList.remove('hidden');
          };
        }

        // 本地 file:// 协议权限感知
        if (url.startsWith('file://') && chrome.extension && chrome.extension.isAllowedFileSchemeAccess) {
          chrome.extension.isAllowedFileSchemeAccess((isAllowed) => {
            if (!isAllowed && filePermHint) {
              filePermHint.classList.remove('hidden');
              if (openExtManageBtn) {
                openExtManageBtn.onclick = () => {
                  chrome.tabs.create({ url: 'chrome://extensions/?id=' + chrome.runtime.id });
                };
              }
            }
          });
        }
      }
    }
  });

  // 2. 加载可用引擎列表，并初始化配置
  function initializePopup() {
    chrome.storage.local.get({
      ...ENGINE_STORAGE_DEFAULTS,
      defaultTargetLang: 'zh-CN',
      defaultEngine: 'google',
      translationPersona: DEFAULT_PERSONA,
      customModels: []
    }, (result) => {
      // 填充目标语言
      if (result.defaultTargetLang) {
        tgtLang.value = result.defaultTargetLang;
      }

      // 动态载入用户在设置中启用的模型列表
      if (Array.isArray(result.glmModels) && result.glmModels.length > 0) AI_MODELS.glm = result.glmModels;

      // 动态构建可选引擎列表
      engineSelect.innerHTML = '';
      const available = [
        { value: 'google', label: 'Google' },
        { value: 'bing', label: 'Bing' }
      ];

      if (result.geminiApiKey && result.geminiApiKey.trim()) {
        available.push({ value: 'gemini', label: 'Gemini' });
      }
      if (result.deepseekApiKey && result.deepseekApiKey.trim()) {
        available.push({ value: 'deepseek', label: 'DeepSeek' });
      }
      if (result.glmApiKey && result.glmApiKey.trim()) {
        available.push({ value: 'glm', label: '智谱GLM' });
      }
      if ((result.deeplApiKey && result.deeplApiKey.trim()) || (result.deeplEndpoint && result.deeplEndpoint.trim())) {
        available.push({ value: 'deepl', label: 'DeepL' });
      }
      if (result.youdaoAppKey && result.youdaoAppSecret && result.youdaoAppKey.trim() && result.youdaoAppSecret.trim()) {
        available.push({ value: 'youdao', label: '有道' });
      }

      (result.customModels || []).forEach(m => {
        if ((m.apiKey && m.apiKey.trim()) || (m.endpoint && m.endpoint.trim())) {
          available.push({ value: `custom_${m.id}`, label: m.name });
        }
      });

      available.forEach(item => {
        const opt = document.createElement('option');
        opt.value = item.value;
        opt.textContent = item.label;
        engineSelect.appendChild(opt);
      });

      // 设置默认选中的翻译引擎 (若不可用则回退为 google)
      const availableValues = available.map(a => a.value);
      if (availableValues.includes(result.defaultEngine)) {
        engineSelect.value = result.defaultEngine;
      } else {
        engineSelect.value = 'google';
      }
      updateEngineBadge();

      // 根据选中的引擎渲染并加载活跃模型
      updateModelSelect(() => {
        // 优先检查 URL 参数中的待翻译文本 (如右键菜单唤起或独立小窗唤起: ?text=...)
        const urlParams = new URLSearchParams(window.location.search);
        const queryText = urlParams.get('text');
        if (queryText && queryText.trim()) {
          sourceText.value = queryText.trim();
          clearBtn.classList.remove('hidden');
          performTranslation();
          return;
        }

        // 如果没有 URL 参数，再检查当前活动标签页选中的文本，自动填入并翻译
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (tabs && tabs[0] && tabs[0].id) {
            if (chrome.scripting && chrome.scripting.executeScript) {
              chrome.scripting.executeScript({
                target: { tabId: tabs[0].id },
                func: () => window.getSelection().toString().trim()
              }, (results) => {
                if (chrome.runtime.lastError) {
                  return;
                }
                if (results && results[0]?.result) {
                  sourceText.value = results[0].result;
                  clearBtn.classList.remove('hidden');
                  performTranslation();
                }
              });
            }
          }
        });
      });
    });
  }

  // 3. 更新模型二级选择器状态
  function updateModelSelect(callback) {
    const engine = engineSelect.value;
    modelSelect.innerHTML = '';

    if (AI_MODELS[engine]) {
      const models = AI_MODELS[engine];

      models.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m;
        opt.textContent = m;
        modelSelect.appendChild(opt);
      });

      // 获取当前引擎存储的活跃模型版本
      const storageKey = `${engine}ActiveModel`;
      chrome.storage.local.get([storageKey], (res) => {
        if (res[storageKey] && models.includes(res[storageKey])) {
          modelSelect.value = res[storageKey];
        } else if (models.length > 0) {
          modelSelect.value = models[0];
        }
        modelSelectContainer.classList.remove('hidden');
        if (callback) callback();
      });
    } else {
      modelSelectContainer.classList.add('hidden');
      if (callback) callback();
    }
  }

  // 4. 更新引擎徽章
  function updateEngineBadge() {
    if (engineSelect.selectedIndex >= 0) {
      const selectedText = engineSelect.options[engineSelect.selectedIndex].text;
      currentEngineBadge.textContent = selectedText;
    }
  }

  // 5. 执行翻译请求 (带请求序号卫语句，杜绝异步乱序覆盖)
  function performTranslation() {
    const text = sourceText.value.trim();
    if (!text) {
      resultText.textContent = '翻译结果将在此显示...';
      resultText.classList.add('result-placeholder');
      loadingSpinner.classList.add('hidden');
      if (starBtn) starBtn.classList.remove('starred');
      return;
    }

    resultText.classList.remove('result-placeholder');
    loadingSpinner.classList.remove('hidden');
    resultText.textContent = '';

    const requestId = ++currentRequestId;
    const engine = engineSelect.value;
    const target = tgtLang.value;
    const source = srcLang.value;
    const model = modelSelect.value;

    // 检查该词汇在生词本中是否已被收藏，同步更新星标状态
    chrome.storage.local.get({ vocabularyHistory: [], translationPersona: DEFAULT_PERSONA }, (res) => {
      const list = res.vocabularyHistory || [];
      const existing = list.find(item => item.word.toLowerCase() === text.toLowerCase());
      const isStarred = Boolean(existing && existing.starred);
      if (starBtn) {
        if (isStarred) starBtn.classList.add('starred');
        else starBtn.classList.remove('starred');
      }

      chrome.runtime.sendMessage({
        action: 'translate',
        text: text,
        engine: engine,
        sourceLang: source,
        targetLang: target,
        model: model,
        persona: res.translationPersona || DEFAULT_PERSONA,
        enableBilingualNotation: true,
        isSelection: true
      }, (response) => {
        if (requestId !== currentRequestId) return;
        loadingSpinner.classList.add('hidden');

        if (!response) {
          resultText.textContent = '翻译出错：未收到后台响应';
          resultText.style.color = '#ff3b30';
          return;
        }

        if (response.success) {
          resultText.style.color = '';
          const trans = response.translation || '';
          if (response.note) {
            resultText.innerHTML = `${escapeHtml(trans)}<div class="term-note" style="margin-top:6px;font-size:11.5px;color:#007aff;opacity:0.85;line-height:1.4;">💡 权威定名备注: ${escapeHtml(response.note)}</div>`;
          } else {
            resultText.textContent = trans;
          }
          saveVocabularyRecord(text, trans, engine, isStarred);
        } else {
          resultText.textContent = `翻译出错：${response.error}`;
          resultText.style.color = '#ff3b30';
        }
      });
    });
  }

  // 6. 事件监听器

  // 输入框监听（防抖）
  sourceText.addEventListener('input', () => {
    if (sourceText.value.length > 0) {
      clearBtn.classList.remove('hidden');
    } else {
      clearBtn.classList.add('hidden');
    }

    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      performTranslation();
    }, 400);
  });

  // Shift + Enter 换行，Enter 直接翻译
  sourceText.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      clearTimeout(debounceTimer);
      performTranslation();
    }
  });

  // 清除输入内容
  clearBtn.addEventListener('click', () => {
    sourceText.value = '';
    clearBtn.classList.add('hidden');
    resultText.textContent = '翻译结果将在此显示...';
    resultText.classList.add('result-placeholder');
    resultText.style.color = '';
    if (starBtn) starBtn.classList.remove('starred');
    sourceText.focus();
  });

  // 引擎切换
  engineSelect.addEventListener('change', () => {
    updateEngineBadge();
    updateModelSelect(() => {
      performTranslation();
    });
  });

  // 模型切换
  modelSelect.addEventListener('change', () => {
    const engine = engineSelect.value;
    const model = modelSelect.value;
    
    // 保存活跃模型
    const storageKey = `${engine}ActiveModel`;
    chrome.storage.local.set({ [storageKey]: model }, () => {
      performTranslation();
    });
  });

  srcLang.addEventListener('change', performTranslation);
  tgtLang.addEventListener('change', performTranslation);

  // 语言交换
  swapLangBtn.addEventListener('click', () => {
    const srcVal = srcLang.value;
    const tgtVal = tgtLang.value;

    if (srcVal === 'auto') {
      srcLang.value = tgtVal;
      tgtLang.value = tgtVal === 'zh-CN' ? 'en' : 'zh-CN';
    } else {
      srcLang.value = tgtVal;
      tgtLang.value = srcVal;
    }
    performTranslation();
  });

  // 复制译文
  copyBtn.addEventListener('click', () => {
    const text = resultText.textContent;
    if (text && !resultText.classList.contains('result-placeholder')) {
      navigator.clipboard.writeText(text).then(() => {
        const originalHTML = copyBtn.innerHTML;
        copyBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" stroke="#34c759" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
        setTimeout(() => {
          copyBtn.innerHTML = originalHTML;
        }, 1500);
      });
    }
  });

  // TTS 语音朗读 (支持全语种自动精确识别)
  function speakText(text, langHint = '') {
    if (!text || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = detectTtsLang(text, langHint);
    window.speechSynthesis.speak(utterance);
  }

  speakSrcBtn.addEventListener('click', () => {
    speakText(sourceText.value.trim(), srcLang.value);
  });

  speakResBtn.addEventListener('click', () => {
    if (!resultText.classList.contains('result-placeholder')) {
      speakText(resultText.textContent.trim(), tgtLang.value);
    }
  });

  // 本地生词本存储逻辑 (不覆盖已有星标状态)
  function saveVocabularyRecord(word, translation, engine, isStarred = null) {
    if (!word || !translation) return;
    chrome.storage.local.get({ vocabularyHistory: [] }, (res) => {
      let list = Array.isArray(res.vocabularyHistory) ? res.vocabularyHistory : [];
      const cleanWord = word.trim();
      const existingIndex = list.findIndex(item => item.word.toLowerCase() === cleanWord.toLowerCase());
      if (existingIndex >= 0) {
        list[existingIndex].translation = translation.trim();
        list[existingIndex].engine = engine;
        list[existingIndex].timestamp = Date.now();
        if (typeof isStarred === 'boolean') {
          list[existingIndex].starred = isStarred;
        }
      } else {
        list.unshift({
          id: Date.now() + '_' + Math.random().toString(36).substr(2, 5),
          word: cleanWord,
          translation: translation.trim(),
          engine: engine,
          timestamp: Date.now(),
          starred: isStarred === true
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

  // 收藏当前输入词汇
  if (starBtn) {
    starBtn.addEventListener('click', () => {
      const word = sourceText.value.trim();
      const trans = resultText.textContent.trim();
      if (!word || !trans || resultText.classList.contains('result-placeholder')) return;

      const isStarred = starBtn.classList.toggle('starred');
      saveVocabularyRecord(word, trans, engineSelect.value, isStarred);
    });
  }

  // 生词本抽屉管理
  let vocabCurrentTab = 'all'; // 'all' | 'starred'
  let cachedVocabList = [];

  function formatTime(ts) {
    const d = new Date(ts);
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const h = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${m}-${day} ${h}:${min}`;
  }

  function renderVocabDOM() {
    const filterText = (vocabSearchInput.value || '').trim().toLowerCase();
    let displayList = cachedVocabList.filter(item => {
      const matchWord = (item.word || '').toLowerCase().includes(filterText);
      const matchTrans = (item.translation || '').toLowerCase().includes(filterText);
      const matchTab = vocabCurrentTab === 'all' || (vocabCurrentTab === 'starred' && item.starred);
      return (matchWord || matchTrans) && matchTab;
    });

    const totalCount = cachedVocabList.length;
    const starredCount = cachedVocabList.filter(i => i.starred).length;
    countAll.textContent = totalCount;
    countStarred.textContent = starredCount;

    vocabList.innerHTML = '';
    if (displayList.length === 0) {
      vocabList.innerHTML = `<div class="vocab-empty">暂无相关生词记录</div>`;
      return;
    }

    displayList.forEach(item => {
      const card = document.createElement('div');
      card.className = 'vocab-item';
      card.innerHTML = `
        <div class="vocab-item-top">
          <span class="vocab-item-word">${escapeHtml(item.word)}</span>
          <div class="vocab-item-actions">
            <button class="vocab-icon-btn star-toggle ${item.starred ? 'starred' : ''}" title="${item.starred ? '取消收藏' : '加入收藏'}">
              <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" fill="${item.starred ? '#ff9500' : 'none'}" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
            </button>
            <button class="vocab-icon-btn item-del" title="删除">
              <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
          </div>
        </div>
        <div class="vocab-item-trans">${escapeHtml(item.translation)}</div>
        <div class="vocab-item-meta">
          <span>${escapeHtml(item.engine || 'google')}</span>
          <span>${formatTime(item.timestamp)}</span>
        </div>
      `;

      // 切换收藏
      card.querySelector('.star-toggle').onclick = () => {
        item.starred = !item.starred;
        chrome.storage.local.set({ vocabularyHistory: cachedVocabList }, () => {
          renderVocabDOM();
        });
      };

      // 单条删除
      card.querySelector('.item-del').onclick = () => {
        cachedVocabList = cachedVocabList.filter(i => i.id !== item.id);
        chrome.storage.local.set({ vocabularyHistory: cachedVocabList }, () => {
          renderVocabDOM();
        });
      };

      vocabList.appendChild(card);
    });
  }

  function loadAndRenderVocab() {
    chrome.storage.local.get({ vocabularyHistory: [] }, (res) => {
      cachedVocabList = Array.isArray(res.vocabularyHistory) ? res.vocabularyHistory : [];
      renderVocabDOM();
    });
  }

  if (vocabNavBtn) {
    vocabNavBtn.onclick = () => {
      vocabOverlay.classList.remove('hidden');
      loadAndRenderVocab();
    };
  }

  if (closeVocabBtn) {
    closeVocabBtn.onclick = () => {
      vocabOverlay.classList.add('hidden');
    };
  }

  if (tabVocabAll) {
    tabVocabAll.onclick = () => {
      vocabCurrentTab = 'all';
      tabVocabAll.classList.add('active');
      tabVocabStarred.classList.remove('active');
      renderVocabDOM();
    };
  }

  if (tabVocabStarred) {
    tabVocabStarred.onclick = () => {
      vocabCurrentTab = 'starred';
      tabVocabStarred.classList.add('active');
      tabVocabAll.classList.remove('active');
      renderVocabDOM();
    };
  }

  if (vocabSearchInput) {
    vocabSearchInput.oninput = () => {
      renderVocabDOM();
    };
  }

  // 导出 Markdown
  if (exportVocabMdBtn) {
    exportVocabMdBtn.onclick = () => {
      if (cachedVocabList.length === 0) return alert('当前生词本为空');
      let md = `# Translate FY 生词本导出\n\n`;
      md += `> 导出时间：${new Date().toLocaleString()} | 共 ${cachedVocabList.length} 条\n\n`;
      md += `| 单词/短语 | 释义/译文 | 引擎 | 收藏 | 记录时间 |\n`;
      md += `| :--- | :--- | :--- | :---: | :--- |\n`;
      cachedVocabList.forEach(item => {
        md += `| **${item.word.replace(/\|/g, '\\|')}** | ${item.translation.replace(/\|/g, '\\|').replace(/\n/g, '<br>')} | ${item.engine || 'google'} | ${item.starred ? '★' : ''} | ${formatTime(item.timestamp)} |\n`;
      });
      const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `translate-fy-vocabulary-${new Date().toISOString().slice(0, 10)}.md`;
      a.click();
    };
  }

  // 导出 CSV
  if (exportVocabCsvBtn) {
    exportVocabCsvBtn.onclick = () => {
      if (cachedVocabList.length === 0) return alert('当前生词本为空');
      let csv = '\uFEFF"Word","Translation","Engine","Starred","Date"\n';
      cachedVocabList.forEach(item => {
        csv += `"${item.word.replace(/"/g, '""')}","${item.translation.replace(/"/g, '""')}","${item.engine || ''}","${item.starred ? 'Yes' : 'No'}","${formatTime(item.timestamp)}"\n`;
      });
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `translate-fy-vocabulary-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
    };
  }

  // 清理未收藏
  if (clearUnstarredBtn) {
    clearUnstarredBtn.onclick = () => {
      const starredCount = cachedVocabList.filter(i => i.starred).length;
      if (confirm(`确定要清空未收藏的历史记录吗？已收藏的 ${starredCount} 条生词将完好保留。`)) {
        cachedVocabList = cachedVocabList.filter(i => i.starred);
        chrome.storage.local.set({ vocabularyHistory: cachedVocabList }, () => {
          renderVocabDOM();
        });
      }
    };
  }

  // 点击打开选项设置页面
  settingsBtn.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  // 初始化入口
  initializePopup();
});
