// 博士级全学科多语种学术术语库总汇编与扩充引擎
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { organicCatalysisTerms } from './data/organic_catalysis.js';
import { biochemMetabolismTerms } from './data/biochem_metabolism.js';
import { molecularGenomicsTerms } from './data/molecular_genomics.js';
import { structuralBiophysicsTerms } from './data/structural_biophysics.js';
import { cellBiologyTerms } from './data/cell_biology_signaling.js';
import { immunologyBiologicsTerms } from './data/immunology_biologics.js';
import { medicinalChemDmpkTerms } from './data/medicinal_chem_dmpk.js';
import { analyticalMassSpecTerms } from './data/analytical_mass_spec.js';
import { materialsNanocatalysisTerms } from './data/materials_nanocatalysis.js';
import { inorganicSupramolecularTerms } from './data/inorganic_supramolecular.js';
import { neurobiologyElectrophysTerms } from './data/neurobiology_electrophys.js';
import { syntheticBiologyTerms } from './data/synthetic_biology.js';
import { academicLatinTerms } from './data/academic_latin_multilingual.js';
import { extendedDoctoralTerms } from './data/extended_disciplines.js';
import { doctoralExpansion2Terms } from './data/doctoral_expansion_2.js';
import { doctoralExpansion3Terms } from './data/doctoral_expansion_3.js';
import { chemOrganicReagentsMechanismsTerms } from './data/chem_organic_reagents_mechanisms.js';
import { chemPhysicalQuantumTerms } from './data/chem_physical_quantum_computational.js';
import { chemInorganicElectroPolymerGreenTerms } from './data/chem_inorganic_electro_polymer_green.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 1. 读取旧版基础词条
const oldDataPath = path.join(__dirname, '../data/biochem_terms.json');
const extDataPath = path.join(__dirname, '../../src/data/biochem_terms.json');
let legacyTerms = {};
if (fs.existsSync(oldDataPath)) {
  try {
    const raw = JSON.parse(fs.readFileSync(oldDataPath, 'utf-8'));
    legacyTerms = raw.terms || {};
  } catch (e) {
    console.warn('读取旧版词条失败:', e.message);
  }
}

// 常见国际标准缩写对照
const knownAbbrs = {
  "polymerase chain reaction": "PCR",
  "reverse transcription": "RT",
  "reverse transcription polymerase chain reaction": "RT-PCR",
  "quantitative real-time polymerase chain reaction": "qPCR",
  "western blot": "WB",
  "western blotting": "WB",
  "sodium dodecyl sulfate polyacrylamide gel electrophoresis": "SDS-PAGE",
  "nuclear magnetic resonance": "NMR",
  "high performance liquid chromatography": "HPLC",
  "high-performance liquid chromatography": "HPLC",
  "ultra-high performance liquid chromatography": "UHPLC",
  "mass spectrometry": "MS",
  "gas chromatography": "GC",
  "gas chromatography-mass spectrometry": "GC-MS",
  "liquid chromatography-mass spectrometry": "LC-MS",
  "enzyme linked immunosorbent assay": "ELISA",
  "enzyme-linked immunosorbent assay": "ELISA",
  "chromatin immunoprecipitation": "ChIP",
  "chromatin immunoprecipitation sequencing": "ChIP-seq",
  "surface plasmon resonance": "SPR",
  "isothermal titration calorimetry": "ITC",
  "transmission electron microscopy": "TEM",
  "scanning electron microscopy": "SEM",
  "atomic force microscopy": "AFM",
  "dynamic light scattering": "DLS",
  "density functional theory": "DFT",
  "metal-organic framework": "MOF",
  "metal organic framework": "MOF",
  "covalent organic framework": "COF",
  "enantiomeric excess": "ee",
  "diastereomeric excess": "de",
  "structure-activity relationship": "SAR",
  "structure activity relationship": "SAR",
  "quantitative structure-activity relationship": "QSAR",
  "blood-brain barrier": "BBB",
  "blood brain barrier": "BBB",
  "reactive oxygen species": "ROS",
  "extracellular matrix": "ECM",
  "long-term potentiation": "LTP",
  "long term potentiation": "LTP",
  "long-term depression": "LTD",
  "gamma-aminobutyric acid": "GABA",
  "central nervous system": "CNS",
  "fluorescence resonance energy transfer": "FRET",
  "chimeric antigen receptor": "CAR",
  "monoclonal antibody": "mAb",
  "polyclonal antibody": "pAb",
  "antibody-drug conjugate": "ADC",
  "single-chain variable fragment": "scFv",
  "cryo-electron microscopy": "Cryo-EM",
  "single-particle analysis": "SPA",
  "cryo-electron tomography": "Cryo-ET",
  "fourier transform infrared spectroscopy": "FTIR",
  "x-ray photoelectron spectroscopy": "XPS",
  "x-ray powder diffraction": "PXRD",
  "selected reaction monitoring": "SRM",
  "multiple reaction monitoring": "MRM",
  "parallel reaction monitoring": "PRM",
  "data-dependent acquisition": "DDA",
  "data-independent acquisition": "DIA",
  "limit of detection": "LOD",
  "limit of quantitation": "LOQ",
  "signal-to-noise ratio": "S/N"
};

