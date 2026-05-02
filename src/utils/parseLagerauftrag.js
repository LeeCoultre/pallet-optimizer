/* ─────────────────────────────────────────────────────────────────────────
   Lagerauftrag parsing — pure functions, testable in Node.

   Two formats supported:
     - "standard"  Lagerauftrag with PALETTE markers + tab-separated rows
     - "schilder"  per-carton Schilder (signage) docs without pallet markers

   The detector picks one based on header keywords; both formats expose the
   same shape: { format, meta, pallets, einzelneSkuItems, schilderItems? }.

   Heights config (admin-configurable inner/outer roll diameter equivalence)
   is injected via setHeightsConfig — defaults are baked in for unit tests
   and for the very first parse before AdminPanel hydrates.
   ───────────────────────────────────────────────────────────────────────── */

/* ── Heights config (admin-configurable) ────────────────────────────────── */
const DEFAULT_HEIGHTS = [
  { from: 9, to: 30 },
  { from: 14, to: 35 },
  { from: 18, to: 40 },
];
let _heights = DEFAULT_HEIGHTS;
export function setHeightsConfig(heights) {
  _heights = Array.isArray(heights) && heights.length ? heights : DEFAULT_HEIGHTS;
}
export function normalizeHeight(h) {
  if (h == null) return h;
  for (const e of _heights) if (e.from === h || e.to === h) return e.to;
  return h;
}

/* ── Code type / classification ─────────────────────────────────────────── */
export function detectCodeType(fnsku) {
  if (!fnsku) return 'OTHER';
  if (/^X001/i.test(fnsku)) return 'X001';
  if (/^X002/i.test(fnsku)) return 'X002';
  if (/^X000/i.test(fnsku)) return 'X000';
  if (/^B0/i.test(fnsku) || /^BO/i.test(fnsku)) return 'B0';
  return 'OTHER';
}

export function parseTitleMeta(title) {
  if (!title) return { dimStr: null, rollen: null, dim: null };
  const cleanTitle = title.replace(/\s+/g, ' ').trim();
  const dimMatch = cleanTitle.match(/(\d+)\s*(?:mm)?\s*[xх×]\s*(\d+)/i);
  const rawW = dimMatch ? parseInt(dimMatch[1], 10) : null;
  const rawH = dimMatch ? parseInt(dimMatch[2], 10) : null;
  const dimStr = dimMatch ? `${rawW} × ${rawH}` : null;
  const normH = normalizeHeight(rawH);
  const dim = dimMatch ? { w: rawW, h: rawH, normH, normW: rawW } : null;
  const rollenMatch = cleanTitle.match(/(\d+)\s*(?:Stck|Stk|Rollen|Rolls|Stück|Pcs|Pieces|er[\s-]+Pack)\b\.?/i);
  const rollen = rollenMatch ? parseInt(rollenMatch[1], 10) : null;
  return { dimStr, rollen, dim };
}

export function classifyItem(title) {
  const t = (title || '').toLowerCase();
  const isTacho = /tachograph|tacho\b|fahrtenschreiber|dtco/i.test(t);
  const isProduktion =
    /big\s*bag|silosack|sandsack|säcke|bauschutt|holzsack|klebeband|paketband|packband|absperrband|holzwolle|füllmaterial|kürbiskern/i.test(t);
  const isVeit = /\bveit\b/i.test(t);
  const isHeipa = /\bheipa\b/i.test(t);
  const isThermo =
    !isTacho &&
    !isProduktion &&
    !isVeit &&
    !isHeipa &&
    /thermorollen|thermopapier|thermal|kassenrollen|bonrollen|cash\s*roll|ec[-\s]*cash|swiparo|eco\s*roolls/i.test(t);

  let category = 'sonstige';
  if (isThermo) category = 'thermorollen';
  else if (isHeipa) category = 'heipa';
  else if (isVeit) category = 'veit';
  else if (isTacho) category = 'tachographenrollen';
  else if (isProduktion) category = 'produktion';

  return { isThermo, isVeit, isHeipa, isTacho, isProduktion, category };
}

