/**
 * useCompanyStore.js
 * ═══════════════════════════════════════════════════════════════════════════
 * Global Zustand store for company settings (name, logo, phone, email, etc.)
 * This is the single source of truth for the company logo across:
 *  • LoginPage (landing page logo) — uses public endpoint (no auth required)
 *  • Sidebar (brand logo)
 *  • Itinerary PDF export (cover page logo)
 *  • SettingsPage (manage logo)
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { create } from 'zustand';

const API_BASE = import.meta.env.VITE_API_URL
  ? import.meta.env.VITE_API_URL.replace('/api', '')
  : 'http://localhost:5000';

// ─── Helper: resolve logo URL to full URL ─────────────────────────────────
export function resolveLogoUrl(logoPath) {
  if (!logoPath) return null;
  if (logoPath.startsWith('http') || logoPath.startsWith('data:')) return logoPath;
  return `${API_BASE}${logoPath.startsWith('/') ? '' : '/'}${logoPath}`;
}

// ─── Store ─────────────────────────────────────────────────────────────────
const useCompanyStore = create((set, get) => ({
  company: null,        // full settings object from API
  logoUrl: null,        // resolved full URL for the logo
  loading: false,
  fetched: false,       // prevent duplicate fetches

  // ── fetchCompany() — works with or without auth ────────────────────────
  // Uses public branding endpoint when no token present (login page)
  // Uses full settings endpoint when authenticated (to get all details)
  fetchCompany: async () => {
    if (get().loading) return;
    set({ loading: true });
    try {
      const token = localStorage.getItem('pt_token');

      let company = null;

      if (token) {
        // Authenticated: fetch full company settings
        const res = await fetch('/api/settings/company', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          company = data.data || null;
        }
      }

      if (!company) {
        // Not authenticated or full fetch failed: use public branding endpoint
        const res = await fetch('/api/settings/public-branding');
        if (res.ok) {
          const data = await res.json();
          company = data.data || null;
        }
      }

      set({
        company,
        logoUrl: resolveLogoUrl(company?.companyLogo),
        loading: false,
        fetched: true,
      });
    } catch (err) {
      console.warn('[useCompanyStore] Failed to load company settings:', err.message);
      set({ loading: false, fetched: true });
    }
  },

  // ── setLogoUrl() — called immediately after successful upload ──────────
  setLogoUrl: (logoPath, companyData) => {
    set({
      logoUrl: resolveLogoUrl(logoPath),
      company: companyData || get().company,
    });
  },

  // ── refreshCompany() — force re-fetch (called after logo upload) ───────
  refreshCompany: async () => {
    set({ fetched: false, loading: false });
    await get().fetchCompany();
  },
}));

export default useCompanyStore;
