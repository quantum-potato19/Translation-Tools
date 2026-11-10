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
const HOST = process.env.HOST ? process.env.HOST.trim() : '127.0.0.1';
const MAX_BODY_BYTES = 5 * 1024 * 1024; // 5MB 请求体上限，防范内存耗尽 DoS
const DIST_ROOT = path.resolve(__dirname, 'dist');
const PROJECT_ROOT = path.resolve(__dirname);

const ALLOWED_ROOT_STATIC_FILES = new Set([
  'pdf_viewer.html',
  'pdf_viewer.css',
  'pdf_viewer.js',
  'pdf.worker.js',
  'popup.html',
  'popup.css',
  'popup.js',
  'options.html',
  'options.css',
  'options.js',
  'manifest.json'
]);

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

// 安全读取 JSON 请求体（带大小上限保护）
function readJsonBody(req, maxBytes = MAX_BODY_BYTES) {
  return new Promise((resolve, reject) => {
    let totalBytes = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      totalBytes += chunk.length;
      if (totalBytes > maxBytes) {
        req.destroy();
        reject(new Error('请求体超出最大限制 (5MB)'));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf-8');
        resolve(raw ? JSON.parse(raw) : {});
      } catch (e) {
        reject(new Error('无效的 JSON 请求格式'));
      }
    });
    req.on('error', reject);
  });
}

