/**
 * R7K12 tracking — client-side counter.
 *
 * R7K12 is a separate tracker (not the Meta pixel / GTM). It drops a visit
 * session id `r7k12_si` after pageview; per spec we read it AT THE MOMENT of
 * the event (never a "last visit" value) and fire a GET counter request.
 *
 * Iteration 1 (per TZ): registration only. Successful sales are sent from the
 * payment side and need the sale endpoint — wired separately once specced.
 *
 * NOTE: r7k12_si only exists if the R7K12 pageview counter script is loaded on
 * the site. If it's missing we skip the request rather than send an empty si.
 */

// Project counter key — must match the pageview snippet in app/[locale]/layout.tsx.
const R7K12_KEY = '0aec6b66fa3e34b560c12d1d8bcf5cc2';
const R7K12_BASE = `https://r7k12.com/${R7K12_KEY}`;

declare global {
  interface Window {
    r7k12_si?: string;
    R7K12_CallBack?: (si?: string) => void;
  }
}

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const escaped = name.replace(/([.$?*|{}()[\]\\/+^])/g, '\\$1');
  const match = document.cookie.match(new RegExp(`(?:^|; )${escaped}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

/** Read the visit session id, in priority order: window → cookie → localStorage. */
export function getR7k12Si(): string | null {
  if (typeof window === 'undefined') return null;
  if (window.r7k12_si) return String(window.r7k12_si);
  const fromCookie = readCookie('r7k12_si');
  if (fromCookie) return fromCookie;
  try {
    const fromLs = window.localStorage.getItem('r7k12_si');
    if (fromLs) return fromLs;
  } catch {
    // localStorage blocked (private mode) — fall through.
  }
  return null;
}

function fireGet(url: string): void {
  if (typeof window === 'undefined') return;
  // Fire-and-forget pixel GET — avoids CORS, no response needed client-side.
  const img = new Image();
  img.src = url;
}

/**
 * Counter event. Reads r7k12_si at call time.
 *   metric=1 → регистрация (per TZ).
 */
export function r7k12Counter(metric: number): void {
  const si = getR7k12Si();
  if (!si) {
    if (typeof console !== 'undefined') {
      console.warn('[r7k12] r7k12_si missing — counter not sent (is the R7K12 pageview counter loaded?)');
    }
    return;
  }
  const url = `${R7K12_BASE}/counter/?si=${encodeURIComponent(si)}&e=metric&metric=${encodeURIComponent(String(metric))}`;
  fireGet(url);
}

/** Registration conversion → R7K12 counter metric=1. */
export function r7k12TrackRegistration(): void {
  r7k12Counter(1);
}
