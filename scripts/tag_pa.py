"""
Sinh templates/template_pa.docx (có thẻ docxtemplater) từ mẫu gốc templates/template_pa.source.docx
(Phương án thi công, biện pháp an toàn — thí nghiệm định kỳ). Chạy lại khi cập nhật mẫu gốc:

    python scripts/tag_pa.py

Chú thích <…> của mẫu được thay bằng thẻ; các bảng ví dụ thành dòng lặp:
  - Mục 5 (nhận diện rủi ro): {#risks}
  - Phụ lục I: trạng thái cô lập {#isolationDevices}; Bảng 1 hạng mục {#testRows} (dòng nhóm I, II… và dòng hạng mục);
    Bảng 2 thiết bị thí nghiệm {#instrumentRows}
  - Phụ lục II: mỗi bảng cô lập mạch dòng {#ctBlocks} gồm các core {#cores} (7 dòng/core như mẫu)
  - Phụ lục III: {#people};  Phụ lục IV: ảnh bản vẽ trạm {@drawingXml}
"""
import copy
import os
import sys

import docx
from docx.oxml.ns import qn

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from tag_bbksht import set_text, text_of, remove, paragraph_loop, drop_sample_image  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, '..', 'templates', 'template_pa.source.docx')
OUT = os.path.join(HERE, '..', 'templates', 'template_pa.docx')


def body_paras(d):
    return [el for el in d.element.body.iterchildren() if el.tag == qn('w:p')]


def find(paras, start, contains=None):
    for p in paras:
        t = text_of(p).strip()
        if t.startswith(start) and (contains is None or contains in t):
            return p
    sys.exit(f'Mẫu gốc đã đổi: không thấy đoạn bắt đầu bằng {start!r}')


def after(p, n=1):
    el = p
    for _ in range(n):
        el = el.getnext()
    return el


def cell_set(cell, text):
    """Một đoạn trong ô (giữ đoạn đầu: định dạng, đánh số)."""
    first, *rest = cell.paragraphs
    for p in rest:
        remove(p._p)
    set_text(first._p, text)


def keep_rows(table, keep):
    for i, r in enumerate(list(table.rows)):
        if i not in keep:
            remove(r._tr)


def tag_header(d):
    t = d.tables[0]
    left = [p._p for p in t.rows[0].cells[0].paragraphs]
    set_text(left[0], '{companyLine1}')
    if len(left) > 1:
        set_text(left[1], '{companyLine2}')
    unit = [p._p for p in t.rows[1].cells[0].paragraphs]
    set_text(unit[0], '{unitLine1}')
    if len(unit) > 1:
        set_text(unit[1], '{unitLine2}')
    cell_set(t.rows[2].cells[0], 'Số: {docNumber}')
    cell_set(t.rows[2].cells[1], '{place}, ngày {day} tháng {month} năm {year}')