export const CATEGORY_ORDER = [
  'thermorollen',
  'heipa',
  'veit',
  'tachographenrollen',
  'produktion',
  'sonstige',
];
export const CATEGORY_LABELS = {
  thermorollen: 'Thermorollen',
  heipa: 'Heipa',
  veit: 'Veit',
  tachographenrollen: 'Tachographenrollen',
  produktion: 'Produktion',
  sonstige: 'Sonstige',
};
export const CATEGORY_COLORS = {
  thermorollen: '#2563EB',
  heipa: '#0891B2',
  veit: '#7C3AED',
  tachographenrollen: '#D97706',
  produktion: '#65A30D',
  sonstige: '#6B6560',
};
export function categoryRank(cat) {
  const i = CATEGORY_ORDER.indexOf(cat);
  return i < 0 ? 99 : i;
}

/* ── Regex char classes ─────────────────────────────────────────────────── */
// All dash variants we've seen between P# and B# in pallet IDs
const DASH_CHARS = '\\-\\u2013\\u2014\\u2212';   // hyphen, en-dash, em-dash, minus
const DASH_RE = `[${DASH_CHARS}]`;
// Arrow / separator chars between pallet-prefix and SKU on item lines.
// Includes: à À, → ⇒ ➤, > 》, em/en-dash + >, plain ->/=>, segmented arrow 🡪
// We accept ANY non-word, non-space sequence — but require at least one
// printable non-ASCII or punctuation char to avoid greedy matches.
const ARROW_RE = '[^\\w\\s\\-]+';

/* ── Header / meta extraction ────────────────────────────────────────────
   mammoth represents table cells as "<label>\t<value>\n". We look for
   each label; the value continues until the next tab or newline. Robust
   to leading/trailing whitespace.
   ──────────────────────────────────────────────────────────────────────── */
function grabField(text, label, captureRe = '([^\\n\\t]+)') {
  // (?:^|\n) — anchor to a line start to avoid catching the same label
  // twice (e.g., "Sendungsnummer" appearing both at top and in a footer).
  const re = new RegExp(`(?:^|\\n)\\s*${label}\\s*[:\\t]\\s*${captureRe}`, 'i');
  const m = text.match(re);
  return m ? m[1].trim() : null;
}

function parseMetaCommon(text) {
  const meta = {};
  const sn = grabField(text, 'Sendungsnummer');
  if (sn && sn !== 'KARTON NR.' && /[A-Z0-9]/i.test(sn)) meta.sendungsnummer = sn;
  const nn = grabField(text, 'Name');
  if (nn) meta.name = nn;
  const ln = grabField(text, 'Lieferanschrift');
  if (ln) meta.destination = ln;
  const sku = grabField(text, 'SKUs insgesamt', '(\\d+)');
  if (sku) meta.totalSkus = parseInt(sku, 10);
  const eh = grabField(text, 'Einheiten insgesamt', '(\\d+)');
  if (eh) meta.totalUnits = parseInt(eh, 10);

  if (meta.name) {
    const dm = meta.name.match(
      /\((\d{1,2})[\/.](\d{1,2})[\/.](\d{2,4})\s+(\d{1,2}):(\d{2})\)/
    );
    if (dm) {
      const [, dd, mm, yy, h, m] = dm;
      const yyyy = yy.length === 2 ? `20${yy}` : yy;
      meta.createdAtIso = `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}T${h.padStart(2, '0')}:${m.padStart(2, '0')}`;
      meta.createdDate = `${dd.padStart(2, '0')}.${mm.padStart(2, '0')}.${yyyy}`;
      meta.createdTime = `${h.padStart(2, '0')}:${m.padStart(2, '0')}`;
    }
    const destMatch = meta.name.match(/-([A-Z]{2,5}\d?)\s*$/);
    if (destMatch && !meta.destination) meta.destination = destMatch[1];
  }
  return meta;
}

