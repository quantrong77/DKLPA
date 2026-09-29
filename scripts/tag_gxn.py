"""
Sinh templates/template_gxn.docx (có thẻ docxtemplater) từ mẫu gốc templates/template_gxn.source.docx
(Giấy xác nhận đủ điều kiện đóng điện). Chạy lại khi cập nhật mẫu gốc:

    python scripts/tag_gxn.py

Chú thích <…> của mẫu được thay bằng thẻ; mục kết quả thành đoạn lặp {#items} (đánh số 1, 2… theo mẫu,
"đạt" canh phải bằng tab của mẫu). Bỏ các dòng trống thừa dưới tên người ký để giấy nằm gọn một trang.
"""
import copy
import os
import sys

import docx
from docx.oxml.ns import qn

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from tag_bbksht import set_text, text_of, remove  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, '..', 'templates', 'template_gxn.source.docx')
OUT = os.path.join(HERE, '..', 'templates', 'template_gxn.docx')


def expect(p_el, start):
    t = text_of(p_el).strip()
    if not t.startswith(start):
        sys.exit(f'Mẫu gốc đã đổi: cần đoạn bắt đầu bằng {start!r}, gặp {t[:60]!r}')
    return p_el


def paras(tc):
    return tc.findall(qn('w:p'))


def cells(tr):
    return tr.findall(qn('w:tc'))


def run(p_el, text=None, proto=None, tab=False):
    """Thêm run vào đoạn, định dạng theo run `proto`."""
    r = p_el.makeelement(qn('w:r'), {})
    if proto is not None and proto.find(qn('w:rPr')) is not None:
        r.append(copy.deepcopy(proto.find(qn('w:rPr'))))
    if tab:
        r.append(r.makeelement(qn('w:tab'), {}))
    else:
        t = r.makeelement(qn('w:t'), {})
        t.text = text
        t.set('{http://www.w3.org/XML/1998/namespace}space', 'preserve')
        r.append(t)
    p_el.append(r)


def tag_header(d):
    header = d.sections[0].header._element
    for r in header.iter(qn('w:r')):
        t = r.find(qn('w:t'))
        if t is not None and '<tự động' in (t.text or ''):
            t.text = ' {docNumber}'
            return
    sys.exit('Mẫu gốc đã đổi: không thấy ô "Số: <tự động…>" ở đầu trang')


def tag_items(p_el):
    """Mục kết quả: '{text}:' <tab> '{result}', lặp theo items; giữ đánh số, điểm tab của mẫu."""
    runs = p_el.findall(qn('w:r'))
    proto = runs[0]
    for r in runs:
        remove(r)
    run(p_el, '{text}:', proto)
    run(p_el, proto=proto, tab=True)
    run(p_el, '{result}', proto)
    for tag, where in (('{#items}', 'addprevious'), ('{/items}', 'addnext')):
        clone = copy.deepcopy(p_el)
        set_text(clone, tag)
        getattr(p_el, where)(clone)


def tag_signature(tc):
    nested = tc.find(qn('w:tbl'))
    # nới ô chữ ký (lấy bớt từ hai ô trống bên trái, tổng bề rộng giữ nguyên) để
    # "Khánh Hòa, ngày 27 tháng 09 năm 2026" nằm trên một dòng
    widths = ['3505', '200', '5099']
    grid = nested.find(qn('w:tblGrid')).findall(qn('w:gridCol'))
    tcs = cells(nested.find(qn('w:tr')))
    if len(grid) != 3 or len(tcs) != 3:
        sys.exit('Mẫu gốc đã đổi: bảng chữ ký không còn 3 cột')
    for col, tc, w in zip(grid, tcs, widths):
        col.set(qn('w:w'), w)
        tc.find(qn('w:tcPr')).find(qn('w:tcW')).set(qn('w:w'), w)
    sign = tcs[2]
    ps = paras(sign)
    set_text(expect(ps[0], 'Địa danh'), '{placeDate}')
    # căn giữa như tên tổ, người ký (mẫu gốc thụt lề âm, canh trái)
    ppr = ps[0].find(qn('w:pPr'))
    for x in ppr.findall(qn('w:ind')):
        ppr.remove(x)
    jc = ppr.makeelement(qn('w:jc'), {qn('w:val'): 'center'})
    rpr = ppr.find(qn('w:rPr'))
    if rpr is not None:
        rpr.addprevious(jc)
    else:
        ppr.append(jc)
    set_text(expect(ps[1], '<Tổ'), '{teamName}')
    name = next(p for p in ps if text_of(p).strip().startswith('<Hoàng'))
    set_text(name, '{signer}')
    # các dòng trống sau tên người ký làm giấy tràn sang trang 2
    for p in ps[ps.index(name) + 1:]:
        if not text_of(p).strip():
            remove(p)


def main():
    sys.stdout.reconfigure(encoding='utf-8')
    d = docx.Document(SRC)
    tag_header(d)
    rows = d.element.body.find(qn('w:tbl')).findall(qn('w:tr'))
    head = paras(cells(rows[0])[1])
    set_text(expect(head[0], 'CÔNG TY'), '{companyUpper}')
    set_text(expect(head[1], 'ĐỘI'), '{unitUpper}')
    expect(paras(cells(rows[1])[0])[0], 'GIẤY XÁC NHẬN')

    # Tên trạm: giữ "Tên dự án / Tên trạm (Project): " (chữ nghiêng như mẫu), phần còn lại là thẻ
    station = expect(paras(cells(rows[2])[0])[0], 'Tên dự án')
    runs = station.findall(qn('w:r'))
    k = next(i for i, r in enumerate(runs) if (r.find(qn('w:t')).text or '').startswith('(Project)'))
    normal = runs[0]
    for r in runs[k + 1:]:
        remove(r)
    run(station, '{stationName}', normal)
    set_text(expect(paras(cells(rows[3])[0])[0], 'Ngăn lộ'), 'Ngăn lộ: {bays}')

    body = paras(cells(rows[4])[0])
    set_text(expect(body[0], 'Ngày'),
             '     Ngày {workDate}, toán công tác thuộc {teamText} đã thực hiện công tác thí nghiệm {workObject}, '
             'khối lượng và kết quả như sau:')
    tag_items(expect(body[1], '<Thí nghiệm'))
    remove(expect(body[2], '….option'))
    set_text(expect(body[3], 'Bằng giấy này'), 'Bằng giấy này, tôi xác nhận {equipment} đủ điều kiện đóng điện vận hành./.')

    set_text(expect(paras(cells(rows[5])[0])[0], 'Ghi chú'), 'Ghi chú: {note}')
    tag_signature(cells(rows[6])[0])
    d.save(OUT)
    print('Đã sinh', os.path.normpath(OUT))


if __name__ == '__main__':
    main()
