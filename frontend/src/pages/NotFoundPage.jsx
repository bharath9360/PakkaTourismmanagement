import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

/* ── Particle dots ───────────────────────────────────────────────────── */
const Particles = () => {
  const dots = Array.from({ length: 40 }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    y: Math.random() * 100,
    size: Math.random() * 3 + 1,
    dur: Math.random() * 6 + 4,
    delay: Math.random() * 4,
    opacity: Math.random() * 0.4 + 0.1,
  }));
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
      {dots.map(d => (
        <div key={d.id} style={{
          position: 'absolute',
          left: `${d.x}%`, top: `${d.y}%`,
          width: d.size, height: d.size,
          borderRadius: '50%',
          background: '#60A5FA',
          opacity: d.opacity,
          animation: `float ${d.dur}s ease-in-out ${d.delay}s infinite alternate`,
        }} />
      ))}
    </div>
  );
};

/* ── Airplane SVG ────────────────────────────────────────────────────── */
const Airplane = () => (
  <svg viewBox="0 0 100 60" style={{ width: 80, height: 48, filter: 'drop-shadow(0 4px 16px rgba(96,165,250,0.6))' }}>
    <path d="M90 28L15 8l8 20-8 20L90 28z" fill="#3B82F6" opacity="0.9"/>
    <path d="M35 28L20 48l30-8" fill="#60A5FA" opacity="0.7"/>
    <path d="M35 28L20 8l30 8" fill="#60A5FA" opacity="0.7"/>
    <circle cx="88" cy="28" r="3" fill="#34D399" opacity="0.9">
      <animate attributeName="r" values="3;5;3" dur="1.5s" repeatCount="indefinite"/>
      <animate attributeName="opacity" values="0.9;0.4;0.9" dur="1.5s" repeatCount="indefinite"/>
    </circle>
  </svg>
);

/* ── Compass ─────────────────────────────────────────────────────────── */
const Compass = () => (
  <svg viewBox="0 0 60 60" style={{ width: 60, height: 60, animation: 'compassSpin 8s linear infinite' }}>
    <circle cx="30" cy="30" r="28" fill="none" stroke="rgba(96,165,250,0.3)" strokeWidth="1.5"/>
    <circle cx="30" cy="30" r="24" fill="rgba(15,23,42,0.8)" stroke="rgba(96,165,250,0.5)" strokeWidth="1"/>
    {['N','E','S','W'].map((label, i) => {
      const angle = i * 90;
      const rad = (angle - 90) * Math.PI / 180;
      return (
        <text key={label}
          x={30 + Math.cos(rad) * 18} y={30 + Math.sin(rad) * 18 + 4}
          textAnchor="middle" fontSize="7" fontWeight="bold"
          fill={label === 'N' ? '#F59E0B' : 'rgba(148,163,184,0.6)'}
          fontFamily="Inter, sans-serif"
        >{label}</text>
      );
    })}
    {/* Needle */}
    <polygon points="30,14 28,30 30,26 32,30" fill="#F59E0B"/>
    <polygon points="30,46 28,30 30,34 32,30" fill="#64748B"/>
    <circle cx="30" cy="30" r="2.5" fill="#fff"/>
  </svg>
);