/* ── Pallet header regex — handles all dash variants ───────────────────── */
function makePalletHeaderRe(global = true) {
  // PALETTE 1 - P1-B1   |   PALETTE 1 - P1 – B1   |   PALETTE 1 — P1-B1
  return new RegExp(
    `PALETTE\\s+(\\d+)\\s*${DASH_RE}\\s*(P\\d+\\s*${DASH_RE}\\s*B\\d+)`,
    global ? 'gi' : 'i'
  );
}

function normalizePalletId(rawId) {
  // Collapse any dash variant + surrounding spaces to ASCII "P#-B#"
  return rawId.replace(new RegExp(`\\s*${DASH_RE}\\s*`, 'g'), '-').toUpperCase();
}

/* ── Item-line regex ───────────────────────────────────────────────────── */
function makePalletItemRegex(palletId, opts = {}) {
  const { anchorStart = true, global = false } = opts;
  // palletId is normalized "P1-B1"; on item lines we accept the same with
  // any dash variant and any arrow / non-word separator before the SKU.
  // Item-line format: "P1-B1 <arrow> <SKU>\t<title>\t..."
  const m = palletId.match(/^([A-Z]+)(\d+)-(B\d+)$/i);
  if (!m) return null;
  const [, prefix, num, b] = m;
  // Tolerate typos like "B1-B5" instead of "P1-B5" — match any [A-Z]+ prefix
  const head = `[A-Z]+${num}\\s*${DASH_RE}\\s*${b}`;
  const pattern = `${anchorStart ? '^' : ''}${head}\\s*${ARROW_RE}\\s*`;
  return new RegExp(pattern, global ? 'gi' : 'i');
}

/* If the first tab-delimited field still contains both SKU and title (some
   exports omit the tab between them and split with an arrow or space only),
   inject a tab so downstream column parsing stays in sync.
   Example: "VF-Z4DN-RFTL THERMALKING Thermorollen ..." → "VF-Z4DN-RFTL\tTHERMALKING Thermorollen ..." */
const SKU_PATTERN = '[A-Z0-9]{2,5}-[A-Z0-9]{4,6}-[A-Z0-9]{3,6}';
const SKU_HEAD_RE = new RegExp(`^(${SKU_PATTERN})\\s*(?:${ARROW_RE}\\s*)?(\\S.*)$`);
function fixGluedSkuTitle(line) {
  const tabIdx = line.indexOf('\t');
  if (tabIdx < 0) return line;
  const head = line.slice(0, tabIdx);
  // Only intervene when head obviously contains both SKU and prose (arrow,
  // bracket, parenthesis, asterisk, etc.). A bare SKU possibly followed by
  // trailing whitespace contains only word/space/hyphen — leave it alone.
  if (!/[^\w\s\-]/.test(head)) return line;
  const m = head.match(SKU_HEAD_RE);
  if (!m) return line;
  const rest = line.slice(tabIdx);
  return `${m[1]}\t${m[2]}${rest}`;
}

/* ── Parse a single tab-separated item row, given the prefix is stripped ── */
function parseItemColumns(rest) {
  const normalized = fixGluedSkuTitle(rest);
  const parts = normalized.split('\t').map((s) => s.trim());
  if (parts.length < 5) return null;
  const sku = parts[0] || '';
  const title = (parts[1] || '').replace(/\s+/g, ' ').trim();
  const asin = parts[2] || '';
  const fnsku = parts[3] || '';
  const codeCol = parts[4] || '';
  const condition = parts[5] || '';
  const prep = parts[6] || '';
  const prepTypeRaw = parts[7] || '';
  const labeler = parts[8] || '';
  const unitsStr = parts[9] || '';

  let ean = null, upc = null;
  const eanM = codeCol.match(/^EAN:\s*(.+)/i);
  const upcM = codeCol.match(/^UPC:\s*(.+)/i);
  if (eanM) ean = eanM[1].trim();
  else if (upcM) upc = upcM[1].trim();

  const units = parseInt(unitsStr, 10) || 0;
  const prepType =
    prepTypeRaw === 'null' || prepTypeRaw === '"--"' || !prepTypeRaw
      ? null
      : prepTypeRaw;

  const { dimStr, rollen, dim } = parseTitleMeta(title);
  const cls = classifyItem(title);
  const codeType = detectCodeType(fnsku);

  return {
    sku, title, asin, fnsku, ean, upc,
    condition, prep, prepType, labeler,
    units, useItem: null, // filled in by caller
    dimStr, rollen, dim,
    isThermo: cls.isThermo,
    isVeit: cls.isVeit,
    isHeipa: cls.isHeipa,
    isTacho: cls.isTacho,
    isProduktion: cls.isProduktion,
    category: cls.category,
    codeType,
  };
}

