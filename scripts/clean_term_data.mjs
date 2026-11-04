// 术语库数据契约清洗脚本 (幂等)
// 将 zh 字段末尾以空白分隔的括号释义 (支持嵌套括号) 剥离到 note / abbr 字段，保证 zh 为纯净标准译名。
// 用法: node scripts/clean_term_data.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const TARGETS = [
  'src/data/biochem_terms.json',
  'src/data/economics_terms.json',
  'server/data/biochem_terms.json',
  'server/data/economics_terms.json'
];

const OPEN = { ')': '(', '）': '（' };

// 从字符串末尾剥离一个平衡括号组；返回 { head, group } 或 null
function popTrailingGroup(str) {
  const s = str.trimEnd();
  const last = s[s.length - 1];
  if (last !== ')' && last !== '）') return null;
  let depth = 0;
  for (let i = s.length - 1; i >= 0; i--) {
    const c = s[i];
    if (c === ')' || c === '）') depth++;
    else if (c === '(' || c === '（') {
      depth--;
      if (depth === 0) {
        const before = s.slice(0, i);
        // 仅剥离以空白分隔的半角括号，或任意全角括号；紧贴的半角括号视为化学命名本体 (如 钯(0))
        const isSeparated = c === '（' || /\s$/.test(before);
        if (!isSeparated || !before.trim()) return null;
        return { head: before.trimEnd(), group: s.slice(i + 1, s.length - 1).trim() };
      }
    }
  }
  return null;
}

export function splitTermTranslation(zh) {
  let head = String(zh || '').trim();
  const groups = [];
  let popped;
  while ((popped = popTrailingGroup(head))) {
    groups.unshift(popped.group);
    head = popped.head;
  }
  return { zh: head || String(zh || '').trim(), groups };
}

let totalChanged = 0;
for (const rel of TARGETS) {
  const file = path.join(ROOT, rel);
  if (!fs.existsSync(file)) continue;
  const json = JSON.parse(fs.readFileSync(file, 'utf-8'));
  const terms = json.terms || {};
  let changed = 0;
  for (const [key, val] of Object.entries(terms)) {
    if (!val || typeof val !== 'object' || typeof val.zh !== 'string') continue;
    const { zh, groups } = splitTermTranslation(val.zh);
    if (groups.length === 0) continue;
    const notes = [];
    for (const g of groups) {
      if (!val.abbr && /^[A-Za-z0-9][A-Za-z0-9\-+/]{0,11}$/.test(g)) {
        val.abbr = g;
      } else if (g) {
        notes.push(g);
      }
    }
    val.zh = zh;
    const existing = val.note ? [val.note] : [];
    const merged = [...existing, ...notes.filter(n => !existing.includes(n))];
    if (merged.length) val.note = merged.join('；');
    changed++;
  }
  json.schemaNote = 'zh 为纯净标准译名 (不含括号释义)；note 为词典释义/全称；abbr 为缩写';
  fs.writeFileSync(file, JSON.stringify(json, null, 2) + '\n', 'utf-8');
  console.log(`${rel}: cleaned ${changed} entries`);
  totalChanged += changed;
}
console.log(`done, total cleaned: ${totalChanged}`);
