// Pure DOM-free PDF layout analysis, column clustering, paragraph segmentation, and color classification

const HEADING_KEYWORD_RE = /^(?:abstract|keywords?|index terms?|introduction|background|overview|summary|conclusion|conclusions|discussion|references|acknowledg?ments?|appendix|methods?|methodology|results?|related work|摘要|关键词|引言|绪论|背景|结论|讨论|参考文献|致谢|附录)$/i;

function computeLuminance(r, g, b) {
  return (r * 299 + g * 587 + b * 114) / 1000;
}

function relativeLuminance(r, g, b) {
  const srgb = [r, g, b].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2];
}

function contrastRatio(rgbA, rgbB) {
  const l1 = relativeLuminance(rgbA[0], rgbA[1], rgbA[2]);
  const l2 = relativeLuminance(rgbB[0], rgbB[1], rgbB[2]);
  const hi = Math.max(l1, l2);
  const lo = Math.min(l1, l2);
  return (hi + 0.05) / (lo + 0.05);
}

function buildPaddedBox(lines, pageWidth, pageHeight) {
  const minX = Math.min(...lines.map(l => l.box.x));
  const maxX = Math.max(...lines.map(l => l.box.x + l.box.w));
  const minY = Math.min(...lines.map(l => l.box.y));
  const maxY = Math.max(...lines.map(l => l.box.y + l.box.h));
  const avgFontSize = lines.reduce((s, l) => s + (l.fontSize || 12), 0) / lines.length;
  const maxDescentRatio = Math.max(0.28, ...lines.map(l => l.descentRatio || 0));

  // PDF baseline -> descender extends downward ~0.28-0.35 * fontSize; ascender/accent extends slightly upward
  const descenderPad = Math.max(2, avgFontSize * maxDescentRatio);
  const ascenderPad = Math.max(1.2, avgFontSize * 0.12);
  const hPad = 2;

  const x = Math.max(0, minX - hPad);
  const y = Math.max(0, minY - descenderPad);
  const topY = Math.min(pageHeight, maxY + ascenderPad);
  const rightX = Math.min(pageWidth, maxX + hPad);

  return {
    box: {
      x: Math.round(x * 100) / 100,
      y: Math.round(y * 100) / 100,
      w: Math.round(Math.max(4, rightX - x) * 100) / 100,
      h: Math.round(Math.max(4, topY - y) * 100) / 100
    },
    rawBounds: { minX, maxX, minY, maxY },
    avgFontSize
  };
}

function findBestGutterInRange(bodyLines, minGx, maxGx, pageHeight, totalBodyCount) {
  if (maxGx - minGx < 16 || bodyLines.length < 6) return null;

  let best = null;
  for (let gx = minGx; gx <= maxGx; gx += 2) {
    const leftLines = [];
    const rightLines = [];

    for (const line of bodyLines) {
      if (line.x + line.w <= gx + 2) {
        leftLines.push(line);
      } else if (line.x >= gx - 2) {
        rightLines.push(line);
      }
    }

    if (leftLines.length < 3 || rightLines.length < 3) continue;

    const overlappingLeft = new Set();
    const overlappingRight = new Set();
    const pairGaps = [];
    let overlapMinY = Infinity;
    let overlapMaxY = -Infinity;

    for (const l of leftLines) {
      const tol = Math.max(l.h || 12, 10) * 2.2;
      for (const r of rightLines) {
        if (Math.abs(l.y - r.y) <= tol) {
          overlappingLeft.add(l);
          overlappingRight.add(r);
          pairGaps.push(r.x - (l.x + l.w));
          overlapMinY = Math.min(overlapMinY, l.y, r.y);
          overlapMaxY = Math.max(overlapMaxY, l.y + (l.h || 12), r.y + (r.h || 12));
        }
      }
    }

    const leftOverlapCount = overlappingLeft.size;
    const rightOverlapCount = overlappingRight.size;
    if (leftOverlapCount < 3 || rightOverlapCount < 3) continue;

    pairGaps.sort((a, b) => a - b);
    const p10Gap = pairGaps[Math.floor(pairGaps.length * 0.1)];
    const medianGap = pairGaps[Math.floor(pairGaps.length * 0.5)];
    if (p10Gap < 8 || medianGap < 10) continue;

    const sideCount = leftOverlapCount + rightOverlapCount;
    const verticalSpanRatio = pageHeight > 0 ? (overlapMaxY - overlapMinY) / pageHeight : 0;
    const participationRatio = totalBodyCount > 0 ? sideCount / totalBodyCount : 0;

    // 防止单栏页面内部偶发两列表格误触发分栏
    if (sideCount < 8 && participationRatio < 0.35) continue;
    if (participationRatio < 0.2 && verticalSpanRatio < 0.15) continue;

    const score = Math.min(leftOverlapCount, rightOverlapCount) * 10 + sideCount + Math.min(medianGap, 32) * 0.25;
    if (!best || score > best.score) {
      best = { gx, score, minGap: medianGap };
    }
  }

  return best;
}

