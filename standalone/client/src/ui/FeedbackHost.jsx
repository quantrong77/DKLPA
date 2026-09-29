import React, { useEffect, useState } from 'react';
import { CheckCircle2, AlertTriangle, XCircle, Info, X } from 'lucide-react';
import ModalOverlay from './ModalOverlay.jsx';
import { subscribeFeedback, dismissToast, settleConfirm } from './feedback.js';

const TOAST_STYLE = {
  success: { Icon: CheckCircle2, icon: 'text-emerald-600' },
  error: { Icon: XCircle, icon: 'text-red-600' },
  warning: { Icon: AlertTriangle, icon: 'text-amber-600' },
  info: { Icon: Info, icon: 'text-chatlan-600' }
};

export default function FeedbackHost() {
  const [state, setState] = useState({ toasts: [], confirm: null });
  useEffect(() => subscribeFeedback(setState), []);

  const { toasts, confirm } = state;

  return (
    <>
      {/* Toasts: bottom-centre on phones, top-right on desktop */}
      <div
        className="fixed z-[200] inset-x-0 bottom-20 md:bottom-auto md:top-4 md:right-4 md:left-auto flex flex-col items-center md:items-end gap-2 px-4 pointer-events-none"
        role="status"
        aria-live="polite"
      >
        {toasts.map((t) => {
          const { Icon, icon } = TOAST_STYLE[t.type] || TOAST_STYLE.info;
          return (
            <div
              key={t.id}
              className="pointer-events-auto w-full max-w-sm flex items-start gap-2.5 px-3.5 py-3 bg-white border border-slate-200 rounded-xl shadow-md animate-fadeIn"
            >
              <Icon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${icon}`} aria-hidden="true" />
              <p className="flex-1 text-sm text-slate-800 whitespace-pre-line break-words">{t.message}</p>
              <button
                type="button"
                onClick={() => dismissToast(t.id)}
                aria-label="Đóng thông báo"
                className="p-0.5 -m-0.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          );
        })}
      </div>

      {confirm && (
        <ModalOverlay
          onClose={() => settleConfirm(false)}
          className="fixed inset-0 z-[210] flex items-center justify-center bg-slate-900/50 p-4 animate-fadeIn"
        >
          <div className="w-full max-w-sm bg-white rounded-xl shadow-xl overflow-hidden">
            <div className="p-5 flex items-start gap-3">
              <div
                className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${
                  confirm.danger ? 'bg-red-50 text-red-600' : 'bg-chatlan-50 text-chatlan-600'
                }`}
              >
                {confirm.danger ? <AlertTriangle className="w-4 h-4" aria-hidden="true" /> : <Info className="w-4 h-4" aria-hidden="true" />}
              </div>
              <div className="min-w-0">
                <h2 className="text-base font-semibold text-slate-900">{confirm.title}</h2>
                <p className="mt-1 text-sm text-slate-600 whitespace-pre-line break-words">{confirm.message}</p>
              </div>
            </div>
            <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 flex justify-end gap-2">
              <button
                type="button"
                autoFocus={confirm.danger}
                onClick={() => settleConfirm(false)}
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-100"
              >
                {confirm.cancelLabel}
              </button>
              <button
                type="button"
                autoFocus={!confirm.danger}
                onClick={() => settleConfirm(true)}
                className={`px-4 py-2 text-sm font-semibold text-white rounded-lg ${
                  confirm.danger ? 'bg-red-600 hover:bg-red-700' : 'bg-chatlan-600 hover:bg-chatlan-700'
                }`}
              >
                {confirm.confirmLabel}
              </button>
            </div>
          </div>
        </ModalOverlay>
      )}
    </>
  );
}
