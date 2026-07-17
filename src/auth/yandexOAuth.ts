const AUTHORIZE_URL = 'https://oauth.yandex.ru/authorize';
const TOKEN_URL = 'https://oauth.yandex.ru/token';
const USER_INFO_URL = 'https://login.yandex.ru/info';

const STORAGE_KEYS = {
  accessToken: 'contacts_yandex_access_token',
  refreshToken: 'contacts_yandex_refresh_token',
  expiresAt: 'contacts_yandex_expires_at',
  oauthState: 'contacts_yandex_oauth_state',
  pkceVerifier: 'contacts_yandex_pkce_verifier',
  returnPath: 'contacts_yandex_return_path',
  deviceId: 'contacts_yandex_device_id',
} as const;

export interface YandexTokenResponse {
  token_type: string;
  access_token: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
}

export interface YandexUserInfo {
  id: string;
  login: string;
  client_id?: string;
  display_name?: string;
  real_name?: string;
  first_name?: string;
  last_name?: string;
  default_email?: string;
  emails?: string[];
}

function getClientId(): string {
  const clientId = import.meta.env.VITE_YANDEX_CLIENT_ID?.trim();
  if (!clientId) throw new Error('Не указан VITE_YANDEX_CLIENT_ID. Проверьте файл .env.local.');
  return clientId;
}

export function getAppUrl(path = '/'): string {
  const base = import.meta.env.BASE_URL || '/';
  const normalizedBase = base.endsWith('/') ? base : `${base}/`;
  const normalizedPath = path.replace(/^\/+/, '');
  return new URL(normalizedPath, `${window.location.origin}${normalizedBase}`).toString();
}

export function getRedirectUri(): string {
  const configured = import.meta.env.VITE_YANDEX_REDIRECT_URI?.trim();
  if (configured) return configured;
  return getAppUrl('auth/callback');
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function createRandomString(byteLength = 48): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return bytesToBase64Url(bytes);
}

async function createCodeChallenge(verifier: string): Promise<string> {
  const data = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return bytesToBase64Url(new Uint8Array(digest));
}

function getOrCreateDeviceId(): string {
  const existing = localStorage.getItem(STORAGE_KEYS.deviceId);
  if (existing) return existing;
  const deviceId = crypto.randomUUID();
  localStorage.setItem(STORAGE_KEYS.deviceId, deviceId);
  return deviceId;
}

export async function beginYandexAuthorization(returnPath = '/'): Promise<void> {
  const verifier = createRandomString();
  const challenge = await createCodeChallenge(verifier);
  const state = createRandomString(24);

  sessionStorage.setItem(STORAGE_KEYS.pkceVerifier, verifier);
  sessionStorage.setItem(STORAGE_KEYS.oauthState, state);
  sessionStorage.setItem(STORAGE_KEYS.returnPath, returnPath.startsWith('/') ? returnPath : '/');

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: getClientId(),
    redirect_uri: getRedirectUri(),
    scope: 'login:info login:email',
    force_confirm: 'yes',
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    device_id: getOrCreateDeviceId(),
    device_name: `Рабочий справочник (${navigator.platform || 'браузер'})`,
  });

  window.location.assign(`${AUTHORIZE_URL}?${params.toString()}`);
}

function saveToken(response: YandexTokenResponse): void {
  sessionStorage.setItem(STORAGE_KEYS.accessToken, response.access_token);
  if (response.refresh_token) sessionStorage.setItem(STORAGE_KEYS.refreshToken, response.refresh_token);

  if (response.expires_in) {
    sessionStorage.setItem(STORAGE_KEYS.expiresAt, String(Date.now() + response.expires_in * 1000));
  } else {
    sessionStorage.removeItem(STORAGE_KEYS.expiresAt);
  }
}

async function readErrorResponse(response: Response): Promise<string> {
  const raw = await response.text();
  if (!raw) return `${response.status} ${response.statusText}`;

  try {
    const data = JSON.parse(raw) as {
      error?: string;
      error_description?: string;
      description?: string;
    };
    return data.error_description || data.description || data.error || raw;
  } catch {
    return raw;
  }
}

export async function finishYandexAuthorization(search: string): Promise<YandexTokenResponse> {
  const params = new URLSearchParams(search);
  const oauthError = params.get('error');
  if (oauthError) {
    const description = params.get('error_description');
    throw new Error(description ? `${oauthError}: ${description}` : oauthError);
  }

  const code = params.get('code');
  const returnedState = params.get('state');
  const expectedState = sessionStorage.getItem(STORAGE_KEYS.oauthState);
  const verifier = sessionStorage.getItem(STORAGE_KEYS.pkceVerifier);

  if (!code) throw new Error('Яндекс не вернул код авторизации.');
  if (!expectedState || !returnedState || returnedState !== expectedState) {
    throw new Error('Проверка state не пройдена. Авторизацию нужно начать заново.');
  }
  if (!verifier) throw new Error('Не найден PKCE code_verifier. Не закрывайте вкладку во время входа.');

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    client_id: getClientId(),
    code_verifier: verifier,
    device_id: getOrCreateDeviceId(),
    device_name: `Рабочий справочник (${navigator.platform || 'браузер'})`,
  });

  let response: Response;
  try {
    response = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
  } catch (error) {
    const details = error instanceof Error ? error.message : String(error);
    throw new Error(`Браузер не смог обратиться к OAuth token endpoint: ${details}`);
  }

  if (!response.ok) {
    throw new Error(`Не удалось получить OAuth-токен: ${await readErrorResponse(response)}`);
  }

  const token = (await response.json()) as YandexTokenResponse;
  if (!token.access_token) throw new Error('В ответе Яндекса отсутствует access_token.');

  saveToken(token);
  sessionStorage.removeItem(STORAGE_KEYS.pkceVerifier);
  sessionStorage.removeItem(STORAGE_KEYS.oauthState);
  return token;
}

export function consumeAuthorizationReturnPath(): string {
  const value = sessionStorage.getItem(STORAGE_KEYS.returnPath) || '/';
  sessionStorage.removeItem(STORAGE_KEYS.returnPath);
  return value.startsWith('/') ? value : '/';
}

export function getAccessToken(): string | null {
  return sessionStorage.getItem(STORAGE_KEYS.accessToken);
}

export function getTokenExpiresAt(): number | null {
  const raw = sessionStorage.getItem(STORAGE_KEYS.expiresAt);
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

export function clearYandexSession(): void {
  sessionStorage.removeItem(STORAGE_KEYS.accessToken);
  sessionStorage.removeItem(STORAGE_KEYS.refreshToken);
  sessionStorage.removeItem(STORAGE_KEYS.expiresAt);
  sessionStorage.removeItem(STORAGE_KEYS.oauthState);
  sessionStorage.removeItem(STORAGE_KEYS.pkceVerifier);
  sessionStorage.removeItem(STORAGE_KEYS.returnPath);
}

export async function loadYandexUser(token = getAccessToken()): Promise<YandexUserInfo> {
  if (!token) throw new Error('Сначала войдите через Яндекс.');

  const params = new URLSearchParams({ format: 'json' });
  const response = await fetch(`${USER_INFO_URL}?${params.toString()}`, {
    headers: { Authorization: `OAuth ${token}` },
  });

  if (!response.ok) {
    throw new Error(`Не удалось получить данные пользователя: ${await readErrorResponse(response)}`);
  }

  return (await response.json()) as YandexUserInfo;
}
