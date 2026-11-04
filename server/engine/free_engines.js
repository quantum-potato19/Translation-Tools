// 免 Key 免费翻译引擎服务 (Google GTX & 微软 Bing 自动熔断与降级体系)

let bingTokenCache = {
  ig: '',
  iid: '',
  key: '',
  token: '',
  expiresAt: 0
};

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
};

let googleCooldownUntil = 0;
const GOOGLE_CLIENTS = ['gtx', 'dict-chrome-ex', 'webapp'];
let currentClientIndex = 0;

/**
 * 谷歌免费高速接口翻译 (支持多客户端标识轮换 + 429 智能熔断保护)
 */
export async function translateGoogle(text, targetLang = 'zh-CN', sourceLang = 'auto') {
  if (!text || typeof text !== 'string') return '';
  const now = Date.now();
  if (now < googleCooldownUntil) {
    throw new Error('Google 通道处于 429 限流冷却保护期');
  }

  const tl = targetLang === 'zh-CN' ? 'zh-CN' : targetLang;
  const sl = sourceLang && sourceLang !== 'auto' ? sourceLang : 'auto';

  for (let i = 0; i < GOOGLE_CLIENTS.length; i++) {
    const client = GOOGLE_CLIENTS[(currentClientIndex + i) % GOOGLE_CLIENTS.length];
    const url = `https://translate.googleapis.com/translate_a/single?client=${client}&sl=${sl}&tl=${tl}&dt=t&q=${encodeURIComponent(text)}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    try {
      const res = await fetch(url, { headers: BROWSER_HEADERS, signal: controller.signal });
      clearTimeout(timeoutId);

      if (res.status === 429) {
        googleCooldownUntil = Date.now() + 8000; // 触发 429 时进入 8 秒冷却
        currentClientIndex = (currentClientIndex + 1) % GOOGLE_CLIENTS.length;
        continue;
      }

      if (!res.ok) throw new Error(`Google API 响应状态异常: ${res.status}`);
      const data = await res.json();
      if (data && Array.isArray(data[0])) {
        return data[0].map(item => (item && item[0] ? item[0] : '')).join('');
      }
    } catch (err) {
      clearTimeout(timeoutId);
      if (err.message && err.message.includes('429')) {
        googleCooldownUntil = Date.now() + 8000;
        continue;
      }
    }
  }

  throw new Error('Google 免Key接口限流或不可用 (429)');
}

/**
 * 提取微软 Bing 防刷动态令牌
 */
async function getBingToken() {
  const now = Date.now();
  if (bingTokenCache.token && now < bingTokenCache.expiresAt) {
    return bingTokenCache;
  }

  const res = await fetch('https://www.bing.com/translator', { headers: BROWSER_HEADERS });
  if (!res.ok) throw new Error(`Bing 网站无法连接: ${res.status}`);
  const html = await res.text();

  const igMatch = html.match(/IG:"([A-F0-9]+)"/i);
  const iidMatch = html.match(/data-iid="([^"]+)"/i);
  const tokenMatch = html.match(/var\s+params_AbusePreventionHelper\s*=\s*\[([0-9]+),"([^"]+)"/);

  if (!tokenMatch) throw new Error('无法解析 Bing 动态鉴权令牌');

  bingTokenCache = {
    ig: igMatch ? igMatch[1] : '',
    iid: iidMatch ? iidMatch[1] : 'translator.5028',
    key: tokenMatch[1],
    token: tokenMatch[2],
    expiresAt: now + 15 * 60 * 1000 // 缓存 15 分钟
  };
  return bingTokenCache;
}

/**
 * 微软 Bing 翻译接口
 */
export async function translateBing(text, targetLang = 'zh-CN', sourceLang = 'auto') {
  if (!text || typeof text !== 'string') return '';
  const langMap = { 'zh-CN': 'zh-Hans', 'en': 'en', 'ja': 'ja', 'ko': 'ko' };
  const to = langMap[targetLang] || targetLang;
  const fromLang = (sourceLang && sourceLang !== 'auto') ? (langMap[sourceLang] || sourceLang) : 'auto-detect';

  let tokenInfo = await getBingToken();

  const doRequest = async (info) => {
    const params = new URLSearchParams();
    params.append('fromLang', fromLang);
    params.append('text', text);
    params.append('to', to);
    params.append('key', info.key);
    params.append('token', info.token);

    const url = `https://www.bing.com/ttranslatev3?isVertical=1&IG=${info.ig}&IID=${info.iid}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        ...BROWSER_HEADERS,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params.toString()
    });
    if (!res.ok) throw new Error(`Bing 接口请求错误: ${res.status}`);
    return await res.json();
  };

  let data = await doRequest(tokenInfo);
  if (!data || !data[0] || !data[0].translations) {
    // 令牌失效主动刷新重试一次
    bingTokenCache.expiresAt = 0;
    tokenInfo = await getBingToken();
    data = await doRequest(tokenInfo);
  }

  if (data && data[0] && data[0].translations && data[0].translations[0]) {
    return data[0].translations[0].text;
  }
  throw new Error('Bing 未返回有效翻译结果');
}