/**
 * 基于真实水平空白沟道检测页面是否包含并排多栏排版
 */
export function detectPageColumns(lines, pageWidth, pageHeight) {
  if (!Array.isArray(lines) || lines.length < 6 || !pageWidth) {
    return { isMultiColumn: false, gutters: [] };
  }

  const bodyLines = lines.filter(l => l && l.w >= 12 && l.text && l.text.trim().length >= 2);
  if (bodyLines.length < 6) {
    return { isMultiColumn: false, gutters: [] };
  }

  const primary = findBestGutterInRange(bodyLines, pageWidth * 0.22, pageWidth * 0.78, pageHeight, bodyLines.length);
  if (!primary) {
    return { isMultiColumn: false, gutters: [] };
  }

  const gutters = [primary.gx];
  const minSubGap = pageWidth * 0.16;

  // 检测潜在三栏左/右侧子沟道
  const leftSub = bodyLines.filter(l => l.x + l.w <= primary.gx + 2);
  const leftGutter = findBestGutterInRange(leftSub, pageWidth * 0.16, primary.gx - minSubGap, pageHeight, bodyLines.length);
  if (leftGutter) gutters.push(leftGutter.gx);

  const rightSub = bodyLines.filter(l => l.x >= primary.gx - 2);
  const rightGutter = findBestGutterInRange(rightSub, primary.gx + minSubGap, pageWidth * 0.84, pageHeight, bodyLines.length);
  if (rightGutter) gutters.push(rightGutter.gx);

  gutters.sort((a, b) => a - b);
  return { isMultiColumn: true, gutters };
}

/**
 * 依据真实单/多栏布局对文本行进行排序（单栏直接 Y 降序，多栏按通栏/分栏水平带切分）
 */