/* ─── Main 404 Component ─────────────────────────────────────────────── */
export default function NotFoundPage() {
  const navigate = useNavigate();
  const [mounted, setMounted] = useState(false);
  const [glitch, setGlitch] = useState(false);

  useEffect(() => {
    setMounted(true);
    // Trigger glitch effect periodically
    const interval = setInterval(() => {
      setGlitch(true);
      setTimeout(() => setGlitch(false), 300);
    }, 3500);
    return () => clearInterval(interval);
  }, []);

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(135deg, #0A0E1A 0%, #0F172A 50%, #0A0E1A 100%)',
      fontFamily: 'Inter, sans-serif', position: 'relative', overflow: 'hidden',
      opacity: mounted ? 1 : 0, transition: 'opacity 0.5s ease',
    }}>
      <Particles />

      {/* Radial glow */}
      <div style={{
        position: 'absolute', width: 500, height: 500, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(37,99,235,0.12) 0%, transparent 70%)',
        top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
        pointerEvents: 'none',
      }} />

      {/* Grid lines */}
      <div style={{
        position: 'absolute', inset: 0, opacity: 0.04,
        backgroundImage: 'linear-gradient(#3B82F6 1px, transparent 1px), linear-gradient(90deg, #3B82F6 1px, transparent 1px)',
        backgroundSize: '60px 60px',
        animation: 'gridDrift 20s linear infinite',
        pointerEvents: 'none',
      }} />

      {/* Flying airplane */}
      <div style={{
        position: 'absolute', top: '18%',
        animation: 'flyAcross 12s linear infinite',
        pointerEvents: 'none',
      }}>
        <Airplane />
      </div>

      {/* Main content */}
      <div style={{
        position: 'relative', zIndex: 1, textAlign: 'center', padding: '0 24px',
        animation: 'fadeSlideUp 0.7s cubic-bezier(0.34,1.56,0.64,1)',
      }}>

        {/* 404 glitch text */}
        <div style={{ position: 'relative', marginBottom: '8px' }}>
          <div style={{
            fontSize: 'clamp(80px, 18vw, 160px)',
            fontWeight: 900, letterSpacing: '-0.04em', lineHeight: 1,
            background: 'linear-gradient(135deg, #3B82F6 0%, #8B5CF6 50%, #06B6D4 100%)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            animation: glitch ? 'glitch 0.3s steps(2,end)' : 'none',
            filter: glitch ? 'none' : 'drop-shadow(0 0 30px rgba(59,130,246,0.4))',
          }}>
            404
          </div>
          {glitch && (
            <>
              <div style={{
                position: 'absolute', inset: 0,
                fontSize: 'clamp(80px, 18vw, 160px)', fontWeight: 900, letterSpacing: '-0.04em', lineHeight: 1,
                color: '#EF4444', opacity: 0.5,
                transform: 'translate(-3px, 0)', clipPath: 'inset(30% 0 60% 0)',
                mixBlendMode: 'multiply',
              }}>404</div>
              <div style={{
                position: 'absolute', inset: 0,
                fontSize: 'clamp(80px, 18vw, 160px)', fontWeight: 900, letterSpacing: '-0.04em', lineHeight: 1,
                color: '#06B6D4', opacity: 0.5,
                transform: 'translate(3px, 0)', clipPath: 'inset(60% 0 10% 0)',
                mixBlendMode: 'multiply',
              }}>404</div>
            </>
          )}
        </div>

        {/* Compass */}
        <div style={{ marginBottom: '24px', display: 'flex', justifyContent: 'center' }}>
          <Compass />
        </div>

        {/* Title */}
        <h1 style={{
          fontSize: 'clamp(20px, 4vw, 28px)', fontWeight: 800, color: '#F1F5F9',
          marginBottom: '12px', letterSpacing: '-0.02em',
          animation: 'fadeSlideUp 0.7s 0.15s both cubic-bezier(0.34,1.56,0.64,1)',
        }}>
          Destination Not Found
        </h1>

        <p style={{
          fontSize: 'clamp(13px, 2vw, 15px)', color: 'rgba(148,163,184,0.7)',
          maxWidth: '380px', lineHeight: 1.7, margin: '0 auto 32px',
          animation: 'fadeSlideUp 0.7s 0.25s both cubic-bezier(0.34,1.56,0.64,1)',
        }}>
          Looks like this route is off the map! The page you're looking for doesn't exist or has moved to a new destination.
        </p>

        {/* Action buttons */}
        <div style={{
          display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap',
          animation: 'fadeSlideUp 0.7s 0.35s both cubic-bezier(0.34,1.56,0.64,1)',
        }}>
          <button
            onClick={() => navigate('/dashboard')}
            style={{
              padding: '13px 28px', borderRadius: '12px', border: 'none', cursor: 'pointer',
              background: 'linear-gradient(135deg, #2563EB, #1D4ED8)',
              color: '#fff', fontSize: '14px', fontWeight: 700,
              boxShadow: '0 4px 20px rgba(37,99,235,0.5)',
              transition: 'all 0.2s', fontFamily: 'Inter, sans-serif',
              display: 'flex', alignItems: 'center', gap: '8px',
            }}
            onMouseEnter={e => { e.target.style.transform = 'translateY(-2px)'; e.target.style.boxShadow = '0 8px 28px rgba(37,99,235,0.6)'; }}
            onMouseLeave={e => { e.target.style.transform = 'none'; e.target.style.boxShadow = '0 4px 20px rgba(37,99,235,0.5)'; }}
          >
            🏠 Back to Dashboard
          </button>
          <button
            onClick={() => navigate(-1)}
            style={{
              padding: '13px 24px', borderRadius: '12px', cursor: 'pointer',
              background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
              color: 'rgba(255,255,255,0.7)', fontSize: '14px', fontWeight: 600,
              transition: 'all 0.2s', fontFamily: 'Inter, sans-serif',
            }}
            onMouseEnter={e => { e.target.style.background = 'rgba(255,255,255,0.1)'; e.target.style.color = '#fff'; }}
            onMouseLeave={e => { e.target.style.background = 'rgba(255,255,255,0.05)'; e.target.style.color = 'rgba(255,255,255,0.7)'; }}
          >
            ← Go Back
          </button>
        </div>

        {/* Flight path illustration */}
        <div style={{
          marginTop: '48px', opacity: 0.25,
          animation: 'fadeSlideUp 0.7s 0.5s both',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
        }}>
          <span style={{ color: '#60A5FA', fontSize: '12px', fontWeight: 500, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            Pakka Tourism Enterprise Suite
          </span>
        </div>
      </div>

      <style>{`
        @keyframes flyAcross {
          0%   { left: -120px; transform: none; }
          50%  { transform: translateY(-12px); }
          100% { left: calc(100% + 120px); transform: none; }
        }
        @keyframes compassSpin {
          to { transform: rotate(360deg); }
        }
        @keyframes fadeSlideUp {
          from { opacity: 0; transform: translateY(28px); }
          to   { opacity: 1; transform: none; }
        }
        @keyframes gridDrift {
          to { background-position: 60px 60px; }
        }
        @keyframes float {
          from { transform: translateY(0); }
          to   { transform: translateY(-20px); }
        }
        @keyframes glitch {
          0%   { transform: skewX(0deg); }
          20%  { transform: skewX(-4deg) translateX(3px); }
          40%  { transform: skewX(4deg) translateX(-3px); }
          60%  { transform: skewX(-2deg) translateX(2px); }
          80%  { transform: skewX(2deg) translateX(-2px); }
          100% { transform: skewX(0deg); }
        }
      `}</style>
    </div>
  );
}
