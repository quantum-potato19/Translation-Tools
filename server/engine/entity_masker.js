/**
 * 保护高危数值、负数温标、公差与科学计数法（彻底杜绝大模型数字幻觉与注意力漂移）
 * @param {string} text 待翻译原英文
 * @returns {{ maskedText: string, tokenMap: Map<string, string> }}
 */
export function maskNumericEntities(text) {
  if (!text || typeof text !== 'string') return { maskedText: text, tokenMap: new Map() };

  const tokenMap = new Map();
  let counter = 0;

  function replaceWithToken(matchStr) {
    const token = `__NUM_${counter++}__`;
    tokenMap.set(token, matchStr);
    return token;
  }

  let result = text;

  // 1. 显式科学计数法 (如 3.2×10⁻⁵, 1.5x10^-4, 10^-6, 10⁻⁴, 2.5e-5, 4.0E+8, 杜绝误匹配 100, 1000, 10-fold)
  result = result.replace(/\b\d+(?:\.\d+)?\s*[×x*]\s*10\^[-+−]?\d+/g, (m) => replaceWithToken(m));
  result = result.replace(/\b\d+(?:\.\d+)?\s*[×x*]\s*10[⁻⁺]?[⁰¹²³⁴⁵⁶⁷⁸⁹]+/g, (m) => replaceWithToken(m));
  result = result.replace(/\b10\^[-+−]?\d+/g, (m) => replaceWithToken(m));
  result = result.replace(/\b10[⁻⁺]?[⁰¹²³⁴⁵⁶⁷⁸⁹]+/g, (m) => replaceWithToken(m));
  result = result.replace(/\b\d+(?:\.\d+)?[eE][-+]?\d+\b/g, (m) => replaceWithToken(m));

  // 2. 负温及带单位取值范围 (如 -20 °C, -80 ℃, -20 °C to -80 °C, 0.05–0.10 μM, ±0.5 mg/L)
  result = result.replace(/[-−–]?\d+(?:\.\d+)?\s*(?:°C|℃|°F|K|mg\/[mμn]?L|[mμn]?M|%|rpm|kDa|bp|kb)?\s*(?:[-~–—]|to)\s*[-−–]?\d+(?:\.\d+)?\s*(?:°C|℃|°F|K|mg\/[mμn]?L|[mμn]?M|%|rpm|kDa|bp|kb)\b/gi, (m) => replaceWithToken(m));
  result = result.replace(/[-−–]\s*\d+(?:\.\d+)?\s*(?:°C|℃|°F|K)\b/gi, (m) => replaceWithToken(m));

  // 3. 公差与误差范围 (如 ±0.5, ±0.5%, ± 0.02 mg/mL)
  result = result.replace(/[±]\s*\d+(?:\.\d+)?(?:\s*(?:%|[a-zA-Z\/]+))?/g, (m) => replaceWithToken(m));

  // 4. 高精度有符号浮点数与负数百分比 (如 -0.0025, -15.4%)
  result = result.replace(/[-−]\s*\d+(?:\.\d+)?%/g, (m) => replaceWithToken(m));

  return { maskedText: result, tokenMap };
}

/**
 * 译后精准对齐还原高危数值占位符
 * @param {string} translatedText 翻译后的文本
 * @param {Map<string, string>} tokenMap 占位符映射表
 * @returns {string} 还原后的最终译文
 */
export function unmaskNumericEntities(translatedText, tokenMap) {
  if (!translatedText || !tokenMap || tokenMap.size === 0) return translatedText;

  let result = translatedText;
  tokenMap.forEach((originalValue, token) => {
    const fuzzyRegex = new RegExp(token.replace(/_/g, '[_\\s]?'), 'gi');
    result = result.replace(fuzzyRegex, originalValue);
  });

  return result;
}

/**
 * 保护生化特征：CAS号、分子式、限制酶、统计学指标、引用标号及数值保护等
 * @param {string} text 待翻译原英文
 * @returns {{ maskedText: string, tokenMap: Map<string, string> }}
 */
export function maskBioEntities(text) {
  if (!text || typeof text !== 'string') return { maskedText: text, tokenMap: new Map() };

  // 先进行高危数值与科学计数法遮罩
  const numResult = maskNumericEntities(text);
  const tokenMap = new Map(numResult.tokenMap);
  let counter = 0;

  function replaceWithToken(matchStr) {
    const token = `__BIO_SYM_${counter++}__`;
    tokenMap.set(token, matchStr);
    return token;
  }

  let result = numResult.maskedText;

  // 1. CAS 编号保护 (如 [50-00-0] 或 50-00-0)
  result = result.replace(/(?:\[\s*)?\b\d{2,7}-\d{2}-\d\b(?:\s*\])?/g, (m) => replaceWithToken(m));

  // 2. 统计指标与量纲保护 (如 p < 0.05, IC50 = 2.4 nM, Kd = 1.2 μM, EC50 > 100 μg/mL)
  result = result.replace(/\b(IC50|EC50|Kd|Km|Ki|kcat|Vmax|RMSD|pKa|pKb|m\/z)\s*([=><≤≥~]\s*[\d.]+\s*(?:[npuμm]?M|[npuμm]?g\/mL|s-1|h|min|%)?)/gi, (m) => replaceWithToken(m));
  result = result.replace(/\bp\s*([<>=≤≥]\s*0?\.\d+)\b/gi, (m) => replaceWithToken(m));

  // 3. 常见限制性核酸内切酶与特异分子工具保护 (EcoRI, BamHI, HindIII, Cas9, dCas9, CRISPR-Cas9)
  result = result.replace(/\b(CRISPR-(?:Cas9|Cas12a|Cas13)|(?:d?Cas9|EcoRI|BamHI|HindIII|NotI|XhoI|SalI|BglII|Taq|Pfu))\b/g, (m) => replaceWithToken(m));

  // 4. 图表与文献交叉引用 (Fig. 1A, Figure 2B, Table 1, Ref. [12], [1-3])
  result = result.replace(/\b(?:Fig\.|Figure|Scheme|Table)\s*\d+[a-zA-Z]?(?:-\d+)?\b/gi, (m) => replaceWithToken(m));
  result = result.replace(/\[\d+(?:\s*[-–,]\s*\d+)*\]/g, (m) => replaceWithToken(m));

  return { maskedText: result, tokenMap };
}

/**
 * 译后精准对齐还原占位符 (支持 __BIO_SYM_x__ 与 __NUM_x__)
 * @param {string} translatedText 翻译后的文本
 * @param {Map<string, string>} tokenMap 占位符映射表
 * @returns {string} 还原后的最终译文
 */
export function unmaskBioEntities(translatedText, tokenMap) {
  if (!translatedText || !tokenMap || tokenMap.size === 0) return translatedText;

  let result = translatedText;
  tokenMap.forEach((originalValue, token) => {
    // 兼容可能被大模型附加空格或转小写的容错
    const fuzzyRegex = new RegExp(token.replace(/_/g, '[_\\s]?'), 'gi');
    result = result.replace(fuzzyRegex, originalValue);
  });

  return result;
}
