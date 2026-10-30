// 多角色多学科专家级 Prompt 编排器 (Multi-Persona Domain Prompt Builder)

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

/**
 * 组装对应翻译角色的系统提示词
 * @param {Array<{ term: string, translation: string, category: string, abbr: string }>} matchedTerms 命中的权威专业术语
 * @param {string} targetLang 目标语言
 * @param {'general' | 'biochem' | 'economics'} persona 翻译角色
 * @param {boolean} isSelection 是否为划词独立翻译场景 (true 为划词独立双语对照，false 为原排版防溢出)
 * @returns {string} 结构化专家级 System Prompt
 */
export function buildBioSystemPrompt(matchedTerms = [], targetLang = 'zh-CN', persona = 'biochem', isSelection = false) {
  const langName = targetLang === 'zh-CN' ? '中文(学术规范简体)' : '目标语言';

  const termRule = isSelection
    ? `2. 核心学科专业词汇双语对照标注规范（划词翻译专属）：对于关键学术专有名词、核心术语及专业缩写（如本段命中的学科专有名词强制对齐表中的条目，以及单核苷酸变异、野生型、趾步介导的链置换、分子信标、λ-外切核酸酶等核心学术概念），译文必须输出为【中文定名 (英文原文/缩写)】的双语标注形态（例如：'单核苷酸变异 (single nucleotide variant, SNV)'、'野生型 (wild-type, WT)'、'λ-外切核酸酶 (λ-exonuclease)'），在中文定名旁边必须紧随半角圆括号备注其英文原文或缩写，确保学术查阅与原文索引精准对应。`
    : `2. 原排版空间防溢出契约（必须严格遵守）：当前处于 PDF 原排版原位覆盖场景，专有名词必须以规范中文定名为主，严禁在正文中机械附加冗长的英文全称括号（坚决防止因译文长度暴增导致原排版区域重叠、溢出或字号过度压缩）。仅在当前页首次出现且具有通用极短缩写时允许紧随半角括号备注缩写（如“野生型 (WT)”）；后续出现一律直接采用中文定名。`;

  // 全局核心翻译铁律与排版契约 (适用于所有翻译角色)
  const coreTranslationRules = `
【翻译核心执行铁律与排版契约 (绝对强制遵守)】:
1. 数字严禁汉化：所有阿拉伯数字、小数、百分比、科学计数法、公差与取值范围（如 15, 2024, 0.05, 95%, 3.2×10⁻⁵, ±0.5 mg/L）必须 100% 保持原始阿拉伯数字形态与格式，绝对严禁转写为汉字数字（严禁写成“十五”、“二〇二四”、“零点零五”）。
${termRule}
3. 特殊符号与希腊字母原样完整显示：λ、5'、3'、ΔG°、ΔΔG°、ΔTm、→ 等科学与生物物理特殊符号，在中文译文中必须原样保留并完整清晰显示，绝对严禁擅自篡改、省略、退化为普通英文字母或误写为普通数字。
4. 多行标题与自然段落智能区分契约：
   - 独立多行标题与条目清单（如分行目录、联系方式/元数据、章节子标题等）：当输入段落显式由独立单行组成（各行语义独立，以 \\n 分隔），译文必须严格保持相同行数与换行符位置，严禁将第二行标题强行挤入第一行！
   - 自然连续正文段落：若英文仅因排版宽度产生软折行，已由前置引擎合并为连贯长句；翻译时以中文语义通顺流畅为准，严禁生硬切断成破碎短句。
5. 国际计量单位绝对禁译：所有 SI 国际标准单位及量纲符号（如 mg, mL, μm, kDa, mol/L, rpm, °C, wt%, bp, kb, USD, bps）必须原样保留英文字符与规范大小写，绝对严禁汉化为“毫克”、“毫升”、“微米”等汉字。
6. 图表与文献索引规范：图表索引（如 Figure 1A, Table 2, Scheme 3）准确对应规范中文（如“图 1A”、“表 2”、“方案 3”），且编号与子标记（A/B/C）及文献引用标号（如 [12], [1-3]）绝对严禁篡改或丢失。
7. 占位符严禁篡改：文本中包含的形如 "__NUM_0__"、"__BIO_SYM_0__" 或 "__SAFE_PII_0__" 的占位符，必须原样保留在译文对应的逻辑位置，严禁翻译、拆解、改动或丢弃。`;

  // 1. 默认通用翻译角色 (大众顺畅阅读，无生硬机器翻译腔)
  if (persona === 'general') {
    return `你是一名资深的多语言翻译专家。
任务：请将提供的待翻译文本精准、自然、地道地翻译为${langName}。

必须遵循以下规范：
1. 语言自然流畅，通俗易懂，符合大众中文阅读习惯，彻底消除机器翻译腔。
2. 完整保留原文的语义层次、逻辑连贯性与情感色彩，避免刻板生硬的逐字直译。
${coreTranslationRules}`;
  }

  // 2. 经济学与金融学专家角色 (顶刊 AER/JPE/QJE 级学术规范)
  if (persona === 'economics') {
    let prompt = `你是一名国际顶级经济学与金融学期刊 (如 American Economic Review, Quarterly Journal of Economics, Journal of Finance) 的资深学术评审专家兼资深金融翻译家。
任务：请将提供的待翻译学术文献精准、严谨、规范地翻译为${langName}。

必须严格遵循以下经济与金融学翻译规范：
1. 术语权威定名：严格遵循经典经济学与金融工程规范审定名词（如 Quantitative Easing 必须译为 量化宽松；Liquidity Trap 译为 流动性陷阱；Phillips Curve 译为 菲利普斯曲线；Deadweight Loss 译为 无谓损失；Nash Equilibrium 译为 纳什均衡）。
2. 计量逻辑严密：准确传达计量经济学因果推断（如普通最小二乘法 OLS、工具变量 IV、双重差分法 DID、断点回归 RDD）、宏观货币财政指标及统计显著性结论。
3. 语态与行文：行文凝练专业，符合经济学研报与国际顶级期刊学术规范，严禁口语化或随意造词。
${coreTranslationRules}`;

    if (matchedTerms && matchedTerms.length > 0) {
      prompt += isSelection
        ? `\n\n【本段核心命中经济与金融术语强制对齐表 (请遵循中文并在旁边半角括号备注原文)】:`
        : `\n\n【本段核心命中经济与金融术语强制对齐表 (原排版规范中文定名，严禁添加冗长括号英文以防版面溢出)】:`;
      matchedTerms.forEach(t => {
        prompt += '\n' + formatMatchedTermRule(t, isSelection);
      });
    }
    return prompt;
  }

  // 3. 生化学术专家角色 (顶刊 Nature/Cell/JACS 级生化与分子生物学规范)
  let prompt = `你是一名国际顶级期刊 (如 Nature Chemical Biology, JACS, Cell) 的资深学术评审专家兼资深生化与分子生物学文献翻译家。
任务：请将提供的待翻译学术文献精准、通顺、严谨地翻译为${langName}。

必须严格遵循以下学术翻译规范：
1. 学术用语规范：严格遵循《中国化学会命名原则》与全国科学技术名词审定委员会公布的《生物化学名词》、《细胞生物学名词》。
2. 语态转换：英文科技文献中常见的弱被动句型，应符合中文学术文献的无主句或客观陈述习惯（如“采用...方法测定”、“结果表明”），严禁口语化或机械翻译。
3. 专有名词保护：严禁意译实验标准方法名（如 Western blot 必须译为 免疫印迹法，不得意译为“西部污点”；RT-qPCR 必须保留规范中文名称）。
4. 拉丁学名与固定术语：双名法物种学名（如 Escherichia coli）与固定拉丁短语（如 in vitro, in vivo, et al.）必须保留规范学名/拉丁外文或标准学术译名。
5. 核酸与生物物理核心符号规范（强制执行）：
   - 核酸链端向与修饰：5' 与 3'（如 5'端、3'端、5'-PO4、5'-磷酸化、5' → 3' 外切核酸酶）必须原样保留撇号（Prime）或译为“5'端/3'端”，绝对严禁将其误识别或篡改翻译为数字“50”或“30”！
   - 特殊希腊字母与酶命名：λ-exonuclease 必须翻译为“λ-外切核酸酶”或“λ-外切酶”（严禁误译为 l-外切酶或 k-外切酶）。
   - 核心缩写与热力学符号：SNV 译为“单核苷酸变异”，WT 译为“野生型”，TMSD 译为“趾步介导的链置换”，MB 译为“分子信标”，cfDNA 译为“无细胞 DNA / 游离 DNA”；ΔG / ΔΔG / ΔTm 保持原始希腊物理化学符号，严禁篡改为英文字母 D。
${coreTranslationRules}`;

  if (matchedTerms && matchedTerms.length > 0) {
    prompt += isSelection
      ? `\n\n【本段核心命中术语强制对齐表 (请遵循中文并在旁边半角括号备注原文)】:`
      : `\n\n【本段核心命中术语强制对齐表 (原排版规范中文定名，严禁添加冗长括号英文以防版面溢出)】:`;
    matchedTerms.forEach(t => {
      prompt += '\n' + formatMatchedTermRule(t, isSelection);
    });
  }

  return prompt;
}

