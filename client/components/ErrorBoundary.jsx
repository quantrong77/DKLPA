import React from 'react';
import { AlertTriangle, RefreshCw, RotateCcw } from 'lucide-react';
import { isChunkError } from '../lib/chunkError.js';

/**
 * Bắt lỗi khi vẽ giao diện để một bảng/trình soạn hỏng không làm trắng cả trang.
 *   resetKeys: đổi giá trị (vd. tab) thì tự bỏ trạng thái lỗi
 *   onReset:   chạy khi bấm "Thử lại" (vd. đóng trình soạn bị lỗi)
 *   variant:   'panel' (khung trong trang) | 'overlay' (phủ màn hình, cho trình soạn)
 */
export default class ErrorBoundary extends React.Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('[dkct] Lỗi giao diện:', error, info?.componentStack);
  }

  componentDidUpdate(prev) {
    if (!this.state.error) return;
    const a = prev.resetKeys || [];
    const b = this.props.resetKeys || [];
    if (a.length !== b.length || a.some((v, i) => !Object.is(v, b[i]))) this.setState({ error: null });
  }

  reset = () => {
    this.setState({ error: null });
    this.props.onReset?.();
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const chunk = isChunkError(error);
    const box = (
      <div role="alert" className="m-4 max-w-lg rounded-lg border border-red-200 bg-white p-4 shadow-sm text-sm text-slate-700">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 shrink-0 text-red-600" aria-hidden="true" />
          <div className="min-w-0 flex-1 space-y-2">
            <p className="font-semibold text-slate-900">
              {chunk ? 'Ứng dụng vừa được cập nhật hoặc mất kết nối' : 'Phần này gặp lỗi khi hiển thị'}
            </p>
            <p>
              {chunk
                ? 'Không tải được phần giao diện cần dùng. Tải lại trang để dùng bản mới nhất.'
                : 'Dữ liệu đã lưu không bị ảnh hưởng. Bấm "Thử lại"; nếu vẫn lỗi, tải lại trang và báo quản trị viên.'}
            </p>
            {!chunk && error?.message && (
              <details className="text-xs text-slate-500">
                <summary className="cursor-pointer select-none">Chi tiết lỗi</summary>
                <pre className="mt-1 whitespace-pre-wrap break-words">{String(error.message)}</pre>
              </details>
            )}
            <div className="flex flex-wrap gap-2 pt-1">
              {!chunk && (
                <button type="button" onClick={this.reset}
                  className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 px-3 py-1.5 font-medium hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-chatlan-600">
                  <RotateCcw className="w-4 h-4" aria-hidden="true" /> Thử lại
                </button>
              )}
              <button type="button" onClick={() => window.location.reload()}
                className="inline-flex items-center gap-1.5 rounded-md bg-chatlan-700 px-3 py-1.5 font-medium text-white hover:bg-chatlan-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-chatlan-600">
                <RefreshCw className="w-4 h-4" aria-hidden="true" /> Tải lại trang
              </button>
            </div>
          </div>
        </div>
      </div>
    );
    if (this.props.variant === 'overlay') {
      return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">{box}</div>;
    }
    return box;
  }
}
