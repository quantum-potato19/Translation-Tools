// 多角色前沿学术文献高精度翻译路由逻辑 (Multi-Persona Translation Pipeline with Privacy Sanitization)
import { maskBioEntities, unmaskBioEntities, maskNumericEntities, unmaskNumericEntities } from '../engine/entity_masker.js';
import { matchTerms, loadAllTerms } from '../engine/term_matcher.js';
import { buildBioSystemPrompt, buildBioBatchPrompt } from '../engine/prompt_builder.js';
import { translateFreeFast, runThrottled } from '../engine/free_engines.js';
import { evaluateChunkUncertainty } from '../engine/uncertainty_evaluator.js';
import { sanitizeTextForUpload, restoreSanitizedData, auditTextSafety } from '../engine/privacy_filter.js';

/**
 * 处理单段或批量高精度学术/通用翻译请求
 * 支持：
 * 1. 隐私合规检测与前置硬脱敏保护
 * 2. 翻译角色切换 (general: 通用大众 | biochem: 生化专家 | economics: 经济金融专家)
 * 3. 动静分流 (确定性走免Key Google/Bing，学术不确定性走大模型 API Key)
 */
export async function handleBioTranslate(payload) {
  const {
    text,
    items,
    targetLang = 'zh-CN',
    sourceLang = 'auto',
    crossPageContext = null,
    apiKey,
    endpoint = 'https://api.deepseek.com/chat/completions',
    model = 'deepseek-chat',
    enableHybrid = true,
    persona = 'biochem'
  } = payload;

  // 1. 批量多段翻译模式
  if (items && Array.isArray(items) && items.length > 0) {
    const uncertainItems = [];
    const deterministicItems = [];
    const tokenMaps = new Map();
    const redactionMaps = new Map();
    const itemTermsMap = new Map();

    // 逐段评估隐私合规、不确定性与实体
    for (const item of items) {
      // 1.1 隐私敏感信息前置脱敏
      const { sanitizedText, redactionMap } = sanitizeTextForUpload(item.text);
      redactionMaps.set(item.id, redactionMap);

      // 1.2 专业实体与数值硬遮罩 (所有角色均执行高危数值硬遮罩，避免大模型幻觉)
      const { maskedText, tokenMap } = (persona !== 'general')
        ? maskBioEntities(sanitizedText)
        : maskNumericEntities(sanitizedText);
      tokenMaps.set(item.id, tokenMap);

      // 1.3 检索当前角色专用词典
      const matched = (persona !== 'general') ? matchTerms(sanitizedText, 8, persona) : [];
      itemTermsMap.set(item.id, matched);

      // 1.4 评估学术不确定度 (通用大众角色默认全走快速通道，除非指定需要大模型)
      const uncertainty = (persona !== 'general')
        ? evaluateChunkUncertainty(sanitizedText, matched, tokenMap)
        : { isUncertain: Boolean(apiKey && items.length <= 3), score: 0 };

      // 若启用了混合分流模式，且属于平实无术语歧义的确定性段落 -> 归入免 Key 免费通道
      if (enableHybrid && !uncertainty.isUncertain) {
        deterministicItems.push({ id: item.id, text: sanitizedText, rawText: item.text });
      } else {
        uncertainItems.push({ id: item.id, text: maskedText, rawText: sanitizedText });
      }
    }

    // A. 确定性段落：通过节流并发通道平滑请求免费引擎，彻底规避 429 请求风暴
    let rateLimitEncountered = false;
    const freeResultsRaw = await runThrottled(deterministicItems, async (dItem) => {
      try {
        let trans = await translateFreeFast(dItem.text, targetLang, sourceLang);
        const rMap = redactionMaps.get(dItem.id);
        trans = restoreSanitizedData(trans, rMap);
        return { id: dItem.id, text: trans, source: 'free_engine' };
      } catch (err) {
        if (err.message && (err.message.includes('429') || err.message.includes('受限'))) {
          rateLimitEncountered = true;
        }
        console.warn(`[Hybrid] 段落 ID:${dItem.id} 免Key通道遇阻，自动并入重试队列:`, err.message);
        const mText = (persona !== 'general' ? maskBioEntities(dItem.text) : maskNumericEntities(dItem.text));
        tokenMaps.set(dItem.id, mText.tokenMap);
        uncertainItems.push({ id: dItem.id, text: mText.maskedText, rawText: dItem.text });
        return null;
      }
    }, 2, 90);

    const freeResults = freeResultsRaw.filter(Boolean);

    // B. 不确定性/核心学术段落：调用大模型 API Key 进行高精学术推理
    let aiResults = [];
    let allMatchedTerms = [];

    if (uncertainItems.length > 0) {
      if (!apiKey) {
        // 若未提供 API Key，安全平滑回退走免费通道，同样使用节流并发
        console.warn(`[Hybrid:${persona}] 未提供 API Key，所有高危段落降级至免Key通道并注入词典校正`);
        const fallbackResultsRaw = await runThrottled(uncertainItems, async (uItem) => {
          let trans = await translateFreeFast(uItem.rawText || uItem.text, targetLang, sourceLang);
          const terms = itemTermsMap.get(uItem.id) || [];
          for (const t of terms) {
            const regex = new RegExp(`\\b${t.term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
            trans = trans.replace(regex, t.translation);
          }
          const rMap = redactionMaps.get(uItem.id);
          trans = restoreSanitizedData(trans, rMap);
          return { id: uItem.id, text: trans, source: 'free_engine_fallback' };
        }, 2, 110);
        aiResults = fallbackResultsRaw.filter(Boolean);
      } else {
        // 汇聚全部不确定段落的待译文本与核心生化/经济术语
        const combinedSample = uncertainItems.map(i => i.rawText || i.text).join(' ');
        allMatchedTerms = (persona !== 'general') ? matchTerms(combinedSample, 15, persona) : [];

        const { systemPrompt, userPrompt } = buildBioBatchPrompt(
          uncertainItems.map(i => ({ id: i.id, text: i.text })),
          allMatchedTerms,
          crossPageContext,
          targetLang,
          persona,
          sourceLang
        );

        // 请求大模型
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
            'HTTP-Referer': 'https://github.com/GeoffLeng/Translation-Tools',
            'X-Title': 'Lite Translate Academic'
          },
          body: JSON.stringify({
            model: model,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt }
            ],
            temperature: 0.2
          })
        });

        if (!response.ok) {
          const err = await response.json().catch(() => ({}));
          throw new Error(err.error?.message || `大模型端点响应异常: HTTP ${response.status}`);
        }

        const resData = await response.json();
        const rawContent = resData.choices && resData.choices[0]?.message?.content?.trim();
        if (!rawContent) throw new Error('大模型未返回翻译内容');

        let cleanJson = rawContent.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
        let parsedArray = [];
        try {
          parsedArray = JSON.parse(cleanJson);
        } catch (e) {
          const objRegex = /\{"id"\s*:\s*([^,]+),\s*"text"\s*:\s*"((?:[^"\\]|\\.)*)"\}/g;
          let match;
          while ((match = objRegex.exec(cleanJson)) !== null) {
            try {
              parsedArray.push({ id: JSON.parse(match[1]), text: JSON.parse(`"${match[2]}"`) });
            } catch (err) {}
          }
        }

        if (!Array.isArray(parsedArray) || parsedArray.length === 0) {
          throw new Error('解析学术翻译批处理结果失败');
        }

        // 还原生化实体占位符与隐私信息
        aiResults = parsedArray.map(p => {
          const tMap = tokenMaps.get(p.id);
          const rMap = redactionMaps.get(p.id);
          let finalText = tMap ? unmaskBioEntities(p.text, tMap) : p.text;
          finalText = restoreSanitizedData(finalText, rMap);
          return { id: p.id, text: finalText, source: 'ai_llm' };
        });
      }
    }

    // C. 将免Key机翻结果与AI精译结果按原有 ID 严格升序合并
    const resultMap = new Map();
    for (const r of [...freeResults, ...aiResults]) {
      resultMap.set(r.id, r.text);
    }

    const finalTranslations = items.map(item => ({
      id: item.id,
      text: resultMap.get(item.id) || item.text
    }));

    return {
      success: true,
      persona,
      translations: finalTranslations,
      matchedTerms: allMatchedTerms,
      dispatchStats: {
        persona,
        totalCount: items.length,
        aiCount: aiResults.length,
        freeCount: freeResults.length,
        rateLimited: rateLimitEncountered,
        savedTokenRatio: items.length > 0 ? `${Math.round((freeResults.length / items.length) * 100)}%` : '0%'
      }
    };
  }

  // 2. 单段学术/通用翻译模式
  if (text && typeof text === 'string') {
    // 2.1 隐私脱敏
    const { sanitizedText, redactionMap } = sanitizeTextForUpload(text);

    // 2.2 实体遮罩与高危数值硬保护
    const { maskedText, tokenMap } = (persona !== 'general')
      ? maskBioEntities(sanitizedText)
      : maskNumericEntities(sanitizedText);

    const matchedTerms = (persona !== 'general') ? matchTerms(sanitizedText, 10, persona) : [];
    const uncertainty = (persona !== 'general')
      ? evaluateChunkUncertainty(sanitizedText, matchedTerms, tokenMap)
      : { isUncertain: false, score: 0 };

    // 确定性平实文本：若开启智能分流，直接由 Google / Bing 免 Key 快速返回
    if (enableHybrid && !uncertainty.isUncertain) {
      try {
        let trans = await translateFreeFast(sanitizedText, targetLang, sourceLang);
        trans = restoreSanitizedData(trans, redactionMap);
        return {
          success: true,
          persona,
          translation: trans,
          matchedTerms: [],
          source: 'free_engine',
          isUncertain: false
        };
      } catch (e) {
        console.warn('[Hybrid] 单段免费机翻异常，回退至AI大模型推理:', e.message);
      }
    }

    // 存在学术不确定性/生化实体时，调用 AI 模型 API Key 精译
    if (!apiKey) {
      let trans = await translateFreeFast(sanitizedText, targetLang, sourceLang);
      for (const t of matchedTerms) {
        const regex = new RegExp(`\\b${t.term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
        trans = trans.replace(regex, t.translation);
      }
      trans = restoreSanitizedData(trans, redactionMap);
      return {
        success: true,
        persona,
        translation: trans,
        matchedTerms: matchedTerms,
        source: 'free_engine_fallback'
      };
    }

    const systemPrompt = buildBioSystemPrompt(matchedTerms, targetLang, persona, false, sourceLang);
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: maskedText }
        ],
        temperature: 0.2
      })
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error?.message || `大模型端点响应异常: HTTP ${response.status}`);
    }

    const resData = await response.json();
    const rawContent = resData.choices && resData.choices[0]?.message?.content?.trim();
    if (!rawContent) throw new Error('大模型未返回翻译内容');

    let finalText = unmaskBioEntities(rawContent, tokenMap);
    finalText = restoreSanitizedData(finalText, redactionMap);

    return {
      success: true,
      persona,
      translation: finalText,
      matchedTerms: matchedTerms,
      source: 'ai_llm',
      isUncertain: true
    };
  }

  throw new Error('缺少待翻译文本参数 (text 或 items)');
}
