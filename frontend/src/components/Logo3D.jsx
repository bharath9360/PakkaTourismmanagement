import React from 'react';

/**
 * CompanyLogo — Clean logo display component.
 * If logoUrl is provided: shows the company logo image.
 * Otherwise: shows "PT" initials with a gradient hexagon background.
 *
 * Props:
 *   logoUrl  {string|null}  — URL of uploaded company logo
 *   size     {number}       — side length in px (default 44)
 */
export default function Logo3D({ logoUrl, size = 44 }) {
  const s = size;

  const getFullLogoUrl = (url) => {
    if (!url) return null;
    if (url.startsWith('http') || url.startsWith('data:')) return url;
    const baseUrl = import.meta.env.VITE_API_URL
      ? import.meta.env.VITE_API_URL.replace('/api', '')
      : '';
    return `${baseUrl}${url.startsWith('/') ? '' : '/'}${url}`;
  };

  const finalLogoUrl = getFullLogoUrl(logoUrl);

  if (finalLogoUrl) {
    return (
      <div style={{
        width: s,
        height: s,
        borderRadius: '10px',
        overflow: 'hidden',
        flexShrink: 0,
        background: '#fff',
        border: '1.5px solid rgba(96,165,250,0.4)',
        boxShadow: '0 2px 10px rgba(37,99,235,0.25)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <img
          src={finalLogoUrl}
          alt="Company Logo"
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'contain',
            padding: '3px',
          }}
          onError={(e) => {
            e.target.style.display = 'none';
            e.target.parentElement.innerHTML = `<span style="font-size:${Math.round(s * 0.32)}px;font-weight:900;color:#1e40af;font-family:Inter,sans-serif">PT</span>`;
          }}
        />
      </div>
    );
  }

  // Fallback: "PT" initials with blue gradient
  return (
    <div style={{
      width: s,
      height: s,
      borderRadius: '10px',
      flexShrink: 0,
      background: 'linear-gradient(135deg, #1E40AF, #3B82F6)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      boxShadow: '0 2px 10px rgba(37,99,235,0.35)',
      border: '1.5px solid rgba(96,165,250,0.3)',
    }}>
      <span style={{
        fontSize: `${Math.round(s * 0.32)}px`,
        fontWeight: 900,
        color: '#fff',
        fontFamily: 'Inter, sans-serif',
        letterSpacing: '-0.02em',
        textShadow: '0 1px 4px rgba(0,0,0,0.3)',
        userSelect: 'none',
      }}>
        PT
      </span>
    </div>
  );
}
