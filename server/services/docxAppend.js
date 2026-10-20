/**
 * Ghép một file Word (.docx) vào cuối một file Word khác, sang trang mới (section mới, giữ khổ giấy / hướng giấy,
 * đầu trang / chân trang của file ghép). Chép kèm ảnh và các phần liên kết, kiểu (style) chưa có, danh sách đánh số;
 * bỏ chú thích cuối trang và bình luận của file ghép. Dùng cho phụ lục người lập phương án đính kèm.
 */
const PizZip = require('pizzip');

const REL_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const NUMBERING_TYPE = `${REL_NS}/numbering`;
const NUMBERING_CT = 'application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml';
const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

const bad = (message) => Object.assign(new Error(message), { status: 422 });
const attrOf = (tag, name) => (tag.match(new RegExp(`\\s${name}="([^"]*)"`)) || [])[1];
const xmlAttr = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

/** Kiểm tra nhanh: là file .docx đọc được (có word/document.xml). */
function isDocx(buffer) {
  try {
    return !!new PizZip(buffer).file('word/document.xml');
  } catch {
    return false;
  }
}

// ---- đường dẫn phần trong gói ----
const dirOf = (p) => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '');
const baseOf = (p) => p.slice(p.lastIndexOf('/') + 1);
const relsPathOf = (p) => `${dirOf(p) ? `${dirOf(p)}/` : ''}_rels/${baseOf(p)}.rels`;
function resolve(fromDir, target) {
  if (target.startsWith('/')) return target.slice(1);
  const parts = fromDir ? fromDir.split('/') : [];
  for (const seg of target.split('/')) {
    if (seg === '..') parts.pop();
    else if (seg && seg !== '.') parts.push(seg);
  }
  return parts.join('/');
}
function relative(fromDir, to) {
  const a = fromDir ? fromDir.split('/') : [];
  const b = to.split('/');
  let i = 0;
  while (i < a.length && i < b.length - 1 && a[i] === b[i]) i++;
  return [...Array(a.length - i).fill('..'), ...b.slice(i)].join('/');
}

function parseRels(xml) {
  const rels = new Map();
  for (const m of String(xml || '').matchAll(/<Relationship\s[^>]*?\/?>/g)) {
    const id = attrOf(m[0], 'Id');
    if (id) rels.set(id, { type: attrOf(m[0], 'Type'), target: attrOf(m[0], 'Target'), mode: attrOf(m[0], 'TargetMode') });
  }
  return rels;
}
const relXml = (id, r) => `<Relationship Id="${xmlAttr(id)}" Type="${xmlAttr(r.type)}" Target="${xmlAttr(r.target)}"${r.mode ? ` TargetMode="${xmlAttr(r.mode)}"` : ''}/>`;
const EMPTY_RELS = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>';
function addRels(zip, path, entries) {
  if (!entries.length) return;
  const xml = zip.file(path)?.asText() || EMPTY_RELS;
  zip.file(path, xml.replace('</Relationships>', () => `${entries.join('')}</Relationships>`));
}

// ---- [Content_Types].xml ----
function contentTypes(zip) {
  const xml = zip.file('[Content_Types].xml').asText();
  const defaults = new Map([...xml.matchAll(/<Default\s[^>]*>/g)].map(m => [String(attrOf(m[0], 'Extension')).toLowerCase(), attrOf(m[0], 'ContentType')]));
  const overrides = new Map([...xml.matchAll(/<Override\s[^>]*>/g)].map(m => [attrOf(m[0], 'PartName'), attrOf(m[0], 'ContentType')]));
  return { xml, defaults, overrides };
}

/** Tiền tố của không gian tên quan hệ (thường "r") trong phần tử gốc. */
function relPrefixes(rootTag) {
  return [...rootTag.matchAll(/\sxmlns:([\w.-]+)="([^"]*)"/g)].filter(m => m[2] === REL_NS).map(m => m[1]);
}

/**
 * Ghép: mainZip (PizZip, sửa tại chỗ) + appendix (Buffer .docx). n: số thứ tự file ghép (đặt tên phần không trùng).
 */
