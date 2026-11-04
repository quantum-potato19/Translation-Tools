// 高性能多学科专业术语多模式匹配引擎 (Multi-Persona Term Matcher)
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 多学科词库分角色缓存
const personaTermsCache = {
  biochem: null,
  economics: null,
  general: {}
};

const personaKeysCache = {
  biochem: null,
  economics: null,
  general: []
};

function getStem(term) {
  if (/[bcdfghjklmnpqrstvwxyz]y$/i.test(term)) {
    return term.slice(0, -1).toLowerCase();
  }
  return term.toLowerCase();
}

function compileTermRegex(term) {
  const trimmed = term.trim();
  const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = trimmed.match(/^([\s\S]*?)([a-zA-Z]+)$/);
  let pattern;
  if (m) {
    const prefix = m[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const word = m[2];
    let wordPat;
    if (/[bcdfghjklmnpqrstvwxyz]y$/i.test(word)) {
      const stem = word.slice(0, -1).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      wordPat = `${stem}(?:y|ies)`;
    } else if (/(?:s|x|z|ch|sh)$/i.test(word)) {
      wordPat = `${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:es)?`;
    } else {
      wordPat = `${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:s)?`;
    }
    pattern = prefix + wordPat;
  } else {
    pattern = escaped;
  }
  return new RegExp(`(?<![A-Za-z0-9])${pattern}(?![A-Za-z0-9])`, 'gi');
}

function normalizeTermEntry(k, val) {
  if (typeof val === 'string') {
    let zh = val.trim();
    let note = '';
    let abbr = '';
    const m = zh.match(/^([\u4e00-\u9fa5\w\s-]+?)\s*[（(]([A-Za-z0-9\s/+-]+)[）)]$/);
    if (m) {
      zh = m[1].trim();
      const paren = m[2].trim();
      if (/^[A-Z0-9/-]{2,8}$/.test(paren)) {
        abbr = paren;
      } else {
        note = paren;
      }
    }
    return { en: k, zh, note, abbr, category: '自定义/通用' };
  }
  if (typeof val === 'object' && val !== null) {
    return {
      en: val.en || k,
      zh: val.zh || val.translation || '',
      note: val.note || '',
      abbr: val.abbr || '',
      category: val.category || '',
      otherLangs: val.otherLangs || {}
    };
  }
  return { en: k, zh: String(val || ''), note: '', abbr: '', category: '' };
}

/**
 * 根据指定角色加载并合并权威术语库与用户自定义词库
 * @param {'general' | 'biochem' | 'economics'} persona 学术角色类型
 */
export function loadAllTerms(persona = 'biochem') {
  if (persona === 'general') {
    return {};
  }

  if (personaTermsCache[persona]) {
    return personaTermsCache[persona];
  }

  const dataDir = path.join(__dirname, '..', 'data');
  const fileNameMap = {
    biochem: 'biochem_terms.json',
    economics: 'economics_terms.json'
  };

  const targetFile = path.join(dataDir, fileNameMap[persona] || 'biochem_terms.json');
  const userPath = path.join(dataDir, 'user_glossary.json');

  let domainTerms = {};
  let userTerms = {};

  try {
    if (fs.existsSync(targetFile)) {
      const content = fs.readFileSync(targetFile, 'utf-8');
      const raw = JSON.parse(content).terms || {};
      for (const [k, v] of Object.entries(raw)) {
        domainTerms[k] = normalizeTermEntry(k, v);
      }
    }
  } catch (e) {
    console.warn(`读取 ${fileNameMap[persona]} 异常:`, e.message);
  }

  try {
    if (fs.existsSync(userPath)) {
      const content = fs.readFileSync(userPath, 'utf-8');
      const raw = JSON.parse(content).terms || {};
      for (const [k, v] of Object.entries(raw)) {
        userTerms[k] = { ...normalizeTermEntry(k, v), source: 'user' };
      }
    }
  } catch (e) {
    console.warn('读取 user_glossary.json 异常:', e.message);
  }

  // 用户自定义词库覆盖通用词典
  const merged = { ...domainTerms, ...userTerms };
  personaTermsCache[persona] = merged;

  // 关键优化：按词长从长到短排序，且记录 stem
  personaKeysCache[persona] = Object.keys(merged)
    .sort((a, b) => b.length - a.length)
    .map(k => ({ term: k, stem: getStem(k) }));

  return merged;
}

/**
 * 扫描输入文本，提取对应学术角色的权威术语清单 (毫秒级极速多模式匹配，支持词尾变体与跨区间覆盖去重)
 * @param {string} text 待翻译原英文或段落
 * @param {number} maxHits 最多返回的匹配项
 * @param {'general' | 'biochem' | 'economics'} persona 翻译角色
 * @returns {Array<{ term: string, translation: string, note?: string, category: string, abbr: string, otherLangs: object, source: string }>} 命中的术语清单
 */
export function matchTerms(text, maxHits = 15, persona = 'biochem') {
  if (!text || typeof text !== 'string') return [];
  if (persona === 'general') return [];

  const termsMap = loadAllTerms(persona);
  const sortedKeyItems = personaKeysCache[persona];
  if (!sortedKeyItems || sortedKeyItems.length === 0) return [];

  const lowerText = text.toLowerCase();
  const matched = [];
  const matchedSpans = [];
  const seenZhs = new Set();

  for (const { term, stem } of sortedKeyItems) {
    if (matched.length >= maxHits) break;

    if (lowerText.includes(stem)) {
      const re = compileTermRegex(term);
      let hit;
      while ((hit = re.exec(text)) !== null) {
        const start = hit.index;
        const end = start + hit[0].length;
        const overlaps = matchedSpans.some(([s, e]) => Math.max(s, start) < Math.min(e, end));
        if (!overlaps) {
          const entry = termsMap[term];
          if (entry && entry.zh && !seenZhs.has(entry.zh)) {
            matchedSpans.push([start, end]);
            seenZhs.add(entry.zh);
            matched.push({
              term: entry.en || term,
              translation: entry.zh,
              note: entry.note || '',
              category: entry.category || '',
              abbr: entry.abbr || '',
              otherLangs: entry.otherLangs || {},
              source: entry.source || 'builtin'
            });
            break;
          }
        }
      }
    }
  }

  return matched;
}

/**
 * 添加新的自定义词条并热保存
 */
export function addCustomTerm(englishTerm, chineseTranslation, category = '用户自定义/学术前沿', note = '', abbr = '') {
  if (!englishTerm || !chineseTranslation) return false;
  const userPath = path.join(__dirname, '..', 'data', 'user_glossary.json');

  let currentData = { description: '用户自定义科研术语', version: '2.0.0', terms: {} };
  try {
    if (fs.existsSync(userPath)) {
      currentData = JSON.parse(fs.readFileSync(userPath, 'utf-8'));
    }
  } catch (e) {}

  currentData.terms = currentData.terms || {};
  const normKey = englishTerm.toLowerCase().trim();
  currentData.terms[normKey] = {
    en: englishTerm.trim(),
    zh: chineseTranslation.trim(),
    category: category.trim(),
    note: (note || '').trim(),
    abbr: (abbr || '').trim(),
    otherLangs: {}
  };

  fs.writeFileSync(userPath, JSON.stringify(currentData, null, 2), 'utf-8');

  // 清空缓存以便下次重新热加载
  personaTermsCache.biochem = null;
  personaTermsCache.economics = null;
  loadAllTerms('biochem');
  loadAllTerms('economics');
  return true;
}
