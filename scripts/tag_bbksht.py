"""
Sinh templates/template_bbksht.docx (có thẻ docxtemplater) từ mẫu gốc templates/template_bbksht.source.docx
(Biên bản khảo sát hiện trường). Chạy lại khi người dùng cập nhật mẫu gốc:

    python scripts/tag_bbksht.py

Giữ định dạng của mẫu: chữ mới lấy định dạng (rPr) của run chữ đầu tiên trong đoạn; run chứa hình
(vd đường kẻ dưới tên đơn vị) được giữ nguyên. Các chú thích <…> của mẫu được thay bằng thẻ; ảnh sơ đồ
ví dụ và hai hình chú thích "Khu vực công tác" được bỏ, thay bằng đoạn {@diagramXml} (ảnh người dùng tải lên).
"""
import copy
import os
import sys

import docx
from docx.oxml.ns import qn

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, '..', 'templates', 'template_bbksht.source.docx')
OUT = os.path.join(HERE, '..', 'templates', 'template_bbksht.docx')


def has_drawing(r):
    return r.find('.//' + qn('w:drawing')) is not None or r.find('.//' + qn('w:pict')) is not None


def set_text(p_el, text, keep_drawings=True):
    """Thay chữ của đoạn (lxml w:p) bằng `text` trong một run, định dạng theo run chữ đầu tiên."""
    runs = p_el.findall(qn('w:r'))
    text_runs = [r for r in runs if r.find(qn('w:t')) is not None and not has_drawing(r)]
    proto = text_runs[0] if text_runs else (runs[0] if runs else None)
    rpr = copy.deepcopy(proto.find(qn('w:rPr'))) if proto is not None and proto.find(qn('w:rPr')) is not None else None
    for r in runs:
        if keep_drawings and has_drawing(r):
            continue
        p_el.remove(r)
    for tag in ('w:hyperlink', 'w:proofErr', 'w:bookmarkStart', 'w:bookmarkEnd'):
        for x in p_el.findall(qn(tag)):
            p_el.remove(x)
    new_r = p_el.makeelement(qn('w:r'), {})
    if rpr is not None:
        new_r.append(rpr)
    t = new_r.makeelement(qn('w:t'), {})
    t.text = text
    t.set('{http://www.w3.org/XML/1998/namespace}space', 'preserve')
    new_r.append(t)
    p_el.append(new_r)


def paragraph_loop(p_el, name):
    """Đoạn p lặp theo danh sách `name`: mỗi phần tử một đoạn (giữ định dạng, đánh số của p).
    docxtemplater (paragraphLoop) cần {#name} và {/name} nằm ở hai đoạn riêng, nó sẽ bỏ hai đoạn đó khi xuất."""
    set_text(p_el, '{.}')
    for tag, where in (('{#' + name + '}', 'before'), ('{/' + name + '}', 'after')):
        clone = copy.deepcopy(p_el)
        set_text(clone, tag)
        getattr(p_el, 'addprevious' if where == 'before' else 'addnext')(clone)


def text_of(p_el):
    return ''.join(t.text or '' for t in p_el.iter(qn('w:t')))


def remove(el):
    el.getparent().remove(el)


def find_para(paras, startswith):
    for p in paras:
        if text_of(p).strip().startswith(startswith):
            return p
    sys.exit(f'Mẫu gốc đã đổi: không thấy đoạn bắt đầu bằng {startswith!r}')


def tag_header(d):
    left = d.tables[0].rows[0].cells[0]
    ps = [p._p for p in left.paragraphs]
    texts = [text_of(p).strip() for p in ps]
    if not (texts[0].startswith('ĐỘI') and texts[2].startswith('TỔ')):
        sys.exit(f'Mẫu gốc đã đổi (đầu biên bản): {texts!r}')
    set_text(ps[0], '{unitLine1}')
    set_text(ps[1], '{unitLine2}')
    set_text(ps[2], '{teamUpper}')