function parseItemsFromBlock(block, palletId) {
  const items = [];
  // Normalize NBSP and collapse stray spaces inside cells (but keep tabs).
  const lines = block.split('\n').map((l) => l.replace(/ /g, ' ').trim());
  const startRe = makePalletItemRegex(palletId);
  if (!startRe) return items;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!startRe.test(line)) continue;

    const rest = line.replace(startRe, '');
    const parsed = parseItemColumns(rest);
    if (!parsed) continue;

    // Look forward for "Zu verwendender Artikel" until the next item starts
    // or until the next pallet header.
    for (let j = i + 1; j < lines.length; j++) {
      if (startRe.test(lines[j])) break;
      if (/^PALETTE\s+\d+/i.test(lines[j])) break;
      const um = lines[j].match(/^Zu\s+verwendender\s+Artikel\s*[:：]?\s*(.+)/i);
      if (um) { parsed.useItem = um[1].trim(); break; }
    }

    items.push(parsed);
  }
  return items;
}

/* ─────────────────────────────────────────────────────────────────────────
   EINZELNE SKU PARSER
   After the last pallet, blocks of:
     ACHTUNG! Jeder Karton mit (X × Y <label>) ...
     <article line>
     Zu verwendender Artikel: ...
   ───────────────────────────────────────────────────────────────────────── */
function parseEinzelneSkuSection(tail) {
  const items = [];
  if (!tail) return items;
  const lines = tail.split('\n').map((l) => l.replace(/ /g, ' ').trim());
  const achtungRe =
    /ACHTUNG[!]?\s+Jeder\s+Karton\s+mit\s+\(\s*(\d+)\s*[×x*]\s*(\d+)\s*([^)]*)\)/i;

  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(achtungRe);
    if (!m) continue;

    const X = parseInt(m[1], 10);
    const Y = parseInt(m[2], 10);
    const contentRaw = (m[3] || '').trim();
    const contentLabel = contentRaw.replace(/^x\s*/i, '').trim() || 'Rollen';

    for (let j = i + 1; j < lines.length; j++) {
      const next = lines[j];
      if (!next) continue;
      if (achtungRe.test(next)) break;
      if (!next.includes('\t')) continue;
      // Strip "Einzelne SKU" prefix with any arrow-like punctuation
      const cleaned = next.replace(/^Einzelne\s+SKU\s*[^\w\s]+\s*/i, '');
      const parsed = parseEinzelneSkuItemLine(cleaned, lines, j, { X, Y, contentLabel });
      if (parsed) items.push(parsed);
      break;
    }
  }
  return items;
}

function parseEinzelneSkuItemLine(line, allLines, lineIdx, achtung) {
  const parsed = parseItemColumns(line);
  if (!parsed) return null;

  // Look forward for "Zu verwendender Artikel"
  for (let k = lineIdx + 1; k < Math.min(allLines.length, lineIdx + 5); k++) {
    if (/^ACHTUNG/i.test(allLines[k])) break;
    const um = allLines[k].match(/^Zu\s+verwendender\s+Artikel\s*[:：]?\s*(.+)/i);
    if (um) { parsed.useItem = um[1].trim(); break; }
  }

  parsed.isEinzelneSku = true;
  parsed.einzelneSku = {
    packsPerCarton: achtung.X,
    itemsPerPack: achtung.Y,
    effectiveRollen: achtung.X * achtung.Y,
    contentLabel: achtung.contentLabel,
    cartonsCount: Math.max(1, Math.ceil(parsed.units / achtung.X)),
  };
  return parsed;
}