def tag_body(d):
    P = body_paras(d)
    set_text(find(P, 'Công tác:'), 'Công tác: {workTitle}')
    set_text(find(P, 'Phương án thi công và biện pháp an toàn này'), '{purposeText}')
    set_text(find(P, 'Thời gian thực hiện:'), 'Thời gian thực hiện: {timeText} (theo lịch cắt điện được duyệt).')

    # Cơ sở pháp lý: 6 dòng mẫu -> 1 đoạn lặp
    first = find(P, 'Căn cứ Quy trình an toàn điện')
    for start in ('Căn cứ Quy định công tác an toàn', 'Căn cứ Quy định thí nghiệm, kiểm định', '<Căn cứ Quyết định',
                  'Căn cứ qui trình vận hành', 'Căn cứ tài liệu hướng dẫn'):
        remove(find(P, start))
    paragraph_loop(first, 'legalBases')

    set_text(find(P, 'Căn cứ kế hoạch thí nghiệm định kỳ'), '{featureText}')
    set_text(find(P, 'Cắt điện cô lập ngăn lộ'), 'Cắt điện cô lập ngăn lộ {bays} để kiểm tra bảo dưỡng và thử nghiệm theo qui định.')

    # Khối lượng thi công
    w1 = find(P, 'Kiểm tra thí nghiệm định kỳ các thiết bị nhất thứ thuộc ngăn lộ')
    remove(find(P, '<Kiểm tra thí nghiệm định kỳ hạng mục 01 năm'))
    paragraph_loop(w1, 'workloads')

    set_text(find(P, 'Trình tự thực hiện công tác kiểm tra cô lập'), 'Trình tự thực hiện công tác kiểm tra cô lập ngăn {bays} {stationName}:')
    s1 = find(P, 'Cắt điện cô lập ngăn <MC')
    remove(find(P, '<Cắt điện cô lập MBA'))
    remove(find(P, 'Có thể bổ sung nội dung này'))
    paragraph_loop(s1, 'isolationSteps')

    ct = find(P, 'Cô lập mạch dòng <TI')
    paragraph_loop(ct, 'ctLines')
    set_text(find(P, 'Kiểm tra thí nghiệm các hạng mục thiết bị nhất thứ ngăn lộ'),
             'Kiểm tra thí nghiệm các hạng mục thiết bị nhất thứ ngăn lộ {bays} theo Phụ lục I.')
    paragraph_loop(find(P, '- DCL'), 'liveDisconnectorLines')

    set_text(find(P, '- Tuyệt đối chấp hành chế độ phiếu công tác'),
             '- Tuyệt đối chấp hành chế độ phiếu công tác, phiếu thao tác và chỉ được làm việc trong phạm vi cho phép '
             'theo sự hướng dẫn của nhân viên vận hành {stationName};')
    set_text(find(P, '- Gởi đăng ký công tác đến'),
             '- Gởi đăng ký công tác đến {registerTo} để đăng ký công tác cắt điện cô lập ngăn lộ {bays} và làm thủ tục phiếu công tác.')
    remove(find(P, '<từ BBKSHT'))
    set_text(find(P, '- Thực hiện từ'), '- Thực hiện {timeRange} (theo lịch cắt điện được duyệt).')
    set_text(find(P, 'Sơ đồ chi tiết đấu nối'), 'Sơ đồ chi tiết đấu nối: Xem bản vẽ sơ đồ nhất thứ {stationName} (phụ lục IV).')
    set_text(find(P, 'Sơ đồ các vị trí cô lập/tái lập'),
             'Sơ đồ các vị trí cô lập/tái lập mạch nhị thứ: Tham khảo các bản vẽ thiết bị, mạch điều khiển, bảo vệ, các tín hiệu liên quan ngăn lộ {bays}.')
    set_text(find(P, 'Các bản vẽ khác'),
             'Các bản vẽ khác: Tham khảo các bản vẽ thiết bị, mạch điều khiển, bảo vệ, các tín hiệu liên quan ngăn lộ {bays}.')
    set_text(find(P, 'PHƯƠNG ÁN DỰ PHÒNG'), 'PHƯƠNG ÁN DỰ PHÒNG: {reserve}')

    # Nơi nhận
    r1 = find(P, '- TTĐ')
    remove(find(P, '- <TBAVT'))
    remove(find(P, '- Lưu:'))
    set_text(r1, '- {.}')
    paragraph_loop_keep(r1, 'recipients')

    # Phụ lục I
    set_text(find(P, 'Trạng thái cô lập'), 'Trạng thái cô lập ngăn {bays} khi tiếp nhận hiện trường và giao trả')
    remove(find(P, 'nhập tay'))
    remove(find(P, '<TỰ ĐỘNG'))

    # Phụ lục II: tiêu đề + bảng của từng nhóm cô lập mạch dòng
    h = find(P, 'Cô lập mạch dòng <nhập tay>')
    note = find(P, '<CÁC NỘI DUNG BÊN TRONG')
    set_text(h, 'Cô lập mạch dòng {title} như sau:')
    # không cô lập mạch dòng thì in "Không." (đoạn đứng trước vòng lặp các bảng)
    set_text(note, '{^ctBlocks}Không.{/ctBlocks}')
    h.addprevious(note)
    opening = copy.deepcopy(h)
    set_text(opening, '{#ctBlocks}')
    h.addprevious(opening)
    # mẫu có 4 bảng ví dụ: giữ bảng đầu, xóa các tiêu đề/bảng còn lại
    closing = find(P, 'Cô lập mạch dòng TI 530')
    for start in ('Cô lập mạch dòng TI 232', 'Cô lập mạch dòng TI 342'):
        p = find(P, start)
        tbl = p.getnext()
        remove(tbl)
        remove(p)
    remove(closing.getnext())  # bảng TI 530
    set_text(closing, '{/ctBlocks}')

    remove(find(P, '<PICK'))

    # Phụ lục IV
    set_text(find(P, 'Bản vẽ sơ đồ nhất thứ'), 'Bản vẽ sơ đồ nhất thứ {stationName}')
    remove(find(P, '<tự động chèn'))
    picture = next(p for p in body_paras(d) if p.find('.//' + qn('pic:pic')) is not None)
    set_text(picture, '{@drawingXml}', keep_drawings=False)


