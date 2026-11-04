// server.js - 本地独立 Web 与 PDF 翻译后端服务 (零外部依赖，极速纯 Node.js 实现)
import http from 'http';
import fs from 'fs';
import path from 'path';
import url from 'url';
import https from 'https';
import { fileURLToPath } from 'url';
import { handleBioTranslate } from './server/routes/translate_bio.js';
import { loadAllTerms, addCustomTerm } from './server/engine/term_matcher.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT ? parseInt(process.env.PORT.trim(), 10) : 3300;
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.pdf': 'application/pdf',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff'
};

// 极简 Google 免费翻译通道
async function translateWithGoogle(text, targetLang = 'zh-CN', sourceLang = 'auto') {
  const encText = encodeURIComponent(text);
  const sl = sourceLang && sourceLang !== 'auto' ? sourceLang : 'auto';
  const reqUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sl}&tl=${targetLang}&dt=t&q=${encText}`;
  return new Promise((resolve, reject) => {
    https.get(reqUrl, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (Array.isArray(parsed) && Array.isArray(parsed[0])) {
            const translated = parsed[0].map(item => item[0]).filter(Boolean).join('');
            resolve(translated);
          } else {
            resolve(text);
          }
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  // 允许跨域
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;

  // 1.0 API: 单句/划词翻译接口 (支持术语库直出与权威定名对齐)
  if (pathname === '/api/translate' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body);
        const { text, targetLang = 'zh-CN', sourceLang = 'auto', persona = 'biochem' } = payload;
        if (!text || typeof text !== 'string') {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'text 不能为空' }));
          return;
        }

        // 优先精准命中权威学科术语库
        if (targetLang === 'zh-CN' && text.trim().length <= 50 && !text.includes('\n')) {
          const terms = loadAllTerms(persona);
          const cleanKey = text.trim().toLowerCase();
          if (terms[cleanKey]) {
            const val = terms[cleanKey];
            const zh = typeof val === 'object' ? (val.zh || val.translation) : val;
            if (zh) {
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({
                success: true,
                translation: zh,
                note: typeof val === 'object' ? (val.note || '') : '',
                abbr: typeof val === 'object' ? (val.abbr || '') : ''
              }));
              return;
            }
          }
        }

        const trans = await translateWithGoogle(text, targetLang, sourceLang);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, translation: trans }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // 1. API: 批量翻译代理接口
  if (pathname === '/api/translate-batch' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body);
        const { items, targetLang = 'zh-CN', sourceLang = 'auto' } = payload;
        if (!Array.isArray(items)) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'items 必须为数组' }));
          return;
        }

        const translations = [];
        // 并发批处理
        const batchPromises = items.map(async (item) => {
          try {
            const trans = await translateWithGoogle(item.text, targetLang, sourceLang);
            return { id: item.id, text: trans };
          } catch (e) {
            return { id: item.id, text: item.text };
          }
        });

        const results = await Promise.all(batchPromises);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, translations: results }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // 1.5 API: 生化前沿学术文献高精度翻译专用接口 (含实体保护 + 权威术语注入 + 滑动窗口)
  if (pathname === '/api/translate/bio' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body);
        const result = await handleBioTranslate(payload);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // 1.6 API: 获取本地权威术语库与用户词库列表 (支持 ?persona=biochem | economics | general)
  if (pathname === '/api/terms' && req.method === 'GET') {
    try {
      const persona = parsedUrl.query?.persona || 'biochem';
      const terms = loadAllTerms(persona);
      const termKeys = Object.keys(terms);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({
        success: true,
        persona: persona,
        totalCount: termKeys.length,
        disciplinesCount: persona === 'biochem' ? 13 : (persona === 'economics' ? 4 : 0),
        termsSample: termKeys.slice(0, 50).map(k => {
          const val = terms[k];
          return typeof val === 'object'
            ? { term: k, en: val.en || k, zh: val.zh, abbr: val.abbr, category: val.category, otherLangs: val.otherLangs }
            : { term: k, en: k, zh: val };
        })
      }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // 1.7 API: 获取系统支持的所有翻译专家角色及语料库概要
  if (pathname === '/api/personas' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({
      success: true,
      personas: [
        { id: 'general', name: '默认通用翻译', desc: '符合大众日常阅读习惯，无专业语料束缚，极速流畅自然', termCount: 0 },
        { id: 'biochem', name: '生化学术专家', desc: '收录3100+权威生化术语库，严格执行中国化学会规范与CAS/酶切保护', termCount: 3105 },
        { id: 'economics', name: '经济学专家', desc: '涵盖宏微观、金融工程、量化投资与计量经济学权威术语及顶刊规范', termCount: 97 }
      ]
    }));
    return;
  }

  // 1.8 API: 向本地词库新增用户自定义学术词条
  if (pathname === '/api/terms/add' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { englishTerm, chineseTranslation, category, note, abbr } = JSON.parse(body);
        const ok = addCustomTerm(englishTerm, chineseTranslation, category, note, abbr);
        if (ok) {
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ success: true, message: `已成功保存词条: ${englishTerm} -> ${chineseTranslation}` }));
        } else {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ success: false, error: '词条内容不能为空' }));
        }
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // 2. API: PDF 防盗链与跨域抓取代理
  if (pathname === '/api/proxy-pdf' && req.method === 'GET') {
    const pdfUrl = parsedUrl.query.url;
    if (!pdfUrl) {
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('缺少 url 参数');
      return;
    }

    try {
      const client = pdfUrl.startsWith('https') ? https : http;
      client.get(pdfUrl, (pdfRes) => {
        res.writeHead(pdfRes.statusCode, {
          'Content-Type': 'application/pdf',
          'Access-Control-Allow-Origin': '*'
        });
        pdfRes.pipe(res);
      }).on('error', (err) => {
        res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end(`下载远程 PDF 失败: ${err.message}`);
      });
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(`代理异常: ${err.message}`);
    }
    return;
  }

  // 3. 静态资源托管 (优先使用 dist 编译产物，不存在则回退至源码根目录)
  let relativePath = pathname === '/' ? '/pdf_viewer.html' : pathname;
  let filePath = path.join(__dirname, 'dist', relativePath);
  if (!fs.existsSync(filePath)) {
    filePath = path.join(__dirname, relativePath);
  }

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(filePath).pipe(res);
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404 Not Found');
  }
});

server.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(`🚀 Lite Translate 本地独立 PDF 翻译服务端已启动！`);
  console.log(`📡 本地访问地址: http://localhost:${PORT}/pdf_viewer.html`);
  console.log(`⚡ 支持无插件独立运行、PDF防盗链代理与批量翻译接口`);
  console.log(`======================================================\n`);
});