// 学科关键词归类逻辑
function inferCategory(term, zh) {
  const t = term.toLowerCase();
  const z = zh || '';
  if (t.includes('chiral') || t.includes('enantio') || t.includes('stereochem') || t.includes('racem') || z.includes('手性') || z.includes('异构')) return '有机化学/立体化学';
  if (t.includes('coupling') || t.includes('palladium') || t.includes('cataly') || z.includes('偶联') || z.includes('催化')) return '有机化学/催化反应';
  if (t.includes('dna') || t.includes('rna') || t.includes('pcr') || t.includes('transcript') || z.includes('基因') || z.includes('转录') || z.includes('测序')) return '分子生物学/基因工程';
  if (t.includes('protein') || t.includes('enzyme') || t.includes('peptid') || t.includes('amino acid') || z.includes('蛋白') || z.includes('酶') || z.includes('肽')) return '生物化学/蛋白质科学';
  if (t.includes('cell') || t.includes('membrane') || t.includes('mitochond') || z.includes('细胞') || z.includes('线粒体') || z.includes('溶酶体')) return '细胞生物学/细胞器';
  if (t.includes('antibod') || t.includes('immun') || t.includes('antigen') || z.includes('抗体') || z.includes('免疫')) return '免疫学/生物制品';
  if (t.includes('chromatograph') || t.includes('spectr') || t.includes('electrophoresis') || z.includes('色谱') || z.includes('质谱') || z.includes('光谱')) return '分析化学/仪器表征';
  if (t.includes('nano') || t.includes('framework') || t.includes('material') || z.includes('纳米') || z.includes('骨架') || z.includes('材料')) return '材料化学/纳米科学';
  if (t.includes('neuro') || t.includes('synap') || t.includes('brain') || z.includes('神经') || z.includes('脑') || z.includes('突触')) return '神经生物学/脑科学';
  if (t.includes('drug') || t.includes('pharmac') || t.includes('inhibitor') || z.includes('药') || z.includes('抑制剂') || z.includes('活性')) return '药物化学/药理学';
  return '生化交叉学科/通用学术';
}

// 自动生成英文字符规范大写 (Title Case)
function toCanonicalEnglish(str) {
  if (!str) return '';
  return str.split(' ').map((word, i) => {
    if (i > 0 && ['of', 'and', 'in', 'on', 'with', 'by', 'for', 'to', 'at'].includes(word.toLowerCase())) {
      return word.toLowerCase();
    }
    return word.charAt(0).toUpperCase() + word.slice(1);
  }).join(' ');
}

const masterDictionary = {};

const AMBIGUOUS_STOPWORDS = new Set([
  'as', 'be', 'is', 'me', 'her', 'hat', 'set', 'tea', 'bet', 'elf', 'pet', 'mom',
  'mr', 'om', 'al', 'pe', 'de', 'ea', 'ac', 'kr', 'rt', 'ce', 'cl', 'ti', 'pi',
  'in', 'on', 'at', 'to', 'of', 'or', 'no', 'so', 'by', 'it', 'an', 'am', 'pm',
  'pop', 'ice', 'cat', 'pin', 'she', 'red', 'gas', 'ion', 'age', 'run', 'bar',
  'pad', 'sap', 'arc', 'map', 'peg', 'pan', 'pep', 'sin', 'cos', 'tan', 'dry',
  'wet', 'hot', 'old', 'new', 'air', 'oil', 'ash', 'wax', 'tar', 'dye', 'ore', 'gel',
  'del', 'etc'
]);