def paragraph_loop_keep(p_el, name):
    """Như paragraph_loop nhưng đoạn đã có sẵn {.}-kiểu nội dung (vd '- {.}')."""
    for tag, where in (('{#' + name + '}', 'before'), ('{/' + name + '}', 'after')):
        clone = copy.deepcopy(p_el)
        set_text(clone, tag)
        getattr(p_el, 'addprevious' if where == 'before' else 'addnext')(clone)


def row_loop(table, proto_index, values, loop):
    """Dòng proto_index thành dòng lặp; values: chữ cho từng ô (None = giữ nguyên ô)."""
    row = table.rows[proto_index]
    cells = row.cells
    last = max(i for i, v in enumerate(values) if v is not None)
    firstv = min(i for i, v in enumerate(values) if v is not None)
    for i, v in enumerate(values):
        if v is None:
            continue
        text = v
        if i == firstv:
            text = '{#' + loop + '}' + text
        if i == last:
            text = text + '{/' + loop + '}'
        cell_set(cells[i], text)


def tag_tables(d):
    tables = d.tables
    risks, sign, iso, tests, instruments, ct1 = tables[1], tables[2], tables[3], tables[4], tables[5], tables[6]
    people = tables[-1]

    # Mục 5: nhận diện rủi ro — dòng mẫu là dòng thường đầu tiên (không gộp ô)
    proto = next(i for i, r in enumerate(risks.rows) if i > 0 and r._tr.find('.//' + qn('w:vMerge')) is None)
    keep_rows(risks, {0, proto})
    row_loop(risks, 1, [None, '{hazard}', '{measures}', '{performer}'], 'risks')

    # Chữ ký: người lập, lãnh đạo tổ; các ô ((…)) khác để trống; tên đơn vị theo dữ liệu
    names = {'((nguoilap))': '{preparedBy}', '((ld_dtc))': '{teamLeader}'}
    for row in sign.rows:
        for cell in row.cells:
            for p in cell.paragraphs:
                t = p.text.strip()
                if t.startswith('((') and t.endswith('))'):
                    set_text(p._p, names.get(t, ''))
    set_text(sign.rows[0].cells[0].paragraphs[0]._p, '{teamName}')
    unit_p = [p for p in sign.rows[2].cells[0].paragraphs if p.text.strip()][0]
    set_text(unit_p._p, '{unitName}')
    tt_p = [p for p in sign.rows[4].cells[0].paragraphs if p.text.strip()][0]
    set_text(tt_p._p, '{transmissionName}')
    co_p = [p for p in sign.rows[7].cells[0].paragraphs if p.text.strip()][0]
    set_text(co_p._p, '{companyName}')

    # Phụ lục I.1 trạng thái cô lập
    keep_rows(iso, {0, 1, 2})
    row_loop(iso, 2, [None, '{.}', '', '', '', ''], 'isolationDevices')

    # Bảng 1 hạng mục thí nghiệm: dòng nhóm (I, MBA) + dòng hạng mục
    keep_rows(tests, {0, 1, 2})
    g, it = tests.rows[1].cells, tests.rows[2].cells
    cell_set(g[0], '{#testRows}{#isGroup}{stt}')
    cell_set(g[1], '{name}')
    cell_set(g[2], '{note}{/isGroup}')
    cell_set(it[0], '{^isGroup}{stt}')
    cell_set(it[1], '{name}')
    cell_set(it[2], '{note}{/isGroup}{/testRows}')

    # Bảng 2 thiết bị thí nghiệm: dòng nhóm + dòng thiết bị (STT tự đánh số của mẫu)
    keep_rows(instruments, {0, 1, 2})
    g, it = instruments.rows[1].cells, instruments.rows[2].cells
    cell_set(g[0], '{#instrumentRows}{#isGroup}{stt}')
    cell_set(g[1], '{name}')
    cell_set(g[2], '')
    cell_set(g[3], '')
    cell_set(g[4], '{/isGroup}')
    cell_set(it[0], '{^isGroup}')
    cell_set(it[1], '{name}')
    cell_set(it[2], '{unit}')
    cell_set(it[3], '{qty}')
    cell_set(it[4], '{note}{/isGroup}{/instrumentRows}')

    # Phụ lục II: bảng mẫu = dòng tiêu đề + 7 dòng của core 1
    keep_rows(ct1, set(range(8)))
    r = ct1.rows
    cell_set(r[0].cells[0], '{coreHeader}')
    cell_set(r[0].cells[2], '{panel}')
    cell_set(r[0].cells[3], '{sideHeader}')
    cell_set(r[1].cells[0], '{#cores}{no}')
    cell_set(r[1].cells[1], 'Tách các link hàng kẹp mạch dòng {block}')
    for k in range(6):
        row = r[2 + k].cells
        cell_set(row[2], '{a%d}' % (k + 1))
        cell_set(row[3], '{b%d}' % (k + 1) + ('{/cores}' if k == 5 else ''))

    # Phụ lục III lực lượng thi công
    keep_rows(people, {0, 1})
    row_loop(people, 1, ['{stt}', '{name}', '{level}', '{duty}'], 'people')


