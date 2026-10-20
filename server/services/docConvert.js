/**
 * Đổi file Word 97-2003 (.doc) sang .docx bằng LibreOffice (soffice --headless) nếu máy chủ có cài.
 * Đường dẫn: biến môi trường DKCT_SOFFICE, không thì "soffice" trong PATH hoặc chỗ cài mặc định trên Windows.
 * Không có LibreOffice: trả về null (người dùng tự lưu thành .docx bằng Word).
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFile } = require('node:child_process');

const TIMEOUT_MS = 60000;
const CANDIDATES = [
  process.env.DKCT_SOFFICE,
  'soffice',
  'libreoffice',
  'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
  'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe',
  '/usr/bin/soffice',
  '/Applications/LibreOffice.app/Contents/MacOS/soffice'
].filter(Boolean);

/** File .doc (OLE2): 8 byte đầu D0 CF 11 E0 A1 B1 1A E1. */
const isLegacyDoc = (buffer) => Buffer.isBuffer(buffer) && buffer.length > 8
  && buffer.subarray(0, 8).equals(Buffer.from([0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1]));

const run = (cmd, args, cwd) => new Promise((resolve) => {
  execFile(cmd, args, { cwd, timeout: TIMEOUT_MS, windowsHide: true }, (err) => resolve(!err));
});

/** buffer .doc -> Buffer .docx; null khi không đổi được (không có LibreOffice / file hỏng). */
async function convertDocToDocx(buffer) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dkct-doc-'));
  try {
    const input = path.join(dir, 'phuluc.doc');
    fs.writeFileSync(input, buffer);
    // hồ sơ người dùng riêng: chạy được khi đang có LibreOffice khác mở
    const profile = `-env:UserInstallation=file:///${dir.replace(/\\/g, '/').replace(/^\//, '')}/profile`;
    for (const cmd of CANDIDATES) {
      if (await run(cmd, [profile, '--headless', '--convert-to', 'docx', '--outdir', dir, input], dir)) {
        const out = path.join(dir, 'phuluc.docx');
        if (fs.existsSync(out)) return fs.readFileSync(out);
      }
    }
    return null;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

module.exports = { convertDocToDocx, isLegacyDoc };