// 2. 将旧版词条提升为富对象结构（过滤停用词与历史二次编译产生的异常复数派生键，保障多次编译幂等）
for (const [key, val] of Object.entries(legacyTerms)) {
  const normKey = key.trim().toLowerCase();
  if (AMBIGUOUS_STOPWORDS.has(normKey)) continue;
  const rawEn = (val && typeof val === 'object') ? String(val.en || '') : '';
  const rawZh = (val && typeof val === 'object') ? String(val.zh || val.translation || '') : String(val || '');
  if (rawEn.includes('(复数)') || rawZh.includes(' 缩写)')) continue;
  if (/(?:ieses|rses|tses|icses|mses|nses|dses|sis(?:es))$/i.test(normKey)) continue;
  const canonicalEn = toCanonicalEnglish(normKey);
  const zh = rawZh;
  const abbr = knownAbbrs[normKey] || (typeof val === 'object' ? val.abbr : '') || '';
  const category = (typeof val === 'object' ? val.category : '') || inferCategory(normKey, zh);
  const otherLangs = (typeof val === 'object' ? val.otherLangs : {}) || {};

  masterDictionary[normKey] = {
    en: canonicalEn,
    zh: zh,
    abbr: abbr,
    category: category,
    otherLangs: otherLangs
  };
}

// 3. 汇聚全部高精学科模块
const curatedModules = [
  ...organicCatalysisTerms,
  ...biochemMetabolismTerms,
  ...molecularGenomicsTerms,
  ...structuralBiophysicsTerms,
  ...cellBiologyTerms,
  ...immunologyBiologicsTerms,
  ...medicinalChemDmpkTerms,
  ...analyticalMassSpecTerms,
  ...materialsNanocatalysisTerms,
  ...inorganicSupramolecularTerms,
  ...neurobiologyElectrophysTerms,
  ...syntheticBiologyTerms,
  ...academicLatinTerms,
  ...extendedDoctoralTerms,
  ...doctoralExpansion2Terms,
  ...doctoralExpansion3Terms,
  ...chemOrganicReagentsMechanismsTerms,
  ...chemPhysicalQuantumTerms,
  ...chemInorganicElectroPolymerGreenTerms
];

// 与常见英文单词同形的缩写仅保留为词条元数据，不单独注入小写索引，避免全文误匹配
const AMBIGUOUS_ABBRS = new Set([
  'A', 'C', 'G', 'T', 'U', 'N', 'K', 'M', 'V', 'DG', 'PG', 'AE', 'OA', 'RE',
  'SET', 'HAT', 'TEA', 'POP', 'BET', 'ICE', 'CAT', 'PIN', 'SHE', 'RED',
  'GAS', 'ION', 'AGE', 'RUN', 'BAR', 'PAD', 'SAP', 'ARC', 'MAP', 'PEG',
  'PAN', 'PEP', 'SIN', 'COS', 'TAN', 'DRY', 'WET', 'HOT', 'OLD', 'NEW',
  'AIR', 'OIL', 'ASH', 'WAX', 'TAR', 'DYE', 'ORE', 'GEL', 'HER',
  'ELF', 'PET', 'MOM', 'DEL', 'ETC'
]);

for (const item of curatedModules) {
  const normKey = item.en.trim().toLowerCase();
  masterDictionary[normKey] = {
    en: item.en,
    zh: item.zh,
    abbr: item.abbr || '',
    category: item.category,
    otherLangs: item.otherLangs || {}
  };

  // 注入无歧义缩写索引，确保缩写命中
  const rawAbbr = (item.abbr || '').trim();
  const upperAbbr = rawAbbr.toUpperCase();
  if (rawAbbr.length >= 3 && !/\s/.test(rawAbbr) && !AMBIGUOUS_ABBRS.has(upperAbbr)) {
    const abbrKey = rawAbbr.toLowerCase();
    if (!masterDictionary[abbrKey]) {
      masterDictionary[abbrKey] = {
        en: rawAbbr,
        zh: `${item.zh} (${item.en} 缩写)`,
        abbr: rawAbbr,
        category: item.category,
        otherLangs: item.otherLangs || {}
      };
    }
  }
}

