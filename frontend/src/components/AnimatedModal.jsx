import React, { useEffect, useRef, useState } from 'react';

/**
 * AnimatedModal — reusable animated modal wrapper.
 *
 * Props:
 *   open       {boolean}    — controls visibility
 *   onClose    {function}   — called when backdrop or X clicked
 *   maxWidth   {string}     — CSS max-width of dialog (default '560px')
 *   children   {ReactNode}
 */
export default function AnimatedModal({ open, onClose, maxWidth = '560px', children }) {
  const [visible, setVisible] = useState(open);
  const [animOut, setAnimOut] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => {
    if (open) {
      setVisible(true);
      setAnimOut(false);
    } else if (visible) {
      setAnimOut(true);
      timerRef.current = setTimeout(() => {
        setVisible(false);
        setAnimOut(false);
      }, 260);
    }
    return () => clearTimeout(timerRef.current);
  }, [open]);

  if (!visible) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '16px',
        background: animOut ? 'rgba(0,0,0,0)' : 'rgba(0,0,0,0.55)',
        backdropFilter: animOut ? 'blur(0px)' : 'blur(4px)',
        transition: 'background 0.25s, backdrop-filter 0.25s',
        animation: animOut ? 'none' : 'backdropIn 0.25s ease-out',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth,
          maxHeight: '90vh',
          overflowY: 'auto',
          animation: animOut ? 'modalOut 0.25s ease-in forwards' : 'modalIn 0.28s cubic-bezier(0.34,1.56,0.64,1)',
        }}
      >
        {children}
      </div>

      <style>{`
        @keyframes backdropIn {
          from { background: rgba(0,0,0,0); backdrop-filter: blur(0); }
          to   { background: rgba(0,0,0,0.55); backdrop-filter: blur(4px); }
        }
        @keyframes modalIn {
          from { opacity: 0; transform: scale(0.88) translateY(24px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes modalOut {
          from { opacity: 1; transform: scale(1) translateY(0); }
          to   { opacity: 0; transform: scale(0.88) translateY(16px); }
        }
      `}</style>
    </div>
  );
}
