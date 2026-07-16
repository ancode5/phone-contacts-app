const DISK_API_URL = 'https://cloud-api.yandex.net/v1/disk';

export interface DiskResource {
  name: string;
  path: string;
  type: 'dir' | 'file';
  size?: number;
  revision?: number;
  modified?: string;
  created?: string;
  md5?: string;
  sha256?: string;
  _embedded?: {
    items: DiskResource[];
    limit: number;
    offset: number;
    total: number;
  };
}

interface LinkResponse {
  href: string;
  method: string;
  templated?: boolean;
}

interface DiskApiErrorBody {
  error?: string;
  description?: string;
  message?: string;
}

export class DiskApiError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'DiskApiError';
    this.status = status;
    this.code = code;
  }
}

function normalizeDiskPath(path: string): string {
  const trimmed = path.trim().replace(/^disk:\/?/i, '').replace(/^\/+|\/+$/g, '');
  return `disk:/${trimmed}`;
}

export function joinDiskPath(...parts: string[]): string {
  const normalized = parts
    .map((part) => part.trim().replace(/^disk:\/?/i, '').replace(/^\/+|\/+$/g, ''))
    .filter(Boolean);
  return `disk:/${normalized.join('/')}`;
}

async function parseError(response: Response): Promise<DiskApiError> {
  const text = await response.text();
  let body: DiskApiErrorBody = {};

  try {
    body = text ? (JSON.parse(text) as DiskApiErrorBody) : {};
  } catch {
    body = { description: text };
  }

  const message = body.description || body.message || response.statusText || 'Ошибка Яндекс Диска';
  return new DiskApiError(message, response.status, body.error);
}

async function diskRequest<T>(token: string, endpoint: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${DISK_API_URL}${endpoint}`, {
      ...init,
      headers: {
        Authorization: `OAuth ${token}`,
        ...init?.headers,
      },
    });
  } catch (error) {
    const details = error instanceof Error ? error.message : String(error);
    throw new Error(`Нет соединения с API Яндекс Диска: ${details}`);
  }

  if (!response.ok) throw await parseError(response);
  if (response.status === 204 || response.status === 202 || response.status === 201) {
    const text = await response.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }

  return (await response.json()) as T;
}

export async function getDiskResource(token: string, path: string): Promise<DiskResource> {
  const params = new URLSearchParams({
    path: normalizeDiskPath(path),
    limit: '200',
    fields:
      'name,path,type,size,revision,modified,created,md5,sha256,_embedded.items.name,_embedded.items.path,_embedded.items.type,_embedded.items.size,_embedded.items.revision,_embedded.items.modified,_embedded.total',
  });
  return diskRequest<DiskResource>(token, `/resources?${params.toString()}`);
}

export async function diskResourceExists(token: string, path: string): Promise<boolean> {
  try {
    await getDiskResource(token, path);
    return true;
  } catch (error) {
    if (error instanceof DiskApiError && error.status === 404) return false;
    throw error;
  }
}

export async function createDiskFolder(token: string, path: string): Promise<void> {
  const params = new URLSearchParams({ path: normalizeDiskPath(path) });
  try {
    await diskRequest<void>(token, `/resources?${params.toString()}`, { method: 'PUT' });
  } catch (error) {
    if (error instanceof DiskApiError && error.status === 409) return;
    throw error;
  }
}

export async function getUploadLink(
  token: string,
  path: string,
  overwrite: boolean,
): Promise<LinkResponse> {
  const params = new URLSearchParams({
    path: normalizeDiskPath(path),
    overwrite: String(overwrite),
  });
  return diskRequest<LinkResponse>(token, `/resources/upload?${params.toString()}`);
}

export async function uploadTextFile(
  token: string,
  path: string,
  text: string,
  overwrite: boolean,
): Promise<void> {
  const link = await getUploadLink(token, path, overwrite);
  const response = await fetch(link.href, {
    method: link.method || 'PUT',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: new Blob([text], { type: 'application/octet-stream' }),
  });

  if (!response.ok) throw await parseError(response);
}

export async function getDownloadLink(token: string, path: string): Promise<LinkResponse> {
  const params = new URLSearchParams({ path: normalizeDiskPath(path) });
  return diskRequest<LinkResponse>(token, `/resources/download?${params.toString()}`);
}

export async function downloadTextFile(token: string, path: string): Promise<string> {
  const link = await getDownloadLink(token, path);
  const response = await fetch(link.href);
  if (!response.ok) throw await parseError(response);
  return response.text();
}

export async function deleteDiskResource(
  token: string,
  path: string,
  permanently = false,
): Promise<void> {
  const params = new URLSearchParams({
    path: normalizeDiskPath(path),
    permanently: String(permanently),
  });
  await diskRequest<void>(token, `/resources?${params.toString()}`, { method: 'DELETE' });
}
