// tải phần giao diện nạp trễ thất bại: thường do máy chủ vừa build bản mới (tên tệp đổi) hoặc mất mạng
const CHUNK_ERROR = /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Loading chunk [\w-]+ failed|ChunkLoadError/i;

export function isChunkError(error) {
  if (!error) return false;
  return error.name === 'ChunkLoadError' || CHUNK_ERROR.test(String(error.message ?? error));
}
