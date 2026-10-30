// Background Service Worker for Lite Translate (方案 A：内置 PDF.js 阅读器接管引擎)
import { matchTerms } from './term_matcher.js';

const DNR_PDF_RULE_ID = 2001;

// 1. 判断是否为目标 PDF 地址 (避免重复接管及死循环)
function isPdfUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return false;
  const extBase = chrome.runtime.getURL('');
  if (rawUrl.startsWith(extBase)) return false;
  if (rawUrl.startsWith('chrome://') || rawUrl.startsWith('chrome-extension://')) return false;

  const urlWithoutHash = rawUrl.split('#')[0];
  const urlWithoutQuery = urlWithoutHash.split('?')[0].toLowerCase();

  // 规则 1: 标准 .pdf 后缀
  if (urlWithoutQuery.endsWith('.pdf')) return true;

  // 规则 2: 学术库与开放获取 PDF 路由 (如 arXiv, Nature, ScienceDirect 等)
  if (urlWithoutHash.toLowerCase().includes('/pdf/') || urlWithoutHash.toLowerCase().includes('.pdf?')) return true;

  return false;
}

// 2. 动态更新 Declarative Net Request 拦截规则 (高效率毫秒级主框架零闪烁重定向)
async function syncPdfDnrRules() {
  if (!chrome.declarativeNetRequest) return;
  chrome.storage.local.get({ pdfAction: 'native' }, async (settings) => {
    const shouldIntercept = (settings.pdfAction === 'extension');
    try {
      if (shouldIntercept) {
        await chrome.declarativeNetRequest.updateDynamicRules({
          removeRuleIds: [DNR_PDF_RULE_ID],
          addRules: [
            {
              id: DNR_PDF_RULE_ID,
              priority: 1,
              action: {
                type: 'redirect',
                redirect: {
                  regexSubstitution: `${chrome.runtime.getURL('pdf_viewer.html')}?file=\\0`
                }
              },
              condition: {
                regexFilter: '^https?://[^?#]+\\.pdf($|[?#].*)',
                resourceTypes: ['main_frame'],
                excludedInitiatorDomains: [chrome.runtime.id]
              }
            }
          ]
        });
      } else {
        await chrome.declarativeNetRequest.updateDynamicRules({
          removeRuleIds: [DNR_PDF_RULE_ID]
        });
      }
    } catch (err) {
      console.warn('更新 DeclarativeNetRequest 动态规则异常:', err);
    }
  });
}

// 3. WebNavigation 顶级框架路由补充拦截 (仅在用户显式开启 extension 接管时生效)
if (chrome.webNavigation && chrome.webNavigation.onBeforeNavigate) {
  chrome.webNavigation.onBeforeNavigate.addListener(async (details) => {
    if (details.frameId !== 0) return; // 仅接管主窗口

    const rawUrl = details.url;
    if (!isPdfUrl(rawUrl)) return;

    chrome.storage.local.get({ pdfAction: 'native' }, (settings) => {
      // 默认 'native' 模式下完全不拦截，保持 Chrome 原生正常打开
      if (settings.pdfAction !== 'extension') return;

      const viewerUrl = chrome.runtime.getURL('pdf_viewer.html') + '?file=' + encodeURIComponent(rawUrl);

      // 本地 file:// 协议处理
      if (rawUrl.startsWith('file://')) {
        chrome.extension.isAllowedFileSchemeAccess((isAllowed) => {
          if (isAllowed) {
            chrome.tabs.update(details.tabId, { url: viewerUrl });
          } else {
            // 未开启本地文件权限时，发出友好提示
            if (chrome.notifications) {
              chrome.notifications.create({
                type: 'basic',
                iconUrl: 'icons/icon-48.png',
                title: 'Translate FY - 本地 PDF 阅读',
                message: '如需自动接管本地 PDF 文件，请在扩展管理页面开启“允许访问文件网址”。'
              });
            }
          }
        });
        return;
      }

      // 针对带路由参数的网络 PDF 进行重定向
      chrome.tabs.update(details.tabId, { url: viewerUrl });
    });
  });
}

// 初始化时创建上下文菜单及同步 DNR 规则
function registerContextMenus() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'translateSelection',
      title: '翻译选中内容',
      contexts: ['selection']
    });

    chrome.contextMenus.create({
      id: 'openPdfInExtension',
      title: '在 Translate FY 中打开此链接 PDF',
      contexts: ['link']
    });

    chrome.contextMenus.create({
      id: 'openCurrentPageInPdf',
      title: '在 Translate FY 阅读器中打开当前页面/PDF',
      contexts: ['page', 'frame']
    });
  });
}

chrome.runtime.onInstalled.addListener(() => {
  // 兼容老版本：如果用户未曾主动修改过 pdfAction，重置为默认的 native 模式并清除 DNR 规则
  chrome.storage.local.get(['pdfAction', 'pdfActionUserExplicit'], (res) => {
    if (!res.pdfAction || (res.pdfAction === 'extension' && !res.pdfActionUserExplicit)) {
      chrome.storage.local.set({ pdfAction: 'native' }, () => {
        syncPdfDnrRules();
      });
    } else {
      syncPdfDnrRules();
    }
  });

  registerContextMenus();

  // 扩展更新或重载后，自动向当前已打开的普通网页标签页补齐注入 content.js，避免用户必须手动刷新页面
  if (chrome.scripting && chrome.tabs) {
    chrome.tabs.query({ url: ['http://*/*', 'https://*/*'] }, (tabs) => {
      if (tabs && Array.isArray(tabs)) {
        for (const t of tabs) {
          if (t && t.id) {
            chrome.scripting.executeScript({
              target: { tabId: t.id },
              files: ['content.js']
            }).catch(() => {});
          }
        }
      }
    });
  }
});

chrome.runtime.onStartup.addListener(() => {
  syncPdfDnrRules();
});

// 监听配置变更，动态启闭 PDF 拦截规则
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local' && changes.pdfAction) {
    syncPdfDnrRules();
  }
});

// 右键菜单点击事件监听
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'translateSelection' && tab.id) {
    const openPopupFallback = (text) => {
      if (chrome.windows) {
        chrome.windows.create({
          url: chrome.runtime.getURL('popup.html') + '?text=' + encodeURIComponent(text || ''),
          type: 'popup',
          width: 420,
          height: 480
        });
      }
    };

    chrome.tabs.sendMessage(tab.id, {
      action: 'showSelectionTranslatePopup',
      text: info.selectionText
    }, () => {
      if (chrome.runtime.lastError) {
        // 若当前标签页尚未注入 content.js (如刷新扩展后标签页未重载)，尝试动态注入并重发
        if (chrome.scripting && chrome.scripting.executeScript && tab.url && !tab.url.startsWith('chrome://') && !tab.url.startsWith('edge://')) {
          chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ['content.js']
          }).then(() => {
            setTimeout(() => {
              chrome.tabs.sendMessage(tab.id, {
                action: 'showSelectionTranslatePopup',
                text: info.selectionText
              }, () => {
                if (chrome.runtime.lastError) {
                  openPopupFallback(info.selectionText);
                }
              });
            }, 80);
          }).catch(() => {
            openPopupFallback(info.selectionText);
          });
        } else {
          openPopupFallback(info.selectionText);
        }
      }
    });
  } else if (info.menuItemId === 'openPdfInExtension') {
    const linkUrl = info.linkUrl;
    if (linkUrl) {
      const viewerUrl = chrome.runtime.getURL('pdf_viewer.html') + '?file=' + encodeURIComponent(linkUrl);
      chrome.tabs.create({ url: viewerUrl });
    }
  } else if (info.menuItemId === 'openCurrentPageInPdf' && tab && tab.url) {
    const pageUrl = tab.url;
    const viewerUrl = chrome.runtime.getURL('pdf_viewer.html') + '?file=' + encodeURIComponent(pageUrl);
    chrome.tabs.create({ url: viewerUrl });
  }
});

