import React, { useState, useEffect, useCallback, useRef } from 'react';
import { X, CheckCircle, AlertCircle, AlertTriangle, Info } from 'lucide-react';

export type ToastType = 'error' | 'success' | 'warning' | 'info';

interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
}

let _idCounter = 0;
type Listener = (item: ToastItem) => void;
const _listeners = new Set<Listener>();

function _emit(message: string, type: ToastType) {
  const id = ++_idCounter;
  _listeners.forEach(fn => fn({ id, message, type }));
}

export const toast = {
  error:   (msg: string) => _emit(msg, 'error'),
  success: (msg: string) => _emit(msg, 'success'),
  warning: (msg: string) => _emit(msg, 'warning'),
  info:    (msg: string) => _emit(msg, 'info'),
};

const CONFIG: Record<ToastType, { icon: React.FC<{ size: number; className: string }>, bg: string, border: string, text: string, bar: string }> = {
  error:   { icon: AlertCircle,   bg: 'bg-red-950/90',    border: 'border-red-500/30',   text: 'text-red-200',    bar: 'bg-red-500' },
  success: { icon: CheckCircle,   bg: 'bg-green-950/90',  border: 'border-green-500/30', text: 'text-green-200',  bar: 'bg-green-500' },
  warning: { icon: AlertTriangle, bg: 'bg-amber-950/90',  border: 'border-amber-500/30', text: 'text-amber-200',  bar: 'bg-amber-500' },
  info:    { icon: Info,          bg: 'bg-zinc-900/95',   border: 'border-white/10',     text: 'text-zinc-200',   bar: 'bg-purple-500' },
};

const DURATION = 4500;

interface SingleToastProps {
  item: ToastItem;
  onRemove: (id: number) => void;
}

const SingleToast: React.FC<SingleToastProps> = ({ item, onRemove }) => {
  const [visible, setVisible] = useState(false);
  const { icon: Icon, bg, border, text, bar } = CONFIG[item.type];

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
    const dismiss = setTimeout(() => {
      setVisible(false);
      setTimeout(() => onRemove(item.id), 300);
    }, DURATION);
    return () => clearTimeout(dismiss);
  }, [item.id, onRemove]);

  const handleClose = () => {
    setVisible(false);
    setTimeout(() => onRemove(item.id), 300);
  };

  return (
    <div
      className={`relative overflow-hidden flex items-start gap-3 px-4 py-3.5 rounded-xl border shadow-2xl backdrop-blur-xl max-w-sm w-full transition-all duration-300
        ${bg} ${border} ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2'}
      `}
    >
      <div className={`absolute bottom-0 left-0 h-0.5 ${bar} transition-all`} style={{ width: visible ? '0%' : '100%', transitionDuration: `${DURATION}ms`, transitionTimingFunction: 'linear' }} />
      <Icon size={17} className={`shrink-0 mt-0.5 ${text}`} />
      <p className={`text-sm leading-snug flex-1 font-medium ${text}`}>{item.message}</p>
      <button onClick={handleClose} className={`shrink-0 mt-0.5 opacity-50 hover:opacity-100 transition-opacity ${text}`}>
        <X size={14} />
      </button>
    </div>
  );
};

export const ToastContainer: React.FC = () => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const setToastsRef = useRef(setToasts);
  setToastsRef.current = setToasts;

  useEffect(() => {
    const listener: Listener = (item) => {
      setToastsRef.current(prev => [...prev.slice(-4), item]);
    };
    _listeners.add(listener);
    return () => { _listeners.delete(listener); };
  }, []);

  const remove = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none">
      {toasts.map(t => (
        <div key={t.id} className="pointer-events-auto">
          <SingleToast item={t} onRemove={remove} />
        </div>
      ))}
    </div>
  );
};