// 4. 生化与化学 IUPAC 系统性衍生词典扩展 (构建全面化学官能团、生化单体、生物物理指标)
const functionalGroups = [
  { en: "Hydroxyl group", zh: "羟基 (-OH)", de: "Hydroxylgruppe", fr: "groupe hydroxyle", cat: "有机化学/官能团" },
  { en: "Carboxyl group", zh: "羧基 (-COOH)", de: "Carboxylgruppe", fr: "groupe carboxyle", cat: "有机化学/官能团" },
  { en: "Amino group", zh: "氨基 (-NH2)", de: "Aminogruppe", fr: "groupe aminé", cat: "有机化学/官能团" },
  { en: "Carbonyl group", zh: "羰基 (C=O)", de: "Carbonylgruppe", fr: "groupe carbonyle", cat: "有机化学/官能团" },
  { en: "Aldehyde group", zh: "醛基 (-CHO)", de: "Aldehydgruppe", fr: "groupe aldéhyde", cat: "有机化学/官能团" },
  { en: "Keto group", zh: "酮羰基 (C=O)", de: "Ketogruppe", fr: "groupe cétone", cat: "有机化学/官能团" },
  { en: "Sulfhydryl group", zh: "巯基 (-SH，硫醇基)", de: "Sulfhydrylgruppe", fr: "groupe sulfhydryle", cat: "有机化学/官能团" },
  { en: "Phosphate group", zh: "磷酸基 (-PO4 2-)", de: "Phosphatgruppe", fr: "groupe phosphate", cat: "生物化学/官能团" },
  { en: "Methyl group", zh: "甲基 (-CH3)", de: "Methylgruppe", fr: "groupe méthyle", cat: "有机化学/烃基" },
  { en: "Ethyl group", zh: "乙基 (-C2H5)", de: "Ethylgruppe", fr: "groupe éthyle", cat: "有机化学/烃基" },
  { en: "Isopropyl group", zh: "异丙基 (-CH(CH3)2)", de: "Isopropylgruppe", fr: "groupe isopropyle", cat: "有机化学/烃基" },
  { en: "tert-Butyl group", zh: "叔丁基 (-C(CH3)3)", de: "tert-Butylgruppe", fr: "groupe tert-butyle", cat: "有机化学/烃基" },
  { en: "Phenyl group", zh: "苯基 (-Ph / -C6H5)", de: "Phenylgruppe", fr: "groupe phényle", cat: "有机化学/芳香基团" },
  { en: "Benzyl group", zh: "苄基 (-Bn / -CH2Ph)", de: "Benzylgruppe", fr: "groupe benzyle", cat: "有机化学/芳香基团" },
  { en: "Trifluoromethyl group", zh: "三氟甲基 (-CF3)", de: "Trifluormethylgruppe", fr: "groupe trifluorométhyle", cat: "药物化学/含氟官能团" },
  { en: "Cyano group", zh: "氰基 (-CN)", de: "Cyanogruppe", fr: "groupe cyano", cat: "有机化学/官能团" },
  { en: "Nitro group", zh: "硝基 (-NO2)", de: "Nitrogruppe", fr: "groupe nitro", cat: "有机化学/官能团" },
  { en: "Azide group", zh: "叠氮基 (-N3)", de: "Azidgruppe", fr: "groupe azoture", cat: "有机化学/点击反应基团" },
  { en: "Alkyne group", zh: "炔基 (-C≡CH)", de: "Alkingruppe", fr: "groupe alcyne", cat: "有机化学/官能团" },
  { en: "Disulfide bond", zh: "二硫键 (-S-S-)", de: "Disulfidbindung", fr: "pont disulfure", cat: "生物化学/蛋白质三级结构" },
  { en: "Peptide bond", zh: "肽键 (-CO-NH-)", de: "Peptidbindung", fr: "liaison peptidique", cat: "生物化学/多肽骨架" },
  { en: "Phosphodiester bond", zh: "磷酸二酯键", de: "Phosphodiesterbindung", fr: "liaison phosphodiester", cat: "分子生物学/核酸骨架" },
  { en: "Glycosidic bond", zh: "糖苷键", de: "Glykosidische Bindung", fr: "liaison glycosidique", cat: "生物化学/糖类化学" },
  { en: "Hydrogen bond", zh: "氢键", de: "Wasserstoffbrückenbindung", fr: "liaison hydrogène", cat: "物理化学/弱相互作用" },
  { en: "Van der Waals forces", zh: "范德华力 (色散力、诱导力、取向力)", de: "Van-der-Waals-Kräfte", fr: "forces de van der Waals", cat: "物理化学/分子间作用力" },
  { en: "Hydrophobic effect", zh: "疏水效应 (熵驱动疏水折叠力)", de: "Hydrophober Effekt", fr: "effet hydrophobe", cat: "生物物理/蛋白质折叠" },
  { en: "Coulombic interaction", zh: "库仑相互作用 (静电相互作用)", de: "Coulomb-Wechselwirkung", fr: "interaction coulombienne", cat: "物理化学/电荷相互作用" }
];

for (const fg of functionalGroups) {
  const normKey = fg.en.toLowerCase();
  if (!masterDictionary[normKey]) {
    masterDictionary[normKey] = {
      en: fg.en,
      zh: fg.zh,
      abbr: "",
      category: fg.cat,
      otherLangs: { de: fg.de, fr: fg.fr }
    };
  }
}