// 请求超时包装器 (防止网络挂起)
async function fetchWithTimeout(url, options = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    return res;
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error(`请求超时 (${timeoutMs / 1000}s)`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// 2. 传统与免 Key 翻译服务逻辑
let bgGoogleCooldownUntil = 0;
const BG_GOOGLE_CLIENTS = ['gtx', 'dict-chrome-ex', 'webapp'];
let bgClientIndex = 0;

async function translateGoogle(text, targetLang) {
  if (!text || typeof text !== 'string') return '';
  const now = Date.now();
  if (now < bgGoogleCooldownUntil) {
    throw new Error('Google 通道处于冷却保护期 (429)');
  }

  for (let i = 0; i < BG_GOOGLE_CLIENTS.length; i++) {
    const client = BG_GOOGLE_CLIENTS[(bgClientIndex + i) % BG_GOOGLE_CLIENTS.length];
    const url = `https://translate.googleapis.com/translate_a/single?client=${client}&sl=auto&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`;
    try {
      const res = await fetchWithTimeout(url, {}, 8000);
      if (res.status === 429) {
        bgGoogleCooldownUntil = Date.now() + 8000;
        bgClientIndex = (bgClientIndex + 1) % BG_GOOGLE_CLIENTS.length;
        continue;
      }
      if (!res.ok) throw new Error(`Google API 错误: ${res.status}`);
      const data = await res.json();
      if (data && Array.isArray(data[0])) {
        return data[0].map(item => (item && item[0] ? item[0] : '')).join('');
      }
    } catch (e) {
      if (e.message && e.message.includes('429')) {
        bgGoogleCooldownUntil = Date.now() + 8000;
        continue;
      }
    }
  }
  throw new Error('Google 免Key接口限流或不可用');
}

// Bing 翻译 (免 Key·微软全球高速通道)
let bingTokenCache = {
  ig: '',
  iid: '',
  key: '',
  token: '',
  expiresAt: 0
};

async function getBingToken() {
  const now = Date.now();
  if (bingTokenCache.token && now < bingTokenCache.expiresAt) {
    return bingTokenCache;
  }

  const res = await fetchWithTimeout('https://www.bing.com/translator', {}, 10000);
  if (!res.ok) throw new Error('无法连接到 Bing 翻译服务');
  const html = await res.text();

  const igMatch = html.match(/IG:"([A-F0-9]+)"/i);
  const iidMatch = html.match(/data-iid="([^"]+)"/i);
  const tokenMatch = html.match(/var\s+params_AbusePreventionHelper\s*=\s*\[([0-9]+),\"([^\"]+)\"/);

  if (!tokenMatch) throw new Error('解析 Bing 防刷令牌失败');

  bingTokenCache = {
    ig: igMatch ? igMatch[1] : '',
    iid: iidMatch ? iidMatch[1] : 'translator.5028',
    key: tokenMatch[1],
    token: tokenMatch[2],
    expiresAt: now + 15 * 60 * 1000 // 缓存 15 分钟
  };
  return bingTokenCache;
}

async function translateBing(text, targetLang) {
  const langMap = {
    'zh-CN': 'zh-Hans',
    'en': 'en',
    'ja': 'ja',
    'ko': 'ko'
  };
  const to = langMap[targetLang] || targetLang;

  let tokenInfo = await getBingToken();

  const doReq = async (info) => {
    const params = new URLSearchParams();
    params.append('fromLang', 'auto-detect');
    params.append('text', text);
    params.append('to', to);
    params.append('key', info.key);
    params.append('token', info.token);

    const url = `https://www.bing.com/ttranslatev3?isVertical=1&IG=${info.ig}&IID=${info.iid}`;
    const res = await fetchWithTimeout(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params.toString()
    }, 10000);
    if (!res.ok) throw new Error(`Bing 请求失败: HTTP ${res.status}`);
    return await res.json();
  };

  let data = await doReq(tokenInfo);
  if (!data || !data[0] || !data[0].translations) {
    // 令牌失效则重置缓存重试
    bingTokenCache.expiresAt = 0;
    tokenInfo = await getBingToken();
    data = await doReq(tokenInfo);
  }

  if (data && data[0] && data[0].translations && data[0].translations[0]) {
    return data[0].translations[0].text;
  }
  throw new Error('Bing 翻译未能返回有效结果');
}

// DeepL 翻译 (支持免 Key 通道或官方 50万字符/月 免费 Key)
async function translateDeepL(text, targetLang, apiKey, customEndpoint) {
  const langMap = {
    'zh-CN': 'ZH',
    'en': 'EN-US',
    'ja': 'JA',
    'ko': 'KO'
  };
  const target = langMap[targetLang] || targetLang.toUpperCase();

  // 若用户配置了官方 API Key
  if (apiKey && apiKey.trim()) {
    const key = apiKey.trim();
    const isFree = key.endsWith(':fx');
    const defaultEndpoint = isFree ? 'https://api-free.deepl.com/v2/translate' : 'https://api.deepl.com/v2/translate';
    const endpoint = (customEndpoint && customEndpoint.trim()) ? customEndpoint.trim() : defaultEndpoint;

    const res = await fetchWithTimeout(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `DeepL-Auth-Key ${key}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        text: [text],
        target_lang: target
      })
    }, 12000);

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `DeepL API 错误: HTTP ${res.status}`);
    }
    const data = await res.json();
    if (data.translations && data.translations[0]) {
      return data.translations[0].text;
    }
    throw new Error('DeepL 未返回有效翻译文本');
  }

  // 免 Key 快捷通道 (DeepLX 协议兼容接口)
  const endpoint = (customEndpoint && customEndpoint.trim()) ? customEndpoint.trim() : 'https://api.deeplx.org/translate';
  const res = await fetchWithTimeout(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: text,
      source_lang: 'auto',
      target_lang: target
    })
  }, 12000);
  if (!res.ok) {
    throw new Error(`DeepL 免 Key 通道响应异常: HTTP ${res.status}。建议在设置中填入 DeepL 官方免费 API Key (每月50万字符免费)`);
  }
  const data = await res.json();
  if (data.data) return data.data;
  if (data.translations && data.translations[0]) return data.translations[0].text;
  throw new Error('DeepL 接口返回数据格式异常');
}

// 计算 SHA256 签名 (用于有道智云 API v3 鉴权)
async function sha256(message) {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

function truncateForYoudao(q) {
  const len = q.length;
  if (len <= 20) return q;
  return q.substring(0, 10) + len + q.substring(len - 10);
}

async function translateYoudao(text, targetLang, appKey, appSecret) {
  if (!appKey || !appSecret) {
    throw new Error('未配置有道智云 AppKey 或 AppSecret，请在设置中配置');
  }

  let toLang = targetLang;
  if (targetLang === 'zh-CN') toLang = 'zh-CHS';

  const salt = Date.now().toString();
  const curtime = Math.round(Date.now() / 1000).toString();
  const signStr = appKey + truncateForYoudao(text) + salt + curtime + appSecret;
  const sign = await sha256(signStr);

  const params = new URLSearchParams({
    q: text,
    from: 'auto',
    to: toLang,
    appKey: appKey,
    salt: salt,
    curtime: curtime,
    signType: 'v3',
    sign: sign
  });

  const res = await fetchWithTimeout('https://openapi.youdao.com/api', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: params.toString()
  }, 10000);

  if (!res.ok) {
    throw new Error(`有道智云 HTTP 错误: ${res.status}`);
  }

  const data = await res.json();
  if (data.errorCode === '0' && Array.isArray(data.translation)) {
    return data.translation.join('\n');
  }

  const errorMessages = {
    '101': '缺少必填的参数',
    '102': '不支持的语言类型',
    '103': '翻译文本过长',
    '108': '应用 ID 无效，请检查 AppKey',
    '110': '无相关服务的访问权限',
    '111': '开发者账号无效',
    '113': 'q 不能为空',
    '202': '签名检验失败，请检查 AppSecret',
    '401': '账户欠费或无额度，请在有道智云充值或使用体验额度',
    '411': '访问频率受限'
  };

  throw new Error(errorMessages[data.errorCode] || `有道智云接口错误代码: ${data.errorCode}`);
}

// 2.9 高危数值与科学计数法硬遮罩保护引擎 (Deterministic Number Masker)
function maskNumericEntities(text) {
  if (!text || typeof text !== 'string') return { maskedText: text, tokenMap: new Map() };
  const tokenMap = new Map();
  let counter = 0;

  function replaceWithToken(matchStr) {
    const token = `__NUM_${counter++}__`;
    tokenMap.set(token, matchStr);
    return token;
  }

  let result = text;
  result = result.replace(/\b\d+(?:\.\d+)?\s*[×x*]\s*10[\^⁻⁺⁰¹²³⁴⁵⁶⁷⁸⁹\-+\d]+/g, (m) => replaceWithToken(m));
  result = result.replace(/\b10[\^⁻⁺⁰¹²³⁴⁵⁶⁷⁸⁹\-+\d]+/g, (m) => replaceWithToken(m));
  result = result.replace(/\b\d+(?:\.\d+)?[eE][-+]?\d+\b/g, (m) => replaceWithToken(m));
  result = result.replace(/[-−–]?\d+(?:\.\d+)?\s*(?:°C|℃|°F|K|mg\/[mμn]?L|[mμn]?M|%|rpm|kDa|bp|kb)?\s*(?:[-~–—]|to)\s*[-−–]?\d+(?:\.\d+)?\s*(?:°C|℃|°F|K|mg\/[mμn]?L|[mμn]?M|%|rpm|kDa|bp|kb)\b/gi, (m) => replaceWithToken(m));
  result = result.replace(/[-−–]\s*\d+(?:\.\d+)?\s*(?:°C|℃|°F|K)\b/gi, (m) => replaceWithToken(m));
  result = result.replace(/[±]\s*\d+(?:\.\d+)?(?:\s*(?:%|[a-zA-Z\/]+))?/g, (m) => replaceWithToken(m));
  result = result.replace(/[-−]\s*\d+(?:\.\d+)?%/g, (m) => replaceWithToken(m));

  return { maskedText: result, tokenMap };
}

function unmaskNumericEntities(translatedText, tokenMap) {
  if (!translatedText || !tokenMap || tokenMap.size === 0) return translatedText;
  let result = translatedText;
  tokenMap.forEach((originalValue, token) => {
    const fuzzyRegex = new RegExp(token.replace(/_/g, '[_\\s]?'), 'gi');
    result = result.replace(fuzzyRegex, originalValue);
  });
  return result;
}

// 3. AI 翻译服务逻辑
const GLOBAL_LANG_NAME_MAP = {
  'zh-CN': '中文(简体)',
  'zh-TW': '中文(繁体)',
  'en': '英语 (English)',
  'ja': '日语 (Japanese)',
  'ko': '韩语 (Korean)',
  'fr': '法语 (French)',
  'de': '德语 (German)',
  'es': '西班牙语 (Spanish)',
  'ru': '俄语 (Russian)',
  'it': '意大利语 (Italian)',
  'pt': '葡萄牙语 (Portuguese)',
  'ar': '阿拉伯语 (Arabic)',
  'vi': '越南语 (Vietnamese)',
  'th': '泰语 (Thai)',
  'nl': '荷兰语 (Dutch)',
  'pl': '波兰语 (Polish)'
};

function isChineseLang(targetLang) {
  if (!targetLang) return true;
  return targetLang === 'zh' || targetLang === 'zh-CN' || targetLang === 'zh-TW';
}

function isEnglishLang(targetLang) {
  return targetLang === 'en';
}

function getTargetLangFullName(targetLang, isAcademic = false) {
  if (!targetLang) return isAcademic ? '中文(学术规范简体)' : '中文(简体)';
  if (targetLang === 'zh-CN') return isAcademic ? '中文(学术规范简体)' : '中文(简体)';
  return GLOBAL_LANG_NAME_MAP[targetLang] || targetLang;
}

function formatMatchedTermRule(t, isSelection = false) {
  const cat = t.category ? ` [${t.category}]` : '';
  const abbrPart = t.abbr && !t.term.toLowerCase().includes(t.abbr.toLowerCase()) ? `, ${t.abbr}` : (t.abbr || '');
  if (t.translation.toLowerCase() === t.term.toLowerCase()) {
    return `- "${t.term}"${cat} => "${t.translation}"`;
  }
  if (t.translation.includes('(') || t.translation.includes('（')) {
    return `- "${t.term}"${cat} => "${t.translation}"`;
  }
  if (isSelection) {
    const originalNotation = `${t.term}${abbrPart ? ', ' + abbrPart : ''}`;
    return `- "${t.term}"${cat} => "${t.translation} (${originalNotation})"`;
  }
  return `- "${t.term}"${cat} => "${t.translation}"`;
}

// 多学科/多角色学术论文特殊符号与标点拓扑自愈引擎 (按角色专有生效: biochem/economics/general)
function healAcademicSymbols(text, persona = 'biochem') {
  if (!text || typeof text !== 'string') return '';
  const targetPersona = persona || 'biochem';
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
  } else if (targetPersona === 'economics') {
    s = s.replace(/\bD\s*GDP\b/g, 'ΔGDP');
    s = s.replace(/\bD\s*CPI\b/g, 'ΔCPI');
    s = s.replace(/\bbeta\s*([0-9]|_i|_t)\b/gi, 'β$1');
    s = s.replace(/\bepsilon\s*([0-9]|_i|_t)\b/gi, 'ε$1');
    s = s.replace(/\bR\s*\^?\s*2\b/g, 'R²');
  }

  return s;
}

// Google Gemini 官方接口翻译 (终身免费额度，支持上下文语境与学科角色术语对齐)
async function translateGemini(text, targetLang, apiKey, modelName, context = null, persona = 'biochem', customPersonaPrompts = {}, enableBilingual = true) {
  if (!apiKey) throw new Error('未配置 Gemini API Key，请在设置中配置');
  const cleanModel = (modelName || 'gemini-2.0-flash').replace(/^models\//, '');
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${cleanModel}:generateContent?key=${apiKey}`;
  const langName = getTargetLangFullName(targetLang, false);
  
  const { maskedText, tokenMap } = maskNumericEntities(text);
  const activePersona = typeof persona === 'string' ? persona : (persona ? 'biochem' : 'general');
  const fullScanText = (text || '') + (context ? ' ' + context : '');
  const matchedTerms = matchTerms(fullScanText, 10, activePersona);

  let prompt = '';
  const isShortTermWithContext = !!(context && context.trim() && text && text.trim().length <= 80 && !text.includes('\n'));

  if (isShortTermWithContext) {
    let personaRole = '专业的高级学术与通用翻译官';
    if (activePersona === 'biochem') personaRole = '国际顶级期刊 (如 Cell, Nature, JACS) 的生物化学与分子生物学资深学术专家';
    else if (activePersona === 'economics') personaRole = '国际顶级期刊 (如 AER, QJE, JF) 的金融与计量经济学资深评审专家';

    prompt = `你是一名${personaRole}。
用户在下方文献语境中选中了专业学术词汇/短语【${maskedText}】。请结合上下文语境进行专业消歧，严格且只能将其精准翻译为${langName}。

严格执行规则：
1. 目标语言唯一性强制：翻译结果必须严格使用指定的目标语言【${langName}】，绝对严禁输出任何非指定的目标语种！
2. 专业消歧定名：彻底消除孤立单字多义性（例如生化语境中 expression 翻译为“表达”而非“表情”；caspase 翻译为“半胱天冬酶”；cleaved 翻译为“剪切型/裂解型”；yield 翻译为“产率/收率”）。
3. 仅翻译所选词汇：绝对严禁翻译或复述上下文语境内容！
4. 输出简洁无干扰：直接输出最贴合该专业语境的最终译名，不要包含任何前导解释、拼音、注脚或标点说明。`;

    if (isChineseLang(targetLang) && matchedTerms && matchedTerms.length > 0) {
      prompt += enableBilingual
        ? `\n\n【权威学科审定专有名词定名标准 (划词双语对照)】:`
        : `\n\n【权威学科审定专有名词定名标准 (纯中文规范定名)】:`;
      matchedTerms.forEach(t => {
        prompt += '\n' + formatMatchedTermRule(t, enableBilingual);
      });
    } else if (!isChineseLang(targetLang) && !isEnglishLang(targetLang)) {
      prompt += `\n\n【本土化学术规范强制约束】:
严格遵循【${langName}】母语权威同行评审期刊的标准学术定名规范与语法体系，自主推导对应学术专有名词，严禁夹杂中文字符或非目标语言专名。`;
    }

    prompt += `\n\n【用户划词选中文本】:\n${maskedText}`;
    prompt += `\n\n【划词所在上下文语境 (仅供消歧理解，严禁翻译整个语境)】:\n${context}`;
  } else {
    let personaPrefix = '你是一个专业的学术与通用翻译官。';
    if (customPersonaPrompts && customPersonaPrompts[activePersona]) {
      personaPrefix = customPersonaPrompts[activePersona] + '\n';
    } else if (isChineseLang(targetLang)) {
      if (activePersona === 'biochem') {
        personaPrefix = '你是一名国际顶级期刊 (如 Nature Chemical Biology, JACS, Cell) 的资深学术评审专家兼资深生化与分子生物学文献翻译家。严格遵循《中国化学会命名原则》与《生物化学名词》标准。';
      } else if (activePersona === 'economics') {
        personaPrefix = '你是一名国际顶级经济学与金融学期刊 (如 AER, JPE, QJE, JF) 的资深学术评审专家兼金融翻译家。严格遵循经典经济学与金融工程规范审定名词。';
      }
    } else {
      let personaTitle = '资深国际学术期刊评审专家兼母语级科学翻译家';
      if (activePersona === 'biochem') personaTitle = '国际顶级期刊 (如 Cell, Nature, JACS) 的生物化学与分子生物学同行评审专家';
      else if (activePersona === 'economics') personaTitle = '国际顶级期刊 (如 AER, QJE, JF) 的金融与计量经济学资深评审专家';
      personaPrefix = `你是一名${personaTitle}。请严格遵循【${langName} 本土化学术规范】，自主推导并采用该语言最严谨地道的规范学术定名体系。\n`;
    }

    if (isChineseLang(targetLang)) {
      const termRule = enableBilingual
        ? `2. 核心专名双语对照（划词专属）：核心专有名词输出为【中文定名 (英文原文/缩写)】（如“野生型 (wild-type, WT)”），便于查词与溯源。`
        : `2. 规范学术定名：专有名词直接翻译为规范${langName}学术定名，严禁附加英文括号或备注。`;

      prompt = `${personaPrefix}请将以下文本翻译为${langName}。如果输入内容已经是${langName}，则中英互译。
强制规则：
1. 符号与数值保真：5'、3'、λ、ΔG°、ΔTm、数字、SI 单位与 __NUM_0__ 占位符原样保留，严禁汉化、篡改或丢失。
${termRule}
3. 排版结构一致：遇到多行标题（\\n 分隔）保持相同行数与换行；普通正文自然流畅。直接输出翻译结果，无任何多余说明。`;
    } else {
      prompt = `${personaPrefix}请将以下文本翻译为指定目标语言【${langName}】。
严格执行【${langName} 本土化学术规范】：
0. 目标语言唯一性强制：译文必须 100% 严格且只能使用【${langName}】，绝对严禁输出任何中文字符或其他无关语种！
1. 本土化学术术语标准：严格遵循【${langName}】母语权威同行评审期刊的标准学术定名体系。由你基于专业学科语境自主推导其在该语种中最严谨地道的规范学术词汇，确保动词变位、格位、性数配合及专业介词搭配完全符合母语学术标准。
2. 数字与符号保留：所有阿拉伯数字、小数、百分比、指数、统计量（如 15, 0.05, 95%）必须 100% 保持原始阿拉伯数字形态与格式，严禁拼写为单词。
3. 专用缩写首次出现原则：若专业国际通用缩写需要翻译或音译，仅在段落中首次出现时以半角括号附带原文缩写，后文直接使用标准译名，避免排版溢出。
4. 标题与段落版式一致性：包含换行符 \\n 的独立标题或条目清单必须严格保持行数与结构完全一致，严禁跨行合并；正文段落保持语义通顺连贯，切勿生硬切碎。
5. 国际单位与占位符绝对保护：mg, mL, μm, kDa, mol/L, rpm, °C 等 SI 单位保留原始英文字符；形如 __NUM_0__ 的占位符必须原样保留在对应位置，严禁篡改或丢失。`;
    }

    if (isChineseLang(targetLang) && matchedTerms && matchedTerms.length > 0) {
      prompt += enableBilingual
        ? `\n\n【核心学科专有名词强制对齐表 (划词双语对照)】:`
        : `\n\n【核心学科专有名词强制对齐表 (纯中文规范定名)】:`;
      matchedTerms.forEach(t => {
        prompt += '\n' + formatMatchedTermRule(t, enableBilingual);
      });
    }
    if (context && context.trim()) {
      prompt += `\n\n【参考上下文语境 (仅供消除代词与断句歧义，严禁将此部分内容夹带在译文中)】:\n${context}`;
    }
    prompt += `\n\n请直接输出翻译结果，不要包含任何前导词、解释、注脚或标点说明。
待翻译文本如下：
${maskedText}`;
  }

  const res = await fetchWithTimeout(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }]
    })
  }, 20000);

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error?.message || `Gemini API 错误: ${res.status}`);
  }

  const data = await res.json();
  if (data.candidates && data.candidates[0]?.content?.parts[0]) {
    const rawOut = data.candidates[0].content.parts[0].text.trim();
    return healAcademicSymbols(unmaskNumericEntities(rawOut, tokenMap), activePersona);
  }
  throw new Error('Gemini 没有返回有效翻译内容');
}

