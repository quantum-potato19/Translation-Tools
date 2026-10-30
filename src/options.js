import { DocStorage, formatBytes, formatTimestamp } from './doc_storage.js';

document.addEventListener('DOMContentLoaded', () => {
  // 1. 侧边栏 Tab 切换逻辑
  const menuItems = document.querySelectorAll('.menu-item');
  const tabPanes = document.querySelectorAll('.tab-pane');

  menuItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      
      menuItems.forEach(i => i.classList.remove('active'));
      tabPanes.forEach(pane => pane.classList.remove('active'));

      item.classList.add('active');
      const tabName = item.getAttribute('data-tab');
      const tabId = tabName + '-tab';
      const targetPane = document.getElementById(tabId);
      if (targetPane) {
        targetPane.classList.add('active');
      }
      if (tabName === 'storage') {
        renderStorageStats();
      }
    });
  });

  // 2. 绑定通用设置与官方服务 DOM 元素
  const enableSelectionTranslate = document.getElementById('enable-selection-translate');
  const autoShowPanel = document.getElementById('auto-show-panel');
  const enableBilingualNotation = document.getElementById('enable-bilingual-notation');
  const triggerMode = document.getElementById('trigger-mode');
  const defaultTargetLang = document.getElementById('default-target-lang');
  const defaultEngine = document.getElementById('default-engine');
  
  // 核心 AI 引擎 (智谱 GLM 永久免费、Google Gemini 终身免费额度、DeepSeek 高性价比)
  const glmApiKey = document.getElementById('glm-api-key');
  const glmModel = document.getElementById('glm-model');
  const geminiApiKey = document.getElementById('gemini-api-key');
  const geminiModel = document.getElementById('gemini-model');
  const deepseekApiKey = document.getElementById('deepseek-api-key');
  const deepseekModel = document.getElementById('deepseek-model');

  // DeepL 与 有道词典
  const deeplApiKey = document.getElementById('deepl-api-key');
  const deeplEndpoint = document.getElementById('deepl-endpoint');
  const youdaoAppKey = document.getElementById('youdao-app-key');
  const youdaoAppSecret = document.getElementById('youdao-app-secret');

  const pdfAction = document.getElementById('pdf-action');
  const pdfContextMenu = document.getElementById('pdf-context-menu');

  // 自定义模型管理 DOM 元素
  const customModelsList = document.getElementById('custom-models-list');
  const addCustomBtn = document.getElementById('add-custom-btn');
  const customModelModal = document.getElementById('custom-model-modal');
  const closeCustomModalBtn = document.getElementById('close-custom-modal-btn');
  const customModalOverlay = document.getElementById('custom-modal-overlay');
  
  const modalProvider = document.getElementById('modal-provider');
  const modalEndpoint = document.getElementById('modal-endpoint');
  const modalApiKey = document.getElementById('modal-api-key');
  const modalToggleKey = document.getElementById('modal-toggle-key');
  const modalFetchModelsBtn = document.getElementById('modal-fetch-models-btn');
  const modalFetchStatus = document.getElementById('modal-fetch-status');
  const modalSelectedCountBadge = document.getElementById('modal-selected-count-badge');
  const modalSelectedTags = document.getElementById('modal-selected-tags');
  const modalModelName = document.getElementById('modal-model-name');
  const modalManualAddModelBtn = document.getElementById('modal-manual-add-model-btn');
  const modalModelPicker = document.getElementById('modal-model-picker');
  const modalPickerSummary = document.getElementById('modal-picker-summary');
  const modalToggleSelectAllBtn = document.getElementById('modal-toggle-select-all-btn');
  const modalToggleSelectAllText = document.getElementById('modal-toggle-select-all-text');
  const modalClearSelectedBtn = document.getElementById('modal-clear-selected-btn');
  const modalPickerList = document.getElementById('modal-picker-list');
  const modalCustomAlias = document.getElementById('modal-custom-alias');
  const modalTestBtn = document.getElementById('modal-test-btn');
  const modalTestStatus = document.getElementById('modal-test-status');
  const modalSaveBtn = document.getElementById('modal-save-btn');

  let customModels = [];
  let modalFetchedModels = []; // 暂存从第三方服务商拉取的模型列表 [{ id, name }]
  let selectedModelMap = new Map(); // 用户主动选择的模型集合 Map(id => { id, name })

  // 常用服务商模板预设
  const PROVIDER_TEMPLATES = {
    deepseek: {
      endpoint: 'https://api.deepseek.com/chat/completions',
      aliasPrefix: 'DeepSeek',
      defaultModel: 'deepseek-chat',
      placeholder: 'sk-... (DeepSeek 官方 API Key)'
    },
    openrouter: {
      endpoint: 'https://openrouter.ai/api/v1/chat/completions',
      aliasPrefix: 'OpenRouter',
      defaultModel: 'google/gemini-2.0-flash-001',
      placeholder: 'sk-or-v1-... (OpenRouter API Key)'
    },
    openai: {
      endpoint: 'https://api.openai.com/v1/chat/completions',
      aliasPrefix: 'OpenAI',
      defaultModel: 'gpt-4o-mini',
      placeholder: 'sk-...'
    },
    siliconflow: {
      endpoint: 'https://api.siliconflow.cn/v1/chat/completions',
      aliasPrefix: 'SiliconFlow',
      defaultModel: 'deepseek-ai/DeepSeek-V3',
      placeholder: 'sk-...'
    },
    groq: {
      endpoint: 'https://api.groq.com/openai/v1/chat/completions',
      aliasPrefix: 'Groq',
      defaultModel: 'llama-3.3-70b-versatile',
      placeholder: 'gsk_...'
    },
    opencode: {
      endpoint: 'https://api.opencode.ai/v1/chat/completions',
      aliasPrefix: 'OpenCode',
      defaultModel: 'claude-3-5-sonnet',
      placeholder: 'sk-...'
    },
    ollama: {
      endpoint: 'http://localhost:11434/v1/chat/completions',
      aliasPrefix: 'Ollama',
      defaultModel: 'llama3',
      placeholder: '无需填写 (或填任意字符)'
    },
    custom: {
      endpoint: '',
      aliasPrefix: 'Custom',
      defaultModel: '',
      placeholder: '输入 API Key'
    }
  };

  // 官方预置 AI 模型的默认备选字典
  const DEFAULT_MODELS = {
    glm: ['glm-4-flash', 'glm-4.5-flash', 'glm-4.7-flash', 'glm-4-flashx']
  };

  // 本地缓存的可用全部模型与已启用勾选模型
  const providerState = {
    glm: { all: [...DEFAULT_MODELS.glm], enabled: [...DEFAULT_MODELS.glm] }
  };

  // 3. 加载已有配置
  function loadSettings() {
    chrome.storage.local.get({
      enableSelectionTranslate: true,
      autoShowPanel: false,
      enableBilingualNotation: true,
      triggerMode: 'direct',
      defaultTargetLang: 'zh-CN',
      defaultEngine: 'google',
      glmApiKey: '',
      glmActiveModel: 'glm-4-flash',
      glmModels: DEFAULT_MODELS.glm,
      deeplApiKey: '',
      deeplEndpoint: '',
      youdaoAppKey: '',
      youdaoAppSecret: '',
      pdfAction: 'native',
      pdfContextMenu: true,
      customModels: []
    }, (settings) => {
      if (enableSelectionTranslate) enableSelectionTranslate.checked = settings.enableSelectionTranslate;
      if (autoShowPanel) autoShowPanel.checked = settings.autoShowPanel;
      if (enableBilingualNotation) enableBilingualNotation.checked = (settings.enableBilingualNotation !== false);
      if (triggerMode) triggerMode.value = settings.triggerMode || 'direct';
      if (defaultTargetLang) defaultTargetLang.value = settings.defaultTargetLang;
      
      if (glmApiKey) glmApiKey.value = settings.glmApiKey || '';
      if (deeplApiKey) deeplApiKey.value = settings.deeplApiKey || '';
      if (deeplEndpoint) deeplEndpoint.value = settings.deeplEndpoint || '';
      if (youdaoAppKey) youdaoAppKey.value = settings.youdaoAppKey || '';
      if (youdaoAppSecret) youdaoAppSecret.value = settings.youdaoAppSecret || '';

      if (pdfAction) pdfAction.value = settings.pdfAction || 'native';
      if (pdfContextMenu) pdfContextMenu.checked = settings.pdfContextMenu;
      customModels = settings.customModels || [];

      checkFileSchemeAccess();

      // 初始化智谱 GLM 模型状态
      ['glm'].forEach(p => {
        const storedModels = settings[`${p}Models`];
        const activeM = settings[`${p}ActiveModel`];
        if (Array.isArray(storedModels) && storedModels.length > 0) {
          providerState[p].enabled = [...storedModels];
          storedModels.forEach(m => {
            if (!providerState[p].all.includes(m)) providerState[p].all.push(m);
          });
        }
        renderProviderModelUI(p, activeM);
      });

      // 渲染自定义模型列表并同步默认翻译引擎下拉菜单
      renderCustomModels();
      renderDefaultEngineOptions(settings.defaultEngine);
    });
  }

  // 渲染某服务商的模型选择 UI（下拉框 + 勾选列表）
  function renderProviderModelUI(provider, preferredActiveModel) {
    const selectEl = document.getElementById(`${provider}-model`);
    const listEl = document.getElementById(`${provider}-checkbox-list`);
    if (!selectEl || !listEl) return;

    const state = providerState[provider];
    const enabledSet = new Set(state.enabled);
    const currentActive = preferredActiveModel || selectEl.value || state.enabled[0] || state.all[0];

    // 1. 刷新下拉选项 (展示已勾选启用的模型)
    selectEl.innerHTML = '';
    const displayOptions = state.enabled.length > 0 ? state.enabled : state.all;
    displayOptions.forEach(m => {
      const opt = document.createElement('option');
      opt.value = m;
      const isFree = (provider === 'glm') && m.toLowerCase().includes('flash');
      opt.textContent = isFree ? `${m} (免费)` : m;
      selectEl.appendChild(opt);
    });

    if (displayOptions.includes(currentActive)) {
      selectEl.value = currentActive;
    } else if (displayOptions.length > 0) {
      selectEl.value = displayOptions[0];
      chrome.storage.local.set({ [`${provider}ActiveModel`]: displayOptions[0] });
    }

    // 2. 刷新复选框勾选列表
    listEl.innerHTML = '';
    state.all.forEach(m => {
      const row = document.createElement('label');
      row.className = 'model-item-row';
      const isChecked = enabledSet.has(m);
      const isDefault = (m === selectEl.value);
      const isFree = (provider === 'glm') && m.toLowerCase().includes('flash');

      row.innerHTML = `
        <input type="checkbox" value="${m}" ${isChecked ? 'checked' : ''}>
        <span class="model-item-name" title="${m}">${m}</span>
        ${isFree ? '<span class="model-item-free-tag">免费</span>' : ''}
        ${isDefault ? '<span class="model-item-tag">默认</span>' : ''}
      `;

      const checkbox = row.querySelector('input');
      checkbox.addEventListener('change', () => {
        if (checkbox.checked) {
          if (!state.enabled.includes(m)) state.enabled.push(m);
        } else {
          state.enabled = state.enabled.filter(x => x !== m);
        }
        // 如果全部取消，至少保留一个
        if (state.enabled.length === 0) {
          state.enabled = [m];
          checkbox.checked = true;
        }
        // 保存并重绘下拉框
        const updateData = {};
        updateData[`${provider}Models`] = state.enabled;
        chrome.storage.local.set(updateData, () => {
          renderProviderModelUI(provider, selectEl.value);
          renderDefaultEngineOptions();
        });
      });

      listEl.appendChild(row);
    });

    // 3. 同步“全选 / 取消全选”按钮状态
    const toggleAllBtn = document.querySelector(`.toggle-select-all-models-btn[data-provider="${provider}"]`);
    if (toggleAllBtn) {
      const isAllSelected = state.all.length > 0 && state.all.every(m => enabledSet.has(m));
      const textEl = toggleAllBtn.querySelector('.select-all-text');
      if (textEl) textEl.textContent = isAllSelected ? '取消全选' : '全选';
      toggleAllBtn.classList.toggle('is-all-selected', isAllSelected);
      toggleAllBtn.title = isAllSelected ? '点击取消全选' : '点击全选所有模型';
    }
  }

  // 发起获取服务商模型列表
  function fetchModelsForProvider(provider) {
    const apiKeyInput = document.getElementById(`${provider}-api-key`);
    const statusText = document.getElementById(`${provider}-status`);
    const panel = document.getElementById(`${provider}-models-panel`);
    const btn = document.querySelector(`.fetch-models-btn[data-provider="${provider}"]`);
    
    const apiKey = apiKeyInput ? apiKeyInput.value.trim() : '';
    if (!apiKey) {
      if (statusText) {
        statusText.textContent = '请先输入 API Key';
        statusText.className = 'model-status-text error';
      }
      if (panel) panel.classList.remove('hidden');
      return;
    }

    if (btn) btn.disabled = true;
    if (statusText) {
      statusText.textContent = '正在获取模型列表...';
      statusText.className = 'model-status-text loading';
    }
    if (panel) panel.classList.remove('hidden');

    chrome.runtime.sendMessage({
      action: 'fetchModels',
      provider,
      apiKey,
      endpoint: ''
    }, (response) => {
      if (btn) btn.disabled = false;
      if (chrome.runtime.lastError || !response || !response.success) {
        const errMsg = response?.error || chrome.runtime.lastError?.message || '获取失败';
        if (statusText) {
          statusText.textContent = `获取失败: ${errMsg}`;
          statusText.className = 'model-status-text error';
        }
        return;
      }

      const fetchedModels = response.models || [];
      if (fetchedModels.length === 0) {
        if (statusText) {
          statusText.textContent = '未找到可用模型';
          statusText.className = 'model-status-text error';
        }
        return;
      }

      const state = providerState[provider];
      fetchedModels.forEach(m => {
        const id = typeof m === 'string' ? m : m.id;
        if (!state.all.includes(id)) state.all.push(id);
      });

      // 默认非全选：仅保留当前下拉框已选中的默认活跃模型，不自动勾选全部模型
      const selectEl = document.getElementById(`${provider}-model`);
      const currentActive = (selectEl && selectEl.value) || (state.enabled && state.enabled[0]) || state.all[0];
      if (!state.enabled || state.enabled.length === 0) {
        state.enabled = currentActive ? [currentActive] : [];
      }

      if (statusText) {
        statusText.textContent = `获取成功，共 ${fetchedModels.length} 个模型（已更新）`;
        statusText.className = 'model-status-text success';
        setTimeout(() => {
          if (statusText.textContent.includes('获取成功')) statusText.textContent = '';
        }, 5000);
      }

      const saveObj = {};
      saveObj[`${provider}Models`] = state.enabled;
      chrome.storage.local.set(saveObj, () => {
        const selectEl = document.getElementById(`${provider}-model`);
        renderProviderModelUI(provider, selectEl ? selectEl.value : null);
        renderDefaultEngineOptions();
      });
    });
  }

  // 绑定“获取模型列表”按钮
  document.querySelectorAll('.fetch-models-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const provider = btn.getAttribute('data-provider');
      if (provider) fetchModelsForProvider(provider);
    });
  });

  // 绑定“勾选可用模型”展开/收起
  document.querySelectorAll('.toggle-models-list-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-target');
      const panel = document.getElementById(targetId);
      if (panel) {
        panel.classList.toggle('hidden');
      }
    });
  });

  // 绑定“全选 / 取消全选”按钮点击切换
  document.querySelectorAll('.toggle-select-all-models-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const provider = btn.getAttribute('data-provider');
      const state = providerState[provider];
      if (!state || !state.all || state.all.length === 0) return;
      const selectEl = document.getElementById(`${provider}-model`);
      const isAllSelected = state.all.every(m => state.enabled.includes(m));

      if (isAllSelected) {
        // 再次点击取消全选：仅保留当前活跃/默认模型，防止可用模型全部为空
        const defaultM = (selectEl && selectEl.value) || state.all[0];
        state.enabled = defaultM ? [defaultM] : [];
      } else {
        // 点击全选：启用服务商下全部模型
        state.enabled = [...state.all];
      }

      const saveObj = {};
      saveObj[`${provider}Models`] = state.enabled;
      chrome.storage.local.set(saveObj, () => {
        renderProviderModelUI(provider, selectEl ? selectEl.value : null);
        renderDefaultEngineOptions();
      });
    });
  });

  // 绑定模型搜索过滤
  document.querySelectorAll('.models-search-input').forEach(input => {
    input.addEventListener('input', () => {
      const listId = input.getAttribute('data-list');
      const listEl = document.getElementById(listId);
      if (!listEl) return;
      const kw = input.value.trim().toLowerCase();
      const rows = listEl.querySelectorAll('.model-item-row');
      rows.forEach(row => {
        const name = row.querySelector('.model-item-name')?.textContent?.toLowerCase() || '';
        row.style.display = name.includes(kw) ? 'flex' : 'none';
      });
    });
  });

  // 绑定手动添加模型 ID
  document.querySelectorAll('.add-model-id-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const provider = btn.getAttribute('data-provider');
      const input = document.getElementById(`${provider}-custom-model-input`);
      if (!provider || !input) return;
      const val = input.value.trim();
      if (!val) return;
      
      const state = providerState[provider];
      if (!state.all.includes(val)) state.all.unshift(val);
      if (!state.enabled.includes(val)) state.enabled.unshift(val);

      input.value = '';
      const saveObj = {};
      saveObj[`${provider}Models`] = state.enabled;
      saveObj[`${provider}ActiveModel`] = val;
      chrome.storage.local.set(saveObj, () => {
        renderProviderModelUI(provider, val);
        renderDefaultEngineOptions();
      });
    });
  });

  // 4. 配置自动保存逻辑
  function saveSettings() {
    chrome.storage.local.set({
      enableSelectionTranslate: enableSelectionTranslate.checked,
      autoShowPanel: autoShowPanel.checked,
      enableBilingualNotation: enableBilingualNotation ? enableBilingualNotation.checked : true,
      triggerMode: triggerMode ? triggerMode.value : 'direct',
      defaultTargetLang: defaultTargetLang.value,
      defaultEngine: defaultEngine.value,
      glmApiKey: glmApiKey ? glmApiKey.value.trim() : '',
      glmActiveModel: glmModel ? glmModel.value : 'glm-4-flash',
      deeplApiKey: deeplApiKey ? deeplApiKey.value.trim() : '',
      deeplEndpoint: deeplEndpoint ? deeplEndpoint.value.trim() : '',
      youdaoAppKey: youdaoAppKey ? youdaoAppKey.value.trim() : '',
      pdfAction: pdfAction ? pdfAction.value : 'native',
      pdfActionUserExplicit: true,
      pdfContextMenu: pdfContextMenu ? pdfContextMenu.checked : true
    });
  }

  // 动态渲染默认翻译引擎选项
  function renderDefaultEngineOptions(preferredEngine) {
    const targetEngine = preferredEngine !== undefined ? preferredEngine : defaultEngine.value;
    defaultEngine.innerHTML = '';

    // 免 Key 免费翻译引擎组
    const available = [
      { value: 'google', label: 'Google 翻译 (免 Key)' },
      { value: 'bing', label: 'Bing 翻译 (免 Key·微软)' }
    ];

    // DeepL 翻译 (仅在配置了 Auth Key 或 自定义 Endpoint 时显示)
    if ((deeplApiKey && deeplApiKey.value.trim()) || (deeplEndpoint && deeplEndpoint.value.trim())) {
      available.push({ value: 'deepl', label: 'DeepL 翻译 (精准自然)' });
    }

    // 智谱 GLM（4/4.5/4.7 flash 免费）
    if (glmApiKey && glmApiKey.value.trim()) {
      const model = glmModel ? glmModel.value : 'glm-4-flash';
      available.push({ value: 'glm', label: `智谱 GLM (${model})` });
    }

    // 官方词典 API
    if (youdaoAppKey && youdaoAppSecret && youdaoAppKey.value.trim() && youdaoAppSecret.value.trim()) {
      available.push({ value: 'youdao', label: '有道智云 (官方词典 API)' });
    }

    // 自定义模型 (仅在已配置 API Key 或 Endpoint 时显示)
    customModels.forEach(m => {
      if ((m.apiKey && m.apiKey.trim()) || (m.endpoint && m.endpoint.trim())) {
        available.push({ value: `custom_${m.id}`, label: `${m.name} (${m.modelName})` });
      }
    });

    available.forEach(item => {
      const opt = document.createElement('option');
      opt.value = item.value;
      opt.textContent = item.label;
      defaultEngine.appendChild(opt);
    });

    const availableValues = available.map(a => a.value);
    if (availableValues.includes(targetEngine)) {
      defaultEngine.value = targetEngine;
    } else {
      defaultEngine.value = 'google';
      chrome.storage.local.set({ defaultEngine: 'google' });
    }
  }

  // 渲染自定义模型列表
  function renderCustomModels() {
    customModelsList.innerHTML = '';

    if (customModels.length === 0) {
      customModelsList.innerHTML = `<span style="font-size: 13px; color: #8e8e93;">暂无自定义模型。点击上方“+ 添加自定义模型”可接入 OpenRouter、OpenCode、OpenAI 或任意兼容服务。</span>`;
      return;
    }

    customModels.forEach(m => {
      const item = document.createElement('div');
      item.style.display = 'flex';
      item.style.justifyContent = 'space-between';
      item.style.alignItems = 'center';
      item.style.background = 'rgba(0,0,0,0.02)';
      item.style.padding = '10px 14px';
      item.style.borderRadius = '10px';
      item.style.fontSize = '13.5px';
      item.style.border = '1px solid rgba(0,0,0,0.03)';
      
      item.innerHTML = `
        <div style="display:flex; flex-direction:column; gap:2px;">
          <span style="font-weight:600; color:#1c1c1e;">${m.name} <span style="font-size:10.5px; font-weight:normal; background:rgba(0,122,255,0.1); color:#007AFF; padding:1px 6px; border-radius:4px; margin-left:4px;">${m.modelName}</span></span>
          <span style="font-size:11.5px; color:#8e8e93; font-family:monospace; max-width: 320px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${m.endpoint}</span>
          <span class="custom-item-status" style="font-size:11px; margin-top:2px;"></span>
        </div>
        <div style="display:flex; gap:6px; align-items:center;">
          <button class="ios-button secondary-btn custom-item-test-btn" style="padding:5px 10px; font-size:12px;" data-id="${m.id}">测试</button>
          <button class="ios-button custom-item-delete-btn" style="background:rgba(255,59,48,0.1); color:#FF3B30; padding:5px 10px; font-size:12px;" data-id="${m.id}">删除</button>
        </div>
      `;

      const testBtn = item.querySelector('.custom-item-test-btn');
      const deleteBtn = item.querySelector('.custom-item-delete-btn');
      const statusSpan = item.querySelector('.custom-item-status');

      testBtn.addEventListener('click', () => {
        testBtn.disabled = true;
        statusSpan.textContent = '测试中...';
        statusSpan.style.color = '#007AFF';

        chrome.runtime.sendMessage({
          action: 'testModelConnection',
          provider: 'custom',
          apiKey: m.apiKey,
          endpoint: m.endpoint,
          modelName: m.modelName
        }, (res) => {
          testBtn.disabled = false;
          if (chrome.runtime.lastError || !res || !res.success) {
            const err = res?.error || chrome.runtime.lastError?.message || '测试失败';
            statusSpan.textContent = `✗ ${err}`;
            statusSpan.style.color = '#FF3B30';
          } else {
            statusSpan.textContent = `✓ ${res.message || '连接正常'}`;
            statusSpan.style.color = '#34C759';
          }
        });
      });

      deleteBtn.addEventListener('click', () => {
        deleteCustomModel(m.id);
      });

      customModelsList.appendChild(item);
    });
  }

  // 删除自定义模型
  function deleteCustomModel(id) {
    customModels = customModels.filter(m => m.id !== id);
    chrome.storage.local.set({ customModels }, () => {
      renderCustomModels();
      renderDefaultEngineOptions();
    });
  }

  // 监听输入并实时保存及动态刷新默认引擎列表
  const inputsToWatch = [
    enableSelectionTranslate, autoShowPanel, enableBilingualNotation, triggerMode, defaultTargetLang, defaultEngine,
    glmApiKey, glmModel, geminiApiKey, geminiModel, deepseekApiKey, deepseekModel,
    deeplApiKey, deeplEndpoint, youdaoAppKey, youdaoAppSecret, pdfAction
  ].filter(Boolean);

  inputsToWatch.forEach(input => {
    const eventType = (input.type === 'checkbox' || input.tagName === 'SELECT') ? 'change' : 'input';
    input.addEventListener(eventType, () => {
      saveSettings();
      if (input !== defaultEngine) {
        renderDefaultEngineOptions();
      }
    });
  });

  // 右键菜单单独处理同步
  if (pdfContextMenu) {
    pdfContextMenu.addEventListener('change', () => {
      saveSettings();
      if (pdfContextMenu.checked) {
        chrome.contextMenus.create({
          id: 'openPdfInExtension',
          title: '在阅读器中打开此 PDF',
          contexts: ['link']
        }, () => {
          if (chrome.runtime.lastError) {
            console.log('右键菜单已经存在');
          }
        });
      } else {
        chrome.contextMenus.remove('openPdfInExtension');
      }
    });
  }

  // --- 本地文件权限与阅读器一键启动 ---
  const openExtensionManageBtn = document.getElementById('open-extension-manage-btn');
  const openStandaloneViewerBtn = document.getElementById('open-standalone-viewer-btn');
  const fileSchemeStatusDesc = document.getElementById('file-scheme-status-desc');

  function checkFileSchemeAccess() {
    if (chrome.extension && chrome.extension.isAllowedFileSchemeAccess && fileSchemeStatusDesc) {
      chrome.extension.isAllowedFileSchemeAccess((isAllowed) => {
        if (isAllowed) {
          fileSchemeStatusDesc.textContent = '已授权：Chrome 访问本地 PDF (file://) 时可自动无缝接管';
          fileSchemeStatusDesc.style.color = '#34c759';
        } else {
          fileSchemeStatusDesc.textContent = '未授权：无法自动拦截本地文件，需在扩展管理页开启“允许访问文件网址”';
          fileSchemeStatusDesc.style.color = '#ff9500';
        }
      });
    }
  }

  if (openExtensionManageBtn) {
    openExtensionManageBtn.addEventListener('click', () => {
      chrome.tabs.create({ url: `chrome://extensions/?id=${chrome.runtime.id}` });
    });
  }

  if (openStandaloneViewerBtn) {
    openStandaloneViewerBtn.addEventListener('click', () => {
      chrome.tabs.create({ url: chrome.runtime.getURL('pdf_viewer.html') });
    });
  }

  // --- 自定义模型弹窗逻辑 ---
  function openCustomModal() {
    customModelModal.classList.remove('hidden');
    // 默认选用 DeepSeek 官方推荐模板
    if (modalProvider) {
      modalProvider.value = 'deepseek';
      applyProviderTemplate('deepseek');
    }
  }

  function applyProviderTemplate(providerKey) {
    const tmpl = PROVIDER_TEMPLATES[providerKey] || PROVIDER_TEMPLATES.custom;
    modalEndpoint.value = tmpl.endpoint;
    if (tmpl.placeholder) {
      modalApiKey.placeholder = tmpl.placeholder;
    }
    if (tmpl.defaultModel) {
      modalModelName.placeholder = `搜索或输入模型，推荐: ${tmpl.defaultModel}`;
    } else {
      modalModelName.placeholder = '搜索可用模型，或输入自定义 ID...';
    }
    modalFetchStatus.textContent = '';
    modalFetchStatus.className = 'model-status-text';
    if (modalTestStatus) {
      modalTestStatus.textContent = '';
      modalTestStatus.className = 'model-status-text';
    }
    if (modalModelPicker) modalModelPicker.classList.add('hidden');
    if (modalPickerList) modalPickerList.innerHTML = '';
    modalFetchedModels = [];
    selectedModelMap.clear();
    updateSelectedUI();
  }

  if (modalProvider) {
    modalProvider.addEventListener('change', () => {
      applyProviderTemplate(modalProvider.value);
    });
  }

  // 智能识别粘贴的 API Key 前缀并自动同步服务商预设
  if (modalApiKey) {
    modalApiKey.addEventListener('input', () => {
      const val = modalApiKey.value.trim();
      if (!val) return;
      if (val.startsWith('sk-or-v1-')) {
        if (modalProvider && modalProvider.value !== 'openrouter') {
          modalProvider.value = 'openrouter';
          applyProviderTemplate('openrouter');
        }
      } else if (val.startsWith('gsk_')) {
        if (modalProvider && modalProvider.value !== 'groq') {
          modalProvider.value = 'groq';
          applyProviderTemplate('groq');
        }
      }
    });
  }

  addCustomBtn.addEventListener('click', openCustomModal);

  function closeCustomModal() {
    customModelModal.classList.add('hidden');
    modalEndpoint.value = '';
    modalApiKey.value = '';
    modalModelName.value = '';
    modalCustomAlias.value = '';
    modalFetchStatus.textContent = '';
    modalFetchStatus.className = 'model-status-text';
    if (modalTestStatus) {
      modalTestStatus.textContent = '';
      modalTestStatus.className = 'model-status-text';
    }
    if (modalModelPicker) modalModelPicker.classList.add('hidden');
    if (modalPickerList) modalPickerList.innerHTML = '';
    modalFetchedModels = [];
    selectedModelMap.clear();
    updateSelectedUI();
  }

  // 更新已选模型 Tags 与计数徽标
  function updateSelectedUI() {
    const count = selectedModelMap.size;
    if (modalSelectedCountBadge) {
      modalSelectedCountBadge.textContent = `已选 ${count} 个`;
      modalSelectedCountBadge.style.color = count > 0 ? '#10b981' : '#007AFF';
    }

    if (modalSaveBtn) {
      if (count > 0) {
        modalSaveBtn.textContent = `保存已选模型 (${count} 个)`;
      } else {
        modalSaveBtn.textContent = '保存并添加模型';
      }
    }

    if (!modalSelectedTags) return;

    if (count === 0) {
      modalSelectedTags.innerHTML = '';
      modalSelectedTags.classList.add('hidden');
      return;
    }

    modalSelectedTags.classList.remove('hidden');
    modalSelectedTags.innerHTML = '';

    selectedModelMap.forEach((item, id) => {
      const chip = document.createElement('span');
      chip.className = 'selected-model-chip';
      chip.innerHTML = `
        <span>${id}</span>
        <button type="button" class="chip-remove-btn" title="移除此模型">✕</button>
      `;

      chip.querySelector('.chip-remove-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        selectedModelMap.delete(id);
        updateSelectedUI();
        renderModelPicker(modalModelName ? modalModelName.value.trim() : '');
      });

      modalSelectedTags.appendChild(chip);
    });
  }

  // 渲染模型列表面板及过滤结果 (支持海量模型极速过滤，避免超大DOM卡顿)
  function renderModelPicker(query) {
    if (!modalModelPicker || !modalPickerList) return;

    if (!modalFetchedModels || modalFetchedModels.length === 0) {
      modalModelPicker.classList.add('hidden');
      return;
    }

    modalModelPicker.classList.remove('hidden');

    const q = (query || '').toLowerCase().trim();
    const filtered = q
      ? modalFetchedModels.filter(m => (m.id && m.id.toLowerCase().includes(q)) || (m.name && m.name.toLowerCase().includes(q)))
      : modalFetchedModels;

    if (modalPickerSummary) {
      if (q) {
        modalPickerSummary.textContent = `搜索匹配: ${filtered.length} / 共 ${modalFetchedModels.length} 个模型`;
      } else {
        modalPickerSummary.textContent = `可用模型列表 (共 ${modalFetchedModels.length} 个，默认未选)`;
      }
    }

    modalPickerList.innerHTML = '';

    if (filtered.length === 0) {
      const emptyTip = document.createElement('div');
      emptyTip.className = 'picker-empty-tip';
      emptyTip.textContent = `未搜索到匹配模型。点击右上角“+ 添加”可直接添加 “${query}” 为自定义 ID`;
      modalPickerList.appendChild(emptyTip);
      if (modalToggleSelectAllBtn && modalToggleSelectAllText) {
        modalToggleSelectAllText.textContent = '全选';
        modalToggleSelectAllBtn.classList.remove('is-all-selected');
      }
      return;
    }

    // 动态同步弹窗模型选择器的“全选 / 取消全选”状态
    if (modalToggleSelectAllBtn && modalToggleSelectAllText) {
      const isAllSelected = filtered.length > 0 && filtered.every(m => selectedModelMap.has(m.id));
      modalToggleSelectAllText.textContent = isAllSelected ? '取消全选' : '全选';
      modalToggleSelectAllBtn.classList.toggle('is-all-selected', isAllSelected);
      modalToggleSelectAllBtn.title = isAllSelected ? '点击取消全选' : '点击全选模型';
    }

    // 默认未输入搜索词时展示前 80 项，有搜索词展示前 50 项
    const maxShow = q ? 50 : 80;
    const toRender = filtered.slice(0, maxShow);

    toRender.forEach(item => {
      const isSelected = selectedModelMap.has(item.id);
      const row = document.createElement('div');
      row.className = 'picker-item';
      row.innerHTML = `
        <div class="picker-item-info">
          <span class="picker-item-id">${item.id}</span>
          ${item.name && item.name !== item.id ? `<span class="picker-item-desc">${item.name}</span>` : ''}
        </div>
        <button type="button" class="picker-add-btn ${isSelected ? 'added' : ''}">
          ${isSelected ? '✓ 已添加' : '+ 添加'}
        </button>
      `;

      const btn = row.querySelector('.picker-add-btn');
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (selectedModelMap.has(item.id)) {
          selectedModelMap.delete(item.id);
        } else {
          selectedModelMap.set(item.id, { id: item.id, name: item.name || item.id });
        }
        updateSelectedUI();
        renderModelPicker(modalModelName ? modalModelName.value.trim() : '');
      });

      modalPickerList.appendChild(row);
    });

    if (filtered.length > maxShow) {
      const moreTip = document.createElement('div');
      moreTip.style.padding = '8px 12px';
      moreTip.style.fontSize = '11px';
      moreTip.style.color = '#8e8e93';
      moreTip.style.textAlign = 'center';
      moreTip.style.background = '#f8fafc';
      moreTip.textContent = `已显示前 ${maxShow} 个模型，在上方搜索框输入关键词可精准过滤全部 ${filtered.length} 个模型`;
      modalPickerList.appendChild(moreTip);
    }
  }

  // 搜索框输入过滤
  if (modalModelName) {
    modalModelName.addEventListener('input', () => {
      renderModelPicker(modalModelName.value.trim());
    });
  }

  // 手动添加单个模型
  if (modalManualAddModelBtn) {
    modalManualAddModelBtn.addEventListener('click', () => {
      const manualId = modalModelName ? modalModelName.value.trim() : '';
      if (!manualId) {
        alert('请在输入框中输入模型 ID！');
        return;
      }
      selectedModelMap.set(manualId, { id: manualId, name: manualId });
      modalModelName.value = '';
      updateSelectedUI();
      renderModelPicker('');
    });
  }

  // 一键清空已选
  if (modalClearSelectedBtn) {
    modalClearSelectedBtn.addEventListener('click', () => {
      selectedModelMap.clear();
      updateSelectedUI();
      renderModelPicker(modalModelName ? modalModelName.value.trim() : '');
    });
  }

  // 弹窗模型选择器：一键全选 / 取消全选切换
  if (modalToggleSelectAllBtn) {
    modalToggleSelectAllBtn.addEventListener('click', () => {
      if (!modalFetchedModels || modalFetchedModels.length === 0) return;
      const q = modalModelName ? modalModelName.value.trim().toLowerCase() : '';
      const targetList = q
        ? modalFetchedModels.filter(m => (m.id && m.id.toLowerCase().includes(q)) || (m.name && m.name.toLowerCase().includes(q)))
        : modalFetchedModels;

      if (targetList.length === 0) return;

      const isAllSelected = targetList.every(m => selectedModelMap.has(m.id));

      if (isAllSelected) {
        // 再次点击：取消全选
        targetList.forEach(m => selectedModelMap.delete(m.id));
      } else {
        // 点击全选：全量添加当前模型列表
        targetList.forEach(m => selectedModelMap.set(m.id, { id: m.id, name: m.name || m.id }));
      }

      updateSelectedUI();
      renderModelPicker(modalModelName ? modalModelName.value.trim() : '');
    });
  }

  // 一键测试连接 (消耗 <= 2 tokens 极轻量探测)
  if (modalTestBtn) {
    modalTestBtn.addEventListener('click', () => {
      const provider = modalProvider ? modalProvider.value : 'custom';
      const apiKey = modalApiKey.value.trim();
      const endpoint = modalEndpoint.value.trim();
      let modelName = modalModelName ? modalModelName.value.trim() : '';

      // 若未输入模型名称，但已勾选模型，优先测试已选模型中的首个
      if (!modelName && selectedModelMap.size > 0) {
        modelName = Array.from(selectedModelMap.keys())[0];
      }

      if (!apiKey && provider !== 'ollama') {
        modalTestStatus.textContent = '请先输入 API Key 再进行测试';
        modalTestStatus.className = 'model-status-text error';
        return;
      }

      if (!endpoint && provider === 'custom') {
        modalTestStatus.textContent = '自定义服务商请先输入接口地址';
        modalTestStatus.className = 'model-status-text error';
        return;
      }

      modalTestBtn.disabled = true;
      modalTestStatus.textContent = '正在发送极简探测包 (1 token) 验证连通性与密钥...';
      modalTestStatus.className = 'model-status-text loading';

      chrome.runtime.sendMessage({
        action: 'testModelConnection',
        provider,
        apiKey,
        endpoint,
        modelName
      }, (response) => {
        modalTestBtn.disabled = false;
        if (chrome.runtime.lastError || !response || !response.success) {
          const errMsg = response?.error || chrome.runtime.lastError?.message || '测试失败';
          modalTestStatus.textContent = `✗ ${errMsg}`;
          modalTestStatus.className = 'model-status-text error';
        } else {
          modalTestStatus.textContent = `✓ ${response.message || '连接测试通过'}`;
          modalTestStatus.className = 'model-status-text success';

          // 若未选模型且未填模型，自动将测试通过的模型加入已选
          if (selectedModelMap.size === 0 && !modalModelName.value.trim() && response.model) {
            selectedModelMap.set(response.model, { id: response.model, name: response.model });
            updateSelectedUI();
          }
        }
      });
    });
  }

  closeCustomModalBtn.addEventListener('click', closeCustomModal);
  customModalOverlay.addEventListener('click', closeCustomModal);
  customModelModal.addEventListener('click', (e) => {
    if (e.target === customModelModal) {
      closeCustomModal();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !customModelModal.classList.contains('hidden')) {
      closeCustomModal();
    }
  });

  // 切换 API Key 密文显隐
  modalToggleKey.addEventListener('click', (e) => {
    e.preventDefault();
    if (modalApiKey.type === 'password') {
      modalApiKey.type = 'text';
      modalToggleKey.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>`;
    } else {
      modalApiKey.type = 'password';
      modalToggleKey.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>`;
    }
  });

  // 弹窗中点击“获取受支持模型”
  modalFetchModelsBtn.addEventListener('click', () => {
    const provider = modalProvider.value;
    const apiKey = modalApiKey.value.trim();
    const endpoint = modalEndpoint.value.trim();

    if (!apiKey) {
      modalFetchStatus.textContent = '请先输入 API Key 再获取模型';
      modalFetchStatus.className = 'model-status-text error';
      return;
    }

    if (!endpoint && provider === 'custom') {
      modalFetchStatus.textContent = '自定义服务商请先输入接口地址';
      modalFetchStatus.className = 'model-status-text error';
      return;
    }

    modalFetchModelsBtn.disabled = true;
    modalFetchStatus.textContent = '正在获取模型列表...';
    modalFetchStatus.className = 'model-status-text loading';

    chrome.runtime.sendMessage({
      action: 'fetchModels',
      provider,
      apiKey,
      endpoint
    }, (response) => {
      modalFetchModelsBtn.disabled = false;
      if (chrome.runtime.lastError || !response || !response.success) {
        const errMsg = response?.error || chrome.runtime.lastError?.message || '获取失败';
        modalFetchStatus.textContent = `获取失败: ${errMsg}`;
        modalFetchStatus.className = 'model-status-text error';
        return;
      }

      const list = response.models || [];
      modalFetchedModels = list.map(m => typeof m === 'string' ? { id: m, name: m } : { id: m.id, name: m.name || m.id });

      if (modalFetchedModels.length === 0) {
        modalFetchStatus.textContent = '未检索到可用模型，请手动输入模型名称';
        modalFetchStatus.className = 'model-status-text error';
        return;
      }

      // 关键原则：海量模型默认一个都不勾选，由用户搜索挑选
      selectedModelMap.clear();
      updateSelectedUI();

      modalFetchStatus.textContent = `成功获取 ${modalFetchedModels.length} 个模型 (默认未选)，可在下方搜索后点击 [+ 添加]`;
      modalFetchStatus.className = 'model-status-text success';

      renderModelPicker('');
      if (modalModelName) {
        modalModelName.value = '';
        modalModelName.focus();
      }
    });
  });

  // 保存自定义模型 (支持从已选模型批量入库，或保存单项)
  modalSaveBtn.addEventListener('click', () => {
    const endpoint = modalEndpoint.value.trim();
    const apiKey = modalApiKey.value.trim();
    const customAlias = modalCustomAlias.value.trim();
    const providerKey = modalProvider ? modalProvider.value : 'custom';
    const prefix = PROVIDER_TEMPLATES[providerKey]?.aliasPrefix || '自定义';

    if (!endpoint) {
      alert('请填写完整的接口地址 (Endpoint)！');
      return;
    }

    // 情况 A：用户勾选了一个或多个模型
    if (selectedModelMap.size > 0) {
      let addedCount = 0;
      selectedModelMap.forEach((item, modelId) => {
        const exists = customModels.some(m => m.endpoint === endpoint && m.modelName === modelId);
        if (!exists) {
          const displayName = customAlias
            ? (selectedModelMap.size === 1 ? customAlias : `${customAlias} - ${modelId}`)
            : `${prefix} - ${item.name || modelId}`;
          customModels.push({
            id: (Date.now() + Math.floor(Math.random() * 10000)).toString(),
            name: displayName,
            endpoint,
            apiKey,
            modelName: modelId
          });
          addedCount++;
        }
      });

      chrome.storage.local.set({ customModels }, () => {
        renderCustomModels();
        renderDefaultEngineOptions();
        closeCustomModal();
      });
      return;
    }

    // 情况 B：用户没有在列表中勾选，但是在输入框中手动填写了模型 ID
    const singleModelName = modalModelName ? modalModelName.value.trim() : '';
    if (singleModelName) {
      const displayName = customAlias || `${prefix} - ${singleModelName}`;
      const newModel = {
        id: Date.now().toString(),
        name: displayName,
        endpoint,
        apiKey,
        modelName: singleModelName
      };
      customModels.push(newModel);
      chrome.storage.local.set({ customModels }, () => {
        renderCustomModels();
        renderDefaultEngineOptions();
        closeCustomModal();
      });
      return;
    }

    // 情况 C：既没有选模型，也没有在输入框输入模型
    alert('请在模型列表中点击【+ 添加】至少选择一个模型，或直接在输入框中输入模型 ID！');
  });

  // 6. 本地文献存储空间管理逻辑 (IndexedDB)
  const storageDocCount = document.getElementById('storage-doc-count');
  const storagePageCount = document.getElementById('storage-page-count');
  const storagePageDetail = document.getElementById('storage-page-detail');
  const storageDiskUsage = document.getElementById('storage-disk-usage');
  const clean30DaysBtn = document.getElementById('clean-30-days-btn');
  const clearAllStorageBtn = document.getElementById('clear-all-storage-btn');
  const refreshStorageBtn = document.getElementById('refresh-storage-btn');
  const jumpToStorageBtn = document.getElementById('jump-to-storage-btn');
  const storageDocsEmpty = document.getElementById('storage-docs-empty');
  const storageDocsTableWrapper = document.getElementById('storage-docs-table-wrapper');
  const storageDocsTbody = document.getElementById('storage-docs-tbody');

  async function renderStorageStats() {
    if (!storageDocCount) return;
    try {
      storageDiskUsage.textContent = '计算中...';
      const stats = await DocStorage.getStorageStats();

      storageDocCount.textContent = stats.docCount;
      storagePageCount.textContent = stats.transPageCount + stats.drawPageCount;
      storagePageDetail.textContent = `${stats.transPageCount} 页译文 · ${stats.drawPageCount} 页批注`;
      storageDiskUsage.textContent = stats.formattedSize;

      if (!stats.docs || stats.docs.length === 0) {
        if (storageDocsEmpty) storageDocsEmpty.classList.remove('hidden');
        if (storageDocsTableWrapper) storageDocsTableWrapper.classList.add('hidden');
        if (storageDocsTbody) storageDocsTbody.innerHTML = '';
      } else {
        if (storageDocsEmpty) storageDocsEmpty.classList.add('hidden');
        if (storageDocsTableWrapper) storageDocsTableWrapper.classList.remove('hidden');
        if (storageDocsTbody) {
          storageDocsTbody.innerHTML = '';
          stats.docs.forEach((doc) => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
              <td>
                <span class="storage-doc-title" title="${doc.title}">${doc.title}</span>
                <span class="storage-doc-id" title="${doc.id}">${doc.id.substring(0, 36)}...</span>
              </td>
              <td>${doc.numPages ? `${doc.numPages} 页` : '-'}</td>
              <td>
                <div style="display: flex; gap: 6px; flex-wrap: wrap;">
                  <span class="storage-badge trans">${doc.transPagesCount} 页译文</span>
                  <span class="storage-badge draw">${doc.drawPagesCount} 页批注</span>
                </div>
              </td>
              <td style="font-size: 12px; color: #64748b;">${formatTimestamp(doc.updatedAt)}</td>
              <td style="text-align: center;">
                <button type="button" class="doc-del-btn" data-doc-id="${doc.id}" title="删除该篇文献的所有本地缓存">删除</button>
              </td>
            `;
            storageDocsTbody.appendChild(tr);
          });

          // 绑定逐篇删除事件
          storageDocsTbody.querySelectorAll('.doc-del-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
              const targetDocId = e.currentTarget.getAttribute('data-doc-id');
              if (confirm('确定要清除这篇文献在本地的全部翻译与批注记录吗？')) {
                await DocStorage.deleteSingleDoc(targetDocId);
                renderStorageStats();
              }
            });
          });
        }
      }
    } catch (err) {
      console.warn('渲染存储空间统计失败:', err);
    }
  }

  if (refreshStorageBtn) {
    refreshStorageBtn.addEventListener('click', () => {
      renderStorageStats();
    });
  }

  if (clean30DaysBtn) {
    clean30DaysBtn.addEventListener('click', async () => {
      clean30DaysBtn.disabled = true;
      clean30DaysBtn.textContent = '清理中...';
      try {
        const res = await DocStorage.cleanCacheBefore(30);
        if (res.deletedDocs === 0) {
          alert('暂无 30 天前的旧文献缓存，无需清理。');
        } else {
          alert(`清理完成！成功清除 ${res.deletedDocs} 篇旧文献，共释放 ${res.deletedPages} 个历史页面缓存。`);
        }
      } catch (e) {
        alert('清理失败: ' + e.message);
      } finally {
        clean30DaysBtn.disabled = false;
        clean30DaysBtn.textContent = '清空 30 天前缓存';
        renderStorageStats();
      }
    });
  }

  if (clearAllStorageBtn) {
    clearAllStorageBtn.addEventListener('click', async () => {
      if (confirm('警告：确定要清空所有保存在 IndexedDB 中的文献翻译和批注记录吗？此操作不可逆。')) {
        clearAllStorageBtn.disabled = true;
        clearAllStorageBtn.textContent = '清空中...';
        try {
          await DocStorage.clearAllCache();
          alert('已成功清空全部本地文献缓存！');
        } catch (e) {
          alert('清空失败: ' + e.message);
        } finally {
          clearAllStorageBtn.disabled = false;
          clearAllStorageBtn.textContent = '清空所有缓存';
          renderStorageStats();
        }
      }
    });
  }

  if (jumpToStorageBtn) {
    jumpToStorageBtn.addEventListener('click', () => {
      const storageTabBtn = document.querySelector('[data-tab="storage"]');
      if (storageTabBtn) storageTabBtn.click();
    });
  }

  // 初始化加载
  loadSettings();
  if (window.location.hash === '#storage') {
    const storageTabBtn = document.querySelector('[data-tab="storage"]');
    if (storageTabBtn) storageTabBtn.click();
  }
});