/* ─────────────────────────────────────────────────────────────────────────
   STANDARD-FORMAT PARSER
   ───────────────────────────────────────────────────────────────────────── */
function parseStandard(rawText) {
  const text = rawText
    .replace(/\r/g, '')
    .split('\n')
    .map((l) => l.replace(/ /g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n');

  const meta = parseMetaCommon(text);

  const palletRe = makePalletHeaderRe(true);
  const matches = [...text.matchAll(palletRe)];
  const pallets = [];

  matches.forEach((m, idx) => {
    const number = parseInt(m[1], 10);
    const id = normalizePalletId(m[2]);
    const start = m.index + m[0].length;
    const end = idx + 1 < matches.length ? matches[idx + 1].index : text.length;
    const block = text.slice(start, end);

    const hasFourSideWarning =
      /SKU\s+Aufkleber\s+auf\s+allen\s+4\s+Seiten/i.test(block);

    const items = parseItemsFromBlock(block, id);
    pallets.push({ number, id, hasFourSideWarning, items });
  });

  const lastPalletEnd = matches.length > 0
    ? matches[matches.length - 1].index + matches[matches.length - 1][0].length
    : 0;
  const tail = text.slice(lastPalletEnd);
  const einzelneSkuItems = parseEinzelneSkuSection(tail);

  return { format: 'standard', meta, pallets, einzelneSkuItems };
}

/* ─────────────────────────────────────────────────────────────────────────
   SCHILDER-FORMAT PARSER
   Layout (from real docs):
     ACHTUNG! VERWENDEN SIE KARTON K8 (400x400x400 mm) 2wellig
     <header rows: SKU, FNSKU, NON AMAZON NUMMER/LAGERPLATZ, MENGE, GEWICHT, KARTON NR.>
     <data: SKU on its own line, then FNSKU/NON-AMZ/MENGE/GEWICHT/KARTON in 5 successive lines>
     <total row: blanks + total MENGE + total GEWICHT + blank>
     SENDUNGSNUMMER  /  KARTON NR.
     <SN-number>     /  <karton-id>

   The order of the 5 follow-up lines varies between docs (sometimes
   FNSKU comes first, sometimes NON-AMZ first). We classify each line
   by its content pattern instead of relying on position.
   ───────────────────────────────────────────────────────────────────────── */
const SCHILDER_KARTON_RE = /VERWENDEN\s+SIE\s+KARTON\s+([A-Z]+\d*)\s*\((\d+)\s*[xх×]\s*(\d+)\s*[xх×]\s*(\d+)\s*mm\)\s*([^\n]+)?/i;
const SCHILDER_SKU_RE = /^[A-Z0-9]{2,4}-[A-Z0-9]{4,6}-[A-Z0-9]{4,6}$/;
const FNSKU_RE = /^[XB]0[A-Z0-9]{8}$/i;

function classifySchilderField(value) {
  const v = value.trim();
  if (!v) return 'empty';
  if (FNSKU_RE.test(v)) return 'fnsku';
  if (SCHILDER_SKU_RE.test(v)) return 'sku';
  // a number with a decimal point is GEWICHT
  if (/^\d+[.,]\d+$/.test(v)) return 'gewicht';
  // pure digits = MENGE or KARTON_NR or NON-AMZ position
  if (/^\d+$/.test(v)) return 'integer';
  // alphanumeric like X001IC3FFT but with leading space — already caught above
  // any other text token (e.g., "10 Stk" or label) — unknown
  return 'text';
}

function parseSchilder(rawText) {
  const text = rawText.replace(/\r/g, '');
  const meta = {};

  // Karton spec
  const km = text.match(SCHILDER_KARTON_RE);
  if (km) {
    meta.karton = {
      type: km[1],
      length: parseInt(km[2], 10),
      width: parseInt(km[3], 10),
      height: parseInt(km[4], 10),
      note: (km[5] || '').trim() || null,
    };
  }

  // Sendungsnummer in Schilder docs is a long numeric like "1035876500597740802500"
  // sitting under "SENDUNGSNUMMER" / "KARTON NR." headers.
  const snMatch = text.match(/SENDUNGSNUMMER[\s\S]*?\n\s*(\d{15,})/i);
  if (snMatch) meta.sendungsnummer = snMatch[1];

  // Try to extract a SN-like FBA code from the document title or any FBA code
  const fbaMatch = text.match(/\bFBA\d[A-Z0-9]+\b/i);
  if (fbaMatch && !meta.sendungsnummer?.startsWith('FBA'))
    meta.fbaCode = fbaMatch[0].toUpperCase();

  // Parse rows. Strategy: find every SKU-pattern line; for each, look at the
  // next ~6 non-empty lines and pull out fnsku/integer/gewicht by pattern.
  const lines = text.split('\n').map((l) => l.replace(/ /g, ' ').trim());

  const items = [];
  let totalUnits = 0;
  let totalWeight = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!SCHILDER_SKU_RE.test(line)) continue;
    const sku = line;

    // Collect up to 8 following non-empty lines (5 fields + safety margin)
    const tokens = [];
    for (let j = i + 1; j < lines.length && tokens.length < 8; j++) {
      const v = lines[j];
      if (!v) continue;
      // Stop if we've hit the next SKU
      if (SCHILDER_SKU_RE.test(v)) break;
      if (/^SENDUNGSNUMMER/i.test(v)) break;
      if (/^ACHTUNG/i.test(v)) break;
      tokens.push(v);
    }

    let fnsku = null, nonAmz = null, menge = null, gewicht = null, kartonNr = null;
    const integers = [];
    for (const t of tokens) {
      const kind = classifySchilderField(t);
      if (kind === 'fnsku' && !fnsku) fnsku = t.toUpperCase();
      else if (kind === 'gewicht' && gewicht == null)
        gewicht = parseFloat(t.replace(',', '.'));
      else if (kind === 'integer') integers.push(parseInt(t, 10));
      else if (kind === 'text' && !fnsku && /^X[0-9]/i.test(t)) {
        // sometimes FNSKU has trailing space or odd char — fallback
        fnsku = t.replace(/\s+/g, '').toUpperCase();
      }
    }

    // Among the integers: typically [non-amz-pos, menge, karton-nr] — but the
    // non-amz-pos can also be alphanumeric so we may have only [menge, karton].
    // Heuristic: the LAST integer is the KARTON_NR (small, usually 1-9), the
    // SECOND-TO-LAST is the MENGE (the actual qty), and any earlier integer
    // is the non-amz position.
    if (integers.length >= 2) {
      kartonNr = integers[integers.length - 1];
      menge = integers[integers.length - 2];
      if (integers.length >= 3) nonAmz = String(integers[0]);
    } else if (integers.length === 1) {
      menge = integers[0];
    }
    // If we still don't have non-amz but a "text" token starts with X, it's
    // probably the NON-AMZ asin-like reference (X000xxx or similar).
    if (!nonAmz) {
      for (const t of tokens) {
        if (t === fnsku) continue;
        if (/^X[0-9]/i.test(t) && !FNSKU_RE.test(t)) {
          nonAmz = t.replace(/\s+/g, '').toUpperCase();
          break;
        }
      }
    }

    if (menge != null) totalUnits += menge;
    if (gewicht != null) totalWeight += gewicht;

    items.push({
      sku,
      fnsku: fnsku || '',
      nonAmz: nonAmz || '',
      units: menge || 0,
      weightKg: gewicht || 0,
      kartonNr: kartonNr ?? null,
      // Provide title-shaped fields for compatibility with downstream UI
      title: nonAmz ? `Schilder ${nonAmz}` : `Schilder ${sku}`,
      asin: '',
      ean: null,
      upc: null,
      condition: '',
      prep: '',
      prepType: null,
      labeler: '',
      useItem: null,
      dimStr: null,
      rollen: null,
      dim: null,
      isSchilder: true,
      category: 'sonstige',
      codeType: detectCodeType(fnsku),
    });
  }

  // Schilder docs ship as one carton — synthesize a single virtual pallet
  // so the rest of the UI works without special cases.
  const pallets = items.length
    ? [{
        number: 1,
        id: 'P1-K1',
        hasFourSideWarning: false,
        items,
      }]
    : [];

  meta.totalUnits = totalUnits;
  meta.totalWeightKg = Math.round(totalWeight * 100) / 100;
  meta.totalSkus = new Set(items.map((it) => it.fnsku || it.sku)).size;

  return { format: 'schilder', meta, pallets, einzelneSkuItems: [] };
}