// 校验远程 URL 是否安全（防范 SSRF 探测内网、云元数据与回环端口）
function isSafeRemoteUrl(rawUrl) {
  try {
    const u = new URL(rawUrl);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
    const host = (u.hostname || '').toLowerCase().replace(/^\[|\]$/g, '');
    if (!host) return false;
    if (
      host === 'localhost' ||
      host === '0.0.0.0' ||
      host === '::1' ||
      host === '0:0:0:0:0:0:0:1' ||
      host.endsWith('.local') ||
      host.endsWith('.internal') ||
      /^127\./.test(host) ||
      /^10\./.test(host) ||
      /^192\.168\./.test(host) ||
      /^169\.254\./.test(host) ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(host) ||
      /^(fc|fd|fe80):/i.test(host)
    ) {
      return false;
    }
    return true;
  } catch (e) {
    return false;
  }
}

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
  // 受限跨域（仅放行本机与 Chrome 扩展源，防止第三方恶意站点滥用本地接口）
  const reqOrigin = req.headers.origin || '';
  if (
    !reqOrigin ||
    reqOrigin.startsWith('http://localhost:') ||
    reqOrigin.startsWith('http://127.0.0.1:') ||
    reqOrigin.startsWith('chrome-extension://')
  ) {
    res.setHeader('Access-Control-Allow-Origin', reqOrigin || `http://localhost:${PORT}`);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname || '/';

  // 1.0 API: 单句/划词翻译接口 (支持术语库直出与权威定名对齐)
  if (pathname === '/api/translate' && req.method === 'POST') {
    try {
      const payload = await readJsonBody(req);
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
      const status = err.message && err.message.includes('5MB') ? 413 : 500;
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // 1. API: 批量翻译代理接口
  if (pathname === '/api/translate-batch' && req.method === 'POST') {
    try {
      const payload = await readJsonBody(req);
      const { items, targetLang = 'zh-CN', sourceLang = 'auto' } = payload;
      if (!Array.isArray(items)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'items 必须为数组' }));
        return;
      }

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
      const status = err.message && err.message.includes('5MB') ? 413 : 500;
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // 1.5 API: 生化前沿学术文献高精度翻译专用接口 (含实体保护 + 权威术语注入 + 滑动窗口)
  if (pathname === '/api/translate/bio' && req.method === 'POST') {
    try {
      const payload = await readJsonBody(req);
      const result = await handleBioTranslate(payload);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    } catch (err) {
      const status = err.message && err.message.includes('5MB') ? 413 : 500;
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
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
    try {
      const { englishTerm, chineseTranslation, category, note, abbr } = await readJsonBody(req);
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
    return;
  }

  // 2. API: PDF 防盗链与跨域抓取代理 (含 SSRF 内网拦截、3xx 跳转校验与 15s 超时)
  if (pathname === '/api/proxy-pdf' && req.method === 'GET') {
    const pdfUrl = parsedUrl.query.url;
    if (!pdfUrl || typeof pdfUrl !== 'string') {
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('缺少 url 参数');
      return;
    }

    if (!isSafeRemoteUrl(pdfUrl)) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('拒绝访问：仅允许公开的 HTTP/HTTPS 远程地址，禁止访问内网或本地回环地址');
      return;
    }

    const fetchRemotePdf = (targetUrl, redirectCount = 0) => {
      if (redirectCount > 5) {
        res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('重定向次数过多');
        return;
      }
      if (!isSafeRemoteUrl(targetUrl)) {
        res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('重定向目标地址不安全，已拦截');
        return;
      }

      const client = targetUrl.startsWith('https:') ? https : http;
      const proxyReq = client.get(targetUrl, { timeout: 15000 }, (pdfRes) => {
        if (pdfRes.statusCode >= 300 && pdfRes.statusCode < 400 && pdfRes.headers.location) {
          pdfRes.resume();
          const nextUrl = new URL(pdfRes.headers.location, targetUrl).toString();
          fetchRemotePdf(nextUrl, redirectCount + 1);
          return;
        }
        res.writeHead(pdfRes.statusCode || 200, {
          'Content-Type': 'application/pdf'
        });
        pdfRes.pipe(res);
      });

      proxyReq.on('timeout', () => {
        proxyReq.destroy(new Error('请求远程 PDF 超时 (15s)'));
      });

      proxyReq.on('error', (err) => {
        if (!res.headersSent) {
          res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end(`下载远程 PDF 失败: ${err.message}`);
        }
      });
    };

    try {
      fetchRemotePdf(pdfUrl, 0);
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(`代理异常: ${err.message}`);
    }
    return;
  }

  // 3. 静态资源托管 (严格限制在 dist 目录或显式白名单文件内，严防目录穿越与敏感文件读取)
  let decodedPath = '/';
  try {
    decodedPath = decodeURIComponent(pathname);
  } catch (e) {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('400 Bad Request');
    return;
  }

  const cleanRel = (decodedPath === '/' ? 'pdf_viewer.html' : decodedPath.replace(/^\/+/, '')).replace(/\\/g, '/');
  if (cleanRel.includes('..') || cleanRel.startsWith('.') || cleanRel.includes('/.')) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('403 Forbidden');
    return;
  }

  let filePath = path.resolve(DIST_ROOT, cleanRel);
  const isInsideDist = filePath.startsWith(DIST_ROOT + path.sep);

  if (!isInsideDist || !fs.existsSync(filePath)) {
    // 仅允许回退访问白名单静态文件或 icons/ 目录下的图标资源，严禁暴露 server/、.git、package.json 等文件
    const isAllowedRootFile = ALLOWED_ROOT_STATIC_FILES.has(cleanRel) || /^icons\/[a-zA-Z0-9._-]+$/.test(cleanRel);
    if (!isAllowedRootFile) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found');
      return;
    }
    filePath = path.resolve(PROJECT_ROOT, cleanRel);
    if (!filePath.startsWith(PROJECT_ROOT + path.sep)) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('403 Forbidden');
      return;
    }
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

server.listen(PORT, HOST, () => {
  console.log(`\n======================================================`);
  console.log(`🚀 Lite Translate 本地独立 PDF 翻译服务端已启动！`);
  console.log(`📡 本地访问地址: http://${HOST}:${PORT}/pdf_viewer.html`);
  console.log(`⚡ 支持无插件独立运行、PDF防盗链代理与批量翻译接口`);
  console.log(`======================================================\n`);
});
