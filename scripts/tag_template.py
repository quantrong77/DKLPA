"""
Sinh templates/template_dkct.docx (có thẻ docxtemplater) từ mẫu gốc templates/template_dkct.source.docx.

Giữ nguyên định dạng của mẫu: mỗi đoạn được dựng lại từ chính các run của nó (copy rPr),
chỉ thay chữ mẫu bằng thẻ {…}. Chạy lại khi người dùng cập nhật mẫu gốc:

    python scripts/tag_template.py

Nếu bố cục mẫu gốc đổi (thêm/bớt đoạn), script dừng với thông báo đoạn không khớp
thay vì âm thầm gắn thẻ sai chỗ.
"""
import copy
import os
import sys

import docx
from docx.text.run import Run

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, '..', 'templates', 'template_dkct.source.docx')
OUT = os.path.join(HERE, '..', 'templates', 'template_dkct.docx')


def rewrite(paragraph, segments):
    """segments: [(chỉ số run mẫu để lấy định dạng, chữ mới)]; thay toàn bộ run của đoạn."""
    runs = paragraph.runs
    protos = [copy.deepcopy(runs[i]._r) for i, _ in segments]
    for r in runs:
        r._r.getparent().remove(r._r)
    for proto, (_, text) in zip(protos, segments):
        for child in list(proto):
            if not child.tag.endswith('rPr'):
                proto.remove(child)
        paragraph._p.append(proto)
        Run(proto, paragraph).text = text


def expect(paragraph, startswith):
    if not paragraph.text.strip().startswith(startswith):
        sys.exit(f'Mẫu gốc đã đổi: cần đoạn bắt đầu bằng {startswith!r}, gặp {paragraph.text[:60]!r}')


def remove(paragraph):
    paragraph._p.getparent().remove(paragraph._p)


def set_cell(cell, text, proto_run=None):
    """Một đoạn duy nhất trong ô, giữ pPr của đoạn đầu và rPr của run đầu (hoặc proto_run)."""
    first, *rest = cell.paragraphs
    for p in rest:
        remove(p)
    source = first.runs[0]._r if first.runs else proto_run
    for r in first.runs:
        r._r.getparent().remove(r._r)
    new_r = copy.deepcopy(source)
    for child in list(new_r):
        if not child.tag.endswith('rPr'):
            new_r.remove(child)
    first._p.append(new_r)
    Run(new_r, first).text = text


def tag_body(d):
    P = [p for p in d.paragraphs]
    by_text = lambda prefix: next(p for p in P if p.text.strip().startswith(prefix))

    expect(P[0], 'ĐỘI SỬA CHỮA')
    rewrite(P[0], [(0, '\t'), (1, '{unitLine1}'), (2, '\t'), (3, 'CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM ')])
    rewrite(P[1], [(0, '\t'), (1, '{unitLine2}'), (2, '\t'), (3, 'Độc lập - Tự do - Hạnh phúc ')])
    expect(P[2], 'TỔ THÍ NGHIỆM')
    rewrite(P[2], [(1, '\t'), (2, '{teamLine1}')])
    rewrite(P[3], [(1, '\t{teamLine2}'), (2, ' '), (3, '\t'), (4, '{place}, ngày {day} tháng {month} năm {year}')])
    expect(P[4], 'Số:')
    rewrite(P[4], [(0, '\t'), (1, 'Số: {docNumber}'), (7, '\t')])

    p = by_text('Kính gửi')
    rewrite(p, [(0, 'Kính gửi: {recipientName}')])
    p = by_text('Căn cứ')
    rewrite(p, [(0, 'Căn cứ {basis}, {orgName} do {repHonorific} {repName} đại diện, '
                   'Chức vụ {repRole}, Điện thoại (Email) {repContact}, đăng ký tiến hành công việc, cụ thể như sau: ')])
    rewrite(by_text('1. Nội dung'), [(0, '1. Nội dung công việc: '), (1, '{workContent}')])
    rewrite(by_text('2. Địa điểm'), [(0, '2. Địa điểm (hoặc thiết bị) tiến hành công việc: '), (1, '{workLocation}')])
    rewrite(by_text('3. Điều kiện'), [(0, '3. Điều kiện cần có để thực hiện công việc: '), (1, '{condition}')])
    rewrite(by_text('Bắt đầu:'), [(0, ' '), (1, '\tBắt đầu: {startText}'), (9, '\t')])
    rewrite(by_text('Kết thúc:'), [(0, '\tKết thúc: {endText}'), (7, '\t')])
    rewrite(by_text('5. Số lượng'), [(0, '5. Số lượng Đơn vị công tác (nếu có): '), (1, '{workUnitCount}')])
    rewrite(by_text('6. Số lượng'), [(0, '6. Số lượng nhân viên 01 Đơn vị công tác: {workerCountsLine}')])
    rewrite(by_text('7. Người LĐCV'), [(0, '7. Người LĐCV (nếu có): '), (1, '{leaderName}'), (2, '\t'), (3, 'Bậc ATĐ {leaderLevel}')])

    p8 = by_text('8. Người GSATĐ')
    rewrite(p8, [(0, '8. Người GSATĐ (nếu có): {supervisorsLine}')])
    remove(by_text('8.2)'))
    p9 = by_text('9. Người CHTT')
    rewrite(p9, [(0, '9. Người CHTT: '), (1, '{commandersLine}')])
    remove(by_text('9.2)'))
    rewrite(by_text('10. Người CG'), [(0, '10. Người CG (nếu có): '), (1, '{watchmanName}'), (2, '\t'), (3, 'Bậc ATĐ {watchmanLevel}')])
    rewrite(by_text('12.1'), [(0, '{otherUnitsLine}')])
    remove(by_text('12.2'))

    signer = next(p for p in P if p.text.strip() == 'Nguyễn Hữu Kính')
    rewrite(signer, [(0, '\t'), (1, '{signatoryName}')])


def tag_row_loop(table, loop, cells_text, keep_first_cell=True):
    """Hàng 1 thành hàng lặp {#loop}…{/loop}; xóa các hàng mẫu còn lại."""
    for row in list(table.rows)[2:]:
        row._tr.getparent().remove(row._tr)
    row = table.rows[1]
    cells = row.cells
    proto = next(r._r for c in cells for r in c.paragraphs[0].runs)
    start = 1 if keep_first_cell else 0
    for i, text in enumerate(cells_text):
        cell = cells[start + i]
        if i == 0:
            text = '{#' + loop + '}' + text
        if i == len(cells_text) - 1:
            text = text + '{/' + loop + '}'
        set_cell(cell, text, proto)


def tag_tables(d):
    t_nominees, t_permits, t_risks = d.tables
    tag_row_loop(t_nominees, 'nominees', ['{name}', '{card}', '{duty}'])
    tag_row_loop(t_permits, 'permits', ['{isolation}', '{permitNo}', '{content}', '{commander}', '{workers}', '{note}'],
                 keep_first_cell=False)
    tag_row_loop(t_risks, 'risks', ['{hazard}', '{measures}', '{performer}'])


def main():
    sys.stdout.reconfigure(encoding='utf-8')
    d = docx.Document(SRC)
    tag_body(d)
    tag_tables(d)
    d.save(OUT)
    print('Đã sinh', os.path.normpath(OUT))


if __name__ == '__main__':
    main()
