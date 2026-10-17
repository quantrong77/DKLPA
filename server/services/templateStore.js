/**
 * Mẫu Word của các văn bản xuất ra (biên bản KSHT, phương án, giấy ĐKCT, giấy xác nhận).
 *
 * Mẫu gốc nằm trong templates/ (đi theo mã nguồn, luôn có). Admin tải lên mẫu mới (bảng dkct_doc_templates) và chọn
 * mẫu đang dùng cho từng loại; không chọn mẫu nào thì dùng mẫu gốc. Nhờ vậy đổi mẫu không cần sửa mã.
 *
 * Mẫu dùng thẻ docxtemplater {tên}, {#lặp}…{/lặp}, {@xml}; nhãn ký số ((…)) của ứng dụng ký số giữ nguyên.
 * Trước khi lưu, mẫu được kiểm tra: đúng file .docx, thẻ đóng/mở khớp, thử điền dữ liệu (văn bản gần nhất) không lỗi;
 * thẻ lạ (không có trong mẫu gốc) và thẻ mẫu gốc có mà mẫu mới thiếu được báo để người tải tự xem lại.
 */
const fs = require('node:fs');
const path = require('node:path');
const PizZip = require('pizzip');
const Docxtemplater = require('docxtemplater');

const TEMPLATE_DIR = path.join(__dirname, '..', '..', 'templates');
const KINDS = {
  survey: { label: 'Biên bản khảo sát hiện trường', file: 'template_bbksht.docx' },
  plan: { label: 'Phương án', file: 'template_pa.docx' },
  registration: { label: 'Giấy đăng ký công tác', file: 'template_dkct.docx' },
  confirmation: { label: 'Giấy xác nhận đủ điều kiện', file: 'template_gxn.docx' }
};
const MAX_BYTES = 10 * 1024 * 1024;

const fail = (status, message, extra = {}) => Object.assign(new Error(message), { status, ...extra });
const builtinPath = (kind) => path.join(TEMPLATE_DIR, KINDS[kind].file);

/** Chữ của các phần văn bản (thân, đầu trang, chân trang), mỗi đoạn một dòng (thẻ có thể bị Word tách nhiều run). */
function partsText(zip) {
  const names = Object.keys(zip.files).filter(n => /^word\/(document|header\d*|footer\d*)\.xml$/.test(n));
  return names.map(n => zip.file(n).asText().split('</w:p>')
    .map(p => (p.match(/<w:t(?:\s[^>]*)?>[^<]*<\/w:t>/g) || []).map(t => t.replace(/<[^>]+>/g, '')).join(''))
    .join('\n')).join('\n')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
}