/**
 * 第三免Key备用通道 (MyMemory 免费 API)
 */
export async function translateMyMemory(text, targetLang = 'zh-CN', sourceLang = 'auto') {
  if (!text || typeof text !== 'string') return '';
  const to = targetLang === 'zh-CN' ? 'zh-CN' : targetLang;
  const sl = (sourceLang && sourceLang !== 'auto') ? sourceLang : 'en';
  const langpair = `${sl}|${to}`;
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text.slice(0, 480))}&langpair=${langpair}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 6000);

  try {
    const res = await fetch(url, { headers: BROWSER_HEADERS, signal: controller.signal });
    clearTimeout(timeoutId);
    if (!res.ok) throw new Error(`MyMemory API 响应状态: ${res.status}`);
    const data = await res.json();
    if (data && data.responseData && data.responseData.translatedText) {
      return data.responseData.translatedText;
    }
    throw new Error('MyMemory 未返回有效翻译结果');
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

/**
 * 免费三通道自适应快速翻译 (Google 多端轮询 -> Bing 动态鉴权 -> MyMemory 兜底)
 */
export async function translateFreeFast(text, targetLang = 'zh-CN', sourceLang = 'auto') {
  try {
    return await translateGoogle(text, targetLang, sourceLang);
  } catch (googleErr) {
    console.warn(`[FreeEngine] Google 翻译受限 (${googleErr.message})，平滑降级至 Bing 翻译...`);
    try {
      return await translateBing(text, targetLang, sourceLang);
    } catch (bingErr) {
      console.warn(`[FreeEngine] Bing 翻译受限 (${bingErr.message})，平滑降级至 MyMemory 兜底...`);
      try {
        return await translateMyMemory(text, targetLang, sourceLang);
      } catch (myMemErr) {
        throw new Error(`免费通道全部受限 (Google: ${googleErr.message} / Bing: ${bingErr.message} / MyMemory: ${myMemErr.message})`);
      }
    }
  }
}

/**
 * 节流并发批处理器 (平滑调用免费通道，防止瞬间请求风暴引发 429)
 * @param {Array<any>} items 
 * @param {(item: any) => Promise<any>} workerFn 
 * @param {number} concurrency 
 * @param {number} delayMs 
 * @returns {Promise<Array<any>>}
 */
export async function runThrottled(items, workerFn, concurrency = 2, delayMs = 90) {
  if (!items || items.length === 0) return [];
  const results = new Array(items.length);
  let cursor = 0;

  async function worker() {
    while (cursor < items.length) {
      const idx = cursor++;
      if (idx >= items.length) break;
      try {
        results[idx] = await workerFn(items[idx]);
      } catch (e) {
        results[idx] = null;
      }
      if (delayMs > 0) {
        await new Promise(r => setTimeout(r, delayMs));
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}