/* ─────────────────────────────────────────────────────────────────────────
   FORMAT DETECTOR + PUBLIC ENTRY
   ───────────────────────────────────────────────────────────────────────── */
export function detectFormat(rawText) {
  const text = rawText.replace(/\r/g, '');
  // Standard if any PALETTE marker is present
  if (makePalletHeaderRe(false).test(text)) return 'standard';
  // Standard header is "Sendungsnummer\tFBA..." — even without pallets we
  // treat it as standard (yields empty pallets but valid meta).
  if (/^Sendungsnummer\b/im.test(text) && !/VERWENDEN\s+SIE\s+KARTON/i.test(text))
    return 'standard';
  // Schilder hallmark
  if (/VERWENDEN\s+SIE\s+KARTON/i.test(text)) return 'schilder';
  return 'standard';
}

export function parseLagerauftragText(rawText) {
  if (!rawText || typeof rawText !== 'string') {
    return { format: 'unknown', meta: {}, pallets: [], einzelneSkuItems: [] };
  }
  const fmt = detectFormat(rawText);
  return fmt === 'schilder' ? parseSchilder(rawText) : parseStandard(rawText);
}

/* ─────────────────────────────────────────────────────────────────────────
   STRICT VALIDATION — independently re-scans the raw text and compares
   ───────────────────────────────────────────────────────────────────────── */