// 5. 氨基酸系统标准中英多语种全集
const aminoAcids = [
  { en: "Alanine", zh: "丙氨酸", abbr: "Ala / A", de: "Alanin", fr: "alanine" },
  { en: "Arginine", zh: "精氨酸", abbr: "Arg / R", de: "Arginin", fr: "arginine" },
  { en: "Asparagine", zh: "天冬酰胺", abbr: "Asn / N", de: "Asparagin", fr: "asparagine" },
  { en: "Aspartic acid", zh: "天冬氨酸", abbr: "Asp / D", de: "Asparaginsäure", fr: "acide aspartique" },
  { en: "Cysteine", zh: "半胱氨酸", abbr: "Cys / C", de: "Cystein", fr: "cystéine" },
  { en: "Glutamic acid", zh: "谷氨酸", abbr: "Glu / E", de: "Glutaminsäure", fr: "acide glutamique" },
  { en: "Glutamine", zh: "谷氨酰胺", abbr: "Gln / Q", de: "Glutamin", fr: "glutamine" },
  { en: "Glycine", zh: "甘氨酸", abbr: "Gly / G", de: "Glycin", fr: "glycine" },
  { en: "Histidine", zh: "组氨酸", abbr: "His / H", de: "Histidin", fr: "histidine" },
  { en: "Isoleucine", zh: "异亮氨酸", abbr: "Ile / I", de: "Isoleucin", fr: "isoleucine" },
  { en: "Leucine", zh: "亮氨酸", abbr: "Leu / L", de: "Leucin", fr: "leucine" },
  { en: "Lysine", zh: "赖氨酸", abbr: "Lys / K", de: "Lysin", fr: "lysine" },
  { en: "Methionine", zh: "甲硫氨酸 (蛋氨酸)", abbr: "Met / M", de: "Methionin", fr: "méthionine" },
  { en: "Phenylalanine", zh: "苯丙氨酸", abbr: "Phe / F", de: "Phenylalanin", fr: "phénylalanine" },
  { en: "Proline", zh: "脯氨酸 (亚氨基酸)", abbr: "Pro / P", de: "Prolin", fr: "proline" },
  { en: "Serine", zh: "丝氨酸", abbr: "Ser / S", de: "Serin", fr: "sérine" },
  { en: "Threonine", zh: "苏氨酸", abbr: "Thr / T", de: "Threonin", fr: "thréonine" },
  { en: "Tryptophan", zh: "色氨酸", abbr: "Trp / W", de: "Tryptophan", fr: "tryptophane" },
  { en: "Tyrosine", zh: "酪氨酸", abbr: "Tyr / Y", de: "Tyrosin", fr: "tyrosine" },
  { en: "Valine", zh: "缬氨酸", abbr: "Val / V", de: "Valin", fr: "valine" },
  { en: "Selenocysteine", zh: "硒半胱氨酸 (第21种天然氨基酸)", abbr: "Sec / U", de: "Selenocystein", fr: "sélénocystéine" },
  { en: "Pyrrolysine", zh: "吡咯赖氨酸 (第22种天然氨基酸)", abbr: "Pyl / O", de: "Pyrrolysin", fr: "pyrrolysine" }
];

for (const aa of aminoAcids) {
  const normKey = aa.en.toLowerCase();
  masterDictionary[normKey] = {
    en: aa.en,
    zh: aa.zh,
    abbr: aa.abbr,
    category: "生物化学/天然氨基酸",
    otherLangs: { de: aa.de, fr: aa.fr }
  };
}

// 6. 核酸碱基与核苷酸全集
const nucleotides = [
  { en: "Adenine", zh: "腺嘌呤", abbr: "Ade / A", de: "Adenin", fr: "adénine" },
  { en: "Guanine", zh: "鸟嘌呤", abbr: "Gua / G", de: "Guanin", fr: "guanine" },
  { en: "Cytosine", zh: "胞嘧啶", abbr: "Cyt / C", de: "Cytosin", fr: "cytosine" },
  { en: "Thymine", zh: "胸腺嘧啶", abbr: "Thy / T", de: "Thymin", fr: "thymine" },
  { en: "Uracil", zh: "尿嘧啶", abbr: "Ura / U", de: "Uracil", fr: "uracile" },
  { en: "Deoxyribonucleic acid", zh: "脱氧核糖核酸", abbr: "DNA", de: "Desoxyribonukleinsäure", fr: "acide désoxyribonucléique" },
  { en: "Ribonucleic acid", zh: "核糖核酸", abbr: "RNA", de: "Ribonukleinsäure", fr: "acide ribonucléique" },
  { en: "Messenger RNA", zh: "信使RNA", abbr: "mRNA", de: "Messenger-RNA", fr: "ARN messager" },
  { en: "Transfer RNA", zh: "转运RNA", abbr: "tRNA", de: "Transfer-RNA", fr: "ARN de transfert" },
  { en: "Ribosomal RNA", zh: "核糖体RNA", abbr: "rRNA", de: "Ribosomale RNA", fr: "ARN ribosomique" }
];

