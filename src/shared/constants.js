// Translate FY 五端共享常量与工具 (background / content / popup / options / pdf_viewer / server 同构复用)
// 约束：本文件禁止依赖 DOM、chrome.* 或 Node 内置模块，确保可被 Vite IIFE 打包与 Node ESM 直接 import。

// 本地可选增强服务端口 (server.js 默认端口，必须与 pdf_viewer 请求端口一致)
export const LOCAL_SERVER_PORT = 3300;
export const LOCAL_SERVER_ORIGIN = `http://localhost:${LOCAL_SERVER_PORT}`;

// 统一语言字典：code -> { label (界面短名), promptName (提示词全称), tts (SpeechSynthesis BCP-47) }
export const LANGUAGES = [
  { code: 'zh-CN', label: '简体中文', promptName: '中文(简体)', tts: 'zh-CN' },
  { code: 'zh-TW', label: '繁體中文', promptName: '中文(繁体)', tts: 'zh-TW' },
  { code: 'en', label: 'English', promptName: '英语 (English)', tts: 'en-US' },
  { code: 'ja', label: '日本語', promptName: '日语 (Japanese)', tts: 'ja-JP' },
  { code: 'ko', label: '한국어', promptName: '韩语 (Korean)', tts: 'ko-KR' },
  { code: 'fr', label: 'Français', promptName: '法语 (French)', tts: 'fr-FR' },
  { code: 'de', label: 'Deutsch', promptName: '德语 (German)', tts: 'de-DE' },
  { code: 'es', label: 'Español', promptName: '西班牙语 (Spanish)', tts: 'es-ES' },
  { code: 'ru', label: 'Русский', promptName: '俄语 (Russian)', tts: 'ru-RU' },
  { code: 'it', label: 'Italiano', promptName: '意大利语 (Italian)', tts: 'it-IT' },
  { code: 'pt', label: 'Português', promptName: '葡萄牙语 (Portuguese)', tts: 'pt-PT' },
  { code: 'ar', label: 'العربية', promptName: '阿拉伯语 (Arabic)', tts: 'ar-SA' },
  { code: 'vi', label: 'Tiếng Việt', promptName: '越南语 (Vietnamese)', tts: 'vi-VN' },
  { code: 'th', label: 'ไทย', promptName: '泰语 (Thai)', tts: 'th-TH' },
  { code: 'nl', label: 'Nederlands', promptName: '荷兰语 (Dutch)', tts: 'nl-NL' },
  { code: 'pl', label: 'Polski', promptName: '波兰语 (Polish)', tts: 'pl-PL' }
];

export const LANGUAGE_MAP = Object.fromEntries(LANGUAGES.map(l => [l.code, l]));

export function getLangPromptName(code) {
  if (!code || code === 'auto') return '';
  return (LANGUAGE_MAP[code] && LANGUAGE_MAP[code].promptName) || code;
}

export function isChineseLangCode(code) {
  return !code || code === 'zh' || code === 'zh-CN' || code === 'zh-TW';
}