export function orderLinesByLayout(processedLines, pageWidth, pageHeight) {
  if (!Array.isArray(processedLines) || processedLines.length === 0) {
    return { orderedLines: [], isMultiColumn: false, gutters: [] };
  }

  const { isMultiColumn, gutters } = detectPageColumns(processedLines, pageWidth, pageHeight);

  if (!isMultiColumn) {
    const sorted = processedLines.map(line => ({
      ...line,
      isSpan: false,
      colIndex: 0,
      bandIndex: 0
    })).sort((a, b) => {
      if (Math.abs(a.y - b.y) > 3) return b.y - a.y;
      return a.x - b.x;
    });
    return { orderedLines: sorted, isMultiColumn: false, gutters: [] };
  }

  const topDown = processedLines.map((line) => {
    const crossesGutter = gutters.some(gx => line.x < gx - 4 && (line.x + line.w) > gx + 4);
    const center = line.x + line.w / 2;
    let colIndex = 0;
    for (const gx of gutters) {
      if (center > gx) colIndex++;
    }
    return {
      ...line,
      isSpan: crossesGutter,
      colIndex: crossesGutter ? -1 : colIndex,
      bandIndex: 0
    };
  }).sort((a, b) => {
    if (Math.abs(a.y - b.y) > 3) return b.y - a.y;
    return a.x - b.x;
  });

  // 短尾行回正：防止通栏摘要/导言最后一行因宽度未跨沟道被剥离到分栏首行
  for (let i = 1; i < topDown.length; i++) {
    const prev = topDown[i - 1];
    const curr = topDown[i];
    if (!prev.isSpan || curr.isSpan || curr.colIndex !== 0) continue;

    const refH = Math.max(prev.h || 12, curr.h || 12);
    const yDiff = prev.y - curr.y;
    const hasSideBySideOtherCol = topDown.some(o =>
      o !== curr &&
      !o.isSpan &&
      o.colIndex > 0 &&
      Math.abs(o.y - curr.y) <= refH * 1.35
    );

    if (
      !hasSideBySideOtherCol &&
      yDiff >= 0 &&
      yDiff <= refH * 2.1 &&
      Math.abs(curr.x - prev.x) <= 22 &&
      Math.abs((curr.fontSize || 12) - (prev.fontSize || 12)) <= 1.8
    ) {
      curr.isSpan = true;
      curr.colIndex = -1;
    }
  }

  // 按通栏行与分栏行切分为交替水平带
  const bands = [];
  for (const line of topDown) {
    const bandType = line.isSpan ? 'span' : 'cols';
    const lastBand = bands[bands.length - 1];
    if (!lastBand || lastBand.type !== bandType) {
      bands.push({ type: bandType, lines: [line] });
    } else {
      lastBand.lines.push(line);
    }
  }

  const orderedLines = [];
  bands.forEach((band, bIdx) => {
    if (band.type === 'span') {
      band.lines.sort((a, b) => (Math.abs(a.y - b.y) > 3 ? b.y - a.y : a.x - b.x));
      for (const l of band.lines) {
        l.bandIndex = bIdx;
        l.colIndex = 0;
        orderedLines.push(l);
      }
    } else {
      const colBuckets = new Map();
      for (const l of band.lines) {
        l.bandIndex = bIdx;
        if (!colBuckets.has(l.colIndex)) colBuckets.set(l.colIndex, []);
        colBuckets.get(l.colIndex).push(l);
      }
      const sortedColIds = Array.from(colBuckets.keys()).sort((a, b) => a - b);
      for (const cid of sortedColIds) {
        const colLines = colBuckets.get(cid);
        colLines.sort((a, b) => (Math.abs(a.y - b.y) > 3 ? b.y - a.y : a.x - b.x));
        orderedLines.push(...colLines);
      }
    }
  });

  return { orderedLines, isMultiColumn: true, gutters };
}

/**
 * 相邻译文块边界裁剪，避免降部安全外扩导致上下段落轻微压盖
 */
export function clampAdjacentBlockBoxes(blocks) {
  if (!Array.isArray(blocks) || blocks.length < 2) return blocks;

  const entries = [];
  for (const block of blocks) {
    if (!block || block.type === 'formula') continue;
    if (Array.isArray(block.segmentBoxes) && block.segmentBoxes.length > 0) {
      for (const seg of block.segmentBoxes) {
        if (seg && seg.box) entries.push({ box: seg.box, raw: seg.rawBounds });
      }
    } else if (block.box) {
      entries.push({ box: block.box, raw: block._rawBounds });
    }
  }

  // 从上到下（PDF Y 轴由高到低）排序
  entries.sort((a, b) => (b.box.y + b.box.h) - (a.box.y + a.box.h));

  for (let i = 0; i < entries.length; i++) {
    const upper = entries[i];
    for (let j = i + 1; j < entries.length; j++) {
      const lower = entries[j];
      const overlapX = Math.min(upper.box.x + upper.box.w, lower.box.x + lower.box.w) - Math.max(upper.box.x, lower.box.x);
      const minW = Math.min(upper.box.w, lower.box.w);
      if (overlapX <= 0 || (minW > 0 && overlapX < Math.min(8, minW * 0.25))) continue;

      const lowerTop = lower.box.y + lower.box.h;
      if (upper.box.y < lowerTop) {
        const rawGapMid = (upper.raw && lower.raw)
          ? (upper.raw.minY + lower.raw.maxY) / 2
          : (upper.box.y + lowerTop) / 2;
        const splitY = Math.round(Math.max(lower.box.y + 4, Math.min(upper.box.y + upper.box.h - 4, rawGapMid)) * 100) / 100;

        if (splitY > upper.box.y && splitY < upper.box.y + upper.box.h) {
          upper.box.h = Math.round(Math.max(4, (upper.box.y + upper.box.h) - splitY) * 100) / 100;
          upper.box.y = splitY;
        }
        if (lowerTop > splitY && splitY > lower.box.y) {
          lower.box.h = Math.round(Math.max(4, splitY - lower.box.y) * 100) / 100;
        }
      }
    }
  }

  for (const block of blocks) {
    if (block && block._rawBounds) delete block._rawBounds;
    if (Array.isArray(block?.segmentBoxes)) {
      for (const seg of block.segmentBoxes) {
        if (seg && seg.rawBounds) delete seg.rawBounds;
      }
    }
  }

  return blocks;
}

