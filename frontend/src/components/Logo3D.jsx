import React, { useState } from 'react';

/**
 * Logo3D — CSS 3D animated company logo.
 * If logoUrl is provided: shows it in a rotating 3D frame.
 * Otherwise: animated 3D hexagon with "PT" initials.
 *
 * Props:
 *   logoUrl  {string|null}  — URL of uploaded company logo
 *   size     {number}       — side length in px (default 44)
 *   pause    {boolean}      — true to pause rotation on hover
 */
export default function Logo3D({ logoUrl, size = 44, pause = true }) {
  const [hovered, setHovered] = useState(false);
  const s = size;

  const containerStyle = {
    width: s, height: s,
    position: 'relative',
    perspective: `${s * 5}px`,
    cursor: 'default',
    flexShrink: 0,
  };

  const innerStyle = {
    width: '100%', height: '100%',
    transformStyle: 'preserve-3d',
    animation: `logo3dSpin ${pause && hovered ? 'paused' : '8s linear infinite'}`,
    // keep animation running but paused on hover
    animationPlayState: pause && hovered ? 'paused' : 'running',
  };

  if (logoUrl) {
    return (
      <div
        style={containerStyle}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <div style={{ ...innerStyle, animation: `logo3dSpin 8s linear infinite`, animationPlayState: pause && hovered ? 'paused' : 'running' }}>
          {/* Front face */}
          <div style={{
            position: 'absolute', inset: 0,
            borderRadius: '12px',
            overflow: 'hidden',
            backfaceVisibility: 'hidden',
            boxShadow: '0 4px 20px rgba(59,130,246,0.4)',
            border: '1.5px solid rgba(96,165,250,0.5)',
            transform: `translateZ(${s * 0.1}px)`,
          }}>
            <img src={logoUrl} alt="Company Logo" style={{ width: '100%', height: '100%', objectFit: 'contain', background: '#fff', padding: '4px' }} />
          </div>
          {/* Back face glow */}
          <div style={{
            position: 'absolute', inset: 0, borderRadius: '12px',
            background: 'linear-gradient(135deg, #1D4ED8, #0F172A)',
            backfaceVisibility: 'hidden', transform: `translateZ(-${s * 0.1}px) rotateY(180deg)`,
            border: '1.5px solid rgba(59,130,246,0.3)',
          }}>
            <svg viewBox="0 0 24 24" fill="rgba(96,165,250,0.6)" style={{ width: '60%', height: '60%', margin: '20%' }}>
              <path d="M12 2L20 7V17L12 22L4 17V7L12 2Z" />
            </svg>
          </div>
        </div>
        <Logo3DStyles />
      </div>
    );
  }

  // Fallback: animated 3D hexagon with gradient layers
  const hex = `polygon(50% 0%, 93% 25%, 93% 75%, 50% 100%, 7% 75%, 7% 25%)`;
  const layers = [
    { z: s * 0.12, bg: 'linear-gradient(135deg,#1E40AF,#1D4ED8)', opacity: 1 },
    { z: s * 0.06, bg: 'linear-gradient(135deg,#2563EB,#3B82F6)', opacity: 0.95 },
    { z: 0,        bg: 'linear-gradient(135deg,#3B82F6,#60A5FA)', opacity: 0.9 },
  ];

  return (
    <div
      style={containerStyle}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div style={{
        ...innerStyle,
        animationPlayState: pause && hovered ? 'paused' : 'running',
      }}>
        {layers.map((l, i) => (
          <div key={i} style={{
            position: 'absolute', inset: 0,
            clipPath: hex,
            background: l.bg,
            opacity: l.opacity,
            backfaceVisibility: 'hidden',
            transform: `translateZ(${l.z}px)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {i === 2 && (
              <span style={{
                fontSize: `${s * 0.32}px`, fontWeight: 900, color: '#fff',
                fontFamily: 'Inter, sans-serif', letterSpacing: '-0.03em',
                textShadow: '0 1px 4px rgba(0,0,0,0.3)',
              }}>
                PT
              </span>
            )}
          </div>
        ))}
        {/* Bottom shadow layer */}
        <div style={{
          position: 'absolute', inset: 0,
          clipPath: hex,
          background: '#0F172A',
          transform: `translateZ(-${s * 0.08}px)`,
          backfaceVisibility: 'hidden',
        }} />
        {/* Shimmer overlay */}
        <div style={{
          position: 'absolute', inset: 0,
          clipPath: hex,
          background: 'linear-gradient(135deg, rgba(255,255,255,0.2) 0%, transparent 60%)',
          transform: `translateZ(${s * 0.13}px)`,
          backfaceVisibility: 'hidden',
          pointerEvents: 'none',
        }} />
      </div>
      <Logo3DStyles />
    </div>
  );
}

function Logo3DStyles() {
  return (
    <style>{`
      @keyframes logo3dSpin {
        0%   { transform: rotateY(0deg) rotateX(5deg); }
        25%  { transform: rotateY(90deg) rotateX(8deg); }
        50%  { transform: rotateY(180deg) rotateX(5deg); }
        75%  { transform: rotateY(270deg) rotateX(8deg); }
        100% { transform: rotateY(360deg) rotateX(5deg); }
      }
    `}</style>
  );
}