for (const nt of nucleotides) {
  const normKey = nt.en.toLowerCase();
  masterDictionary[normKey] = {
    en: nt.en,
    zh: nt.zh,
    abbr: nt.abbr,
    category: "分子生物学/核酸生化",
    otherLangs: { de: nt.de, fr: nt.fr }
  };
}

// 6.2 经典配体、催化剂与光敏剂全集
const catalystsAndLigands = [
  { en: "Tetrakis(triphenylphosphine)palladium(0)", zh: "四(三苯基膦)钯 (Pd(PPh3)4 常用偶联催化剂)", abbr: "Pd(PPh3)4", cat: "金属有机催化/钯催化", de: "Tetrakis(triphenylphosphin)palladium(0)" },
  { en: "Bis(triphenylphosphine)palladium(II) dichloride", zh: "二氯双(三苯基膦)钯 (Pd(PPh3)2Cl2)", abbr: "Pd(PPh3)2Cl2", cat: "金属有机催化/偶联催化剂" },
  { en: "[1,1'-Bis(diphenylphosphino)ferrocene]dichloropalladium(II)", zh: "二氯[1,1'-双(二苯基膦基)二茂铁]钯 (Pd(dppf)Cl2 铃木偶联优质催化剂)", abbr: "Pd(dppf)Cl2", cat: "金属有机催化/双膦配合物" },
  { en: "Palladium(II) acetate", zh: "醋酸钯 (Pd(OAc)2 常用二价钯源)", abbr: "Pd(OAc)2", cat: "金属有机催化/催化前驱体" },
  { en: "Tris(dibenzylideneacetone)dipalladium(0)", zh: "三(二亚苄基丙酮)二钯 (Pd2(dba)3 零价钯前驱体)", abbr: "Pd2(dba)3", cat: "金属有机催化/零价钯" },
  { en: "Bis(1,5-cyclooctadiene)nickel(0)", zh: "双(1,5-环辛二烯)镍 (Ni(cod)2 常用零价镍源)", abbr: "Ni(cod)2", cat: "过渡金属催化/镍催化" },
  { en: "Copper(I) iodide", zh: "碘化亚铜 (CuI 薗头偶联与乌尔曼偶联常用铜源)", abbr: "CuI", cat: "金属有机催化/一价铜催化" },
  { en: "Dirhodium tetraacetate", zh: "四醋酸二铑 (Rh2(OAc)4 重氮化合物卡宾转移催化剂)", abbr: "Rh2(OAc)4", cat: "金属卡宾催化/环加成" },
  { en: "Tris(2-phenylpyridine)iridium(III)", zh: "三(2-苯基吡啶)铱 (Ir(ppy)3 经典可见光强还原光催化剂)", abbr: "Ir(ppy)3", cat: "光氧化还原催化/过渡金属配合物" },
  { en: "Tris(2,2'-bipyridine)ruthenium(II) dichloride", zh: "三(2,2'-联吡啶)氯化钌 (Ru(bpy)3Cl2 经典光敏剂)", abbr: "Ru(bpy)3Cl2", cat: "光氧化还原催化/可见光敏化" },
  { en: "RuPhos", zh: "RuPhos手性/大位阻二联苯双膦配体 (布赫瓦尔德膦配体)", abbr: "RuPhos", cat: "有机合成/配体体系" },
  { en: "SPhos", zh: "SPhos大位阻联苯膦配体", abbr: "SPhos", cat: "有机合成/配体体系" },
  { en: "XPhos", zh: "XPhos大位阻联苯膦配体 (高活性碳氮与碳碳偶联配体)", abbr: "XPhos", cat: "有机合成/配体体系" },
  { en: "BrettPhos", zh: "BrettPhos特大位阻配体 (极难偶联伯胺与芳基氯高效配体)", abbr: "BrettPhos", cat: "有机合成/配体体系" }
];

for (const c of catalystsAndLigands) {
  const normKey = c.en.toLowerCase();
  masterDictionary[normKey] = {
    en: c.en,
    zh: c.zh,
    abbr: c.abbr || '',
    category: c.cat,
    otherLangs: c.de ? { de: c.de } : {}
  };
  if (c.abbr && c.abbr.length >= 2) {
    const abbrKey = c.abbr.toLowerCase();
    if (!masterDictionary[abbrKey]) {
      masterDictionary[abbrKey] = {
        en: c.abbr,
        zh: `${c.zh} (${c.en} 缩写)`,
        abbr: c.abbr,
        category: c.cat,
        otherLangs: {}
      };
    }
  }
}