// 依据文本字符集推断朗读语种 (用于源文朗读；fallbackLang 为用户指定的语种)
export function detectTtsLang(text, fallbackLang) {
  const s = String(text || '');
  if (fallbackLang && fallbackLang !== 'auto' && LANGUAGE_MAP[fallbackLang]) return LANGUAGE_MAP[fallbackLang].tts;
  if (/[\u3040-\u30ff]/.test(s)) return 'ja-JP';
  if (/[\uac00-\ud7af]/.test(s)) return 'ko-KR';
  if (/[\u4e00-\u9fa5]/.test(s)) return 'zh-CN';
  if (/[\u0400-\u04ff]/.test(s)) return 'ru-RU';
  if (/[\u0600-\u06ff]/.test(s)) return 'ar-SA';
  if (/[\u0e00-\u0e7f]/.test(s)) return 'th-TH';
  if (/[ăâđêôơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/i.test(s)) return 'vi-VN';
  if (/[äöüß]/i.test(s)) return 'de-DE';
  if (/[àâçéèêëîïôûùüÿœæ]/i.test(s)) return 'fr-FR';
  if (/[ñ¿¡áíóú]/i.test(s)) return 'es-ES';
  return 'en-US';
}

// 学术领域角色 (默认 general，避免非学术网页被生化词库误译)
export const PERSONAS = [
  { id: 'general', label: '通用日常' },
  { id: 'biochem', label: '生化医药' },
  { id: 'economics', label: '经济金融' }
];
export const DEFAULT_PERSONA = 'general';

// 内置 AI 模型默认清单
export const AI_MODELS = {
  glm: ['glm-4-flash', 'glm-4.5-flash', 'glm-4.7-flash', 'glm-4-flashx'],
  gemini: ['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-pro'],
  deepseek: ['deepseek-chat', 'deepseek-reasoner']
};

// 统一引擎注册表
// type: free(免 Key) | key(需 Key 的传统 MT) | ai(大模型)
// requires: 引擎可用所需的 chrome.storage.local 键 (全部非空才视为已配置)
// activeModelKey / enabledModelsKey: 当前模型 / 用户启用模型列表的存储键
export const ENGINES = [
  { id: 'google', label: 'Google', type: 'free', requires: [] },
  { id: 'bing', label: 'Bing', type: 'free', requires: [] },
  { id: 'deepl', label: 'DeepL', type: 'key', requires: ['deeplApiKey'] },
  { id: 'youdao', label: '有道', type: 'key', requires: ['youdaoAppKey', 'youdaoAppSecret'] },
  { id: 'glm', label: '智谱 GLM', type: 'ai', requires: ['glmApiKey'], activeModelKey: 'glmActiveModel', enabledModelsKey: 'glmModels' },
  { id: 'gemini', label: 'Google Gemini', type: 'ai', requires: ['geminiApiKey'], activeModelKey: 'geminiActiveModel', enabledModelsKey: 'geminiModels' },
  { id: 'deepseek', label: 'DeepSeek', type: 'ai', requires: ['deepseekApiKey'], activeModelKey: 'deepseekActiveModel', enabledModelsKey: 'deepseekModels' }
];
export const ENGINE_MAP = Object.fromEntries(ENGINES.map(e => [e.id, e]));

// 所有引擎相关存储键及默认值 (各端 chrome.storage.local.get 统一使用，杜绝漏读)
export const ENGINE_STORAGE_DEFAULTS = {
  glmApiKey: '',
  glmActiveModel: 'glm-4-flash',
  glmModels: [],
  geminiApiKey: '',
  geminiActiveModel: 'gemini-2.0-flash',
  geminiModels: [],
  deepseekApiKey: '',
  deepseekActiveModel: 'deepseek-chat',
  deepseekModels: [],
  deeplApiKey: '',
  deeplEndpoint: '',
  youdaoAppKey: '',
  youdaoAppSecret: '',
  customModels: [],
  customPersonaPrompts: {}
};

export function isAIEngineId(engine) {
  if (!engine) return false;
  return (ENGINE_MAP[engine] && ENGINE_MAP[engine].type === 'ai') || engine.startsWith('custom_');
}

// 判断引擎是否已完成必要配置 (free 永远可用；custom_* 由 customModels 判定)
export function isEngineConfigured(engineId, settings) {
  if (!engineId) return false;
  if (engineId.startsWith('custom_')) {
    const id = engineId.substring(7);
    return Array.isArray(settings && settings.customModels) && settings.customModels.some(m => m.id === id);
  }
  const def = ENGINE_MAP[engineId];
  if (!def) return false;
  return def.requires.every(k => settings && String(settings[k] || '').trim());
}

// 用户自定义术语表存储键与数据结构：[{ term, zh, note?, persona?: 'all'|'general'|'biochem'|'economics' }]
export const USER_GLOSSARY_KEY = 'userGlossary';

// 兼容别名导出
export const SUPPORTED_LANGUAGES = LANGUAGES;
export const DEFAULT_TRANSLATE_ENGINES = ENGINES;
export const TRANSLATION_PERSONAS = PERSONAS;

// HTML 转义 (所有 innerHTML 拼接动态数据必须经过)
export function escapeHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
