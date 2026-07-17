const GITHUB_API_URL = 'https://api.github.com';
const SESSION_KEY = 'contacts_github_storage_session';
const LOCAL_KEY = 'contacts_github_storage_local';

export interface GitHubStorageConfig {
  owner: string;
  repo: string;
  branch: string;
  token: string;
}

interface GitHubErrorBody {
  message?: string;
  documentation_url?: string;
}

export interface GitHubFile {
  path: string;
  sha: string;
  text: string;
}

interface GitHubContentResponse {
  type: 'file' | 'dir' | 'symlink' | 'submodule';
  path: string;
  sha: string;
  content?: string;
  encoding?: string;
}

export class GitHubApiError extends Error {
  readonly status: number;
  readonly documentationUrl?: string;

  constructor(message: string, status: number, documentationUrl?: string) {
    super(message);
    this.name = 'GitHubApiError';
    this.status = status;
    this.documentationUrl = documentationUrl;
  }
}

function normalizeConfig(config: GitHubStorageConfig): GitHubStorageConfig {
  return {
    owner: config.owner.trim(),
    repo: config.repo.trim().replace(/\.git$/i, ''),
    branch: config.branch.trim() || 'main',
    token: config.token.trim(),
  };
}

function isValidConfig(value: unknown): value is GitHubStorageConfig {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<GitHubStorageConfig>;
  return Boolean(item.owner && item.repo && item.branch && item.token);
}

function readConfig(storage: Storage, key: string): GitHubStorageConfig | null {
  const raw = storage.getItem(key);
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as unknown;
    return isValidConfig(value) ? normalizeConfig(value) : null;
  } catch {
    storage.removeItem(key);
    return null;
  }
}

export function getGitHubStorageConfig(): GitHubStorageConfig | null {
  return readConfig(sessionStorage, SESSION_KEY) ?? readConfig(localStorage, LOCAL_KEY);
}

export function saveGitHubStorageConfig(
  config: GitHubStorageConfig,
  rememberOnDevice: boolean,
): GitHubStorageConfig {
  const normalized = normalizeConfig(config);
  if (!normalized.owner || !normalized.repo || !normalized.token) {
    throw new Error('Укажите владельца, репозиторий и токен GitHub.');
  }

  sessionStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(LOCAL_KEY);
  const storage = rememberOnDevice ? localStorage : sessionStorage;
  storage.setItem(rememberOnDevice ? LOCAL_KEY : SESSION_KEY, JSON.stringify(normalized));
  return normalized;
}

export function clearGitHubStorageConfig(): void {
  sessionStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(LOCAL_KEY);
}

function encodePath(path: string): string {
  return path
    .split('/')
    .filter(Boolean)
    .map((part) => encodeURIComponent(part))
    .join('/');
}

function encodeUtf8Base64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

function decodeUtf8Base64(value: string): string {
  const binary = atob(value.replace(/\s/g, ''));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new TextDecoder().decode(bytes);
}

async function parseError(response: Response): Promise<GitHubApiError> {
  const text = await response.text();
  let body: GitHubErrorBody = {};
  try {
    body = text ? (JSON.parse(text) as GitHubErrorBody) : {};
  } catch {
    body = { message: text };
  }

  let message = body.message || response.statusText || 'Ошибка GitHub API';
  if (response.status === 401) {
    message = 'GitHub отклонил токен. Проверьте токен и срок его действия.';
  } else if (response.status === 403) {
    message = 'Токен GitHub не имеет нужных прав. Требуется Contents: Read and write.';
  } else if (response.status === 404) {
    message = 'Приватный репозиторий не найден или токен не имеет к нему доступа.';
  }

  return new GitHubApiError(message, response.status, body.documentation_url);
}

async function githubRequest<T>(
  config: GitHubStorageConfig,
  endpoint: string,
  init?: RequestInit,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${GITHUB_API_URL}${endpoint}`, {
      ...init,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${config.token}`,
        'X-GitHub-Api-Version': '2026-03-10',
        ...init?.headers,
      },
    });
  } catch (error) {
    const details = error instanceof Error ? error.message : String(error);
    throw new Error(`Нет соединения с GitHub API: ${details}`);
  }

  if (!response.ok) throw await parseError(response);
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

function repoEndpoint(config: GitHubStorageConfig): string {
  return `/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}`;
}

export async function validateGitHubStorage(config: GitHubStorageConfig): Promise<void> {
  const normalized = normalizeConfig(config);
  await githubRequest(normalized, repoEndpoint(normalized));
}

export async function getGitHubFile(
  config: GitHubStorageConfig,
  path: string,
): Promise<GitHubFile | null> {
  const normalized = normalizeConfig(config);
  const params = new URLSearchParams({ ref: normalized.branch });
  try {
    const response = await githubRequest<GitHubContentResponse>(
      normalized,
      `${repoEndpoint(normalized)}/contents/${encodePath(path)}?${params.toString()}`,
    );
    if (response.type !== 'file' || response.encoding !== 'base64' || !response.content) {
      throw new Error(`Объект «${path}» в GitHub не является обычным файлом.`);
    }
    return {
      path: response.path,
      sha: response.sha,
      text: decodeUtf8Base64(response.content),
    };
  } catch (error) {
    if (error instanceof GitHubApiError && error.status === 404) return null;
    throw error;
  }
}

export async function putGitHubFile(
  config: GitHubStorageConfig,
  path: string,
  text: string,
  message: string,
  sha?: string,
): Promise<void> {
  const normalized = normalizeConfig(config);
  await githubRequest(
    normalized,
    `${repoEndpoint(normalized)}/contents/${encodePath(path)}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
        content: encodeUtf8Base64(text),
        branch: normalized.branch,
        ...(sha ? { sha } : {}),
      }),
    },
  );
}
