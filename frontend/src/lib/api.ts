import { API_BASE } from '@/config';

/** Clear auth and redirect to login */
function forceLogout() {
  localStorage.removeItem('auth_token');
  // Only reload if not already on root (avoids infinite loop)
  if (window.location.pathname !== '/') {
    window.location.href = '/';
  } else {
    window.location.reload();
  }
}

/** Fetch wrapper that adds JWT auth header and handles 401 */
export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const token = localStorage.getItem('auth_token');
  const headers = new Headers(init?.headers);

  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  if (!headers.has('Content-Type') && init?.body) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(`${API_BASE}${path}`, { ...init, headers });

  // If the token is rejected, clear it and redirect to login
  if (res.status === 401 && token) {
    forceLogout();
  }

  return res;
}

/** Shorthand for GET */
export function apiGet(path: string): Promise<Response> {
  return apiFetch(path);
}

/** Shorthand for POST with JSON body */
export function apiPost(path: string, body?: object): Promise<Response> {
  return apiFetch(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined });
}

/** Shorthand for PATCH with JSON body */
export function apiPatch(path: string, body: object): Promise<Response> {
  return apiFetch(path, { method: 'PATCH', body: JSON.stringify(body) });
}

/** Shorthand for DELETE */
export function apiDelete(path: string): Promise<Response> {
  return apiFetch(path, { method: 'DELETE' });
}