def page_break_appendices(d, headings=('PHỤ LỤC I', 'PHỤ LỤC II')):
    """Mẫu đẩy phụ lục sang trang mới bằng hàng loạt dòng trống (lệch khi nội dung ngắn/dài hơn mẫu):
    thay bằng "ngắt trang trước" ở tiêu đề phụ lục."""
    for p in body_paras(d):
        if text_of(p).strip() not in headings:
            continue
        prev = p.getprevious()
        while prev is not None and prev.tag == qn('w:p') and not text_of(prev).strip() \
                and prev.find('.//' + qn('w:sectPr')) is None and prev.find('.//' + qn('w:drawing')) is None:
            victim, prev = prev, prev.getprevious()
            remove(victim)
        ppr = p.find(qn('w:pPr'))
        if ppr is None:
            ppr = p.makeelement(qn('w:pPr'), {})
            p.insert(0, ppr)
        if ppr.find(qn('w:pageBreakBefore')) is None:
            # đúng thứ tự schema: sau pStyle, keepNext, keepLines
            before = [c for c in ppr if c.tag in (qn('w:pStyle'), qn('w:keepNext'), qn('w:keepLines'))]
            ppr.insert(ppr.index(before[-1]) + 1 if before else 0, ppr.makeelement(qn('w:pageBreakBefore'), {}))


def main():
    sys.stdout.reconfigure(encoding='utf-8')
    d = docx.Document(SRC)
    tag_header(d)
    tag_tables(d)  # trước tag_body: body xóa bớt bảng ví dụ ở Phụ lục II
    tag_body(d)
    page_break_appendices(d, ('PHỤ LỤC I', 'PHỤ LỤC II', 'PHỤ LỤC IV'))
    # tiêu đề Phụ lục IV luôn cùng trang với ảnh bản vẽ
    for p in d.paragraphs:
        if p.text.strip() in ('PHỤ LỤC IV',) or p.text.strip().startswith('Bản vẽ sơ đồ nhất thứ'):
            p.paragraph_format.keep_with_next = True
    drop_sample_image(d)
    d.save(OUT)
    print('Đã sinh', os.path.normpath(OUT))


if __name__ == '__main__':
    main()