/**
 * 将已按物理阅读顺序排列的线段聚合成段落/标题/图表/公式块
 */
export function buildParagraphBlocks(orderedLines, options = {}) {
  const {
    pageWidth = 600,
    pageHeight = 800,
    pageNum = 1,
    isMultiColumn = false,
    isFormulaText = () => false,
    isChartCaption = () => false,
    reconstructText = (t) => t
  } = options;

  if (!Array.isArray(orderedLines) || orderedLines.length === 0) return [];

  // 统计当前页正文主导字体与主字号，识别未在字体名标注 bold 的标题句柄
  const fontCharWeights = new Map();
  const sizeCharWeights = new Map();
  for (const l of orderedLines) {
    const len = (l.text || '').trim().length;
    const weight = len >= 25 ? len : Math.max(1, Math.floor(len * 0.2));
    if (l.dominantFontName) {
      fontCharWeights.set(l.dominantFontName, (fontCharWeights.get(l.dominantFontName) || 0) + weight);
    }
    const bucketSize = Math.round((l.fontSize || 12) * 2) / 2;
    sizeCharWeights.set(bucketSize, (sizeCharWeights.get(bucketSize) || 0) + weight);
  }

  let bodyFontName = '';
  let maxFontW = -1;
  fontCharWeights.forEach((w, name) => {
    if (w > maxFontW) { maxFontW = w; bodyFontName = name; }
  });

  let bodyFontSize = 11;
  let maxSizeW = -1;
  sizeCharWeights.forEach((w, sz) => {
    if (w > maxSizeW) { maxSizeW = w; bodyFontSize = sz; }
  });

  const blocks = [];
  let currentParagraphLines = [];
  let seqCounter = 0;

  function makeId() {
    seqCounter += 1;
    return `block-p${pageNum}-${seqCounter}`;
  }

  function flushParagraph() {
    if (currentParagraphLines.length === 0) return;

    const rawJoined = currentParagraphLines.map(l => l.text).join('\n');
    const mergedText = reconstructText(rawJoined);

    if (mergedText && mergedText.trim()) {
      const paddedFull = buildPaddedBox(currentParagraphLines, pageWidth, pageHeight);
      const minY = paddedFull.rawBounds.minY;
      const maxY = paddedFull.rawBounds.maxY;
      const avgFontSize = currentParagraphLines.reduce((s, l) => s + (l.fontSize || 12), 0) / currentParagraphLines.length;

      // 计算块内主导字体以辅助判定匿名粗体标题
      const blockFontWeights = new Map();
      for (const l of currentParagraphLines) {
        const fname = l.dominantFontName || l.fontName || '';
        blockFontWeights.set(fname, (blockFontWeights.get(fname) || 0) + (l.text || '').length);
      }
      let blockDomFont = '';
      let maxBFW = -1;
      blockFontWeights.forEach((w, name) => {
        if (w > maxBFW) { maxBFW = w; blockDomFont = name; }
      });

      const explicitBold = currentParagraphLines.some(l => l.isBold);
      const cleanMerged = mergedText.trim();
      const looksLikeHeadingText = currentParagraphLines.length <= 2 &&
        cleanMerged.length <= 85 &&
        !/[\.,;!?。！？]$/.test(cleanMerged) &&
        (
          HEADING_KEYWORD_RE.test(cleanMerged) ||
          /^(?:\d+(?:\.\d+)*|[IVX]+)\s+[A-Z\u4e00-\u9fa5]/.test(cleanMerged) ||
          (bodyFontName && blockDomFont && blockDomFont !== bodyFontName && avgFontSize >= bodyFontSize - 0.5)
        );
      const isBold = explicitBold || looksLikeHeadingText;

      // 页眉页脚兜底过滤
      const isBlockFooter = (minY < 48 && (avgFontSize <= 11.5 || /copyright|all\s*rights|©/i.test(cleanMerged)));
      const isBlockHeader = (maxY > pageHeight - 50 && avgFontSize <= 11.5 && !(pageNum === 1 && avgFontSize >= 15));
      if (isBlockFooter || isBlockHeader) {
        currentParagraphLines = [];
        return;
      }

      let blockType = 'paragraph';
      if (currentParagraphLines.some(l => l.isCaption) || avgFontSize <= 9.2 || isChartCaption(cleanMerged)) {
        blockType = 'caption';
      } else if (avgFontSize >= 15 || looksLikeHeadingText || (isBold && avgFontSize >= 11.5 && currentParagraphLines.length <= 2 && cleanMerged.length <= 90)) {
        blockType = 'heading';
      }

      // 仅当真实多栏且本段落确实跨越多个栏位时，按栏拆分为多段几何覆盖区（禁止单栏长段塌缩成 1 行！）
      const colSegmentsMap = [];
      for (const l of currentParagraphLines) {
        const key = isMultiColumn ? `${l.bandIndex || 0}:${l.colIndex || 0}` : '0:0';
        const prevSeg = colSegmentsMap[colSegmentsMap.length - 1];
        if (!prevSeg || prevSeg.key !== key) {
          colSegmentsMap.push({ key, colIndex: l.colIndex || 0, lines: [l] });
        } else {
          prevSeg.lines.push(l);
        }
      }

      const isCrossColumn = isMultiColumn && colSegmentsMap.length > 1;
      let primaryBox = paddedFull.box;
      let segmentBoxes = null;

      if (isCrossColumn) {
        segmentBoxes = colSegmentsMap.map(seg => {
          const segPadded = buildPaddedBox(seg.lines, pageWidth, pageHeight);
          const charWeight = seg.lines.reduce((s, l) => s + (l.text || '').trim().length, 0) || 1;
          return {
            colIndex: seg.colIndex,
            box: segPadded.box,
            rawBounds: segPadded.rawBounds,
            charWeight
          };
        });
        primaryBox = segmentBoxes[0].box;
      }

      blocks.push({
        id: makeId(),
        pageNum,
        pageHeight,
        layoutVersion: 2,
        colIndex: currentParagraphLines[0].colIndex || 0,
        bandIndex: currentParagraphLines[0].bandIndex || 0,
        type: blockType,
        originalText: cleanMerged,
        isCrossColumn,
        lineBoxes: currentParagraphLines.map(l => ({ ...l.box })),
        box: primaryBox,
        segmentBoxes,
        _rawBounds: isCrossColumn ? undefined : paddedFull.rawBounds,
        style: {
          fontSize: Math.round(avgFontSize * 10) / 10,
          isBold,
          fontName: blockDomFont || currentParagraphLines[0].fontName || ''
        }
      });
    }

    currentParagraphLines = [];
  }

  for (let i = 0; i < orderedLines.length; i++) {
    const lineObj = orderedLines[i];
    const text = lineObj.text;

    if (isFormulaText(text)) {
      flushParagraph();
      const paddedFormula = buildPaddedBox([lineObj], pageWidth, pageHeight);
      blocks.push({
        id: makeId(),
        pageNum,
        pageHeight,
        layoutVersion: 2,
        colIndex: lineObj.colIndex || 0,
        bandIndex: lineObj.bandIndex || 0,
        type: 'formula',
        originalText: text,
        box: paddedFormula.box,
        style: {
          fontSize: Math.round((lineObj.fontSize || 12) * 10) / 10,
          isBold: Boolean(lineObj.isBold),
          fontName: lineObj.fontName || ''
        }
      });
      continue;
    }

    if (isChartCaption(text)) {
      if (currentParagraphLines.length > 0) flushParagraph();
      lineObj.isCaption = true;
    }

    if (currentParagraphLines.length > 0) {
      const prevLine = currentParagraphLines[currentParagraphLines.length - 1];
      const lineGap = prevLine.y - lineObj.y;
      const avgH = Math.max(6, ((prevLine.h || 12) + (lineObj.h || 12)) / 2);
      const fontDiff = Math.abs((prevLine.fontSize || 12) - (lineObj.fontSize || 12));
      const xOffset = Math.abs(prevLine.x - lineObj.x);

      const prevText = prevLine.text.trim();
      const currText = lineObj.text.trim();

      const prevEndsWithTerminal = /[\.\?!。？！:：]$/.test(prevText);
      const prevEndsWithHyphen = /[a-zA-Z][-—]\s*$/.test(prevText);
      const currStartsWithLower = /^[a-z]/.test(currText);
      const currIsListItem = /^([-*•·]|(?:\d+|[a-zA-Z])[\.)])\s+/.test(currText);

      // 字体句柄与字号切换判定（解决 PDF.js fontName 不含 "Bold" 时小标题与正文粘连的问题）
      const prevFont = prevLine.dominantFontName || prevLine.fontName || '';
      const currFont = lineObj.dominantFontName || lineObj.fontName || '';
      const isFontSwitch = Boolean(prevFont && currFont && prevFont !== currFont && (prevLine.isUniformFont || lineObj.isUniformFont));
      const isHeadingToBodyFont = isFontSwitch && bodyFontName && prevFont !== bodyFontName && currFont === bodyFontName && prevText.length <= 75 && !/[,\-]$/.test(prevText);
      const isBodyToHeadingFont = isFontSwitch && bodyFontName && prevFont === bodyFontName && currFont !== bodyFontName && currText.length <= 75 && !prevEndsWithHyphen && (prevEndsWithTerminal || lineGap > avgH * 1.25 || HEADING_KEYWORD_RE.test(currText));

      const isHeaderStyleChange =
        fontDiff > 1.8 ||
        (prevLine.isBold !== lineObj.isBold && (prevText.length < 75 || currText.length < 75)) ||
        isHeadingToBodyFont ||
        isBodyToHeadingFont ||
        HEADING_KEYWORD_RE.test(prevText) ||
        HEADING_KEYWORD_RE.test(currText);

      const isBandOrColChange = isMultiColumn && (
        (lineObj.bandIndex !== prevLine.bandIndex) ||
        (lineObj.colIndex !== prevLine.colIndex) ||
        (lineGap < -5)
      );

      let shouldBreak = false;

      // 仅在真实多栏、相邻栏衔接、且前一行严格未出现终结标点时才允许跨栏缝合
      const isCrossColumnContinuation =
        isMultiColumn &&
        lineObj.bandIndex === prevLine.bandIndex &&
        lineObj.colIndex === prevLine.colIndex + 1 &&
        !isHeaderStyleChange &&
        !currIsListItem &&
        !prevEndsWithTerminal &&
        (prevEndsWithHyphen || currStartsWithLower || prevText.length > 20);

      const isCaptionCollecting = currentParagraphLines.some(l => l.isCaption);
      if (isCaptionCollecting && !prevEndsWithTerminal && lineGap >= 0 && lineGap < avgH * 2.2 && !isBandOrColChange) {
        shouldBreak = false;
      } else if (isCrossColumnContinuation) {
        shouldBreak = false;
      } else if (isBandOrColChange || isHeaderStyleChange || currIsListItem || lineGap < -5) {
        shouldBreak = true;
      } else if (prevEndsWithHyphen || currStartsWithLower) {
        shouldBreak = (lineGap > avgH * 3.0);
      } else if (!prevEndsWithTerminal) {
        shouldBreak = (lineGap > avgH * 2.2) || (xOffset > 45 && !lineObj.isSpan);
      } else {
        shouldBreak = (lineGap > avgH * 1.75) || (lineObj.x - prevLine.x > 14);
      }

      if (shouldBreak) {
        flushParagraph();
      }
    }

    currentParagraphLines.push(lineObj);
  }

  flushParagraph();
  return clampAdjacentBlockBoxes(blocks);
}

