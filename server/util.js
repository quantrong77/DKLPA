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

module.exports = { likePattern, LIKE, safeParse, changedRows };
