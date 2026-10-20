const PizZip = require('pizzip');
const { makePng } = require('./png');

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

/**
 * File Word phụ lục mẫu (khổ ngang): tiêu đề kiểu riêng "PLTitle", danh sách đánh số, một ảnh, dấu trang,
 * chú thích cuối trang (phải bị bỏ khi ghép), liên kết ngoài.
 */
function makeAppendixDocx(title = 'PHỤ LỤC V: CHI TIẾT THỰC HIỆN') {
  const zip = new PizZip();
  zip.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
    + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
    + '<Default Extension="xml" ContentType="application/xml"/>'
    + '<Default Extension="png" ContentType="image/png"/>'
    + '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
    + '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>'
    + '<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>'
    + '<Override PartName="/word/footnotes.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footnotes+xml"/>'
    + '</Types>');
  zip.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  zip.file('word/_rels/document.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + `<Relationship Id="rId1" Type="${R}/styles" Target="styles.xml"/>`
    + `<Relationship Id="rId2" Type="${R}/numbering" Target="numbering.xml"/>`
    + `<Relationship Id="rId3" Type="${R}/footnotes" Target="footnotes.xml"/>`
    + `<Relationship Id="rId4" Type="${R}/image" Target="media/image1.png"/>`
    + `<Relationship Id="rId5" Type="${R}/hyperlink" Target="https://evnnpt.vn/" TargetMode="External"/>`
    + '</Relationships>');
  zip.file('word/media/image1.png', makePng(40, 20));
  zip.file('word/styles.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="${W}">`
    + '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>'
    + '<w:style w:type="paragraph" w:styleId="PLBase"><w:name w:val="PL Base"/><w:rPr><w:sz w:val="28"/></w:rPr></w:style>'
    + '<w:style w:type="paragraph" w:customStyle="1" w:styleId="PLTitle"><w:name w:val="PL Title"/><w:basedOn w:val="PLBase"/><w:rPr><w:b/></w:rPr></w:style>'
    + '</w:styles>');
  zip.file('word/numbering.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:numbering xmlns:w="${W}">`
    + '<w:abstractNum w:abstractNumId="0"><w:nsid w:val="11112222"/><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/></w:lvl></w:abstractNum>'
    + '<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num></w:numbering>');
  zip.file('word/footnotes.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:footnotes xmlns:w="${W}"><w:footnote w:id="1"><w:p><w:r><w:t>Ghi chú</w:t></w:r></w:p></w:footnote></w:footnotes>`);
  const drawing = '<w:r><w:drawing><wp:inline><wp:extent cx="381000" cy="190500"/><wp:docPr id="1" name="Hình 1"/>'
    + '<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">'
    + '<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="1" name="image1.png"/><pic:cNvPicPr/></pic:nvPicPr>'
    + '<pic:blipFill><a:blip r:embed="rId4"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>'
    + '<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="381000" cy="190500"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic>'
    + '</a:graphicData></a:graphic></wp:inline></w:drawing></w:r>';
  zip.file('word/document.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + `<w:document xmlns:w="${W}" xmlns:r="${R}" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"`
    + ' xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" mc:Ignorable="w14"><w:body>'
    + `<w:p w14:paraId="1A2B3C4D"><w:pPr><w:pStyle w:val="PLTitle"/></w:pPr><w:bookmarkStart w:id="0" w:name="PL"/><w:r><w:t>${title}</w:t></w:r><w:bookmarkEnd w:id="0"/></w:p>`
    + '<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr><w:r><w:t>Bước một: kiểm tra hiện trường</w:t></w:r>'
    + '<w:r><w:rPr><w:vertAlign w:val="superscript"/></w:rPr><w:footnoteReference w:id="1"/></w:r></w:p>'
    + '<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr><w:hyperlink r:id="rId5"><w:r><w:t>Bước hai: thí nghiệm</w:t></w:r></w:hyperlink></w:p>'
    + `<w:p>${drawing}</w:p>`
    + '<w:sectPr><w:pgSz w:w="16840" w:h="11907" w:orient="landscape"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="567" w:footer="567" w:gutter="0"/></w:sectPr>'
    + '</w:body></w:document>');
  return zip.generate({ type: 'nodebuffer' });
}

/** Kiểm tra thẻ XML đóng mở cân đối (không có trình phân tích XML trong thư viện). */
function assertBalanced(xml) {
  const stack = [];
  for (const m of xml.replace(/<\?[\s\S]*?\?>/g, '').matchAll(/<(\/?)([\w:.-]+)[^>]*?(\/?)>/g)) {
    if (m[3]) continue;
    if (!m[1]) { stack.push(m[2]); continue; }
    const open = stack.pop();
    if (open !== m[2]) throw new Error(`Thẻ không cân đối: <${open}> … </${m[2]}>`);
  }
  if (stack.length) throw new Error(`Thẻ chưa đóng: ${stack.join(', ')}`);
}

module.exports = { makeAppendixDocx, assertBalanced };
