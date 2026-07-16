import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ChangeEvent } from 'react';
import {
  beginYandexAuthorization,
  clearYandexSession,
  finishYandexAuthorization,
  getAccessToken,
  getRedirectUri,
  getTokenExpiresAt,
  loadYandexUser,
} from '../auth/yandexOAuth';
import type { YandexUserInfo } from '../auth/yandexOAuth';
import {
  deleteDiskResource,
  DiskApiError,
  downloadTextFile,
  getDiskResource,
  joinDiskPath,
  uploadTextFile,
} from '../services/yandexDisk';
import type { DiskResource } from '../services/yandexDisk';
import './YandexDiskPrototype.css';

const DEFAULT_FOLDER = 'Справочник контактов';
const TEST_FILENAME = 'contacts-api-test.json';
const FOLDER_STORAGE_KEY = 'contacts_test_disk_folder';

interface LogEntry {
  id: string;
  time: string;
  kind: 'info' | 'success' | 'error';
  message: string;
}

interface TestPayload {
  test: true;
  revision: number;
  message: string;
  updatedAt: string;
  updatedBy: {
    id: string;
    login: string;
    displayName: string;
  };
  browser: string;
}

function describeError(error: unknown): string {
  if (error instanceof DiskApiError) {
    const code = error.code ? `, ${error.code}` : '';
    return `${error.message} (HTTP ${error.status}${code})`;
  }
  return error instanceof Error ? error.message : String(error);
}

function formatDate(value: number | null): string {
  if (!value) return 'не указано';
  return new Intl.DateTimeFormat('ru-RU', {
    dateStyle: 'medium',
    timeStyle: 'medium',
  }).format(value);
}

