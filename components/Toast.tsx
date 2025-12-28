import React, { useEffect } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info';

interface ToastProps {
  message: string;
  type: ToastType;
  onClose: () => void;
  duration?: number;
}

export const Toast: React.FC<ToastProps> = ({ message, type, onClose, duration = 3000 }) => {
  useEffect(() => {
    const timer = setTimeout(onClose, duration);
    return () => clearTimeout(timer);
  }, [onClose, duration]);

  const icons = {
    success: <CheckCircle2 className="w-5 h-5 text-green-600" />,
    error: <AlertCircle className="w-5 h-5 text-red-600" />,
    info: <Info className="w-5 h-5 text-blue-600" />
  };

  const bgColors = {
    success: 'bg-white border-green-100 shadow-green-100/50',
    error: 'bg-white border-red-100 shadow-red-100/50',
    info: 'bg-white border-blue-100 shadow-blue-100/50'
  };

  return (
    <div className={`
      flex items-center gap-4 px-5 py-4 rounded-2xl border shadow-xl animate-in slide-in-from-right duration-300
      ${bgColors[type]}
    `}>
      <div className={`p-2 rounded-xl ${
        type === 'success' ? 'bg-green-50' : 
        type === 'error' ? 'bg-red-50' : 'bg-blue-50'
      }`}>
        {icons[type]}
      </div>
      <p className="text-sm font-bold text-slate-800 min-w-[200px]">{message}</p>
      <button 
        onClick={onClose}
        className="p-1 hover:bg-slate-50 rounded-lg text-slate-400 transition-colors"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};
