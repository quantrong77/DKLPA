/**
 * Ngày/năm theo giờ Việt Nam, không phụ thuộc múi giờ máy chủ (Docker thường chạy UTC):
 * giấy lập lúc 01:30 ngày 01/01 giờ VN phải nhận số của năm mới.
 */
const FMT = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' });

const vnToday = (now = new Date()) => FMT.format(now); // "YYYY-MM-DD"
const vnYear = (now = new Date()) => Number(vnToday(now).slice(0, 4));

const TIME_FMT = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
/** "YYYY-MM-DDTHH:mm" giờ Việt Nam (giá trị cho ô datetime-local). */
const vnNow = (now = new Date()) => `${vnToday(now)}T${TIME_FMT.format(now)}`;

module.exports = { vnToday, vnYear, vnNow };
