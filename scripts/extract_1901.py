"""
Trích bảng khối lượng thí nghiệm theo thiết bị từ PDF gốc QĐ 1901/QĐ-EVNNPT (29/09/2025)
thành server/seeds/tests1901.json (dùng để tự lập Bảng 1 "Hạng mục thí nghiệm" của Phương án).

    python scripts/extract_1901.py "<đường dẫn PDF QĐ 1901>"

Đọc bảng bằng PyMuPDF (find_tables) để giữ đúng CỘT chu kỳ của từng dấu "x"
(bản QD1901.md chuyển từ PDF đã mất vị trí cột nên không dùng được cho việc này).
Chu kỳ: install = Sau lắp đặt, year1 = Sau 1 năm lắp đặt, annual = Định kỳ 1 năm, y3 = 3 năm, y6 = 6 năm.
"""
import json
import os
import re
import sys

import pymupdf

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'server', 'seeds', 'tests1901.json')

# (khóa, tên nhóm in trong Bảng 1, căn cứ, [(trang, chỉ số bảng)], mục La Mã trong bảng (hoặc None), các cột chu kỳ)
C4 = ['install', 'year1', 'annual', 'y3']
C5 = ['install', 'year1', 'annual', 'y3', 'y6']
DEVICES = [
    ('MBA', 'MBA', 'Điều 9, Bảng 1 (MBA lực ≥110kV)', [(14, 0), (15, 0), (16, 0)], None, C4),
    ('MBA_TD', 'MBA TỰ DÙNG', 'Điều 9, Bảng 2 (MBA tự dùng ≤35kV)', [(17, 0), (18, 0)], None, C4),
    ('KH', 'KHÁNG DẦU', 'Điều 9, Bảng 3 (Kháng dầu)', [(18, 1), (19, 0), (20, 0)], None, C4),
    ('TI_HO', 'BIẾN DÒNG ĐIỆN (kiểu hở, có ống thở)', 'Điều 10, Bảng 9, mục I', [(23, 1), (24, 0)], 'I', C5),
    ('TI_DAU', 'BIẾN DÒNG ĐIỆN (kín, cách điện dầu ≥110kV)', 'Điều 10, Bảng 9, mục II', [(24, 0), (25, 0)], 'II', C5),
    ('TI_SF6', 'BIẾN DÒNG ĐIỆN (cách điện khí SF6)', 'Điều 10, Bảng 9, mục III', [(25, 0), (26, 0)], 'III', C5),
    ('TI_35', 'BIẾN DÒNG ĐIỆN (≤35kV, TI xuyến)', 'Điều 10, Bảng 9, mục IV', [(26, 0)], 'IV', C5),
    ('TU_CD', 'BIẾN ĐIỆN ÁP (kiểu cuộn dây)', 'Điều 11, Bảng 14, mục I', [(29, 1)], 'I', C5),
    ('TU_TU', 'BIẾN ĐIỆN ÁP (kiểu tụ, kín cách điện dầu)', 'Điều 11, Bảng 14, mục II', [(30, 0)], None, C5),
    ('MC_DAU', 'MÁY CẮT DẦU', 'Điều 12, Bảng 19, mục I', [(33, 1), (34, 0), (35, 0)], 'I', C5),
    ('MC_SF6', 'MÁY CẮT SF6', 'Điều 12, Bảng 19, mục II', [(35, 0), (36, 0)], 'II', C5),
    ('MC_CK', 'MÁY CẮT CHÂN KHÔNG', 'Điều 12, Bảng 19, mục III', [(36, 0), (37, 0)], 'III', C5),
    ('DCL', 'DAO CÁCH LY, DAO TIẾP ĐỊA', 'Điều 13, Bảng 22', [(39, 1), (40, 0)], None, C4),
    ('CSV_KH', 'CHỐNG SÉT VAN (có khe hở)', 'Điều 15, Bảng 26, mục I', [(43, 0)], 'I', C4),
    ('CSV', 'CHỐNG SÉT VAN (không khe hở)', 'Điều 15, Bảng 26, mục II', [(43, 0)], 'II', C4),
    ('KK', 'KHÁNG KHÔ', 'Điều 16, Bảng 27 (Kháng lõi không khí)', [(44, 0), (45, 0)], None, C4),
    ('ND', 'HỆ THỐNG NỐI ĐẤT', 'Điều 17, Bảng 28', [(45, 1)], None, ['install', 'year1', 'annual']),
]
ROMAN = re.compile(r'^(I|II|III|IV|V|VI)$')
FOOTNOTE = re.compile(r'\s+[a-i]$')  # chữ chú thích a..i ở cuối tên hạng mục


def clean(s):
    return re.sub(r'\s+', ' ', (s or '').replace('\n', ' ')).strip()


# chỉ số dưới/trên trong PDF bị tách khỏi ký hiệu khi trích chữ: ghép lại theo đúng văn bản
FIXES = [
    ('R và R /R , R /R (PI) d 60 60 15 600 60', 'R60 và R60/R15, R600/R60 (PI)'),
    ('R60 và R /R , R /R (PI) d 60 15 600 60', 'R60 và R60/R15, R600/R60 (PI)'),
    ('R60 và R /R 60 15', 'R60 và R60/R15'),
    ('(I ) ref', '(Iref)'),
    ('(U ) ref', '(Uref)'),
    ('750C', '75°C'),
]


def fix(s):
    for a, b in FIXES:
        s = s.replace(a, b)
    return s


def extract(pdf_path):
    doc = pymupdf.open(pdf_path)
    tables = {}
    out = []
    for key, name, source, parts, section, cycles in DEVICES:
        items = []
        current = None if section else True  # đang ở trong mục cần lấy?
        for pno, ti in parts:
            if (pno, ti) not in tables:
                tables[(pno, ti)] = doc[pno - 1].find_tables().tables[ti].extract()
            for row in tables[(pno, ti)]:
                cells = [clean(c) for c in row]
                tt, title = cells[0], cells[1] if len(cells) > 1 else ''
                if ROMAN.match(tt):
                    current = (tt == section) if section else True
                    continue
                if not current or tt in ('TT',) or title.startswith('HẠNG MỤC') or tt.startswith('Ghi chú') or (not tt and not title):
                    continue
                marks = cells[2:2 + len(cycles)]
                note = clean(cells[2 + len(cycles)]) if len(cells) > 2 + len(cycles) else ''
                if not tt and title and not any(marks) and items:
                    # phần tiếp của tên hạng mục bị ngắt sang trang/dòng sau
                    items[-1]['name'] += ' ' + title
                    continue
                flags = {c: bool(re.search(r'\bx\b', m or '')) for c, m in zip(cycles, marks)}
                items.append({
                    'code': tt,
                    'name': fix(FOOTNOTE.sub('', title)),
                    'cycles': [c for c in cycles if flags[c]],
                    'note': fix(note) if note != 'x' else '',
                    'extra': ' + '.join(m for m in marks if m and m != 'x')  # vd "x + sau giông bão"
                })
            if section and current is False and items:
                break
        out.append({'key': key, 'name': name, 'source': f'QĐ 1901/QĐ-EVNNPT, {source}', 'cycles': cycles, 'items': items})
    return out


def main():
    sys.stdout.reconfigure(encoding='utf-8')
    data = extract(sys.argv[1])
    with open(OUT, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    for d in data:
        print(f"{d['key']:7} {len(d['items']):3} hạng mục  {d['source']}")
    print('Đã ghi', os.path.normpath(OUT))


if __name__ == '__main__':
    main()
