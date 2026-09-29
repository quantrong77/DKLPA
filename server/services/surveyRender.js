/**
 * Điền BBKSHT vào mẫu Word templates/template_bbksht.docx (sinh bằng scripts/tag_bbksht.py)
 * và chèn ảnh sơ đồ một sợi (PNG/JPEG) vào trang cuối, thay cho ảnh ví dụ của mẫu.
 *
 * Ảnh được thêm thẳng vào gói DOCX (word/media + quan hệ + kiểu nội dung) rồi tham chiếu
 * từ đoạn {@diagramXml}; không cần module ảnh trả phí của docxtemplater.
 */
const fs = require('node:fs');
const path = require('node:path');
const PizZip = require('pizzip');
const Docxtemplater = require('docxtemplater');
const { toSurveyView } = require('./surveyView');

const TEMPLATE_PATH = path.join(__dirname, '..', '..', 'templates', 'template_bbksht.docx');
const REL_ID = 'rIdDkctDiagram';
// khung ảnh trên trang ngang (EMU), bằng ảnh ví dụ trong mẫu
const MAX_CX = 9093835;
const MAX_CY = 5202382;
let templateBinary = null;

/** { type, width, height } của ảnh PNG/JPEG; null nếu không phải hai loại này. */
function imageInfo(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 12) return null;
  if (buf.length >= 24 && buf.readUInt32BE(0) === 0x89504e47 && buf.readUInt32BE(4) === 0x0d0a1a0a) {
    return { type: 'png', width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    // duyệt các đoạn JPEG tới khung SOF (C0–CF, trừ C4 DHT, C8, CC DAC)
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) { i++; continue; }
      const marker = buf[i + 1];
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { type: 'jpeg', height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
      }
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
      i += 2 + buf.readUInt16BE(i + 2);
    }
  }
  return null;
}

/** Co giãn (w, h) vừa khung (maxW, maxH), giữ tỉ lệ. */
function fitImage(w, h, maxW, maxH) {
  const scale = Math.min(maxW / w, maxH / h);
  return { cx: Math.round(w * scale), cy: Math.round(h * scale) };
}

// bề rộng vùng in của trang ngang (A4 ngang, lề trái/phải 1134 twip) để tính vị trí ảnh căn giữa
const COLUMN_CX = (16838 - 2 * 1134) * 635;
const RED = 'FF0000';
const LABEL_CY = 290830;
const escapeXml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Một hình của Word (khung hoặc hộp chữ) đặt nổi trên ảnh, vị trí tính từ đầu đoạn chứa ảnh. */
function anchoredShape({ id, name, x, y, cx, cy, z, spPr, txbx = '', bodyPr = '<wps:bodyPr/>' }) {
  return '<w:r><mc:AlternateContent xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"'
    + ' xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"><mc:Choice Requires="wps"><w:drawing>'
    + '<wp:anchor distT="0" distB="0" distL="0" distR="0" simplePos="0" relativeHeight="' + z + '" behindDoc="0" locked="0" layoutInCell="1" allowOverlap="1"'
    + ' xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">'
    + `<wp:simplePos x="0" y="0"/><wp:positionH relativeFrom="column"><wp:posOffset>${Math.round(x)}</wp:posOffset></wp:positionH>`
    + `<wp:positionV relativeFrom="paragraph"><wp:posOffset>${Math.round(y)}</wp:posOffset></wp:positionV>`
    + `<wp:extent cx="${Math.round(cx)}" cy="${Math.round(cy)}"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:wrapNone/>`
    + `<wp:docPr id="${id}" name="${name}"/><wp:cNvGraphicFramePr/>`
    + '<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.microsoft.com/office/word/2010/wordprocessingShape">'
    + `<wps:wsp><wps:cNvSpPr/><wps:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${Math.round(cx)}" cy="${Math.round(cy)}"/></a:xfrm>${spPr}</wps:spPr>`
    + `${txbx}${bodyPr}</wps:wsp></a:graphicData></a:graphic></wp:anchor></w:drawing></mc:Choice></mc:AlternateContent></w:r>`;
}