export function YandexDiskPrototype() {
  const isCallbackPage = window.location.pathname === '/auth/callback';
  const [token, setToken] = useState<string | null>(() => getAccessToken());
  const [user, setUser] = useState<YandexUserInfo | null>(null);
  const [folderName, setFolderName] = useState(
    () => localStorage.getItem(FOLDER_STORAGE_KEY) || DEFAULT_FOLDER,
  );
  const [folderInfo, setFolderInfo] = useState<DiskResource | null>(null);
  const [fileContents, setFileContents] = useState('');
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isBusy, setIsBusy] = useState(false);
  const [callbackStatus, setCallbackStatus] = useState<'idle' | 'working' | 'success' | 'error'>('idle');
  const [callbackMessage, setCallbackMessage] = useState('');

  const testFilePath = useMemo(() => joinDiskPath(folderName, TEST_FILENAME), [folderName]);
  const expiresAt = getTokenExpiresAt();

  const addLog = useCallback((kind: LogEntry['kind'], message: string) => {
    setLogs((current) => [
      {
        id: crypto.randomUUID(),
        time: new Date().toLocaleTimeString('ru-RU'),
        kind,
        message,
      },
      ...current,
    ]);
  }, []);

  const runAction = async (label: string, action: () => Promise<void>) => {
    setIsBusy(true);
    addLog('info', `${label}: начало`);
    try {
      await action();
      addLog('success', `${label}: успешно`);
    } catch (error) {
      const message = describeError(error);
      addLog('error', `${label}: ${message}`);
      window.alert(message);
    } finally {
      setIsBusy(false);
    }
  };

  const loadUser = useCallback(async (currentToken: string) => {
    const profile = await loadYandexUser(currentToken);
    setUser(profile);
    addLog('success', `Вход выполнен: ${profile.display_name || profile.real_name || profile.login}`);
  }, [addLog]);

  useEffect(() => {
    if (!isCallbackPage || callbackStatus !== 'idle') return;

    setCallbackStatus('working');
    setCallbackMessage('Получаем OAuth-токен…');
    void finishYandexAuthorization(window.location.search)
      .then(async (response) => {
        setToken(response.access_token);
        await loadUser(response.access_token);
        setCallbackStatus('success');
        setCallbackMessage('Авторизация завершена. Возвращаемся к тесту…');
        window.setTimeout(() => window.location.replace('/oauth-test'), 900);
      })
      .catch((error: unknown) => {
        setCallbackStatus('error');
        setCallbackMessage(describeError(error));
      });
  }, [callbackStatus, isCallbackPage, loadUser]);

  useEffect(() => {
    if (!token || isCallbackPage || user) return;
    void loadUser(token).catch((error: unknown) => {
      addLog('error', `Не удалось восстановить сессию: ${describeError(error)}`);
      clearYandexSession();
      setToken(null);
    });
  }, [addLog, isCallbackPage, loadUser, token, user]);

  useEffect(() => {
    localStorage.setItem(FOLDER_STORAGE_KEY, folderName);
  }, [folderName]);

  if (isCallbackPage) {
    return (
      <main className="oauth-callback-page">
        <section className="prototype-card callback-card">
          <p className="prototype-eyebrow">Яндекс OAuth</p>
          <h1>Завершение входа</h1>
          <p className={`callback-message ${callbackStatus}`}>{callbackMessage || 'Подготовка…'}</p>
          {callbackStatus === 'error' && (
            <a className="prototype-button secondary" href="/oauth-test">
              Вернуться к тесту
            </a>
          )}
        </section>
      </main>
    );
  }

  const requireToken = (): string => {
    if (!token) throw new Error('Сначала нажмите «Войти через Яндекс».');
    return token;
  };

  const checkFolder = () => runAction('Проверка папки', async () => {
    const resource = await getDiskResource(requireToken(), folderName);
    if (resource.type !== 'dir') throw new Error(`«${folderName}» найдено, но это не папка.`);
    setFolderInfo(resource);
    const count = resource._embedded?.total ?? resource._embedded?.items.length ?? 0;
    addLog('info', `Путь API: ${resource.path}; файлов и папок внутри: ${count}`);
  });

  const createFile = () => runAction('Создание тестового файла', async () => {
    const currentUser = user;
    if (!currentUser) throw new Error('Не удалось определить вошедшего пользователя.');

    const payload: TestPayload = {
      test: true,
      revision: 1,
      message: 'Тестовый файл создан приложением. Настоящих контактов здесь нет.',
      updatedAt: new Date().toISOString(),
      updatedBy: {
        id: currentUser.id,
        login: currentUser.login,
        displayName: currentUser.display_name || currentUser.real_name || currentUser.login,
      },
      browser: navigator.userAgent,
    };

    await uploadTextFile(requireToken(), testFilePath, JSON.stringify(payload, null, 2), false);
    setFileContents(JSON.stringify(payload, null, 2));
    addLog('info', `Создан файл ${testFilePath}`);
  });

  const readFile = () => runAction('Чтение тестового файла', async () => {
    const text = await downloadTextFile(requireToken(), testFilePath);
    setFileContents(text);
    const parsed = JSON.parse(text) as Partial<TestPayload>;
    addLog(
      'info',
      `Прочитана revision=${parsed.revision ?? 'не указана'}, автор=${parsed.updatedBy?.login ?? 'не указан'}`,
    );
  });

  const updateFile = () => runAction('Изменение тестового файла', async () => {
    const currentUser = user;
    if (!currentUser) throw new Error('Не удалось определить вошедшего пользователя.');

    let revision = 0;
    try {
      const current = JSON.parse(await downloadTextFile(requireToken(), testFilePath)) as Partial<TestPayload>;
      revision = typeof current.revision === 'number' ? current.revision : 0;
    } catch (error) {
      if (!(error instanceof DiskApiError) || error.status !== 404) throw error;
    }

    const payload: TestPayload = {
      test: true,
      revision: revision + 1,
      message: `Файл изменён пользователем ${currentUser.login}`,
      updatedAt: new Date().toISOString(),
      updatedBy: {
        id: currentUser.id,
        login: currentUser.login,
        displayName: currentUser.display_name || currentUser.real_name || currentUser.login,
      },
      browser: navigator.userAgent,
    };

    await uploadTextFile(requireToken(), testFilePath, JSON.stringify(payload, null, 2), true);
    setFileContents(JSON.stringify(payload, null, 2));
    addLog('info', `Новая revision: ${payload.revision}`);
  });

  const deleteFile = () => runAction('Удаление тестового файла', async () => {
    if (!window.confirm(`Переместить ${TEST_FILENAME} в корзину Яндекс Диска?`)) return;
    await deleteDiskResource(requireToken(), testFilePath);
    setFileContents('');
  });

  const logout = () => {
    clearYandexSession();
    setToken(null);
    setUser(null);
    setFolderInfo(null);
    setFileContents('');
    addLog('info', 'Локальная OAuth-сессия удалена. Доступ приложения можно отдельно отозвать в Яндекс ID.');
  };

  return (
    <div className="prototype-shell">
      <header className="prototype-header">
        <div>
          <p className="prototype-eyebrow">Этап 1 · технический прототип</p>
          <h1>Проверка общей папки Яндекс Диска</h1>
          <p>
            Здесь используются только тестовые данные. Контакты и пароль шифрования пока не создаются.
          </p>
        </div>
        <a className="prototype-link" href="/">Открыть текущий справочник</a>
      </header>

      <main className="prototype-content">
        <section className="prototype-card auth-card">
          <div className="card-heading">
            <div>
              <p className="step-number">1</p>
              <h2>Авторизация</h2>
            </div>
            <span className={`status-pill ${token ? 'success' : 'neutral'}`}>
              {token ? 'Вход выполнен' : 'Нет сессии'}
            </span>
          </div>

          {user ? (
            <dl className="profile-grid">
              <div><dt>Пользователь</dt><dd>{user.display_name || user.real_name || user.login}</dd></div>
              <div><dt>Логин</dt><dd>{user.login}</dd></div>
              <div><dt>Email</dt><dd>{user.default_email || user.emails?.[0] || 'не передан'}</dd></div>
              <div><dt>ID</dt><dd>{user.id}</dd></div>
              <div><dt>Токен действует до</dt><dd>{formatDate(expiresAt)}</dd></div>
              <div><dt>Redirect URI</dt><dd>{getRedirectUri()}</dd></div>
            </dl>
          ) : (
            <p className="muted-text">
              Вход откроется на странице Яндекса. Приложение не получает пароль от аккаунта.
            </p>
          )}

          <div className="button-row">
            {!token ? (
              <button
                type="button"
                className="prototype-button primary"
                onClick={() => void beginYandexAuthorization().catch((error: unknown) => window.alert(describeError(error)))}
              >
                Войти через Яндекс
              </button>
            ) : (
              <button type="button" className="prototype-button secondary" onClick={logout}>
                Выйти на этом устройстве
              </button>
            )}
          </div>
        </section>

        <section className="prototype-card">
          <div className="card-heading">
            <div>
              <p className="step-number">2</p>
              <h2>Общая папка</h2>
            </div>
            <span className={`status-pill ${folderInfo ? 'success' : 'neutral'}`}>
              {folderInfo ? 'Папка найдена' : 'Не проверена'}
            </span>
          </div>

          <label className="prototype-field">
            <span>Название или путь папки</span>
            <input
              value={folderName}
              onChange={(event: ChangeEvent<HTMLInputElement>) => {
                setFolderName(event.target.value);
                setFolderInfo(null);
              }}
              placeholder={DEFAULT_FOLDER}
              disabled={isBusy}
            />
          </label>
          <p className="path-preview">Тестовый файл: {testFilePath}</p>

          <button
            type="button"
            className="prototype-button primary"
            onClick={() => void checkFolder()}
            disabled={!token || isBusy || !folderName.trim()}
          >
            Проверить доступ к папке
          </button>
        </section>

        <section className="prototype-card wide-card">
          <div className="card-heading">
            <div>
              <p className="step-number">3</p>
              <h2>Операции с тестовым файлом</h2>
            </div>
            {isBusy && <span className="status-pill working">Выполняется…</span>}
          </div>

          <div className="button-grid">
            <button type="button" className="prototype-button primary" onClick={() => void createFile()} disabled={!token || isBusy}>
              Создать файл
            </button>
            <button type="button" className="prototype-button secondary" onClick={() => void readFile()} disabled={!token || isBusy}>
              Прочитать файл
            </button>
            <button type="button" className="prototype-button secondary" onClick={() => void updateFile()} disabled={!token || isBusy}>
              Изменить файл
            </button>
            <button type="button" className="prototype-button danger" onClick={() => void deleteFile()} disabled={!token || isBusy}>
              Удалить файл
            </button>
          </div>

          <label className="prototype-field output-field">
            <span>Содержимое последней прочитанной или записанной версии</span>
            <textarea value={fileContents} readOnly placeholder="После чтения файла здесь появится тестовый JSON." />
          </label>
        </section>

        <section className="prototype-card wide-card">
          <div className="card-heading">
            <div>
              <p className="step-number">4</p>
              <h2>Журнал проверки</h2>
            </div>
            <button type="button" className="small-button" onClick={() => setLogs([])}>
              Очистить
            </button>
          </div>

          <div className="prototype-log" aria-live="polite">
            {logs.length === 0 ? (
              <p className="muted-text">Здесь появятся результаты операций и коды ошибок.</p>
            ) : (
              logs.map((entry) => (
                <p key={entry.id} className={`log-entry ${entry.kind}`}>
                  <time>{entry.time}</time>
                  <span>{entry.message}</span>
                </p>
              ))
            )}
          </div>
        </section>

        <section className="prototype-card warning-card wide-card">
          <h2>Как проверить два аккаунта</h2>
          <ol>
            <li>Войдите владельцем папки, проверьте папку и создайте файл.</li>
            <li>Нажмите «Выйти на этом устройстве» и войдите вторым Яндекс-аккаунтом.</li>
            <li>Прочитайте файл, затем нажмите «Изменить файл».</li>
            <li>Снова войдите владельцем и проверьте, что видна новая revision и логин второго аккаунта.</li>
          </ol>
          <p>
            Токен хранится только в <code>sessionStorage</code> текущей вкладки и удаляется при явном выходе.
            Для настоящего приложения схему хранения и обновления токенов проработаем отдельно.
          </p>
        </section>
      </main>
    </div>
  );
}
