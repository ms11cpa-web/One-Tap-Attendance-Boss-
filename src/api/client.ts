export class ApiError extends Error {
  status: number;
  data: unknown;

  constructor(message: string, status: number, data?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

export function getStoredToken(): string | null {
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      return localStorage.getItem('boss_token');
    } catch {
      return null;
    }
  }
  return null;
}

export function setStoredToken(token: string | null): void {
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      if (token) {
        localStorage.setItem('boss_token', token);
      } else {
        localStorage.removeItem('boss_token');
      }
    } catch {
      // ignore
    }
  }
}

export async function apiRequest<T = unknown>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const headers = new Headers(options.headers || {});
  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  // Include Bearer token from localStorage for iframe & cross-origin compatibility
  const token = getStoredToken();
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(endpoint, {
    ...options,
    headers,
    credentials: 'include',
  });

  if (!response.ok) {
    let errData: { error?: string } = {};
    try {
      errData = await response.json();
    } catch {
      // ignore JSON parse error
    }
    const message = errData.error || response.statusText || 'An unexpected error occurred';
    throw new ApiError(message, response.status, errData);
  }

  if (response.status === 204) {
    return {} as T;
  }

  return response.json();
}

export async function downloadExcelReport(params: Record<string, string>): Promise<void> {
  const query = new URLSearchParams(params).toString();
  const url = `/api/reports/export-xlsx?${query}`;

  const headers = new Headers();
  const token = getStoredToken();
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(url, {
    method: 'GET',
    headers,
    credentials: 'include',
  });

  if (!response.ok) {
    let msg = 'Failed to generate Excel report';
    try {
      const err = await response.json();
      if (err.error) msg = err.error;
    } catch {
      // ignore
    }
    throw new Error(msg);
  }

  const blob = await response.blob();
  const downloadUrl = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = downloadUrl;
  const contentDisp = response.headers.get('Content-Disposition');
  let filename = 'Boss_Attendance_Report.xlsx';
  if (contentDisp && contentDisp.includes('filename=')) {
    const match = contentDisp.match(/filename="?([^"]+)"?/);
    if (match && match[1]) filename = match[1];
  }
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(downloadUrl);
}