/**
 * 基于区块内部与边缘像素分布统计判定真实前景色与背景色，彻底消除单点擦边误判导致的“黑底白字”
 */
export function classifyColorsFromSamples(pageBgRgb, interiorPixels, borderPixels = []) {
  const safePageBg = Array.isArray(pageBgRgb) && pageBgRgb.length >= 3 ? pageBgRgb : [255, 255, 255];
  const pageBgStr = `rgb(${safePageBg[0]}, ${safePageBg[1]}, ${safePageBg[2]})`;
  const pageIsLight = computeLuminance(safePageBg[0], safePageBg[1], safePageBg[2]) >= 195;

  if (!Array.isArray(interiorPixels) || interiorPixels.length === 0) {
    return {
      bgColor: pageBgStr,
      color: pageIsLight ? '#1c1c1e' : '#ffffff'
    };
  }

  // 1. 统计区块内部像素 16 级量化主色簇
  const buckets = new Map();
  for (const px of interiorPixels) {
    const key = `${px[0] >> 4},${px[1] >> 4},${px[2] >> 4}`;
    let b = buckets.get(key);
    if (!b) {
      b = { count: 0, sumR: 0, sumG: 0, sumB: 0 };
      buckets.set(key, b);
    }
    b.count++;
    b.sumR += px[0];
    b.sumG += px[1];
    b.sumB += px[2];
  }

  let dominantBucket = null;
  for (const b of buckets.values()) {
    if (!dominantBucket || b.count > dominantBucket.count) {
      dominantBucket = b;
    }
  }

  let bgRgb = [
    Math.round(dominantBucket.sumR / dominantBucket.count),
    Math.round(dominantBucket.sumG / dominantBucket.count),
    Math.round(dominantBucket.sumB / dominantBucket.count)
  ];
  const domShare = dominantBucket.count / interiorPixels.length;
  const domLuma = computeLuminance(bgRgb[0], bgRgb[1], bgRgb[2]);

  // 白纸底防污染校验：文字墨迹仅占 10%~25%，纸底占 70%+；
  // 若页底为浅白，只有当内部主色占比较高且边缘样本支持深底卡片时，才保留非白底色
  if (pageIsLight) {
    const distFromPageBg = Math.abs(bgRgb[0] - safePageBg[0]) + Math.abs(bgRgb[1] - safePageBg[1]) + Math.abs(bgRgb[2] - safePageBg[2]);
    if (distFromPageBg < 36) {
      bgRgb = safePageBg;
    } else if (domLuma < 175) {
      let borderDarkMatch = 0;
      for (const bp of borderPixels) {
        const d = Math.abs(bp[0] - bgRgb[0]) + Math.abs(bp[1] - bgRgb[1]) + Math.abs(bp[2] - bgRgb[2]);
        if (d < 45) borderDarkMatch++;
      }
      const borderSupport = borderPixels.length > 0 ? borderDarkMatch / borderPixels.length : 0;
      const isTrueDarkCard = (domShare >= 0.55 && borderSupport >= 0.4) || domShare >= 0.72;
      if (!isTrueDarkCard) {
        bgRgb = safePageBg;
      }
    }
  }

  // 2. 提取文字前景色（过滤单个边缘抗锯齿噪点，优先显著彩色群或高对比墨色）
  const inkPixels = [];
  for (const px of interiorPixels) {
    const dist = Math.abs(px[0] - bgRgb[0]) + Math.abs(px[1] - bgRgb[1]) + Math.abs(px[2] - bgRgb[2]);
    if (dist > 60) {
      const spread = Math.max(Math.abs(px[0] - px[1]), Math.abs(px[0] - px[2]), Math.abs(px[1] - px[2]));
      inkPixels.push({ px, dist, spread });
    }
  }

  let fgRgb = computeLuminance(bgRgb[0], bgRgb[1], bgRgb[2]) < 140 ? [255, 255, 255] : [28, 28, 30];
  if (inkPixels.length > 0) {
    const chromatic = inkPixels.filter(it => it.spread > 38 && it.dist > 80);
    if (chromatic.length >= 3) {
      chromatic.sort((a, b) => b.dist - a.dist);
      fgRgb = chromatic[Math.min(Math.floor(chromatic.length * 0.25), chromatic.length - 1)].px;
    } else {
      inkPixels.sort((a, b) => b.dist - a.dist);
      // 取高对比度区间偏稳健值，避开纯黑白二值边缘极端点
      fgRgb = inkPixels[Math.min(Math.floor(inkPixels.length * 0.2), inkPixels.length - 1)].px;
    }
  }

  // 3. WCAG AA 可读对比度兜底 (>= 4.5:1)
  if (contrastRatio(fgRgb, bgRgb) < 4.5) {
    fgRgb = computeLuminance(bgRgb[0], bgRgb[1], bgRgb[2]) < 140 ? [255, 255, 255] : [28, 28, 30];
  }

  return {
    bgColor: `rgb(${bgRgb[0]}, ${bgRgb[1]}, ${bgRgb[2]})`,
    color: `rgb(${fgRgb[0]}, ${fgRgb[1]}, ${fgRgb[2]})`
  };
}

