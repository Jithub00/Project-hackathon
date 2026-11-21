export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fieldErrors: Record<string, string>;

  constructor(message: string, status: number, code: string, fieldErrors: Record<string, string> = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.fieldErrors = fieldErrors;
  }
}

type Method = 'GET' | 'POST' | 'PUT' | 'DELETE';

async function request<T>(method: Method, path: string, body?: unknown): Promise<T> {
  const init: RequestInit = { method, credentials: 'same-origin', headers: { Accept: 'application/json' } };
  if (body !== undefined) {
    init.headers = { ...init.headers, 'Content-Type': 'application/json' };
    init.body = JSON.stringify(body);
  }
  let response: Response;
  try {
    response = await fetch(path, init);
  } catch {
    throw new ApiError('We could not reach Photo Shoot. Check your connection and try again.', 0, 'NETWORK');
  }
  const text = await response.text();
  let data: Record<string, unknown> | null = null;
  try {
    data = text ? (JSON.parse(text) as Record<string, unknown>) : null;
  } catch {
    data = null;
  }
  if (!response.ok) {
    throw new ApiError(
      (data?.error as string) || `Something went wrong (${response.status}). Please try again.`,
      response.status,
      (data?.code as string) || 'ERROR',
      (data?.fieldErrors as Record<string, string>) || {},
    );
  }
  return data as T;
}

export const api = {
  get: <T,>(path: string) => request<T>('GET', path),
  post: <T,>(path: string, body?: unknown) => request<T>('POST', path, body ?? {}),
  put: <T,>(path: string, body?: unknown) => request<T>('PUT', path, body ?? {}),
  delete: <T,>(path: string) => request<T>('DELETE', path),
};

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Something went wrong. Please try again.';
}

/** Reads a File into a base64 data URL for the upload endpoint. */
export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('That file could not be read. Choose it again.'));
    reader.readAsDataURL(file);
  });
}

export async function uploadFile(file: File): Promise<{ url: string; kind: 'photo' | 'video'; sizeBytes: number; fileName: string }> {
  const dataUrl = await readFileAsDataUrl(file);
  return api.post('/api/uploads', { fileName: file.name, mimeType: file.type, dataUrl });
}