// 6.3 经典杂环母核
const heterocycles = [
  { en: "Pyridine", zh: "吡啶", cat: "杂环化学/六元单杂环", de: "Pyridin", fr: "pyridine" },
  { en: "Pyrimidine", zh: "嘧啶", cat: "杂环化学/二氮杂六元环", de: "Pyrimidin", fr: "pyrimidine" },
  { en: "Pyrazine", zh: "吡嗪", cat: "杂环化学/对二氮杂六元环", de: "Pyrazin", fr: "pyrazine" },
  { en: "Pyridazine", zh: "哒嗪", cat: "杂环化学/邻二氮杂六元环", de: "Pyridazin", fr: "pyridazine" },
  { en: "Triazine", zh: "三嗪", cat: "杂环化学/三氮杂六元环", de: "Triazin", fr: "triazine" },
  { en: "Tetrazine", zh: "四嗪 (生物正交逆电子需求狄尔斯-阿尔德常用母核)", cat: "杂环化学/生物正交基团", de: "Tetrazin" },
  { en: "Pyrrole", zh: "吡咯", cat: "杂环化学/五元含氮杂环", de: "Pyrrol", fr: "pyrrole" },
  { en: "Furan", zh: "呋喃", cat: "杂环化学/五元含氧杂环", de: "Furan", fr: "furane" },
  { en: "Thiophene", zh: "噻吩", cat: "杂环化学/五元含硫杂环", de: "Thiophen", fr: "thiophène" },
  { en: "Imidazole", zh: "咪唑 (组氨酸母核)", cat: "杂环化学/二氮杂五元环", de: "Imidazol", fr: "imidazole" },
  { en: "Oxazole", zh: "恶唑", cat: "杂环化学/氮氧杂五元环", de: "Oxazol", fr: "oxazole" },
  { en: "Thiazole", zh: "噻唑 (维生素B1核心母核)", cat: "杂环化学/氮硫杂五元环", de: "Thiazol", fr: "thiazole" },
  { en: "Pyrazole", zh: "吡唑", cat: "杂环化学/邻二氮杂五元环", de: "Pyrazol", fr: "pyrazole" },
  { en: "Isoxazole", zh: "异恶唑", cat: "杂环化学/杂环化学", de: "Isoxazol" },
  { en: "Isothiazole", zh: "异噻唑", cat: "杂环化学/杂环化学", de: "Isothiazol" },
  { en: "1,2,3-Triazole", zh: "1,2,3-三唑 (点击化学环加成产物)", cat: "点击化学/杂环", de: "1,2,3-Triazol" },
  { en: "Tetrazole", zh: "四唑 (羧酸经典生物电子等排体)", cat: "药物化学/生物电子等排体", de: "Tetrazol" },
  { en: "Indole", zh: "吲哚 (色氨酸与血清素母核)", cat: "杂环化学/稠杂环", de: "Indol", fr: "indole" },
  { en: "Quinoline", zh: "喹啉", cat: "杂环化学/苯并吡啶", de: "Chinolin", fr: "quinoléine" },
  { en: "Isoquinoline", zh: "异喹啉", cat: "杂环化学/苯并吡啶异构体", de: "Isochinolin" },
  { en: "Purine", zh: "嘌呤 (腺嘌呤与鸟嘌呤母核)", cat: "生物化学/核酸碱基母核", de: "Purin", fr: "purine" },
  { en: "Piperidine", zh: "哌啶 (六氢吡啶)", cat: "杂环化学/饱和含氮杂环", de: "Piperidin" },
  { en: "Piperazine", zh: "哌嗪 (二乙撑二胺)", cat: "药物化学/经典亲水环", de: "Piperazin" },
  { en: "Morpholine", zh: "吗啉 (四氢-1,4-恶嗪)", cat: "药物化学/极性增溶环", de: "Morpholin" },
  { en: "Pyrrolidine", zh: "吡咯烷 (四氢吡咯)", cat: "杂环化学/饱和五元含氮环", de: "Pyrrolidin" }
];

for (const h of heterocycles) {
  const normKey = h.en.toLowerCase();
  masterDictionary[normKey] = {
    en: h.en,
    zh: h.zh,
    abbr: "",
    category: h.cat,
    otherLangs: { de: h.de || '', fr: h.fr || '' }
  };
}