function appendDocx(mainZip, appendix, n = 1) {
  let src;
  try { src = new PizZip(appendix); } catch { throw bad('File phụ lục không phải file Word .docx đọc được.'); }
  const srcDocXml = src.file('word/document.xml')?.asText();
  if (!srcDocXml) throw bad('File phụ lục không phải file Word .docx đọc được.');
  const tag = `dkctpl${n}_`;

  // ---- thân văn bản của file ghép ----
  const bodyStart = srcDocXml.search(/<w:body>/);
  const bodyEnd = srcDocXml.lastIndexOf('</w:body>');
  if (bodyStart < 0 || bodyEnd < 0) throw bad('File phụ lục không có nội dung.');
  let body = srcDocXml.slice(bodyStart + '<w:body>'.length, bodyEnd);
  let srcSect = '';
  const lastSect = body.lastIndexOf('<w:sectPr');
  if (lastSect >= 0 && /^<w:sectPr[\s\S]*<\/w:sectPr>\s*$/.test(body.slice(lastSect))) {
    srcSect = body.slice(lastSect).trim();
    body = body.slice(0, lastSect);
  }
  const srcRoot = srcDocXml.match(/<w:document\b[^>]*>/)?.[0] || '';

  // bỏ phần không chép: chú thích cuối trang/cuối văn bản, bình luận; mã đoạn w14 (phải không trùng)
  const strip = (xml) => xml
    .replace(/<w:r\b[^>]*>(?:(?!<\/w:r>)[\s\S])*?<w:(?:footnoteReference|endnoteReference|commentReference)\b[^>]*\/>(?:(?!<\/w:r>)[\s\S])*?<\/w:r>/g, '')
    .replace(/<w:(?:commentRangeStart|commentRangeEnd)\b[^>]*\/>/g, '')
    .replace(/\s(?:w14:paraId|w14:textId)="[^"]*"/g, '');
  body = strip(body);
  srcSect = strip(srcSect);

  // ---- quan hệ (ảnh, liên kết, đầu/chân trang…) dùng trong thân: chép phần, đổi mã ----
  const ct = contentTypes(mainZip);
  const srcCt = contentTypes(src);
  const newDefaults = [];
  const newOverrides = [];
  const copied = new Map(); // đường dẫn phần nguồn -> đường dẫn mới
  function copyPart(srcPath) {
    if (copied.has(srcPath)) return copied.get(srcPath);
    const file = src.file(srcPath);
    if (!file) return null;
    let dest = `${dirOf(srcPath)}/${tag}${baseOf(srcPath)}`;
    while (mainZip.file(dest)) dest = `${dirOf(dest)}/x${baseOf(dest)}`;
    copied.set(srcPath, dest);
    mainZip.file(dest, file.asUint8Array());
    const over = srcCt.overrides.get(`/${srcPath}`);
    if (over) newOverrides.push(`<Override PartName="/${xmlAttr(dest)}" ContentType="${xmlAttr(over)}"/>`);
    const ext = (baseOf(srcPath).split('.').pop() || '').toLowerCase();
    if (!over && ext && !ct.defaults.has(ext) && srcCt.defaults.has(ext)) {
      ct.defaults.set(ext, srcCt.defaults.get(ext));
      newDefaults.push(`<Default Extension="${xmlAttr(ext)}" ContentType="${xmlAttr(srcCt.defaults.get(ext))}"/>`);
    }
    // phần có quan hệ riêng (vd đầu trang có ảnh, biểu đồ): chép theo, giữ mã quan hệ
    const rels = src.file(relsPathOf(srcPath))?.asText();
    if (rels) {
      const entries = [];
      for (const [id, r] of parseRels(rels)) {
        if (r.mode === 'External') { entries.push(relXml(id, r)); continue; }
        const to = copyPart(resolve(dirOf(srcPath), r.target));
        if (to) entries.push(relXml(id, { ...r, target: relative(dirOf(dest), to) }));
      }
      addRels(mainZip, relsPathOf(dest), entries);
    }
    return dest;
  }

  const srcRels = parseRels(src.file('word/_rels/document.xml.rels')?.asText());
  const mainRelsPath = 'word/_rels/document.xml.rels';
  const mainRels = parseRels(mainZip.file(mainRelsPath)?.asText());
  const idMap = new Map();
  const newRels = [];
  const prefixes = relPrefixes(srcRoot);
  const refRe = prefixes.length ? new RegExp(`(\\s(?:${prefixes.join('|')}):[\\w]+=")([^"]+)(")`, 'g') : null;
  const SKIP = /\/(?:footnotes|endnotes|comments|commentsExtended|commentsIds|people)$/;
  const remap = (xml) => (refRe ? xml.replace(refRe, (all, pre, id, post) => {
    if (!srcRels.has(id)) return all;
    if (!idMap.has(id)) {
      const r = srcRels.get(id);
      if (SKIP.test(r.type)) return all;
      let newId = `rId${tag}${idMap.size + 1}`;
      while (mainRels.has(newId)) newId = `x${newId}`;
      if (r.mode === 'External') {
        newRels.push(relXml(newId, r));
      } else {
        const to = copyPart(resolve('word', r.target));
        if (!to) return all;
        newRels.push(relXml(newId, { ...r, target: relative('word', to) }));
      }
      idMap.set(id, newId);
    }
    return `${pre}${idMap.get(id)}${post}`;
  }) : xml);
  body = remap(body);
  srcSect = remap(srcSect);

  // ---- mã không được trùng trong văn bản: hình (wp:docPr), dấu trang (bookmark) ----
  let mainDoc = mainZip.file('word/document.xml').asText();
  const maxOf = (xml, re) => Math.max(0, ...[...xml.matchAll(re)].map(m => Number(m[1]) || 0));
  // mã mới = số nhỏ nhất chưa dùng (mã gốc có thể đã gần 2^31: cộng thêm thì Word không mở được)
  const freshIds = (re) => {
    const used = new Set([...mainDoc.matchAll(re)].map(m => m[1]));
    const map = new Map();
    let next = 1;
    return (id) => {
      if (!map.has(id)) {
        while (used.has(String(next))) next++;
        map.set(id, String(next));
        used.add(String(next));
      }
      return map.get(id);
    };
  };
  const docPrId = freshIds(/<(?:wp:docPr|pic:cNvPr)\b[^>]*\sid="(\d+)"/g);
  const bookmarkId = freshIds(/<w:bookmark(?:Start|End)\b[^>]*\sw:id="(\d+)"/g);
  body = body
    .replace(/(<wp:docPr\b[^>]*\sid=")(\d+)(")/g, (m, a, id, b) => `${a}${docPrId(id)}${b}`)
    .replace(/(<pic:cNvPr\b[^>]*\sid=")(\d+)(")/g, (m, a, id, b) => `${a}${docPrId(id)}${b}`)
    .replace(/(<w:bookmark(?:Start|End)\b[^>]*\sw:id=")(\d+)(")/g, (m, a, id, b) => `${a}${bookmarkId(id)}${b}`);

  // ---- danh sách đánh số: chép w:num + w:abstractNum với mã mới ----
  const srcNumbering = src.file('word/numbering.xml')?.asText() || '';
  const usedNums = new Set();
  const collectNums = (xml) => { for (const m of xml.matchAll(/<w:numId w:val="(\d+)"/g)) if (m[1] !== '0') usedNums.add(m[1]); };
  collectNums(body);

  // ---- kiểu (style) chưa có trong văn bản chính: chép kèm kiểu gốc (basedOn / link / next) ----
  const srcStyles = src.file('word/styles.xml')?.asText() || '';
  const mainStylesPath = 'word/styles.xml';
  let mainStyles = mainZip.file(mainStylesPath)?.asText() || '';
  const styleOf = (xml) => new Map([...xml.matchAll(/<w:style\b[^>]*>[\s\S]*?<\/w:style>/g)].map(m => [attrOf(m[0].match(/<w:style\b[^>]*>/)[0], 'w:styleId'), m[0]]));
  const srcStyleMap = styleOf(srcStyles);
  const mainStyleIds = new Set(styleOf(mainStyles).keys());
  const addedStyles = [];
  const wantStyle = (id) => {
    if (!id || mainStyleIds.has(id) || !srcStyleMap.has(id)) return;
    mainStyleIds.add(id);
    const xml = srcStyleMap.get(id);
    addedStyles.push(xml);
    collectNums(xml);
    for (const m of xml.matchAll(/<w:(?:basedOn|link|next) w:val="([^"]*)"/g)) wantStyle(m[1]);
  };
  for (const m of body.matchAll(/<w:(?:pStyle|rStyle|tblStyle) w:val="([^"]*)"/g)) wantStyle(m[1]);

  const numMap = new Map();
  if (usedNums.size && srcNumbering) {
    const numsPath = 'word/numbering.xml';
    let mainNumbering = mainZip.file(numsPath)?.asText();
    if (!mainNumbering) {
      mainNumbering = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:numbering xmlns:w="${W_NS}"></w:numbering>`;
      if (!ct.overrides.has('/word/numbering.xml')) newOverrides.push(`<Override PartName="/word/numbering.xml" ContentType="${NUMBERING_CT}"/>`);
      if (![...mainRels.values()].some(r => r.type === NUMBERING_TYPE)) newRels.push(relXml(`rId${tag}numbering`, { type: NUMBERING_TYPE, target: 'numbering.xml' }));
    }
    const srcNums = new Map([...srcNumbering.matchAll(/<w:num\b[^>]*w:numId="(\d+)"[^>]*>[\s\S]*?<\/w:num>/g)].map(m => [m[1], m[0]]));
    const srcAbs = new Map([...srcNumbering.matchAll(/<w:abstractNum\b[^>]*w:abstractNumId="(\d+)"[^>]*>[\s\S]*?<\/w:abstractNum>/g)].map(m => [m[1], m[0]]));
    let nextNum = maxOf(mainNumbering, /<w:num\b[^>]*w:numId="(\d+)"/g) + 1;
    let nextAbs = maxOf(mainNumbering, /<w:abstractNum\b[^>]*w:abstractNumId="(\d+)"/g) + 1;
    const absMap = new Map();
    const absXml = [];
    const numXml = [];
    for (const id of usedNums) {
      const num = srcNums.get(id);
      if (!num) continue;
      const absId = num.match(/<w:abstractNumId w:val="(\d+)"/)?.[1];
      if (absId && !absMap.has(absId) && srcAbs.has(absId)) {
        absMap.set(absId, String(nextAbs++));
        absXml.push(srcAbs.get(absId)
          .replace(/(<w:abstractNum\b[^>]*w:abstractNumId=")\d+(")/, `$1${absMap.get(absId)}$2`)
          .replace(/<w:nsid w:val="[^"]*"\/>/, `<w:nsid w:val="${(0x10000000 + Math.floor(Math.random() * 0xEFFFFFFF)).toString(16).toUpperCase().slice(0, 8)}"/>`)
          .replace(/\s(?:w15:restartNumberingAfterBreak|w16cid:durableId)="[^"]*"/g, ''));
      }
      numMap.set(id, String(nextNum++));
      numXml.push(num
        .replace(/(<w:num\b[^>]*w:numId=")\d+(")/, `$1${numMap.get(id)}$2`)
        .replace(/(<w:abstractNumId w:val=")(\d+)(")/, (m, a, v, b) => `${a}${absMap.get(v) ?? v}${b}`)
        .replace(/\s(?:w16cid:durableId)="[^"]*"/g, ''));
    }
    // thứ tự theo lược đồ: mọi w:abstractNum trước w:num; w:numIdMacAtCleanup (nếu có) đứng cuối
    const firstNum = mainNumbering.search(/<w:num\b/);
    const cleanup = mainNumbering.search(/<w:numIdMacAtCleanup\b/);
    const close = cleanup >= 0 ? cleanup : mainNumbering.lastIndexOf('</w:numbering>');
    const absAt = firstNum >= 0 ? firstNum : close;
    mainNumbering = mainNumbering.slice(0, absAt) + absXml.join('') + mainNumbering.slice(absAt, close) + numXml.join('') + mainNumbering.slice(close);
    mainZip.file(numsPath, mainNumbering);
  }
  const renumber = (xml) => xml.replace(/(<w:numId w:val=")(\d+)(")/g, (m, a, v, b) => (numMap.has(v) ? `${a}${numMap.get(v)}${b}` : m));
  body = renumber(body);
  if (addedStyles.length && mainStyles) {
    mainStyles = mainStyles.replace('</w:styles>', () => `${addedStyles.map(renumber).join('')}</w:styles>`);
    mainZip.file(mainStylesPath, mainStyles);
  }

  // ---- không gian tên của file ghép chưa khai báo ở văn bản chính ----
  const mainRoot = mainDoc.match(/<w:document\b[^>]*>/)[0];
  const declared = new Set([...mainRoot.matchAll(/\sxmlns:([\w.-]+)=/g)].map(m => m[1]));
  const extra = [...srcRoot.matchAll(/\sxmlns:([\w.-]+)="([^"]*)"/g)].filter(m => !declared.has(m[1])).map(m => ` xmlns:${m[1]}="${m[2]}"`);
  let root = mainRoot;
  if (extra.length) root = root.replace(/>$/, () => `${extra.join('')}>`);
  const ignorable = (t) => (attrOf(t, 'mc:Ignorable') || '').split(/\s+/).filter(Boolean);
  const allDeclared = new Set([...root.matchAll(/\sxmlns:([\w.-]+)=/g)].map(m => m[1]));
  const ign = [...new Set([...ignorable(mainRoot), ...ignorable(srcRoot)])].filter(p => allDeclared.has(p));
  if (ign.length && allDeclared.has('mc')) {
    root = /\smc:Ignorable="/.test(root) ? root.replace(/\smc:Ignorable="[^"]*"/, ` mc:Ignorable="${ign.join(' ')}"`) : root.replace(/>$/, ` mc:Ignorable="${ign.join(' ')}">`);
  }
  mainDoc = mainDoc.replace(mainRoot, () => root);

  // ---- section: kết thúc section cuối của văn bản chính, file ghép bắt đầu trang mới với khổ giấy của nó ----
  const close = mainDoc.lastIndexOf('</w:body>');
  const mainLast = mainDoc.lastIndexOf('<w:sectPr', close);
  const mainSect = mainLast >= 0 && /^<w:sectPr[\s\S]*<\/w:sectPr>\s*$/.test(mainDoc.slice(mainLast, close)) ? mainDoc.slice(mainLast, close).trim() : '';
  const before = mainSect ? mainDoc.slice(0, mainLast) : mainDoc.slice(0, close);
  const breakPara = mainSect
    ? `<w:p><w:pPr>${mainSect.replace(/<w:type w:val="[^"]*"\/>/, '')}</w:pPr></w:p>`
    : '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
  // section của file ghép không có đầu / chân trang riêng: dùng của section đầu văn bản chính (vd chân trang "-n/N-" của
  // phương án), không để Word lấy theo section liền trước (đầu trang của phụ lục trước); số trang đánh tiếp, không bắt đầu lại
  const firstSect = mainDoc.match(/<w:sectPr\b[\s\S]*?<\/w:sectPr>/)?.[0] || '';
  // văn bản chính không có đầu (chân) trang: trỏ tới một đầu (chân) trang trống để không thừa hưởng của phụ lục trước
  const emptyPart = (kind) => {
    const id = `rIdDkctEmpty${kind}`;
    const part = `word/dkct_empty_${kind}.xml`;
    if (!mainZip.file(part)) {
      const el = kind === 'header' ? 'hdr' : 'ftr';
      mainZip.file(part, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:${el} xmlns:w="${W_NS}"><w:p/></w:${el}>`);
      newOverrides.push(`<Override PartName="/${part}" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.${kind}+xml"/>`);
      newRels.push(relXml(id, { type: `${REL_NS}/${kind}`, target: `dkct_empty_${kind}.xml` }));
    }
    return `<w:${kind}Reference w:type="default" r:id="${id}"/>`;
  };
  const hostRefs = (kind) => (firstSect.match(new RegExp(`<w:${kind}Reference\\b[^>]*/>`, 'g')) || []).join('') || emptyPart(kind);
  const withHostRefs = (sect) => {
    const add = ['header', 'footer'].filter(k => !new RegExp(`<w:${k}Reference\\b`).test(sect)).map(hostRefs).join('');
    return (add ? sect.replace(/<w:sectPr\b[^>]*>/, (m) => m + add) : sect)
      .replace(/(<w:pgNumType\b[^>]*?)\s+w:start="\d+"/, '$1');
  };
  body = body.replace(/<w:sectPr\b[\s\S]*?<\/w:sectPr>/g, withHostRefs);
  const finalSect = withHostRefs((srcSect || mainSect).replace(/<w:type w:val="[^"]*"\/>/, ''));
  mainZip.file('word/document.xml', `${before}${breakPara}${body}${finalSect}${mainDoc.slice(close)}`);

  addRels(mainZip, mainRelsPath, newRels);
  if (newDefaults.length || newOverrides.length) {
    mainZip.file('[Content_Types].xml', ct.xml
      .replace(/(<Types\b[^>]*>)/, (m) => `${m}${newDefaults.join('')}`)
      .replace('</Types>', () => `${newOverrides.join('')}</Types>`));
  }
  return mainZip;
}

module.exports = { appendDocx, isDocx };