/**
 * 将跨栏缝合段落的完整译文按字符权重与自然标点拆分回各栏独立覆盖框
 */
export function splitTranslationForSegments(text, segmentBoxes) {
  const clean = String(text || '');
  if (!Array.isArray(segmentBoxes) || segmentBoxes.length <= 1) return [clean];
  if (!clean) return segmentBoxes.map(() => '');

  const totalWeight = segmentBoxes.reduce((s, seg) => s + Math.max(1, seg.charWeight || 1), 0);
  const parts = [];
  let cursor = 0;

  for (let i = 0; i < segmentBoxes.length; i++) {
    if (i === segmentBoxes.length - 1) {
      parts.push(clean.slice(cursor).trim());
      break;
    }
    const weight = Math.max(1, segmentBoxes[i].charWeight || 1);
    const estLen = Math.max(1, Math.round((clean.length * weight) / totalWeight));
    const targetIdx = Math.min(clean.length - 1, cursor + estLen);

    const searchRadius = Math.max(8, Math.min(28, Math.floor(estLen * 0.35)));
    const minSearch = Math.max(cursor + 1, targetIdx - searchRadius);
    const maxSearch = Math.min(clean.length - 1, targetIdx + searchRadius);

    let splitAt = targetIdx;
    let bestScore = Infinity;
    for (let pos = minSearch; pos <= maxSearch; pos++) {
      const ch = clean[pos - 1];
      let penalty = Math.abs(pos - targetIdx);
      if ('。！？；.!?;'.includes(ch)) penalty -= 18;
      else if ('，、,: '.includes(ch)) penalty -= 8;
      if (penalty < bestScore) {
        bestScore = penalty;
        splitAt = pos;
      }
    }

    parts.push(clean.slice(cursor, splitAt).trim());
    cursor = splitAt;
  }

  return parts;
}

