/** Tiện ích dùng chung cho các route của module. */

/**
 * Chuỗi tìm kiếm cho LIKE: "%" và "_" người dùng gõ là ký tự thường.
 * Dùng "!" làm ký tự thoát vì "\" bị MySQL hiểu khác SQLite trong chuỗi SQL.
 */
const likePattern = (search) => `%${String(search).replace(/[!%_]/g, (c) => `!${c}`)}%`;
const LIKE = "LIKE ? ESCAPE '!'";

/** JSON.parse không ném: một dòng hỏng không làm hỏng cả danh sách/màn hình. */
function safeParse(json, fallback = {}) {
  if (json && typeof json === 'object') return json;
  try { return JSON.parse(json); } catch (e) { return fallback; }
}

const changedRows = (result) => Number(result?.changes ?? result?.affectedRows) || 0;

const DOCX_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
/** Gửi bản Word xem trước (không lưu, không cấp số, không cache). */
function sendPreview(res, buffer) {
  res.setHeader('Content-Type', DOCX_TYPE);
  res.setHeader('Cache-Control', 'private, no-store');
  res.send(buffer);
}
/** Số văn bản in trên bản xem trước: số đã cấp, hoặc số dự kiến người dùng đang thấy (chỉ để hiển thị). */
const previewNumber = (row, query) => row?.docNumber || String(query?.docNumber || '').slice(0, 60) || '…';

module.exports = { likePattern, LIKE, safeParse, changedRows, sendPreview, previewNumber };