/** Thẻ trong mẫu: { fields: ['tên', '#lặp', '@xml', …], signs: ['((nguoilap))', …] } */
function readTags(zip) {
  const text = partsText(zip);
  const fields = new Set();
  for (const m of text.matchAll(/\{([#^/@]?)\s*([^{}]+?)\s*\}/g)) {
    if (m[1] === '/') continue;
    fields.add(`${m[1]}${m[2]}`);
  }
  return { fields: [...fields], signs: [...new Set(text.match(/\(\([^()]+\)\)/g) || [])] };
}

// lỗi thường gặp của docxtemplater -> câu tiếng Việt (t: tên thẻ)
const ERROR_TEXT = {
  unclosed_loop: (t) => `Đoạn lặp {#${t}} chưa có thẻ đóng {/${t}}.`,
  unopened_loop: (t) => `Thẻ đóng {/${t}} không có thẻ mở {#${t}} tương ứng.`,
  closing_tag_does_not_match_opening_tag: (t, p) => `Thẻ đóng không khớp thẻ mở${p.openingtag ? ` {#${p.openingtag}}` : ''}${p.closingtag ? ` (gặp {/${p.closingtag}})` : ''}.`,
  unclosed_tag: (t) => `Thẻ "${t}" thiếu dấu đóng "}".`,
  unopened_tag: (t) => `Thẻ "${t}" thiếu dấu mở "{".`,
  duplicate_open_tag: (t) => `Thừa dấu "{" ở thẻ "${t}" (gõ "{{" thay vì "{").`,
  duplicate_close_tag: (t) => `Thừa dấu "}" ở thẻ "${t}" (gõ "}}" thay vì "}").`,
  raw_xml_tag_should_be_only_text_in_paragraph: (t) => `Thẻ {@${t}} phải đứng một mình trong một đoạn (không có chữ khác cùng dòng).`,
  unbalanced_loop_tags: () => 'Các đoạn lặp mở/đóng lồng nhau không đúng thứ tự.',
  unclosed_loop_section: (t) => `Đoạn lặp {#${t}} chưa có thẻ đóng {/${t}}.`
};

/** Lỗi docxtemplater -> danh sách câu dễ hiểu (tiếng Việt khi biết loại lỗi). */
function explain(err) {
  const list = err?.properties?.errors?.length ? err.properties.errors : [err];
  return list.map(e => {
    const p = e.properties || {};
    const tag = String(p.xtag ?? '').trim();
    if (ERROR_TEXT[p.id]) return ERROR_TEXT[p.id](tag, p);
    return [p.explanation || e.message, tag && !String(p.explanation || '').includes(tag) ? `(thẻ "${tag}")` : ''].filter(Boolean).join(' ');
  }).slice(0, 20);
}

const builtinCache = new Map();
function builtinBuffer(kind) {
  if (!builtinCache.has(kind)) builtinCache.set(kind, fs.readFileSync(builtinPath(kind)));
  return builtinCache.get(kind);
}
const builtinTags = (kind) => readTags(new PizZip(builtinBuffer(kind)));

/**
 * Kiểm tra cấu trúc một file mẫu (chưa thử điền dữ liệu): -> { tags, unknown, missing, signs, missingSigns }
 * Ném lỗi 422 (errors: [...]) nếu không phải .docx hoặc thẻ sai cú pháp.
 */
function inspectTemplate(kind, buffer) {
  if (!KINDS[kind]) throw fail(400, 'Loại văn bản không hợp lệ.');
  if (!buffer?.length) throw fail(400, 'Chọn file mẫu Word (.docx).');
  if (buffer.length > MAX_BYTES) throw fail(413, 'File mẫu quá lớn (tối đa 10 MB).');
  let zip;
  try { zip = new PizZip(buffer); } catch { throw fail(422, 'File không phải .docx (Word 2007 trở lên).', { errors: ['Không mở được file: hãy lưu lại bằng Word dạng .docx.'] }); }
  if (!zip.file('word/document.xml')) throw fail(422, 'File không phải văn bản Word .docx.', { errors: ['Thiếu word/document.xml.'] });
  try {
    // dựng thử: báo thẻ thiếu ngoặc, vòng lặp {#…} không đóng {/…}
    // errorLogging: false — lỗi đã trả về người tải lên, không ghi cả khối JSON ra nhật ký máy chủ
    new Docxtemplater(new PizZip(buffer), { paragraphLoop: true, linebreaks: true, nullGetter: () => '', errorLogging: false }); // eslint-disable-line no-new
  } catch (err) {
    throw fail(422, 'Mẫu có thẻ sai cú pháp.', { errors: explain(err) });
  }
  const own = readTags(zip);
  const base = builtinTags(kind);
  const baseFields = new Set(base.fields);
  const ownFields = new Set(own.fields);
  return {
    tags: own.fields,
    signs: own.signs,
    unknown: own.fields.filter(f => !baseFields.has(f)),
    missing: base.fields.filter(f => !ownFields.has(f)),
    missingSigns: base.signs.filter(s => !own.signs.includes(s))
  };
}

/**
 * @param db
 * @param renderers { survey(sample, tpl), plan(sample, tpl), … } dựng văn bản từ dữ liệu mẫu bằng mẫu `tpl` (Buffer)
 * @param sampleOf  async (kind) -> dữ liệu văn bản gần nhất (hoặc rỗng) để thử điền
 */
function createTemplateStore({ db, renderers, sampleOf }) {
  const cache = new Map(); // kind -> { id, revision, content: Buffer }

  async function active(kind) {
    return db.queryOne('SELECT id, name, revision FROM dkct_doc_templates WHERE kind = ? AND active = 1', [kind]);
  }

  /** Mẫu đang dùng: { id, name, content } của mẫu đã tải lên, hoặc null (dùng mẫu gốc). */
  async function current(kind) {
    const row = await active(kind);
    if (!row) return null;
    const hit = cache.get(kind);
    if (hit && hit.id === row.id && Number(hit.revision) === Number(row.revision)) return hit;
    const full = await db.queryOne('SELECT content FROM dkct_doc_templates WHERE id = ?', [row.id]);
    if (!full) return null;
    const entry = { id: row.id, name: row.name, revision: row.revision, content: Buffer.from(full.content) };
    cache.set(kind, entry);
    return entry;
  }

  /** Dựng văn bản bằng mẫu đang dùng; mẫu tải lên mà lỗi -> báo rõ để admin quay về mẫu gốc. */
  async function render(kind, fn) {
    const tpl = await current(kind);
    if (!tpl) return fn(undefined);
    try {
      return await fn(tpl.content);
    } catch (err) {
      throw fail(409, `Mẫu Word "${tpl.name}" đang dùng cho ${KINDS[kind].label.toLowerCase()} bị lỗi khi điền: ${explain(err)[0]}. `
        + 'Admin vào Cài đặt → Mẫu văn bản để sửa hoặc chọn lại mẫu gốc.');
    }
  }

  /** Kiểm tra đầy đủ: cấu trúc + thử điền dữ liệu văn bản gần nhất. -> báo cáo (ném 422 nếu không dùng được). */
  async function check(kind, buffer) {
    const report = inspectTemplate(kind, buffer);
    const sample = await sampleOf(kind);
    try {
      await renderers[kind](sample.doc, buffer);
    } catch (err) {
      throw fail(422, 'Mẫu không điền được dữ liệu.', { errors: explain(err), report });
    }
    return { ...report, sampleFrom: sample.label };
  }

  /** Điền văn bản gần nhất (hoặc dữ liệu trống) vào mẫu `buffer` (bỏ trống = mẫu đang dùng) -> .docx để xem thử. */
  async function renderSample(kind, buffer) {
    if (!KINDS[kind]) throw fail(400, 'Loại văn bản không hợp lệ.');
    if (buffer) inspectTemplate(kind, buffer);
    const sample = await sampleOf(kind);
    const tpl = buffer || (await current(kind))?.content;
    try {
      return await renderers[kind](sample.doc, tpl);
    } catch (err) {
      throw fail(422, `Mẫu không điền được dữ liệu: ${explain(err)[0]}`);
    }
  }

  const invalidate = (kind) => (kind ? cache.delete(kind) : cache.clear());

  return { current, render, check, renderSample, invalidate, active };
}

module.exports = { KINDS, MAX_BYTES, builtinPath, builtinBuffer, builtinTags, inspectTemplate, readTags, createTemplateStore };