// OpenAI 兼容 API 翻译 (适用于 智谱 GLM, DeepSeek, OpenRouter, OpenCode, 硅基流动, Groq, 自定义模型等)
async function translateOpenAICompatible(text, targetLang, apiKey, endpoint, modelName, context = null, persona = 'biochem', customPersonaPrompts = {}, enableBilingual = true) {
  if (!apiKey) throw new Error('该服务未配置 API Key，请在设置中配置');
  if (!endpoint) throw new Error('接口地址未配置');

  const langName = getTargetLangFullName(targetLang, true);
  
  const { maskedText, tokenMap } = maskNumericEntities(text);
  const activePersona = typeof persona === 'string' ? persona : (persona ? 'biochem' : 'general');
  const fullScanText = (text || '') + (context ? ' ' + context : '');
  const matchedTerms = matchTerms(fullScanText, 10, activePersona);

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`,
    'HTTP-Referer': 'https://github.com/GeoffLeng/Translation-Tools',
    'X-Title': 'Translate FY'
  };

  const isShortTermWithContext = !!(context && context.trim() && text && text.trim().length <= 80 && !text.includes('\n'));
  let messages = [];

  if (isShortTermWithContext) {
    let personaRole = '专业的高级学术与通用翻译官';
    if (activePersona === 'biochem') personaRole = '国际顶级期刊 (如 Cell, Nature, JACS) 的生物化学与分子生物学资深学术专家';
    else if (activePersona === 'economics') personaRole = '国际顶级期刊 (如 AER, QJE, JF) 的金融与计量经济学资深评审专家';

    let sysPrompt = `你是一名${personaRole}。
用户在学术文献语境中选中了专业词汇/短语。请结合上下文语境进行专业消歧，严格且只能将其精准翻译为指定目标语言【${langName}】。
严格执行规则：
1. 目标语言唯一性强制：翻译结果必须严格使用指定的目标语言【${langName}】，绝对严禁输出任何非指定的目标语种（例如严禁输出韩语、日语等无关语种）！
2. 专业消歧定名：彻底消除孤立单字多义性（例如生化语境中 expression 翻译为“表达”而非“表情”；caspase 翻译为“半胱天冬酶”；cleaved 翻译为“剪切型/裂解型”；yield 翻译为“产率/收率”）。
3. 仅翻译所选词汇：绝对严禁翻译或复述上下文语境内容！
4. 输出简洁无干扰：直接输出最贴合该专业语境的最终译名，不要包含任何前导解释、拼音、注脚或标点说明。`;

    if (isChineseLang(targetLang) && matchedTerms && matchedTerms.length > 0) {
      sysPrompt += enableBilingual
        ? `\n\n【权威学科审定专有名词定名标准 (划词双语对照)】:`
        : `\n\n【权威学科审定专有名词定名标准 (纯中文规范定名)】:`;
      matchedTerms.forEach(t => {
        sysPrompt += '\n' + formatMatchedTermRule(t, enableBilingual);
      });
    } else if (!isChineseLang(targetLang) && !isEnglishLang(targetLang)) {
      sysPrompt += `\n\n【本土化学术规范强制约束】:
严格遵循【${langName}】母语权威同行评审期刊的标准学术定名规范与语法体系，自主推导对应学术专有名词，严禁夹杂中文字符或非目标语言专名。`;
    }

    const userPrompt = `【划词选中文本】:\n${maskedText}\n\n【划词所在上下文语境 (仅供消歧理解，严禁翻译整个语境)】:\n${context}`;
    messages = [
      { role: 'system', content: sysPrompt },
      { role: 'user', content: userPrompt }
    ];
  } else {
    let systemPrompt = '';
    if (customPersonaPrompts && customPersonaPrompts[activePersona]) {
      systemPrompt = customPersonaPrompts[activePersona] + `\n\n【核心约束】目标语言强制：必须严格且只能翻译为指定目标语言【${langName}】，绝对严禁输出其他无关语种！`;
    } else if (isChineseLang(targetLang)) {
      if (activePersona === 'economics') {
        const termRule = enableBilingual
          ? `3. 核心学科专业词汇双语对照标注（划词翻译专属）：专有名词在中文定名后紧跟半角括号备注原文或缩写，方便溯源。`
          : `3. 规范精炼学术定名：专有名词直接使用规范中文定名，严禁添加任何英文原文或括号备注（保持纯净中文翻译）。`;

        systemPrompt = `你是一名国际顶级经济学与金融学期刊 (如 AER, JPE, QJE, JF) 的资深学术评审专家兼金融翻译家。
请将待翻译的学术文本精准翻译为指定目标语言【${langName}】。
严格规范：
0. 目标语言强制：必须严格且只能翻译为【${langName}】，绝对严禁输出其他无关语种。
1. 术语权威定名：严格遵循经典经济学与金融工程规范审定名词。
2. 数字严禁汉化：所有阿拉伯数字、百分比、指数、统计量必须 100% 保持原始阿拉伯数字形态与格式，严禁转写为汉字。
${termRule}
4. 特殊符号与希腊字母无损保留：ΔGDP, ΔCPI, β, ε, R² 等经济与计量符号必须原样保留并完整清晰显示。
5. 多行标题与自然段落智能区分：遇到包含换行符 \\n 的独立多行标题或条目清单，必须严格保持相同行数与换行，严禁跨行合并；若是普通连贯正文段落，保持自然流畅，切勿机械切碎。
6. 国际单位与占位符保护：USD, bps, %, pt 等保留英文；形如 __NUM_0__ 的占位符必须原样保留在对应位置，严禁篡改或丢失。
请直接输出翻译结果，不要包含任何解释、前导词、注脚或说明。`;
      } else if (activePersona === 'biochem') {
        const termRule = enableBilingual
          ? `3. 核心专名双语对照（划词专属）：核心专有名词输出为【中文定名 (英文原文/缩写)】（如“野生型 (wild-type, WT)”），便于查词与溯源。`
          : `3. 规范学术定名：专有名词直接使用规范中文定名，严禁附加英文括号或备注（保持纯净中文）。`;

        systemPrompt = `你是一名国际顶级期刊 (Nature/Cell/JACS) 的资深生化与分子生物学文献学术评审与翻译专家。
请将输入学术文本精准严谨地翻译为指定目标语言【${langName}】，强制遵守：
0. 目标语言强制：100% 严格使用【${langName}】，严禁输出其他语种。
1. 术语标准：严格符合《中国化学会命名原则》与《生物化学名词》，严禁字面硬翻标准方法（如 Western blot 译为 免疫印迹法；RT-qPCR 译为 逆转录定量PCR）。
2. 符号与数值保真：5'、3'、λ、ΔG°、ΔTm、数字、SI 单位与 __NUM_0__ 占位符原样保留，严禁汉化、篡改或退化。
${termRule}
4. 排版结构一致：遇到多行标题或清单（\\n 分隔）保持原始换行；普通正文自然流畅。
直接输出翻译结果，严禁包含任何前导解释、注脚或说明。`;
      } else {
        const termRule = enableBilingual
          ? `2. 核心学科专业词汇双语对照标注（划词翻译专属）：专有名词及专有缩写在中文译名后以半角括号附带原文或缩写，方便查阅。`
          : `2. 规范精炼学术定名：专有名词及专有缩写直接使用规范中文定名，严禁在译文后附加任何英文原文或括号备注（保持纯净中文翻译）。`;

        systemPrompt = `你是一个专业的高级学术与通用翻译官。请直接将用户输入的文本精准翻译为指定目标语言【${langName}】。
严格规则：
0. 目标语言强制：必须严格且只能翻译为【${langName}】，绝对严禁输出其他无关语种。
1. 数字严禁汉化：所有阿拉伯数字、小数、百分比、科学计数法与范围必须 100% 保持原始阿拉伯数字形态，绝对禁止转写为汉字。
${termRule}
3. 特殊符号与数学字母无损保留：λ、5'、3'、→ 等特殊符号完整保留与清晰显示。
4. 多行标题与自然段落智能区分：遇到包含换行符 \\n 的独立多行标题或条目清单，必须严格保持相同行数与换行，严禁跨行合并；若是普通连贯正文段落，保持自然通顺，切勿机械切碎。
5. 国际单位与占位符保护：mg, mL, μm, kDa, mol/L, rpm, °C 等 SI 单位保留英文字符；形如 __NUM_0__ 的占位符必须原样保留在对应位置，严禁篡改或丢失。
请直接输出翻译结果，不要包含任何解释、前导词、注脚或说明。`;
      }
    } else {
      let personaTitle = '资深国际学术期刊评审专家与母语级科学翻译家';
      if (activePersona === 'biochem') personaTitle = '国际顶级期刊 (如 Cell, Nature, JACS) 的生物化学与分子生物学同行评审专家';
      else if (activePersona === 'economics') personaTitle = '国际顶级期刊 (如 AER, QJE, JF) 的金融与计量经济学资深评审专家';

      systemPrompt = `你是一名${personaTitle}。
请将待翻译的学术文本精准翻译为指定目标语言【${langName}】。
严格执行【${langName} 本土化学术规范】：
0. 目标语言唯一性强制：译文必须 100% 严格且只能使用【${langName}】，绝对严禁输出任何中文字符或其他无关语种！
1. 本土化学术术语标准：严格遵循【${langName}】母语权威同行评审期刊的标准学术定名体系。由你基于专业学科语境自主推导其在该语种中最严谨地道的规范学术词汇，确保动词变位、格位、性数配合及专业介词搭配完全符合母语学术标准。
2. 数字与符号保留：所有阿拉伯数字、小数、百分比、指数、统计量（如 15, 0.05, 95%）必须 100% 保持原始阿拉伯数字形态与格式，严禁拼写为单词。
3. 专用缩写首次出现原则：若专业国际通用缩写需要翻译或音译，仅在段落中首次出现时以半角括号附带原文缩写，后文直接使用标准译名，避免排版溢出。
4. 标题与段落版式一致性：包含换行符 \\n 的独立标题或条目清单必须严格保持行数与结构完全一致，严禁跨行合并；正文段落保持语义通顺连贯，切勿生硬切碎。
5. 国际单位与占位符绝对保护：mg, mL, μm, kDa, mol/L, rpm, °C 等 SI 单位保留原始英文字符；形如 __NUM_0__ 的占位符必须原样保留在对应位置，严禁篡改或丢失。
请直接输出翻译结果，不要包含任何解释、前导词、注脚或说明。`;
    }

    if (isChineseLang(targetLang) && matchedTerms && matchedTerms.length > 0) {
      systemPrompt += enableBilingual
        ? `\n\n【本段核心命中学科专有术语强制对齐表 (划词双语对照)】:`
        : `\n\n【本段核心命中学科专有术语强制对齐表 (纯中文规范定名)】:`;
      matchedTerms.forEach(t => {
        systemPrompt += '\n' + formatMatchedTermRule(t, enableBilingual);
      });
    }

    if (context && context.trim()) {
      systemPrompt += `\n\n【参考上下文语境 (仅供消除代词与断句歧义，严禁将此部分内容夹带在译文中)】:\n${context}`;
    }

    messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `将以下文本严格且只能翻译为【${langName}】，严禁输出任何其他语种：\n\n${maskedText}` }
    ];
  }

  const res = await fetchWithTimeout(endpoint, {
    method: 'POST',
    headers: headers,
    body: JSON.stringify({
      model: modelName,
      messages: messages,
      temperature: 0.2
    })
  }, 25000);

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error?.message || `API 错误: ${res.status}`);
  }

  const data = await res.json();
  const choice = data.choices && data.choices[0];
  if (choice) {
    const content = choice.message?.content;
    if (typeof content === 'string' && content.trim()) {
      return healAcademicSymbols(unmaskNumericEntities(content.trim(), tokenMap), activePersona);
    }
    if (Array.isArray(content)) {
      const merged = content.map(part => (part && part.text) ? part.text : '').join('').trim();
      if (merged) return healAcademicSymbols(unmaskNumericEntities(merged, tokenMap), activePersona);
    }
    if (choice.text && typeof choice.text === 'string' && choice.text.trim()) {
      return healAcademicSymbols(unmaskNumericEntities(choice.text.trim(), tokenMap), activePersona);
    }
  }
  throw new Error('API 没有返回有效的翻译文本内容');
}

// 3.5 结构化批量翻译逻辑 (Batch Context Prompting + 滑动窗口跨页断句补齐 + 纯前端权威语料库注入)
async function translateBatchOpenAICompatible(items, targetLang, apiKey, endpoint, modelName, context = null, persona = 'biochem', customPersonaPrompts = {}) {
  if (!apiKey) throw new Error('该服务未配置 API Key，请在设置中配置');
  if (!endpoint) throw new Error('接口地址未配置');

  const langName = getTargetLangFullName(targetLang, true);
  
  const tokenMaps = new Map();
  const maskedItems = items.map(item => {
    const { maskedText, tokenMap } = maskNumericEntities(item.text);
    tokenMaps.set(item.id, tokenMap);
    return { id: item.id, text: maskedText };
  });

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`,
    'HTTP-Referer': 'https://github.com/GeoffLeng/Translation-Tools',
    'X-Title': 'Translate FY'
  };

  // 本地权威学科词库毫秒级多模式匹配 (3,102 条生化词库 / 97 条顶刊经济金融词库)
  const fullText = items.map(it => it.text).join(' ');
  const activePersona = typeof persona === 'string' ? persona : (persona ? 'biochem' : 'general');
  const matchedTerms = matchTerms(fullText, 15, activePersona);

  let systemPrompt = '';
  if (customPersonaPrompts && customPersonaPrompts[activePersona]) {
    systemPrompt = customPersonaPrompts[activePersona] + `\n\n【核心约束】目标语言强制：必须严格且只能翻译为指定目标语言【${langName}】，绝对严禁输出其他无关语种！`;
    if (!systemPrompt.includes('JSON')) {
      systemPrompt += `\n\n【排版与数据格式协议】:\n请将待翻译的 JSON 数组中的每一个学术段落精准翻译为 ${langName}。保持每一个对象的 "id" 字段与输入严格一致，必须输出合法的纯 JSON 数组，严禁任何 markdown 标记或解释。`;
    }
  } else if (isChineseLang(targetLang)) {
    if (activePersona === 'economics') {
      systemPrompt = `你是一名国际顶级经济学与金融学期刊 (如 AER, JPE, QJE, JF) 的资深学术评审专家兼资深金融翻译家。
请将待翻译的 JSON 数组中的每一个学术段落精准翻译为 ${langName}。
学术规范：
1. 术语权威定名：严格遵循经典经济学与金融工程规范审定名词（如 Quantitative Easing 译为 量化宽松；Phillips Curve 译为 菲利普斯曲线；Deadweight Loss 译为 无谓损失）。
2. 计量逻辑严密：准确传达计量因果推断（OLS、IV、DID、RDD）与统计显著性。
3. 数字严禁汉化：所有阿拉伯数字、百分比、指数、统计量必须 100% 保持原始阿拉伯数字形态与格式，严禁转写为汉字。
4. 原排版空间防溢出契约（必须严格遵守）：当前处于 PDF 原排版原位覆盖场景，专有名词必须以规范中文定名为主，严禁在正文中机械附加冗长的英文全称括号（坚决防止因译文长度暴增导致原排版区域重叠、溢出或字号过度压缩）。仅在当前页首次出现且具有通用极短缩写时允许紧随半角括号备注极短缩写（如“野生型 (WT)”）；后续出现一律直接采用中文定名。
5. 特殊符号与希腊字母无损保留：ΔGDP, ΔCPI, β, ε, R² 等经济与计量符号必须原样保留并完整清晰显示。
6. 多行标题与自然段落智能区分：包含换行符 \\n 的独立多行标题或条目清单必须严格保持相同行数与换行；普通正文段落保持语义通顺连贯。
7. 国际单位与占位符保护：USD, bps, %, pt 等保留英文；形如 __NUM_0__ 的占位符必须原样保留在对应位置。
8. 必须输出合法的纯 JSON 数组，保持 id 严格一致，严禁任何 markdown 标记或解释。`;
    } else if (activePersona === 'biochem') {
      systemPrompt = `你是一名国际顶级期刊 (Nature/Cell/JACS) 的资深生化与分子生物学文献学术评审与翻译专家。
请将待翻译 JSON 数组中的每个学术段落精准翻译为 ${langName}，强制遵守：
1. 术语标准：严格符合《中国化学会命名原则》与《生物化学名词》，严禁字面硬翻标准方法（如 Western blot 译为 免疫印迹法）。
2. 原排版空间防溢出：处于 PDF 原位覆盖场景，专有名词使用规范中文定名，严禁附加冗长英文括号（首现通用缩写可简注如“野生型 (WT)”）。
3. 符号与数值保真：5'、3'、λ、ΔG°、ΔTm、阿拉伯数字、SI 单位及 __NUM_0__ 占位符 100% 原始保留，严禁汉化或篡改。
4. 排版与格式契约：保持多行换行结构；保持原始 "id" 严格一致，必须且仅输出合法纯 JSON 数组，严禁 markdown 标记或解释。`;
    } else {
      systemPrompt = `你是一个专业的高级学术与文档翻译专家。请将待翻译的 JSON 数组中的每一个段落翻译为 ${langName}。
严格遵循以下要求：
1. 保持每一个对象的 "id" 字段与原始输入严格一致。
2. 数字严禁汉化：所有阿拉伯数字、小数、百分比、科学计数法与范围必须 100% 保留阿拉伯数字形态，绝对禁止转写为汉字。
3. 原排版空间防溢出契约（必须严格遵守）：当前处于 PDF 原排版原位覆盖场景，专有名词必须以规范中文定名为主，严禁在正文中机械附加冗长的英文全称括号（坚决防止因译文长度暴增导致原排版区域重叠、溢出或字号过度压缩）。仅在当前页首次出现且具有通用极短缩写时允许紧随半角括号备注极短缩写；后续出现一律直接采用中文定名。
4. 特殊符号与数学字母无损保留：λ、5'、3'、→ 等特殊符号完整保留与清晰显示。
5. 多行标题与自然段落智能区分：包含换行符 \\n 的独立多行标题、清单必须严格保持相同行数与换行符位置；普通正文保持自然连贯。
6. 国际单位与占位符保护：SI 单位保留英文；形如 __NUM_0__ 的占位符严禁篡改或丢失。
7. 必须输出且仅输出合法的纯 JSON 数组，格式为 [{"id": 0, "text": "译文"}...]。
8. 严禁包含任何 Markdown 代码块标记（如 \`\`\`json ），严禁附加任何解释。`;
    }
  } else {
    let personaTitle = '资深国际学术期刊评审专家兼母语级科学翻译家';
    if (activePersona === 'biochem') personaTitle = '国际顶级期刊 (如 Cell, Nature, JACS) 的生物化学与分子生物学同行评审专家';
    else if (activePersona === 'economics') personaTitle = '国际顶级期刊 (如 AER, QJE, JF) 的金融与计量经济学资深评审专家';

    systemPrompt = `你是一名${personaTitle}。
请将待翻译的 JSON 数组中的每一个学术段落精准翻译为指定目标语言【${langName}】。
严格执行【${langName} 本土化学术规范与排版协议】：
0. 目标语言唯一性强制：译文必须 100% 严格且只能使用【${langName}】，绝对严禁输出任何中文字符或其他无关语种！
1. 本土化学术术语标准：严格遵循【${langName}】母语权威同行评审期刊的标准学术定名体系。由你基于专业学科语境自主推导其在该语种中最严谨地道的规范学术词汇，确保动词变位、格位、性数配合及专业介词搭配完全符合母语学术标准。
2. 数字与符号保留：所有阿拉伯数字、小数、百分比、指数、统计量（如 15, 0.05, 95%）必须 100% 保持原始阿拉伯数字形态与格式，严禁拼写为单词。
3. 专用缩写首次出现原则：若专业国际通用缩写需要翻译或音译，仅在当前页首次出现时以半角括号附带原文缩写，后文直接使用标准译名，避免排版溢出。
4. 保持段落结构一致：多行标题与独立清单必须严格保持相同换行与排版；普通正文段落保持语义通顺连贯，切勿生硬切碎。
5. 国际单位与占位符保护：SI 单位保留原始英文字符；形如 __NUM_0__ 的占位符必须原样保留在对应位置，严禁篡改或丢失。
6. 严格保持每一个对象的 "id" 字段与输入严格一致，必须输出合法的纯 JSON 数组，格式为 [{"id": 0, "text": "译文"}...]。
7. 严禁包含任何 Markdown 代码块标记（如 \`\`\`json ），严禁附加任何解释。`;
  }

  // 动态注入命中的学科专有名词强制对齐表 (仅在目标语言为中文时生效)
  if (isChineseLang(targetLang) && matchedTerms && matchedTerms.length > 0) {
    systemPrompt += `\n\n【本段核心命中学科专有术语强制对齐表 (原排版规范中文定名，严禁添加冗长括号英文以防版面溢出)】:`;
    matchedTerms.forEach(t => {
      systemPrompt += '\n' + formatMatchedTermRule(t, false);
    });
  }

  if (context && (context.prefix || context.suffix)) {
    systemPrompt += `\n\n【重要：跨页上下文语境参考 (用于消除跨页断句与代词歧义)】
${context.prefix ? `【前置页面末尾上下文 (仅作为理解上文代词、断句参考，绝对不要翻译此部分)】:\n${context.prefix}\n` : ''}
${context.suffix ? `【后置页面开头上下文 (仅作为理解下文句意、断句参考，绝对不要翻译此部分)】:\n${context.suffix}\n` : ''}
跨页约束：
- 待翻译的 JSON 数组是当前页面的正文。
- 如果当前页开头是上一页未结束的从句/短语，请结合【前置页面末尾上下文】将其译为通顺中文；
- 如果当前页末尾句子尚未结束，请结合【后置页面开头上下文】理解完整句意后，仅将当前页所含部分准确翻译，绝对严禁将后置上下文的内容输出在当前页的译文中！`;
  }

  const userPrompt = JSON.stringify(maskedItems.map(item => ({ id: item.id, text: item.text })));

  const res = await fetchWithTimeout(endpoint, {
    method: 'POST',
    headers: headers,
    body: JSON.stringify({
      model: modelName,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.2
    })
  }, 40000);

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error?.message || `API 错误: ${res.status}`);
  }

  const data = await res.json();
  const choice = data.choices && data.choices[0];
  let rawContent = '';
  if (choice) {
    const content = choice.message?.content;
    if (typeof content === 'string') rawContent = content.trim();
    else if (Array.isArray(content)) rawContent = content.map(p => (p && p.text) ? p.text : '').join('').trim();
    else if (choice.text) rawContent = choice.text.trim();
  }

  if (!rawContent) throw new Error('API 没有返回翻译内容');

  let cleanJson = rawContent.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  try {
    const parsed = JSON.parse(cleanJson);
    if (Array.isArray(parsed)) {
      return parsed.map(p => {
        const tMap = tokenMaps.get(p.id);
        const unmasked = tMap ? unmaskNumericEntities(p.text, tMap) : p.text;
        return {
          id: p.id,
          text: healAcademicSymbols(unmasked, activePersona)
        };
      });
    }
  } catch (parseErr) {
    const matched = [];
    const objRegex = /\{"id"\s*:\s*([^,]+),\s*"text"\s*:\s*"((?:[^"\\]|\\.)*)"\}/g;
    let match;
    while ((match = objRegex.exec(cleanJson)) !== null) {
      try {
        const idVal = JSON.parse(match[1]);
        const textVal = JSON.parse(`"${match[2]}"`);
        matched.push({ id: idVal, text: textVal });
      } catch (e) {}
    }
    if (matched.length > 0) {
      return matched.map(p => {
        const tMap = tokenMaps.get(p.id);
        const unmasked = tMap ? unmaskNumericEntities(p.text, tMap) : p.text;
        return {
          id: p.id,
          text: healAcademicSymbols(unmasked, activePersona)
        };
      });
    }
    throw new Error('批量翻译解析 JSON 失败: ' + parseErr.message);
  }
  throw new Error('批量翻译返回数据非数组格式');
}