export function validateParsing(rawText, parsed) {
  const text = rawText.replace(/\r/g, '');
  const issues = [];

  if (parsed.format === 'schilder') {
    // For Schilder we just sanity-check: every SKU-pattern line yielded an item.
    const skuCount = (text.split('\n').filter((l) => SCHILDER_SKU_RE.test(l.trim()))).length;
    if (skuCount !== parsed.pallets[0]?.items.length) {
      issues.push({
        severity: 'error',
        kind: 'schilder-item-count',
        msg: `Schilder: ожидалось ${skuCount} SKU-строк, распарсено ${parsed.pallets[0]?.items.length || 0}`,
      });
    }
  } else {
    // 1. Pallet count
    const palletMatches = [...text.matchAll(makePalletHeaderRe(true))];
    if (palletMatches.length !== parsed.pallets.length) {
      issues.push({
        severity: 'error',
        kind: 'pallet-count',
        msg: `Палет в тексте: ${palletMatches.length}, распарсено: ${parsed.pallets.length}`,
      });
    }

    // 2. Item count per pallet
    const palletExpectedItems = {};
    palletMatches.forEach((m, idx) => {
      const palletId = normalizePalletId(m[2]);
      const start = m.index + m[0].length;
      const end =
        idx + 1 < palletMatches.length
          ? palletMatches[idx + 1].index
          : text.length;
      const block = text.slice(start, end);
      const itemRe = makePalletItemRegex(palletId, { anchorStart: false, global: true });
      palletExpectedItems[palletId] = itemRe ? (block.match(itemRe) || []).length : 0;
    });
    parsed.pallets.forEach((p) => {
      const expected = palletExpectedItems[p.id];
      if (expected != null && expected !== p.items.length) {
        issues.push({
          severity: 'error',
          kind: 'item-count',
          palletId: p.id,
          msg: `${p.id}: ожидалось ${expected} артиклей, распарсено ${p.items.length}`,
        });
      }
    });

    // 3. Missing FNSKU
    parsed.pallets.forEach((p) =>
      p.items.forEach((it) => {
        if (!it.fnsku) {
          issues.push({
            severity: 'error',
            kind: 'missing-fnsku',
            palletId: p.id,
            msg: `${p.id}: артикул без FNSKU — "${it.title?.slice(0, 40) || '—'}"`,
          });
        }
      })
    );
  }

  // 4. Header totals cross-check (works for both formats)
  const eskuItems = parsed.einzelneSkuItems || [];
  const allEntries = [
    ...parsed.pallets.flatMap((p) => p.items),
    ...eskuItems,
  ];
  const uniqueFnskus = new Set();
  allEntries.forEach((it) => { if (it.fnsku) uniqueFnskus.add(it.fnsku); });
  const totalSkus = uniqueFnskus.size;
  const totalEntries = allEntries.length;
  const totalUnits = allEntries.reduce((s, it) => s + (it.units || 0), 0);
  // Header totals are user-entered in the Word template and frequently have
  // off-by-N typos. We surface mismatches as warnings (so the operator can
  // verify), while pallet-count + per-pallet item-count above are the
  // structural errors that indicate real parsing failures.
  if (parsed.meta?.totalSkus != null && parsed.format !== 'schilder' && parsed.meta.totalSkus !== totalSkus) {
    issues.push({
      severity: 'warn',
      kind: 'sku-mismatch',
      msg: `Header zeigt ${parsed.meta.totalSkus} eindeutige SKUs, im Auftrag erkannt: ${totalSkus}`,
    });
  }
  if (parsed.meta?.totalUnits != null && parsed.format !== 'schilder' && parsed.meta.totalUnits !== totalUnits) {
    issues.push({
      severity: 'warn',
      kind: 'unit-mismatch',
      msg: `Header zeigt ${parsed.meta.totalUnits} Einheiten, summiert: ${totalUnits} (Δ ${parsed.meta.totalUnits - totalUnits})`,
    });
  }

  // 5. Per-item warnings
  parsed.pallets.forEach((p) =>
    p.items.forEach((it) => {
      if (!it.units || it.units <= 0) {
        issues.push({
          severity: 'warn',
          kind: 'zero-units',
          palletId: p.id,
          msg: `${p.id} / ${it.fnsku || it.sku}: количество = 0`,
        });
      }
      if (parsed.format !== 'schilder') {
        if (!it.asin) {
          issues.push({
            severity: 'warn', kind: 'missing-asin', palletId: p.id,
            msg: `${p.id} / ${it.fnsku}: пустой ASIN`,
          });
        }
        if (!it.ean && !it.upc) {
          issues.push({
            severity: 'warn', kind: 'missing-code', palletId: p.id,
            msg: `${p.id} / ${it.fnsku}: нет EAN/UPC`,
          });
        }
      }
    })
  );

  const errors = issues.filter((i) => i.severity === 'error');
  const warnings = issues.filter((i) => i.severity === 'warn');
  return {
    ok: errors.length === 0,
    issues,
    errorCount: errors.length,
    warningCount: warnings.length,
    counts: {
      palletsParsed: parsed.pallets.length,
      itemsParsed: totalSkus,
      entriesParsed: totalEntries,
      itemsExpectedFromHeader: parsed.meta?.totalSkus,
      unitsParsed: totalUnits,
      unitsExpectedFromHeader: parsed.meta?.totalUnits,
    },
  };
}
