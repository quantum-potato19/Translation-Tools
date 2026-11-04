// 纯前端与浏览器扩展内置权威术语匹配引擎 (Client-side In-Extension Term Matcher)
import biochemJson from './data/biochem_terms.json';
import economicsJson from './data/economics_terms.json';

const personaTermsCache = {
  biochem: biochemJson.terms || {},
  economics: economicsJson.terms || {},
  general: {}
};

function getStem(term) {
  if (/[bcdfghjklmnpqrstvwxyz]y$/i.test(term)) {
    return term.slice(0, -1).toLowerCase();
  }
  return term.toLowerCase();
}

// 预热按词长由长到短排序，优先贪婪命中多词复合专有名词
const personaKeysCache = {
  biochem: Object.keys(personaTermsCache.biochem)
    .sort((a, b) => b.length - a.length)
    .map(k => ({ term: k, stem: getStem(k) })),
  economics: Object.keys(personaTermsCache.economics)
    .sort((a, b) => b.length - a.length)
    .map(k => ({ term: k, stem: getStem(k) })),
  general: []
};

// 用户自定义词库 (由 background 或 options 动态注入)
let userGlossaryList = [];

/**
 * 注入用户自定义术语列表
 * @param {Array<{ term: string, zh: string, note?: string, abbr?: string, persona?: string }>} list
 */
export function setUserGlossary(list) {
  if (Array.isArray(list)) {
    userGlossaryList = list
      .filter(item => item && item.term && (item.zh || item.translation))
      .map(item => ({
        term: item.term.trim(),
        stem: getStem(item.term.trim()),
        zh: (item.zh || item.translation || '').trim(),
        note: (item.note || '').trim(),
        abbr: (item.abbr || '').trim(),
        category: (item.category || '用户自定义').trim(),
        persona: item.persona || 'all'
      }))
      .sort((a, b) => b.term.length - a.term.length);
  } else {
    userGlossaryList = [];
  }
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

/**
 * 扫描输入文本，提取权威术语清单 (优先用户术语，非贪婪去重)
 * @param {string} text 待翻译文本
 * @param {number} maxHits 最多返回匹配项数
 * @param {'general' | 'biochem' | 'economics'} persona 翻译角色
 * @returns {Array<{ term: string, translation: string, note?: string, category: string, abbr: string, source: 'user'|'builtin' }>} 命中清单
 */
export function matchTerms(text, maxHits = 15, persona = 'general') {
  if (!text || typeof text !== 'string') return [];

  const lowerText = text.toLowerCase();
  const matched = [];
  const matchedSpans = []; // [[start, end]] 用于区间覆盖去重
  const seenZhs = new Set();

  // 1. 优先检索用户自定义术语 (匹配指定 persona 或 'all')
  for (const uItem of userGlossaryList) {
    if (matched.length >= maxHits) break;
    if (uItem.persona && uItem.persona !== 'all' && uItem.persona !== persona) continue;

    if (lowerText.includes(uItem.stem)) {
      const re = compileTermRegex(uItem.term);
      let hit;
      while ((hit = re.exec(text)) !== null) {
        const start = hit.index;
        const end = start + hit[0].length;
        const overlaps = matchedSpans.some(([s, e]) => Math.max(s, start) < Math.min(e, end));
        if (!overlaps && !seenZhs.has(uItem.zh)) {
          matchedSpans.push([start, end]);
          seenZhs.add(uItem.zh);
          matched.push({
            term: uItem.term,
            translation: uItem.zh,
            note: uItem.note || '',
            category: uItem.category || '用户自定义',
            abbr: uItem.abbr || '',
            source: 'user'
          });
          break;
        }
      }
    }
  }

  // 2. 检索内置专业词库 (仅限非 general 专家角色)
  if (persona !== 'general') {
    const termsMap = personaTermsCache[persona] || {};
    const sortedKeyItems = personaKeysCache[persona] || [];

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
            const val = termsMap[term];
            const zh = typeof val === 'object' ? (val.zh || val.translation) : val;
            const en = typeof val === 'object' ? (val.en || term) : term;
            const category = typeof val === 'object' ? (val.category || '') : '';
            const abbr = typeof val === 'object' ? (val.abbr || '') : '';
            const note = typeof val === 'object' ? (val.note || '') : '';

            if (zh && !seenZhs.has(zh)) {
              matchedSpans.push([start, end]);
              seenZhs.add(zh);
              matched.push({
                term: en,
                translation: zh,
                note,
                category,
                abbr,
                source: 'builtin'
              });
              break;
            }
          }
        }
      }
    }
  }

  return matched;
}

export function getTermsCount() {
  return {
    biochem: personaKeysCache.biochem.length,
    economics: personaKeysCache.economics.length,
    user: userGlossaryList.length
  };
}