async function translateBatchGemini(items, targetLang, apiKey, modelName, context = null, persona = 'biochem', customPersonaPrompts = {}) {
  if (!apiKey) throw new Error('未配置 Gemini API Key，请在设置中配置');
  const cleanModel = (modelName || 'gemini-2.0-flash').replace(/^models\//, '');
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${cleanModel}:generateContent?key=${apiKey}`;
  const langName = getTargetLangFullName(targetLang, false);

  const tokenMaps = new Map();
  const maskedItems = items.map(item => {
    const { maskedText, tokenMap } = maskNumericEntities(item.text);
    tokenMaps.set(item.id, tokenMap);
    return { id: item.id, text: maskedText };
  });

  const fullText = items.map(it => it.text).join(' ');
  const activePersona = typeof persona === 'string' ? persona : (persona ? 'biochem' : 'general');
  const matchedTerms = matchTerms(fullText, 15, activePersona);

  let prompt = '';
  if (customPersonaPrompts && customPersonaPrompts[activePersona]) {
    prompt = customPersonaPrompts[activePersona] + `\n\n【核心约束】目标语言强制：必须严格且只能翻译为指定目标语言【${langName}】，绝对严禁输出其他无关语种！`;
    if (!prompt.includes('JSON')) {
      prompt += `\n\n【排版与数据格式协议】:\n请将待翻译的 JSON 数组中的每一个学术段落精准翻译为 ${langName}。保持每一个对象的 "id" 字段与输入严格一致，必须输出合法的纯 JSON 数组，严禁任何 markdown 标记或解释。`;
    }
  } else if (isChineseLang(targetLang)) {
    if (activePersona === 'economics') {
      prompt = `你是一名国际顶级经济学与金融学期刊 (如 AER, JPE, QJE, JF) 的资深学术评审专家兼资深金融翻译家。
请将待翻译的 JSON 数组中的每一个学术段落精准翻译为 ${langName}。
学术规范：
1. 术语权威定名：严格遵循经典经济学与金融工程规范审定名词（如 Quantitative Easing 译为 量化宽松；Phillips Curve 译为 菲利普斯曲线；Deadweight Loss 译为 无谓损失）。
2. 计量逻辑严密：准确传达计量因果推断（OLS、IV、DID、RDD）与统计显著性。
3. 数字严禁汉化：所有阿拉伯数字、百分比、指数、统计量必须 100% 保持原始阿拉伯数字形态与格式，严禁转写为汉字。
4. 原排版空间防溢出契约（必须严格遵守）：当前处于 PDF 原排版原位覆盖场景，专有名词必须以规范中文定名为主，严禁在正文中机械附加冗长的英文全称括号（坚决防止因译文长度暴增导致原排版区域重叠、溢出或字号过度压缩）。仅在当前页首次出现且具有通用极短缩写时允许紧随半角括号备注极短缩写（如“野生型 (WT)”）；后续出现一律直接采用中文定名。
5. 特殊符号与希腊字母无损保留：ΔGDP, ΔCPI, β, ε, R² 等经济与计量符号必须原样保留并完整清晰显示。
6. 多行标题与自然段落智能区分：包含换行符 \\n 的独立多行标题或条目清单必须严格保持相同行数与换行；普通正文段落保持语义通顺连贯。
7. 国际单位与占位符保护：USD, bps, %, pt 等保留英文；形如 __NUM_0__ 的占位符必须原样保留在对应位置。
8. 必须输出合法的纯 JSON 数组，保持 id 严格一致，严禁任何 markdown 标记或解释。`;
    } else if (activePersona === 'biochem') {
      prompt = `你是一名国际顶级期刊 (Nature/Cell/JACS) 的资深生化与分子生物学文献学术评审与翻译专家。
请将待翻译 JSON 数组中的每个学术段落精准翻译为 ${langName}，强制遵守：
1. 术语标准：严格符合《中国化学会命名原则》与《生物化学名词》，严禁字面硬翻标准方法（如 Western blot 译为 免疫印迹法）。
2. 原排版空间防溢出：处于 PDF 原位覆盖场景，专有名词使用规范中文定名，严禁附加冗长英文括号（首现通用缩写可简注如“野生型 (WT)”）。
3. 符号与数值保真：5'、3'、λ、ΔG°、ΔTm、阿拉伯数字、SI 单位及 __NUM_0__ 占位符 100% 原始保留，严禁汉化或篡改。
4. 排版与格式契约：保持多行换行结构；保持原始 "id" 严格一致，必须且仅输出合法纯 JSON 数组，严禁 markdown 标记或解释。`;
    } else {
      prompt = `你是一个专业的高级学术与文档翻译专家。请将待翻译的 JSON 数组中的每一个段落翻译为 ${langName}。
严格遵循以下要求：
1. 保持每一个对象的 "id" 字段与原始输入严格一致。
2. 数字严禁汉化：所有阿拉伯数字、小数、百分比、科学计数法与范围必须 100% 保留阿拉伯数字形态，绝对禁止转写为汉字。
3. 原排版空间防溢出契约（必须严格遵守）：当前处于 PDF 原排版原位覆盖场景，专有名词必须以规范中文定名为主，严禁在正文中机械附加冗长的英文全称括号（坚决防止因译文长度暴增导致原排版区域重叠、溢出或字号过度压缩）。仅在当前页首次出现且具有通用极短缩写时允许紧随半角括号备注极短缩写；后续出现一律直接采用中文定名。
4. 特殊符号与数学字母无损保留：λ、5'、3'、→ 等特殊符号完整保留与清晰显示。
5. 多行标题与自然段落智能区分：包含换行符 \\n 的独立多行标题、清单必须严格保持相同行数与换行符位置；普通正文保持自然连贯。
6. 国际单位与占位符保护：SI 单位保留英文；形如 __NUM_0__ 的占位符严禁篡改或丢失。
7. 必须输出且仅输出合法的纯 JSON 数组，格式为 [{"id": 0, "text": "译文"}...]。
8. 严禁包含任何 Markdown 标记（如 \`\`\`json ），严禁附加任何解释。`;
    }
  } else {
    let personaTitle = '资深国际学术期刊评审专家兼母语级科学翻译家';
    if (activePersona === 'biochem') personaTitle = '国际顶级期刊 (如 Cell, Nature, JACS) 的生物化学与分子生物学同行评审专家';
    else if (activePersona === 'economics') personaTitle = '国际顶级期刊 (如 AER, QJE, JF) 的金融与计量经济学资深评审专家';

    prompt = `你是一名${personaTitle}。
请将待翻译的 JSON 数组中的每一个学术段落精准翻译为指定目标语言【${langName}】。
严格执行【${langName} 本土化学术规范与排版协议】：
0. 目标语言唯一性强制：译文必须 100% 严格且只能使用【${langName}】，绝对严禁输出任何中文字符或其他无关语种！
1. 本土化学术术语标准：严格遵循【${langName}】母语权威同行评审期刊的标准学术定名体系。由你基于专业学科语境自主推导其在该语种中最严谨地道的规范学术词汇，确保动词变位、格位、性数配合及专业介词搭配完全符合母语学术标准。
2. 数字与符号保留：所有阿拉伯数字、小数、百分比、指数、统计量（如 15, 0.05, 95%）必须 100% 保持原始阿拉伯数字形态与格式，严禁拼写为单词。
3. 专用缩写首次出现原则：若专业国际通用缩写需要翻译或音译，仅在当前页首次出现时以半角括号附带原文缩写，后文直接使用标准译名，避免排版溢出。
4. 保持段落结构一致：多行标题与独立清单必须严格保持相同换行与排版；普通正文段落保持语义通顺连贯，切勿生硬切碎。
5. 国际单位与占位符保护：SI 单位保留原始英文字符；形如 __NUM_0__ 的占位符必须原样保留在对应位置，严禁篡改或丢失。
6. 严格保持每一个对象的 "id" 字段与输入严格一致，必须输出合法的纯 JSON 数组，格式为 [{"id": 0, "text": "译文"}...]。
7. 严禁包含任何 Markdown 代码块标记（如 \`\`\`json ），严禁附加任何解释。`;
  }

  // 动态注入命中的学科专有名词强制对齐表 (仅在目标语言为中文时生效)
  if (isChineseLang(targetLang) && matchedTerms && matchedTerms.length > 0) {
    prompt += `\n\n【本段核心命中学科专有术语强制对齐表 (原排版规范中文定名，严禁添加冗长括号英文以防版面溢出)】:`;
    matchedTerms.forEach(t => {
      prompt += '\n' + formatMatchedTermRule(t, false);
    });
  }

  if (context && (context.prefix || context.suffix)) {
    prompt += `\n\n【跨页上下文语境参考】
${context.prefix ? `【前置页面末尾参考 (仅供理解上文，严禁翻译输出)】:\n${context.prefix}\n` : ''}
${context.suffix ? `【后置页面开头参考 (仅供理解下文，严禁翻译输出)】:\n${context.suffix}\n` : ''}
跨页约束：仅翻译下方待翻译数据，结合前后参考消除断句与代词歧义，绝对严禁夹带输出前后参考内容！`;
  }

  prompt += `\n待翻译数据：
${JSON.stringify(maskedItems.map(i => ({ id: i.id, text: i.text })))}`;

  const res = await fetchWithTimeout(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }]
    })
  }, 40000);

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error?.message || `Gemini API 错误: ${res.status}`);
  }

  const data = await res.json();
  const rawContent = data.candidates && data.candidates[0]?.content?.parts[0]?.text?.trim();
  if (!rawContent) throw new Error('Gemini 没有返回翻译内容');

  let cleanJson = rawContent.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  try {
    const parsed = JSON.parse(cleanJson);
    if (Array.isArray(parsed)) {
      return parsed.map(p => {
        const tMap = tokenMaps.get(p.id);
        const unmasked = tMap ? unmaskNumericEntities(p.text, tMap) : p.text;
        return {
          id: p.id,
          text: healAcademicSymbols(unmasked, activePersona)
        };
      });
    }
  } catch (e) {
    const matched = [];
    const objRegex = /\{"id"\s*:\s*([^,]+),\s*"text"\s*:\s*"((?:[^"\\]|\\.)*)"\}/g;
    let match;
    while ((match = objRegex.exec(cleanJson)) !== null) {
      try {
        const idVal = JSON.parse(match[1]);
        const textVal = JSON.parse(`"${match[2]}"`);
        matched.push({ id: idVal, text: textVal });
      } catch (err) {}
    }
    if (matched.length > 0) {
      return matched.map(p => {
        const tMap = tokenMaps.get(p.id);
        const unmasked = tMap ? unmaskNumericEntities(p.text, tMap) : p.text;
        return {
          id: p.id,
          text: healAcademicSymbols(unmasked, activePersona)
        };
      });
    }
    throw new Error('Gemini 批量翻译解析 JSON 失败');
  }
  throw new Error('Gemini 批量翻译返回数据非数组格式');
}

