// Dựng một trang PDF thành ảnh JPEG trên trình duyệt (pdf.js, chỉ tải khi cần).
import { renderScale } from './survey.js';

let pdfjsPromise = null;
function loadPdfjs() {
  pdfjsPromise = pdfjsPromise || Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.min.mjs?url')
  ]).then(([pdfjs, worker]) => {
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
    return pdfjs;
  });
  return pdfjsPromise;
}

/** Mở file PDF; trả về { doc, pageCount }. Nhớ gọi doc.destroy() khi xong. */
export async function openPdf(file) {
  const pdfjs = await loadPdfjs();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  return { doc, pageCount: doc.numPages };
}

/** Lớp chữ của trang (khung tên bản vẽ); nhãn vẽ bằng nét (font CAD) không có trong lớp này. */
export async function pageText(doc, pageNo) {
  const page = await doc.getPage(pageNo);
  const content = await page.getTextContent();
  page.cleanup();
  return content.items.map(it => it.str).join(' ');
}

/** Các hình tô (nét vẽ vector) của trang, để tự đọc nhãn/dây (ctReader): { shapes, width, height } theo pt. */
export async function pageShapes(doc, pageNo) {
  const [pdfjs, { filledShapes }] = await Promise.all([loadPdfjs(), import('./ctVector.js')]);
  const page = await doc.getPage(pageNo);
  const viewport = page.getViewport({ scale: 1 });
  const ops = await page.getOperatorList();
  page.cleanup();
  return { shapes: filledShapes(ops, pdfjs.OPS, viewport.transform), width: viewport.width, height: viewport.height };
}

/** Trang `pageNo` -> { blob (image/jpeg), width, height }; nền trắng, ~200 dpi. */
export async function renderPdfPage(doc, pageNo) {
  const page = await doc.getPage(pageNo);
  const base = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: renderScale(base.width, base.height) });
  const canvas = document.createElement('canvas');
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, canvas, viewport }).promise;
  const blob = await new Promise((resolve, reject) => canvas.toBlob(b => (b ? resolve(b) : reject(new Error('Không dựng được ảnh trang bản vẽ.'))), 'image/jpeg', 0.9));
  page.cleanup();
  return { blob, width: canvas.width, height: canvas.height };
}