/** Khung đỏ "Khu vực công tác" (và nhãn) cho từng mark; x, y, w, h tương đối theo ảnh cx×cy. */
function marksXml(marks, { cx, cy }) {
  const left = Math.max(0, (COLUMN_CX - cx) / 2);
  return (marks || []).map((m, i) => {
    const box = anchoredShape({
      id: 9100 + i * 2, name: `Khu vuc cong tac ${i + 1}`, z: 251700000 + i * 2,
      x: left + m.x * cx, y: m.y * cy, cx: m.w * cx, cy: m.h * cy,
      spPr: `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/><a:ln w="28575"><a:solidFill><a:srgbClr val="${RED}"/></a:solidFill></a:ln>`
    });
    if (!m.label) return box;
    const labelCx = Math.min(4000000, Math.max(1000000, m.label.length * 100000));
    // nhãn nằm ngay trên khung; khung sát mép trên ảnh thì đặt nhãn bên dưới
    const top = m.y * cy - LABEL_CY - 30000;
    const label = anchoredShape({
      id: 9101 + i * 2, name: `Nhan khu vuc ${i + 1}`, z: 251700001 + i * 2,
      x: left + m.x * cx, y: top >= 0 ? top : (m.y + m.h) * cy + 30000, cx: labelCx, cy: LABEL_CY,
      spPr: `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:ln w="12700"><a:solidFill><a:srgbClr val="${RED}"/></a:solidFill></a:ln>`,
      txbx: '<wps:txbx><w:txbxContent><w:p><w:pPr><w:spacing w:before="0" w:after="0"/><w:jc w:val="center"/></w:pPr><w:r>'
        + `<w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:color w:val="${RED}"/><w:sz w:val="22"/></w:rPr>`
        + `<w:t xml:space="preserve">${escapeXml(m.label)}</w:t></w:r></w:p></w:txbxContent></wps:txbx>`,
      bodyPr: '<wps:bodyPr lIns="45720" tIns="9144" rIns="45720" bIns="9144" anchor="ctr"><a:noAutofit xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"/></wps:bodyPr>'
    });
    return box + label;
  }).join('');
}

/** Đoạn căn giữa chứa một ảnh inline (cx×cy EMU) tham chiếu quan hệ relId; extra: các run hình vẽ nổi. */
function imageParagraphXml({ cx, cy }, ext, { relId = REL_ID, name = 'dkct_diagram', docPrId = 9001, extra = '' } = {}) {
  return '<w:p><w:pPr><w:spacing w:before="0" w:after="120"/><w:jc w:val="center"/></w:pPr>' + extra + '<w:r><w:drawing>'
    + '<wp:inline distT="0" distB="0" distL="0" distR="0" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">'
    + `<wp:extent cx="${cx}" cy="${cy}"/><wp:effectExtent l="0" t="0" r="0" b="0"/>`
    + `<wp:docPr id="${docPrId}" name="${name}"/>`
    + '<wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr>'
    + '<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">'
    + '<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">'
    + `<pic:nvPicPr><pic:cNvPr id="0" name="${name}.${ext}"/><pic:cNvPicPr/></pic:nvPicPr>`
    + `<pic:blipFill><a:blip r:embed="${relId}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>`
    + `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>`
    + '</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>';
}

// "So do mot soi": tên hình trong Word (không dấu để tương thích mọi bản Word)
const diagramXml = (size, ext, marks = []) => imageParagraphXml(size, ext, { name: 'So do mot soi', extra: marksXml(marks, size) });

/** Thêm ảnh vào gói DOCX: word/media/<name>.<ext>, quan hệ relId, kiểu nội dung. */
function addImagePart(zip, buffer, ext, { relId = REL_ID, name = 'dkct_diagram' } = {}) {
  zip.file(`word/media/${name}.${ext}`, buffer);
  const relsPath = 'word/_rels/document.xml.rels';
  zip.file(relsPath, zip.file(relsPath).asText().replace('</Relationships>',
    `<Relationship Id="${relId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${name}.${ext}"/></Relationships>`));
  const types = zip.file('[Content_Types].xml').asText();
  if (!new RegExp(`Extension="${ext}"`, 'i').test(types)) {
    zip.file('[Content_Types].xml', types.replace('</Types>', `<Default Extension="${ext}" ContentType="image/${ext}"/></Types>`));
  }
}

function loadTemplate(templatePath) {
  if (templatePath !== TEMPLATE_PATH) return fs.readFileSync(templatePath, 'binary');
  templateBinary = templateBinary || fs.readFileSync(TEMPLATE_PATH, 'binary');
  return templateBinary;
}

/** survey: { data }; diagram: { buffer } (tùy chọn). Trả về Buffer DOCX. */
function renderSurveyDocx(survey, diagram = null, templatePath = TEMPLATE_PATH) {
  const zip = new PizZip(loadTemplate(templatePath));
  const info = diagram?.buffer ? imageInfo(diagram.buffer) : null;
  const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true, nullGetter: () => '' });
  doc.render({
    ...toSurveyView(survey.data),
    diagramXml: info ? diagramXml(fitImage(info.width, info.height, MAX_CX, MAX_CY), info.type, survey.data.diagramMarks) : '<w:p/>'
  });
  const out = doc.getZip();
  if (info) addImagePart(out, diagram.buffer, info.type);
  return out.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
}

module.exports = { renderSurveyDocx, imageInfo, fitImage, imageParagraphXml, addImagePart, TEMPLATE_PATH };