async function translateBatchGoogle(items, targetLang) {
  const results = new Array(items.length);
  const CONCURRENCY = 2;
  let cursor = 0;

  async function worker() {
    while (cursor < items.length) {
      const idx = cursor++;
      if (idx >= items.length) break;
      const item = items[idx];
      try {
        let trans = await translateGoogle(item.text, targetLang);
        results[idx] = { id: item.id, text: trans || item.text };
      } catch (err) {
        // Google 429 降级尝试 Bing
        try {
          let trans = await translateBing(item.text, targetLang);
          results[idx] = { id: item.id, text: trans || item.text };
        } catch (bingErr) {
          results[idx] = { id: item.id, text: item.text };
        }
      }
      await new Promise(r => setTimeout(r, 90));
    }
  }

  const workers = Array.from({ length: Math.min(CONCURRENCY, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

async function translateBatchDeepL(items, targetLang, apiKey, customEndpoint) {
  const langMap = { 'zh-CN': 'ZH', 'en': 'EN-US', 'ja': 'JA', 'ko': 'KO' };
  const target = langMap[targetLang] || targetLang.toUpperCase();

  if (apiKey && apiKey.trim()) {
    const key = apiKey.trim();
    const isFree = key.endsWith(':fx');
    const defaultEndpoint = isFree ? 'https://api-free.deepl.com/v2/translate' : 'https://api.deepl.com/v2/translate';
    const endpoint = (customEndpoint && customEndpoint.trim()) ? customEndpoint.trim() : defaultEndpoint;

    const res = await fetchWithTimeout(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `DeepL-Auth-Key ${key}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        text: items.map(i => i.text),
        target_lang: target
      })
    }, 25000);

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `DeepL API 错误: HTTP ${res.status}`);
    }
    const data = await res.json();
    if (data.translations && Array.isArray(data.translations)) {
      return items.map((item, idx) => ({
        id: item.id,
        text: data.translations[idx]?.text || item.text
      }));
    }
    throw new Error('DeepL 未返回有效翻译文本');
  }

  // 免Key模式同样采用高并发独立通道，杜绝分隔符篡改
  const results = new Array(items.length);
  const CONCURRENCY = 4;
  let cursor = 0;

  async function worker() {
    while (cursor < items.length) {
      const idx = cursor++;
      if (idx >= items.length) break;
      const item = items[idx];
      try {
        const trans = await translateDeepL(item.text, targetLang, '', customEndpoint);
        results[idx] = { id: item.id, text: trans || item.text };
      } catch (err) {
        results[idx] = { id: item.id, text: item.text };
      }
    }
  }

  const workers = Array.from({ length: Math.min(CONCURRENCY, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

async function translateBatchGeneric(items, engine, targetLang, settings) {
  const results = [];
  const CONCURRENCY = 5;
  let idx = 0;
  async function worker() {
    while (idx < items.length) {
      const current = items[idx++];
      if (!current) break;
      try {
        let t = '';
        if (engine === 'bing') t = await translateBing(current.text, targetLang);
        else if (engine === 'youdao') t = await translateYoudao(current.text, targetLang, settings.youdaoAppKey, settings.youdaoAppSecret);
        else t = await translateGoogle(current.text, targetLang);
        results.push({ id: current.id, text: t });
      } catch (e) {
        results.push({ id: current.id, text: `[翻译失败: ${e.message}]` });
      }
    }
  }
  const workers = Array.from({ length: Math.min(CONCURRENCY, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

// 辅助：从 Chat Endpoint 推导 Models Endpoint
function deriveModelsUrl(endpoint, fallbackUrl) {
  let url = (endpoint && endpoint.trim()) ? endpoint.trim() : fallbackUrl;
  if (!url) return '';
  const [base, query] = url.split('?');
  let cleanBase = base.replace(/\/+$/, '');
  if (cleanBase.endsWith('/chat/completions')) {
    cleanBase = cleanBase.replace(/\/chat\/completions$/, '/models');
  } else if (cleanBase.endsWith('/completions')) {
    cleanBase = cleanBase.replace(/\/completions$/, '/models');
  } else if (cleanBase.endsWith('/messages')) {
    cleanBase = cleanBase.replace(/\/messages$/, '/models');
  } else if (!cleanBase.includes('/models')) {
    cleanBase = cleanBase + '/models';
  }
  return query ? `${cleanBase}?${query}` : cleanBase;
}

// 4. 服务商可用模型获取逻辑
async function fetchProviderModels(provider, apiKey, customEndpoint) {
  if (!apiKey) throw new Error('请先输入有效的 API Key');

  const defaultHeaders = {
    'Authorization': `Bearer ${apiKey}`,
    'HTTP-Referer': 'https://github.com/GeoffLeng/Translation-Tools',
    'X-Title': 'Translate FY'
  };

  // 1) 智谱 GLM（4/4.5/4.7 flash 免费）
  if (provider === 'glm') {
    const res = await fetchWithTimeout('https://open.bigmodel.cn/api/paas/v4/models', {
      headers: { 'Authorization': `Bearer ${apiKey}` }
    }, 12000);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || `智谱 GLM 请求失败: HTTP ${res.status}`);
    }
    const data = await res.json();
    const fetchedList = (data.data && Array.isArray(data.data)) ? data.data.map(m => m.id) : [];

    // 官方核心免费 Flash 模型集合（确保完整包含并优先置顶）
    const freeFlashModels = ['glm-4-flash', 'glm-4.5-flash', 'glm-4.7-flash', 'glm-4-flashx'];
    const mergedList = [...freeFlashModels];
    fetchedList.forEach(id => {
      if (!mergedList.includes(id)) mergedList.push(id);
    });

    return mergedList.map(id => {
      const isFree = freeFlashModels.includes(id) || id.toLowerCase().includes('flash');
      return {
        id: id,
        name: isFree ? `${id} (免费)` : id,
        isFree: isFree
      };
    });
  }

  // 2) Google Gemini (终身免费额度)
  if (provider === 'gemini') {
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
    const res = await fetchWithTimeout(url, {}, 12000);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || `Gemini 请求失败: HTTP ${res.status}`);
    }
    const data = await res.json();
    if (!data.models || !Array.isArray(data.models)) throw new Error('Gemini 未返回模型列表');
    return data.models
      .filter(m => m.supportedGenerationMethods && m.supportedGenerationMethods.includes('generateContent'))
      .map(m => m.name.replace(/^models\//, ''))
      .filter(id => !id.includes('embedding') && !id.includes('aqa'));
  }

  // 3) DeepSeek (官方预置与自定义端点)
  if (provider === 'deepseek') {
    const url = deriveModelsUrl(customEndpoint, 'https://api.deepseek.com/models');
    const res = await fetchWithTimeout(url, {
      headers: { 'Authorization': `Bearer ${apiKey}` }
    }, 12000);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const msg = err.error?.message || err.message || '';
      throw new Error(`DeepSeek 鉴权失败 (HTTP ${res.status}): ${msg || '请核对 DeepSeek API Key 是否正确'}`);
    }
    const data = await res.json();
    if (!data.data || !Array.isArray(data.data)) throw new Error('DeepSeek 未返回模型列表');
    return data.data.map(m => typeof m === 'string' ? { id: m, name: m } : { id: m.id, name: m.name || m.id });
  }

  // 4) OpenRouter
  if (provider === 'openrouter') {
    // 强制验证 API Key 的真实归属与有效性，防止将 DeepSeek 等其他服务商 Key 误当 OpenRouter Key 产生虚假成功
    const authRes = await fetchWithTimeout('https://openrouter.ai/api/v1/auth/key', {
      headers: defaultHeaders
    }, 10000);
    if (!authRes.ok) {
      const authErr = await authRes.json().catch(() => ({}));
      const msg = authErr.error?.message || authErr.message || `HTTP ${authRes.status}`;
      throw new Error(`OpenRouter 鉴权失败 (${msg}): 该密钥非有效 OpenRouter Key。若您使用的是 DeepSeek 密钥，请在上方“服务商预设”中选择 DeepSeek`);
    }

    const res = await fetchWithTimeout('https://openrouter.ai/api/v1/models', {
      headers: defaultHeaders
    }, 15000);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || `OpenRouter 请求失败: HTTP ${res.status}`);
    }
    const data = await res.json();
    if (!data.data || !Array.isArray(data.data)) throw new Error('OpenRouter 未返回模型列表');
    return data.data.map(m => ({
      id: m.id,
      name: m.name || m.id
    }));
  }

  // 5) OpenCode
  if (provider === 'opencode') {
    const url = deriveModelsUrl(customEndpoint, 'https://api.opencode.ai/v1/models');
    const res = await fetchWithTimeout(url, { headers: defaultHeaders }, 15000);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || `OpenCode 请求失败: HTTP ${res.status}`);
    }
    const data = await res.json();
    const list = data.data || data.models || [];
    if (!Array.isArray(list)) throw new Error('OpenCode 未返回模型列表');
    return list.map(m => typeof m === 'string' ? { id: m, name: m } : { id: m.id, name: m.name || m.id });
  }

  // 6) OpenAI
  if (provider === 'openai') {
    const url = deriveModelsUrl(customEndpoint, 'https://api.openai.com/v1/models');
    const res = await fetchWithTimeout(url, { headers: { 'Authorization': `Bearer ${apiKey}` } }, 15000);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || `OpenAI 请求失败: HTTP ${res.status}`);
    }
    const data = await res.json();
    if (!data.data || !Array.isArray(data.data)) throw new Error('OpenAI 未返回模型列表');
    const filtered = data.data.filter(m => {
      const lower = m.id.toLowerCase();
      return !lower.includes('embedding') && !lower.includes('whisper') && !lower.includes('tts') && !lower.includes('dall-e');
    });
    return filtered.map(m => ({ id: m.id, name: m.name || m.id }));
  }

  // 7) 硅基流动 SiliconFlow
  if (provider === 'siliconflow') {
    const url = deriveModelsUrl(customEndpoint, 'https://api.siliconflow.cn/v1/models');
    const res = await fetchWithTimeout(url, { headers: { 'Authorization': `Bearer ${apiKey}` } }, 15000);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || `SiliconFlow 请求失败: HTTP ${res.status}`);
    }
    const data = await res.json();
    const list = data.data || data.models || [];
    if (!Array.isArray(list)) throw new Error('SiliconFlow 未返回模型列表');
    return list.map(m => typeof m === 'string' ? { id: m, name: m } : { id: m.id, name: m.name || m.id });
  }

  // 8) Groq
  if (provider === 'groq') {
    const url = deriveModelsUrl(customEndpoint, 'https://api.groq.com/openai/v1/models');
    const res = await fetchWithTimeout(url, { headers: { 'Authorization': `Bearer ${apiKey}` } }, 15000);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || `Groq 请求失败: HTTP ${res.status}`);
    }
    const data = await res.json();
    const list = data.data || data.models || [];
    if (!Array.isArray(list)) throw new Error('Groq 未返回模型列表');
    return list.map(m => typeof m === 'string' ? { id: m, name: m } : { id: m.id, name: m.name || m.id });
  }

  // 9) 通用自定义 OpenAI 兼容接口 / 本地 Ollama
  if (provider === 'custom') {
    const url = deriveModelsUrl(customEndpoint, '');
    if (!url) throw new Error('请先填写接口地址以获取受支持模型');
    const res = await fetchWithTimeout(url, { headers: defaultHeaders }, 15000);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || `自定义端点请求失败: HTTP ${res.status}`);
    }
    const data = await res.json();
    const list = data.data || data.models || (Array.isArray(data) ? data : []);
    if (!Array.isArray(list) || list.length === 0) throw new Error('未在端点检测到有效模型列表');
    return list.map(m => typeof m === 'string' ? { id: m, name: m } : { id: m.id, name: m.name || m.id });
  }

  throw new Error('不支持的服务商: ' + provider);
}

// 4.5 测试模型连接与密钥有效性 (极低 token 消耗: 发送 1 字符测试探针并限制 1 token 输出)
async function testModelConnection({ provider, endpoint, apiKey, modelName }) {
  if (!apiKey && provider !== 'ollama') {
    throw new Error('请先输入 API Key');
  }

  let targetEndpoint = (endpoint && endpoint.trim()) ? endpoint.trim() : '';
  if (!targetEndpoint) {
    if (provider === 'deepseek') targetEndpoint = 'https://api.deepseek.com/chat/completions';
    else if (provider === 'openrouter') targetEndpoint = 'https://openrouter.ai/api/v1/chat/completions';
    else if (provider === 'openai') targetEndpoint = 'https://api.openai.com/v1/chat/completions';
    else if (provider === 'siliconflow') targetEndpoint = 'https://api.siliconflow.cn/v1/chat/completions';
    else if (provider === 'groq') targetEndpoint = 'https://api.groq.com/openai/v1/chat/completions';
    else if (provider === 'opencode') targetEndpoint = 'https://api.opencode.ai/v1/chat/completions';
    else if (provider === 'ollama') targetEndpoint = 'http://localhost:11434/v1/chat/completions';
    else throw new Error('请填写接口地址 (Chat Endpoint)');
  }

  if (!targetEndpoint.startsWith('http://') && !targetEndpoint.startsWith('https://')) {
    targetEndpoint = 'https://' + targetEndpoint;
  }

  // 智能推测探活模型 ID
  let targetModel = (modelName && modelName.trim()) ? modelName.trim() : '';
  if (!targetModel) {
    if (provider === 'deepseek') targetModel = 'deepseek-chat';
    else if (provider === 'openrouter') targetModel = 'google/gemini-2.0-flash-001';
    else if (provider === 'openai') targetModel = 'gpt-4o-mini';
    else if (provider === 'siliconflow') targetModel = 'deepseek-ai/DeepSeek-V3';
    else if (provider === 'groq') targetModel = 'llama-3.3-70b-versatile';
    else if (provider === 'opencode') targetModel = 'claude-3-5-sonnet';
    else if (provider === 'ollama') targetModel = 'llama3';
    else targetModel = 'gpt-3.5-turbo';
  }

  const headers = {
    'Content-Type': 'application/json',
    'HTTP-Referer': 'https://github.com/GeoffLeng/Translation-Tools',
    'X-Title': 'Translate FY'
  };
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey.trim()}`;
  }

  // 极轻量探测包：仅 1 词输入 + 强制限制输出 1 token，将 Token 消耗压缩至理论极限 (<=2 tokens)
  const probePayload = {
    model: targetModel,
    messages: [{ role: 'user', content: 'hi' }],
    max_tokens: 1,
    stream: false
  };

  const startTime = performance.now();
  let res;
  try {
    res = await fetchWithTimeout(targetEndpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(probePayload)
    }, 15000);
  } catch (netErr) {
    throw new Error(`连接失败 (${netErr.message})，请检查网络或代理设置`);
  }

  const durationMs = Math.round(performance.now() - startTime);

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    const rawMsg = errBody.error?.message || errBody.message || '';
    if (res.status === 401) {
      throw new Error(`认证失败 (401 Unauthorized): API Key 无效或未与当前接口地址匹配。${rawMsg ? `[${rawMsg}]` : ''}`);
    } else if (res.status === 404) {
      throw new Error(`接口地址未找到 (404 Not Found): 请确认 Chat Endpoint 是否正确填写（通常需以 /chat/completions 结尾）`);
    } else if (res.status === 429) {
      throw new Error(`请求受限 (429 Too Many Requests): 账户额度不足 (Insufficient Quota) 或调用频次超限。${rawMsg ? `[${rawMsg}]` : ''}`);
    } else if (res.status === 400) {
      throw new Error(`参数异常 (400 Bad Request): ${rawMsg || '所选模型名称不存在或该接口不支持该参数'}`);
    } else {
      throw new Error(`接口响应错误 (HTTP ${res.status}): ${rawMsg || res.statusText}`);
    }
  }

  const data = await res.json();
  if (!data || (!data.choices && !data.id && !data.created)) {
    throw new Error('接口响应格式异常 (未包含标准 Chat Completion 数据结构)');
  }

  return {
    success: true,
    latency: durationMs,
    model: targetModel,
    message: `连接成功 (耗时: ${durationMs}ms, 模型: ${targetModel})`
  };
}

// 5. 监听 runtime 消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'fetchModels') {
    const { provider, apiKey, endpoint } = request;
    fetchProviderModels(provider, apiKey, endpoint)
      .then(models => {
        sendResponse({ success: true, models });
      })
      .catch(err => {
        sendResponse({ success: false, error: err.message });
      });
    return true;
  }

  if (request.action === 'testModelConnection') {
    const { provider, apiKey, endpoint, modelName } = request;
    testModelConnection({ provider, endpoint, apiKey, modelName })
      .then(result => {
        sendResponse(result);
      })
      .catch(err => {
        sendResponse({ success: false, error: err.message });
      });
    return true;
  }

  if (request.action === 'translate') {
    const { text, engine, targetLang, model, context, persona, enableBilingualNotation } = request;
    const activePersona = persona || 'biochem';
    const isBilingual = enableBilingualNotation !== false;

    // 如果选中的是单一学术术语且在专业词库中有确定对应定名，优先直接采用权威审定名 (根据开关决定是否输出双语对照形态)
    if (targetLang === 'zh-CN' && text && text.trim().length <= 50 && !text.includes('\n')) {
      const cleanKey = text.trim();
      const directMatches = matchTerms(cleanKey, 1, activePersona);
      if (directMatches.length > 0 && directMatches[0].term.toLowerCase() === cleanKey.toLowerCase()) {
        const match = directMatches[0];
        let displayTrans;
        if (!isBilingual) {
          // 用户关闭了双语备注：仅输出权威中文审定名，不带英文括号
          displayTrans = match.translation.replace(/\s*\([a-zA-Z0-9\s,\-_/]+\)/g, '').trim();
        } else {
          const abbrPart = match.abbr && !match.term.toLowerCase().includes(match.abbr.toLowerCase()) ? `, ${match.abbr}` : (match.abbr || '');
          displayTrans = (match.translation.includes('(') || match.translation.includes('（'))
            ? match.translation
            : `${match.translation} (${match.term}${abbrPart ? ', ' + abbrPart : ''})`;
        }
        sendResponse({ success: true, translation: healAcademicSymbols(displayTrans, activePersona) });
        return true;
      }
    }

    // 读取 API 配置与偏好模型及用户自定义角色提示词
    chrome.storage.local.get({
      glmApiKey: '',
      glmActiveModel: 'glm-4-flash',
      geminiApiKey: '',
      geminiActiveModel: 'gemini-2.0-flash',
      deepseekApiKey: '',
      deepseekActiveModel: 'deepseek-chat',
      deeplApiKey: '',
      deeplEndpoint: '',
      youdaoAppKey: '',
      youdaoAppSecret: '',
      customModels: [],
      customPersonaPrompts: {}
    }, (settings) => {
      let translationPromise;

      if (engine === 'google') {
        translationPromise = translateGoogle(text, targetLang);
      } else if (engine === 'bing') {
        translationPromise = translateBing(text, targetLang);
      } else if (engine === 'deepl') {
        translationPromise = translateDeepL(text, targetLang, settings.deeplApiKey, settings.deeplEndpoint);
      } else if (engine === 'glm') {
        translationPromise = translateOpenAICompatible(text, targetLang, settings.glmApiKey, 'https://open.bigmodel.cn/api/paas/v4/chat/completions', model || settings.glmActiveModel || 'glm-4-flash', context, activePersona, settings.customPersonaPrompts, isBilingual);
      } else if (engine === 'gemini') {
        translationPromise = translateGemini(text, targetLang, settings.geminiApiKey, model || settings.geminiActiveModel || 'gemini-2.0-flash', context, activePersona, settings.customPersonaPrompts, isBilingual);
      } else if (engine === 'deepseek') {
        translationPromise = translateOpenAICompatible(text, targetLang, settings.deepseekApiKey, 'https://api.deepseek.com/chat/completions', model || settings.deepseekActiveModel || 'deepseek-chat', context, activePersona, settings.customPersonaPrompts, isBilingual);
      } else if (engine === 'youdao') {
        translationPromise = translateYoudao(text, targetLang, settings.youdaoAppKey, settings.youdaoAppSecret);
      } else if (engine && engine.startsWith('custom_')) {
        const customId = engine.substring(7); // "custom_" 长度为 7
        const customModel = settings.customModels.find(m => m.id === customId);
        if (customModel) {
          translationPromise = translateOpenAICompatible(text, targetLang, customModel.apiKey, customModel.endpoint, customModel.modelName, context, activePersona, settings.customPersonaPrompts, isBilingual);
        } else {
          translationPromise = Promise.reject(new Error('未找到该自定义模型的配置信息'));
        }
      } else {
        translationPromise = Promise.reject(new Error('未支持的引擎：' + engine));
      }

      Promise.resolve(translationPromise)
        .then(translation => {
          sendResponse({ success: true, translation: healAcademicSymbols(translation, activePersona) });
        })
        .catch(err => {
          sendResponse({ success: false, error: err.message });
        });
    });

    return true; // 异步支持
  }

  if (request.action === 'translateBatch') {
    const { items, engine, targetLang, model, context, isBioChem, persona } = request;
    const effectivePersona = persona || (isBioChem ? 'biochem' : 'general');
    if (!items || !Array.isArray(items) || items.length === 0) {
      sendResponse({ success: true, translations: [] });
      return false;
    }

    chrome.storage.local.get({
      glmApiKey: '',
      glmActiveModel: 'glm-4-flash',
      geminiApiKey: '',
      geminiActiveModel: 'gemini-2.0-flash',
      deepseekApiKey: '',
      deepseekActiveModel: 'deepseek-chat',
      deeplApiKey: '',
      deeplEndpoint: '',
      youdaoAppKey: '',
      youdaoAppSecret: '',
      customModels: [],
      customPersonaPrompts: {}
    }, (settings) => {
      let batchPromise;

      if (engine === 'google') {
        batchPromise = translateBatchGoogle(items, targetLang);
      } else if (engine === 'deepl') {
        batchPromise = translateBatchDeepL(items, targetLang, settings.deeplApiKey, settings.deeplEndpoint);
      } else if (engine === 'glm') {
        batchPromise = translateBatchOpenAICompatible(items, targetLang, settings.glmApiKey, 'https://open.bigmodel.cn/api/paas/v4/chat/completions', model || settings.glmActiveModel || 'glm-4-flash', context, effectivePersona, settings.customPersonaPrompts);
      } else if (engine === 'gemini') {
        batchPromise = translateBatchGemini(items, targetLang, settings.geminiApiKey, model || settings.geminiActiveModel || 'gemini-2.0-flash', context, effectivePersona, settings.customPersonaPrompts);
      } else if (engine === 'deepseek') {
        batchPromise = translateBatchOpenAICompatible(items, targetLang, settings.deepseekApiKey, 'https://api.deepseek.com/chat/completions', model || settings.deepseekActiveModel || 'deepseek-chat', context, effectivePersona, settings.customPersonaPrompts);
      } else if (engine && engine.startsWith('custom_')) {
        const customId = engine.substring(7);
        const customModel = settings.customModels.find(m => m.id === customId);
        if (customModel) {
          batchPromise = translateBatchOpenAICompatible(items, targetLang, customModel.apiKey, customModel.endpoint, customModel.modelName, context, effectivePersona, settings.customPersonaPrompts);
        } else {
          batchPromise = Promise.reject(new Error('未找到该自定义模型的配置信息'));
        }
      } else {
        batchPromise = translateBatchGeneric(items, engine, targetLang, settings);
      }

      Promise.resolve(batchPromise)
        .then(translations => {
          const healed = Array.isArray(translations)
            ? translations.map(t => ({ id: t.id, text: healAcademicSymbols(t.text, effectivePersona) }))
            : translations;
          sendResponse({ success: true, translations: healed });
        })
        .catch(err => {
          sendResponse({ success: false, error: err.message });
        });
    });

    return true; // 异步支持
  }
});