def tag_body(d):
    body = d.element.body
    paras = [el for el in body.iterchildren() if el.tag == qn('w:p')]

    set_text(find_para(paras, 'Vào hồi'), 'Vào hồi {surveyTimeText}, tại {stationName}')
    paragraph_loop(find_para(paras, '1.1.'), 'workUnitRepLines')
    remove(find_para(paras, '1.2.'))
    paragraph_loop(find_para(paras, '2.1.'), 'qlvhRepLines')
    remove(find_para(paras, '2.2.'))
    set_text(find_para(paras, '3. Đại diện'), '3. Đại diện các đơn vị có liên quan: {relatedUnits}')

    p4 = find_para(paras, '4. Địa điểm')
    set_text(paras[paras.index(p4) + 1], '{equipment} tại {stationName}.')
    p5 = find_para(paras, '5. Nội dung')
    set_text(paras[paras.index(p5) + 1], '{workContent}')
    p6 = find_para(paras, '6. Phạm vi')
    paragraph_loop(paras[paras.index(p6) + 1], 'scopeItems')
    set_text(find_para(paras, '7. Thời gian'), '7. Thời gian tiến hành công việc: {timeText}')
    remove(find_para(paras, '<pick'))

    caption = find_para(paras, '(Kèm theo')
    set_text(caption, '(Kèm theo Biên bản khảo sát hiện trường do {teamShortLabel} lập ngày {diagramDateText})')

    # đoạn chứa ảnh ví dụ + hình chú thích -> ảnh người dùng; bỏ đoạn hướng dẫn "<Import ảnh…>"
    picture = next((p for p in paras if p.find('.//' + qn('pic:pic')) is not None), None)
    if picture is None:
        sys.exit('Mẫu gốc đã đổi: không thấy ảnh sơ đồ ví dụ ở trang cuối')
    set_text(picture, '{@diagramXml}', keep_drawings=False)
    remove(find_para(paras, '<Import'))


def tag_risks(d):
    table = next(t for t in d.tables if t.rows[0].cells[0].text.strip() == 'STT')
    rows = list(table.rows)
    # dòng mẫu: dòng thường đầu tiên (không gộp ô), ô STT tự đánh số giữ nguyên
    proto = next(r for r in rows[1:] if r._tr.find('.//' + qn('w:vMerge')) is None)
    for r in rows[1:]:
        if r is not proto:
            remove(r._tr)
    cells = proto.cells
    for cell, value in zip(cells[1:], ['{#risks}{hazard}', '{measures}', '{performer}{/risks}']):
        first, *rest = cell.paragraphs
        for p in rest:
            remove(p._p)
        set_text(first._p, value)


def tag_signatures(d):
    table = next(t for t in d.tables if t.rows[0].cells[0].text.strip().startswith('ĐƠN VỊ CÔNG TÁC'))
    row = table.rows[1]
    for cell, tag in ((row.cells[0], '{workUnitSigner}'), (row.cells[-1], '{qlvhSigner}')):
        last = [p for p in cell.paragraphs if p.text.strip()][-1]
        set_text(last._p, tag)
    # phần ký không bị tách: tiêu đề và tên người ký luôn cùng một trang
    for r in table.rows:
        trPr = r._tr.get_or_add_trPr()
        if trPr.find(qn('w:cantSplit')) is None:
            trPr.append(trPr.makeelement(qn('w:cantSplit'), {}))
    for cell in table.rows[0].cells:
        for p in cell.paragraphs:
            p.paragraph_format.keep_with_next = True


def drop_sample_image(d):
    part = d.part
    for rel_id, rel in list(part.rels.items()):
        if rel.reltype.endswith('/image'):
            part.drop_rel(rel_id)


def main():
    sys.stdout.reconfigure(encoding='utf-8')
    d = docx.Document(SRC)
    tag_header(d)
    tag_body(d)
    tag_risks(d)
    tag_signatures(d)
    drop_sample_image(d)
    d.save(OUT)
    print('Đã sinh', os.path.normpath(OUT))


if __name__ == '__main__':
    main()
