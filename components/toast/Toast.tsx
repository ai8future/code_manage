'use client';

import { CheckCircle, XCircle, Info, X } from 'lucide-react';
import { useToast, ToastMessage } from './ToastContext';

const VARIANT_STYLES = {
  success: 'bg-green-50 dark:bg-green-900/30 border-green-200 dark:border-green-800 text-green-800 dark:text-green-200',
  error: 'bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-800 text-red-800 dark:text-red-200',
  info: 'bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-200',
};

const VARIANT_ICONS = {
  success: CheckCircle,
  error: XCircle,
  info: Info,
};

function ToastItem({ toast }: { toast: ToastMessage }) {
  const { removeToast } = useToast();
  const Icon = VARIANT_ICONS[toast.variant];

  return (
    <div
      className={`
        flex items-center gap-3 px-4 py-3 rounded-lg border shadow-lg
        ${VARIANT_STYLES[toast.variant]}
        ${toast.exiting ? 'animate-slide-out-right' : 'animate-slide-in-right'}
      `}
    >
      <Icon size={18} className="flex-shrink-0" />
      <p className="text-sm font-medium flex-1">{toast.message}</p>
      <button
        onClick={() => removeToast(toast.id)}
        className="flex-shrink-0 p-1 rounded hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
      >
        <X size={14} />
      </button>
    </div>
  );
}

export function ToastContainer() {
  const { toasts } = useToast();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 w-80">
      {toasts.map(toast => (
        <ToastItem key={toast.id} toast={toast} />
      ))}
    </div>
  );
}