// 3.8 通用流式请求封装 (支持划词悬浮窗打字机与论文总结)
async function streamOpenAIEndpoint({ apiKey, endpoint, modelName, messages, temperature = 0.2, signal, onChunk }) {
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`,
    'HTTP-Referer': 'https://github.com/GeoffLeng/Translation-Tools',
    'X-Title': 'Translate FY'
  };

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: headers,
    body: JSON.stringify({
      model: modelName,
      messages: messages,
      temperature: temperature,
      stream: true
    }),
    signal: signal
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error?.message || `API 错误: ${res.status}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let fullOutput = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop(); // 保留不完整尾行
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith(':')) continue;
      if (trimmed === 'data: [DONE]') continue;
      if (trimmed.startsWith('data:')) {
        try {
          const json = JSON.parse(trimmed.slice(5).trim());
          const delta = json.choices?.[0]?.delta?.content || '';
          if (delta) {
            fullOutput += delta;
            onChunk(delta);
          }
        } catch (e) {}
      }
    }
  }
  return fullOutput;
}

// 4. 长连接流式通信总线 (Streaming Port Listener)
chrome.runtime.onConnect.addListener((port) => {
  // 划词浮窗长连接逐字打字机
  if (port.name === 'translate-stream') {
    let abortController = new AbortController();

    port.onDisconnect.addListener(() => {
      abortController.abort();
    });

    port.onMessage.addListener((request) => {
      const { text, engine, targetLang, model, context, persona, enableBilingualNotation } = request;
      const activePersona = persona || 'biochem';
      const isBilingual = enableBilingualNotation !== false;

      port.postMessage({ type: 'start' });

      chrome.storage.local.get({
        glmApiKey: '',
        glmActiveModel: 'glm-4-flash',
        deepseekApiKey: '',
        deepseekActiveModel: 'deepseek-chat',
        deeplApiKey: '',
        deeplEndpoint: '',
        youdaoAppKey: '',
        youdaoAppSecret: '',
        customModels: [],
        customPersonaPrompts: {}
      }, async (settings) => {
        try {
          let fullResult = '';
          const isAIStream = (engine === 'glm' || engine === 'deepseek' || (engine && engine.startsWith('custom_')));

          if (isAIStream) {
            let apiKey = '';
            let endpoint = '';
            let modelName = '';

            if (engine === 'glm') {
              apiKey = settings.glmApiKey;
              endpoint = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';
              modelName = model || settings.glmActiveModel || 'glm-4-flash';
            } else if (engine === 'deepseek') {
              apiKey = settings.deepseekApiKey;
              endpoint = 'https://api.deepseek.com/chat/completions';
              modelName = model || settings.deepseekActiveModel || 'deepseek-chat';
            } else if (engine.startsWith('custom_')) {
              const customId = engine.substring(7);
              const customModel = settings.customModels.find(m => m.id === customId);
              if (customModel) {
                apiKey = customModel.apiKey;
                endpoint = customModel.endpoint;
                modelName = customModel.modelName;
              }
            }

            if (!apiKey) throw new Error('该 AI 引擎尚未配置 API Key，请在设置中配置');
            if (!endpoint) throw new Error('接口地址未配置');

            const langName = getTargetLangFullName(targetLang, true);
            const { maskedText, tokenMap } = maskNumericEntities(text);
            const fullScanText = (text || '') + (context ? ' ' + context : '');
            const matchedTerms = matchTerms(fullScanText, 10, activePersona);

            const termRule = isBilingual
              ? `2. 核心专名双语对照（划词专属）：核心专有名词输出为【中文定名 (英文原文/缩写)】（如“野生型 (wild-type, WT)”），便于查词与溯源。`
              : `2. 规范学术定名：专有名词直接使用规范中文定名，严禁附加英文括号或备注。`;

            let sysPrompt = `你是一名国际顶级学术期刊的资深学术评审专家兼母语级科学翻译家。请将待翻译文本严格翻译为指定目标语言【${langName}】。
规则约束：
0. 目标语言强制：100% 严格使用【${langName}】，严禁输出其他语种。
1. 符号与数值保真：5'、3'、λ、ΔG°、ΔTm、数字、SI 单位与 __NUM_0__ 占位符必须原样保留，严禁汉化、篡改或丢失。
${termRule}
3. 排版结构一致：遇到多行标题保持换行；直接输出翻译结果，严禁包含任何前导解释、注脚或说明。`;

            if (isChineseLang(targetLang) && matchedTerms && matchedTerms.length > 0) {
              sysPrompt += isBilingual
                ? `\n\n【核心学科专有名词强制对齐表 (划词双语对照)】:`
                : `\n\n【核心学科专有名词强制对齐表 (纯中文规范定名)】:`;
              matchedTerms.forEach(t => {
                sysPrompt += '\n' + formatMatchedTermRule(t, isBilingual);
              });
            }

            const messages = [
              { role: 'system', content: sysPrompt },
              { role: 'user', content: `将以下文本精准翻译为【${langName}】：\n\n${maskedText}` }
            ];

            const rawOutput = await streamOpenAIEndpoint({
              apiKey,
              endpoint,
              modelName,
              messages,
              signal: abortController.signal,
              onChunk: (delta) => {
                port.postMessage({ type: 'chunk', delta });
              }
            });

            fullResult = healAcademicSymbols(unmaskNumericEntities(rawOutput, tokenMap), activePersona);
          } else {
            // 传统免 Key 引擎 (Google / Bing / DeepL / Youdao)
            if (engine === 'google') {
              fullResult = await translateGoogle(text, targetLang);
            } else if (engine === 'bing') {
              fullResult = await translateBing(text, targetLang);
            } else if (engine === 'deepl') {
              fullResult = await translateDeepL(text, targetLang, settings.deeplApiKey, settings.deeplEndpoint);
            } else if (engine === 'youdao') {
              fullResult = await translateYoudao(text, targetLang, settings.youdaoAppKey, settings.youdaoAppSecret);
            } else {
              fullResult = await translateGoogle(text, targetLang);
            }
          }

          port.postMessage({ type: 'done', fullText: healAcademicSymbols(fullResult, activePersona) });
        } catch (err) {
          if (err.name !== 'AbortError') {
            port.postMessage({ type: 'error', error: err.message });
          }
        }
      });
    });
  }

  // 论文一键骨干学术总结长连接通道
  if (port.name === 'paper-summary-stream') {
    let abortController = new AbortController();

    port.onDisconnect.addListener(() => {
      abortController.abort();
    });

    port.onMessage.addListener((request) => {
      const { backbone, engine, targetLang, model } = request;

      port.postMessage({ type: 'start' });

      chrome.storage.local.get({
        glmApiKey: '',
        glmActiveModel: 'glm-4-flash',
        deepseekApiKey: '',
        deepseekActiveModel: 'deepseek-chat',
        customModels: []
      }, async (settings) => {
        try {
          let apiKey = settings.glmApiKey || settings.deepseekApiKey;
          let endpoint = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';
          let modelName = model || settings.glmActiveModel || 'glm-4-flash';

          if (engine === 'deepseek') {
            apiKey = settings.deepseekApiKey;
            endpoint = 'https://api.deepseek.com/chat/completions';
            modelName = model || settings.deepseekActiveModel || 'deepseek-chat';
          } else if (engine && engine.startsWith('custom_')) {
            const customId = engine.substring(7);
            const customModel = settings.customModels.find(m => m.id === customId);
            if (customModel) {
              apiKey = customModel.apiKey;
              endpoint = customModel.endpoint;
              modelName = customModel.modelName;
            }
          } else if (settings.glmApiKey) {
            apiKey = settings.glmApiKey;
            endpoint = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';
            modelName = model || settings.glmActiveModel || 'glm-4-flash';
          }

          if (!apiKey) {
            throw new Error('学术论文总结需要 AI 大模型支持，请在设置中配置 智谱 GLM 或 DeepSeek API Key (智谱 GLM-4-Flash 永久免费)');
          }

          const summaryPrompt = `你是一名国际顶级学术期刊 (如 Nature, Science, Cell, IEEE, ACM) 的资深学术主编兼同行评审专家。
请根据以下从论文中精准抽取的骨干信息（包含标题/摘要、主要章节大纲、以及结论部分），为学术研究者撰写一份高信息密度、逻辑结构严密的【论文核心框架与学术大纲总结】。

必须严格输出为中文，并严格按照以下 4 个结构化板块组织排版，使用精美清晰的 Markdown 格式：

### 💡 1. 研究背景与核心痛点 (Background & Problem)
- 本文针对什么现实痛点或科学瓶颈展开研究？现有已有方法存在什么缺陷？

### 🔥 2. 核心创新与贡献 (Key Contributions)
- 作者提出了什么新机制、新理论或新模型？
- 本文最核心的 1~3 个独创性突破点是什么？

### 🛠️ 3. 方法与技术路线 (Methodology & Architecture)
- 核心算法/模型架构的关键模块与运行机制是什么？
- 结合以下章节大纲简述其论证框架：
${backbone.headings || '（未显式分节）'}

### 📊 4. 实验结论与研究局限 (Findings & Limitations)
- 关键实验取得了什么代表性指标或定性结论？
- 作者在结论或讨论中指出了该研究的哪些不足与未来展望 (Future Work)？

【论文骨干抽取样本】:
前言与摘要部分:
${backbone.headSample || ''}

结论与讨论部分:
${backbone.tailSample || ''}
`;

          const messages = [
            { role: 'system', content: '你是一名专业的顶级学术主编，精通文献精读、要点提炼与框架化输出。' },
            { role: 'user', content: summaryPrompt }
          ];

          const fullResult = await streamOpenAIEndpoint({
            apiKey,
            endpoint,
            modelName,
            messages,
            temperature: 0.3,
            signal: abortController.signal,
            onChunk: (delta) => {
              port.postMessage({ type: 'chunk', delta });
            }
          });

          port.postMessage({ type: 'done', fullText: fullResult });
        } catch (err) {
          if (err.name !== 'AbortError') {
            port.postMessage({ type: 'error', error: err.message });
          }
        }
      });
    });
  }
});



