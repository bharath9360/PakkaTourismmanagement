/**
 * sessionStorage.js — Temporary Data Utilities for Pakka Tourism CRM
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Purpose:
 *  Store NON-SENSITIVE temporary data that should:
 *   • Persist across page refreshes within the same browser tab/session
 *   • Be cleared when the user logs out or closes the browser
 *   • NOT survive a new browser session (unlike localStorage)
 *
 * What belongs here (temporary / non-sensitive):
 *   • Draft itinerary / quote data (unsaved work)
 *   • Active filter states (lead pipeline filters, date ranges)
 *   • UI preferences (active tab, expanded sections)
 *   • Scroll positions
 *   • Last viewed record IDs
 *   • Search queries
 *
 * What does NOT belong here:
 *   • JWT tokens (use HttpOnly cookies)
 *   • Passwords
 *   • Payment info
 *   • User credentials
 *
 * Note: sessionStorage is cleared automatically when:
 *   • The browser tab is closed
 *   • The user logs out (via lsClear() → sessionStorage.clear())
 * ══════════════════════════════════════════════════════════════════════════
 */

// ─── Key namespace prefix ─────────────────────────────────────────────────────
const NS = 'pt_';

// ─── Safe helpers ─────────────────────────────────────────────────────────────

const ssGet = (key, fallback = null) => {
  try {
    const raw = sessionStorage.getItem(`${NS}${key}`);
    if (raw === null || raw === 'undefined') return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
};

const ssSet = (key, value) => {
  try {
    sessionStorage.setItem(`${NS}${key}`, JSON.stringify(value));
  } catch { /* quota exceeded — ignore */ }
};

const ssRemove = (key) => {
  try {
    sessionStorage.removeItem(`${NS}${key}`);
  } catch { /* ignore */ }
};

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Draft form data (itinerary, quotes, etc.)
 * Key example: 'itinerary_draft', 'quote_draft'
 */
export const saveDraft = (formKey, data) => ssSet(`draft_${formKey}`, {
  data,
  savedAt: Date.now(),
});

export const getDraft = (formKey) => {
  const entry = ssGet(`draft_${formKey}`);
  if (!entry) return null;
  // Auto-expire drafts older than 24 hours
  if (Date.now() - entry.savedAt > 24 * 60 * 60 * 1000) {
    ssRemove(`draft_${formKey}`);
    return null;
  }
  return entry.data;
};

export const clearDraft = (formKey) => ssRemove(`draft_${formKey}`);

export const hasDraft = (formKey) => getDraft(formKey) !== null;

/**
 * Active filters (lead pipeline, bookings, finance ledger, etc.)
 */
export const saveFilters = (pageKey, filters) => ssSet(`filters_${pageKey}`, filters);
export const getFilters  = (pageKey)          => ssGet(`filters_${pageKey}`, {});
export const clearFilters = (pageKey)         => ssRemove(`filters_${pageKey}`);

/**
 * UI State (active tabs, expanded panels, sidebar state)
 */
export const saveUIState = (componentKey, state) => ssSet(`ui_${componentKey}`, state);
export const getUIState  = (componentKey, def = {}) => ssGet(`ui_${componentKey}`, def);
export const clearUIState = (componentKey)      => ssRemove(`ui_${componentKey}`);

/**
 * Last visited record (for "Back to last viewed" UX)
 */
export const setLastViewed = (type, id) => ssSet(`last_${type}`, { id, at: Date.now() });
export const getLastViewed = (type)     => ssGet(`last_${type}`, null);

/**
 * Search query persistence (remembers what the user searched)
 */
export const saveSearch = (pageKey, query) => ssSet(`search_${pageKey}`, query);
export const getSearch  = (pageKey)        => ssGet(`search_${pageKey}`, '');
export const clearSearch = (pageKey)       => ssRemove(`search_${pageKey}`);

/**
 * Clear all session data for a specific module
 */
export const clearModule = (moduleKey) => {
  try {
    const keys = Object.keys(sessionStorage);
    keys.forEach((k) => {
      if (k.startsWith(`${NS}${moduleKey}`)) sessionStorage.removeItem(k);
    });
  } catch { /* ignore */ }
};

/**
 * Clear ALL session storage (called on logout)
 */
export const clearAll = () => {
  try {
    sessionStorage.clear();
  } catch { /* ignore */ }
};

/**
 * Raw getter/setter for one-off use cases
 */
export const setTemp  = (key, value) => ssSet(key, value);
export const getTemp  = (key, def = null) => ssGet(key, def);
export const clearTemp = (key) => ssRemove(key);

// ─── Default export: all helpers ──────────────────────────────────────────────
export default {
  saveDraft,  getDraft,  clearDraft,  hasDraft,
  saveFilters, getFilters, clearFilters,
  saveUIState, getUIState, clearUIState,
  setLastViewed, getLastViewed,
  saveSearch, getSearch, clearSearch,
  clearModule, clearAll,
  setTemp, getTemp, clearTemp,
};