// 6.4 学术文献形态屈折与派生衍生 (Plurals, Participles & Suffix Variations)
const existingKeys = Object.keys(masterDictionary);
for (const k of existingKeys) {
  const entry = masterDictionary[k];
  if (!entry || k.length < 3) continue;
  if ((entry.zh || '').includes(' 缩写)') || (entry.abbr && entry.en === entry.abbr)) continue;
  if (/^[a-z0-9\-/]+$/i.test(k) && k.length <= 5 && k === k.toLowerCase() && entry.abbr && entry.abbr.toLowerCase() === k) continue;

  // 复数形态衍生 (如 enantiomer -> enantiomers, synthesis -> syntheses)
  let pluralKey = null;
  if (k.endsWith('sis') || k.endsWith('lysis')) {
    pluralKey = k.slice(0, -2) + 'es';
  } else if (k.endsWith('y') && !k.endsWith('ay') && !k.endsWith('ey') && !k.endsWith('oy')) {
    pluralKey = k.slice(0, -1) + 'ies';
  } else if (k.endsWith('x') || k.endsWith('ch') || k.endsWith('sh') || k.endsWith('ss')) {
    pluralKey = k + 'es';
  } else if (!k.endsWith('s') && /[a-z]$/.test(k)) {
    pluralKey = k + 's';
  }

  if (pluralKey && !masterDictionary[pluralKey]) {
    masterDictionary[pluralKey] = {
      en: entry.en + ' (复数)',
      zh: entry.zh,
      abbr: entry.abbr,
      category: entry.category,
      otherLangs: entry.otherLangs
    };
  }

  // 动名词/分词形式衍生 (如 blot -> blotting)
  if (k.endsWith(' blot')) {
    const blotKey = k + 'ting';
    if (!masterDictionary[blotKey]) {
      masterDictionary[blotKey] = {
        en: entry.en + 'ting',
        zh: entry.zh,
        abbr: entry.abbr,
        category: entry.category,
        otherLangs: entry.otherLangs
      };
    }
  }
}

const disciplinesList = [
  "有机合成与不对称催化 (Organic Synthesis & Asymmetric Catalysis)",
  "物理有机、反应机理与常用试剂溶剂 (Physical Organic, Mechanisms & Reagents)",
  "物理化学、量子化学与计算模拟 (Physical, Quantum & Computational Chemistry)",
  "无机配位与固体晶体化学 (Inorganic Coordination & Solid-State Chemistry)",
  "电化学、电催化与新能源电池 (Electrochemistry, Electrocatalysis & Batteries)",
  "高分子化学与胶体界面科学 (Polymer, Colloid & Interface Chemistry)",
  "分析化学与波谱/X射线表征 (Analytical Chemistry & Spectroscopy)",
  "绿色合成、流动化学与实验室安全 (Green Chemistry, Flow & Lab Safety)",
  "材料化学、纳米科学与催化 (Materials, Nanotechnology & Catalysis)",
  "分子生物学与表观遗传学 (Molecular Biology & Epigenetics)",
  "结构生物学与冷冻电镜 (Structural Biology & Cryo-EM)",
  "生物化学与细胞代谢 (Biochemistry & Cellular Metabolism)",
  "免疫学与生物大分子药物 (Immunology & Biologics)",
  "药物化学与药代动力学 (Medicinal Chemistry & DMPK)",
  "细胞生物学与细胞器病理 (Cell Biology & Organelle Dynamics)",
  "神经生物学与电生理学 (Neurobiology & Electrophysiology)",
  "合成生物学与代谢工程 (Synthetic Biology & Metabolic Engineering)",
  "经典学术拉丁语与科技德语词源 (Academic Latin & German Etymology in Science)"
];

// 7. 统计总数并输出
const totalCount = Object.keys(masterDictionary).length;
console.log(`\n========================================`);
console.log(`博士级多语种生化词库汇编完成！`);
console.log(`有效权威词条总数: ${totalCount} 条`);
console.log(`覆盖学科: ${disciplinesList.length} 大前沿博士级门类`);
console.log(`结构规范: 中英文对照 (en, zh) + 标准缩写 (abbr) + 学科分类 (category) + 国际多语种 (otherLangs)`);
console.log(`========================================\n`);

const fullOutput = {
  description: "化学、生物学、药学与前沿材料交叉学科博士级多语种学术术语知识库 (遵循 IUPAC、CAS、中国化学会及全国科学技术名词审定委员会规范)",
  version: "3.3.0",
  updatedAt: new Date().toISOString(),
  totalCount: totalCount,
  disciplines: disciplinesList,
  terms: masterDictionary
};

const serialized = JSON.stringify(fullOutput, null, 2);
fs.writeFileSync(oldDataPath, serialized, 'utf-8');
fs.writeFileSync(extDataPath, serialized, 'utf-8');
console.log(`已成功同步持久化至:\n  - ${oldDataPath}\n  - ${extDataPath}`);