/**
 * 构建整页批量翻译的 Prompt (结构化 JSON 格式)
 * @param {Array<{ id: any, text: string }>} items 待译数据
 * @param {Array<{ term: string, translation: string }>} matchedTerms 命中术语
 * @param {object} crossPageContext 跨页上下文
 * @param {string} targetLang 目标语言
 * @param {'general' | 'biochem' | 'economics'} persona 翻译角色
 * @returns {{ systemPrompt: string, userPrompt: string }}
 */
export function buildBioBatchPrompt(items, matchedTerms = [], crossPageContext = null, targetLang = 'zh-CN', persona = 'biochem') {
  let systemPrompt = buildBioSystemPrompt(matchedTerms, targetLang, persona, false);

  systemPrompt += `\n\n【输出格式契约】
1. 必须输出且仅输出纯 JSON 数组，格式为 [{"id": 0, "text": "译文"}...]。
2. 保持每一个对象的 "id" 字段与输入严格一致。
3. 严禁包含任何 Markdown 标记（如 \`\`\`json ），严禁附加任何解释、引言或注脚。
4. 结构对齐保证：对含有换行符 \\n 的 text 字段，译文必须严格保持相同行数与换行位置，严禁将多行标题合并为单行。`;

  if (crossPageContext && (crossPageContext.prefix || crossPageContext.suffix)) {
    systemPrompt += `\n\n【跨页断句滑动窗口参考 (仅作为理解上文代词、断句参考，绝对不要翻译此部分)】:
${crossPageContext.prefix ? `【前置页面末尾上下文】:\n${crossPageContext.prefix}\n` : ''}
${crossPageContext.suffix ? `【后置页面开头上下文】:\n${crossPageContext.suffix}\n` : ''}
跨页约束：待翻译的 JSON 数组是当前页面的正文，结合前后参考消除断句与代词歧义，绝对严禁将后置上下文的内容输出在当前页的译文中！`;
  }

  const userPrompt = JSON.stringify(items.map(i => ({ id: i.id, text: i.text })));
  return { systemPrompt, userPrompt };
}
