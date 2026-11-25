// -----------------------------------------------------------------------------
// CRM runtime configuration.
//
// Reusable across projects: everything the CRM needs to talk to a backend is
// here. Override via Vite env vars (VITE_API_BASE, VITE_ADMIN_TOKEN_KEY) or by
// passing a `config` prop to <CrmApp />.
// -----------------------------------------------------------------------------

export interface CrmConfig {
  /** Backend base URL, e.g. http://localhost:5000 */
  apiBase: string;
  /** localStorage key the admin bearer token is stored under. */
  tokenKey: string;
}

export const defaultConfig: CrmConfig = {
  apiBase: (import.meta.env.VITE_API_BASE && import.meta.env.VITE_API_BASE.trim() !== '')
    ? import.meta.env.VITE_API_BASE
    : (typeof window !== 'undefined' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1'
        ? `http://${window.location.host}`
        : 'http://localhost:5055'),
  tokenKey: import.meta.env.VITE_ADMIN_TOKEN_KEY ?? 'crm_admin_token',
};
