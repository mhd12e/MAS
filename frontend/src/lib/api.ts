import { API_BASE } from '@/config';

/** Fetch wrapper that adds JWT auth header */
export function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const token = localStorage.getItem('auth_token');
  const headers = new Headers(init?.headers);

  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  if (!headers.has('Content-Type') && init?.body) {
    headers.set('Content-Type', 'application/json');
  }

  return fetch(`${API_BASE}${path}`, { ...init, headers });
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
