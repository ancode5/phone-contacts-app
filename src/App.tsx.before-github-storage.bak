import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import {
  FaBook,
  FaCloud,
  FaCog,
  FaFileExcel,
  FaPlus,
  FaSignOutAlt,
  FaTrash,
} from 'react-icons/fa';
import {
  beginYandexAuthorization,
  clearYandexSession,
  getAccessToken,
  loadYandexUser,
} from './auth/yandexOAuth';
import type { YandexUserInfo } from './auth/yandexOAuth';
import { AuthCallback } from './components/AuthCallback';
import { CatalogModal } from './components/CatalogModal';
import { ContactForm } from './components/ContactForm';
import { ContactList } from './components/ContactList';
import { SearchBar } from './components/SearchBar';
import { YandexDiskPrototype } from './components/YandexDiskPrototype';
import { db } from './db/database';
import { exportContactsToExcel } from './services/excelExport';
import {
  cloudDatabaseExists,
  initializeCloudDatabase,
  syncWithCloud,
} from './services/cloudSync';
import type {
  Contact,
  ContactInput,
  ContactSort,
  Group,
  Organization,
  SyncMetadata,
} from './types';
import './App.css';

type SyncStatus = 'idle' | 'pending' | 'syncing' | 'synced' | 'offline' | 'error';

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function formatSyncTime(value: number | null): string {
  if (!value) return 'ещё не выполнялась';
  return new Intl.DateTimeFormat('ru-RU', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(value);
}

function LoginGate({ errorMessage }: { errorMessage: string }) {
  return (
    <main className="gate-page">
      <section className="gate-card">
        <div className="gate-icon"><FaBook aria-hidden="true" /></div>
        <p className="eyebrow">Единая рабочая база</p>
        <h1>Справочник контактов</h1>
        <p>
          Войдите через разрешённый Яндекс-аккаунт. Приложение работает только с общей папкой
          «Справочник контактов».
        </p>
        {errorMessage && <p className="form-error">{errorMessage}</p>}
        <button
          type="button"
          className="primary-button gate-action"
          onClick={() => void beginYandexAuthorization('/')}
        >
          Войти через Яндекс
        </button>
        <p className="gate-note">Контакты не хранятся в GitHub и не встроены в страницу приложения.</p>
      </section>
    </main>
  );
}

interface VaultGateProps {
  cloudExists: boolean;
  isBusy: boolean;
  errorMessage: string;
  onSetup: (password: string) => Promise<void>;
  onUnlock: (password: string) => Promise<void>;
  onLogout: () => void;
}

function VaultGate({
  cloudExists,
  isBusy,
  errorMessage,
  onSetup,
  onUnlock,
  onLogout,
}: VaultGateProps) {
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [localError, setLocalError] = useState('');

  const submit = async () => {
    if (password.length < 10) {
      setLocalError('Используйте пароль длиной не менее 10 символов.');
      return;
    }
    if (!cloudExists && password !== confirmation) {
      setLocalError('Пароли не совпадают.');
      return;
    }

    setLocalError('');
    if (cloudExists) await onUnlock(password);
    else await onSetup(password);
  };

  return (
    <main className="gate-page">
      <section className="gate-card">
        <div className="gate-icon"><FaCloud aria-hidden="true" /></div>
        <p className="eyebrow">Зашифрованная база</p>
        <h1>{cloudExists ? 'Открыть справочник' : 'Создать облачную базу'}</h1>
        <p>
          {cloudExists
            ? 'Введите общий пароль справочника. Он не отправляется Яндексу и не хранится в GitHub.'
            : 'Придумайте общий пароль и передайте его участникам отдельно. Потерянный пароль восстановить невозможно.'}
        </p>
        <label className="gate-field">
          Пароль справочника
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event: ChangeEvent<HTMLInputElement>) => setPassword(event.target.value)}
          />
        </label>
        {!cloudExists && (
          <label className="gate-field">
            Повторите пароль
            <input
              type="password"
              autoComplete="new-password"
              value={confirmation}
              onChange={(event: ChangeEvent<HTMLInputElement>) => setConfirmation(event.target.value)}
            />
          </label>
        )}
        {(localError || errorMessage) && <p className="form-error">{localError || errorMessage}</p>}
        <button type="button" className="primary-button gate-action" onClick={() => void submit()} disabled={isBusy}>
          {isBusy ? 'Подготовка базы…' : cloudExists ? 'Открыть и синхронизировать' : 'Создать базу'}
        </button>
        <button type="button" className="text-button" onClick={onLogout} disabled={isBusy}>
          Выйти из Яндекс-аккаунта
        </button>
      </section>
    </main>
  );
}

interface ContactsAppProps {
  token: string;
  user: YandexUserInfo;
  password: string;
  onLogout: () => Promise<void>;
}

function ContactsApp({ token, user, password, onLogout }: ContactsAppProps) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [trashContacts, setTrashContacts] = useState<Contact[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [metadata, setMetadata] = useState<SyncMetadata>({
    key: 'state',
    lastSyncAt: null,
    cloudRevision: 0,
    lastSyncBy: '',
  });
  const [pendingCount, setPendingCount] = useState(0);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const [syncMessage, setSyncMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact>();
  const [showCatalogs, setShowCatalogs] = useState(false);
  const [showTrash, setShowTrash] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showFavorites, setShowFavorites] = useState(false);
  const [organizationFilter, setOrganizationFilter] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [groupFilter, setGroupFilter] = useState('');
  const [sort, setSort] = useState<ContactSort>('name');
  const syncInProgress = useRef(false);

  const loadLocalData = useCallback(async () => {
    await db.ensureSeedData();
    const [nextContacts, nextTrash, nextOrganizations, nextGroups, nextMetadata, nextPending] =
      await Promise.all([
        db.getAllContacts(),
        db.getTrashContacts(),
        db.getOrganizations(),
        db.getGroups(),
        db.getSyncMetadata(),
        db.getPendingCount(),
      ]);

    setContacts(nextContacts);
    setTrashContacts(nextTrash);
    setOrganizations(nextOrganizations);
    setGroups(nextGroups);
    setMetadata(nextMetadata);
    setPendingCount(nextPending);
  }, []);

  const syncNow = useCallback(async (silent = false) => {
    if (syncInProgress.current) return;
    if (!navigator.onLine) {
      setSyncStatus('offline');
      setSyncMessage('Нет интернета. Изменения сохранены на устройстве.');
      return;
    }

    syncInProgress.current = true;
    setSyncStatus('syncing');
    if (!silent) setSyncMessage('Синхронизация с Яндекс Диском…');

    try {
      await syncWithCloud(token, password, user);
      await loadLocalData();
      setSyncStatus('synced');
      setSyncMessage('');
    } catch (error) {
      setSyncStatus('error');
      setSyncMessage(describeError(error));
    } finally {
      syncInProgress.current = false;
    }
  }, [loadLocalData, password, token, user]);

  useEffect(() => {
    // Вход/разблокировка уже выполнили синхронизацию. Здесь достаточно мгновенно
    // показать локальную Dexie-копию, не запуская второй одинаковый запрос.
    void loadLocalData().finally(() => setIsLoading(false));
  }, [loadLocalData]);

  useEffect(() => {
    const handleOnline = () => void syncNow(true);
    const handleOffline = () => {
      setSyncStatus('offline');
      setSyncMessage('Нет интернета. Работа продолжается с локальной копией.');
    };
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') void syncNow(true);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    document.addEventListener('visibilitychange', handleVisibility);
    const timer = window.setInterval(() => void syncNow(true), 45_000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.clearInterval(timer);
    };
  }, [syncNow]);

  const afterMutation = async () => {
    await loadLocalData();
    setSyncStatus(navigator.onLine ? 'pending' : 'offline');
    setSyncMessage(
      navigator.onLine
        ? 'Изменение сохранено локально и отправляется на Диск.'
        : 'Изменение сохранено локально и ожидает интернет.',
    );
    // Сохранение интерфейса не ждёт сеть: синхронизация продолжается в фоне.
    void syncNow(true);
  };

  const visibleContacts = useMemo(() => {
    const source = showTrash ? trashContacts : contacts;
    const query = searchQuery.trim().toLocaleLowerCase('ru');
    const departmentQuery = departmentFilter.trim().toLocaleLowerCase('ru');
    const organizationsById = new Map(organizations.map((item) => [item.id, item.name]));
    const groupsById = new Map(groups.map((item) => [item.id, item.name]));

    const filtered = source.filter((contact) => {
      if (showTrash) return true;
      if (showFavorites && !contact.isFavorite) return false;
      if (organizationFilter && contact.organizationId !== organizationFilter) return false;
      if (groupFilter && !contact.groupIds.includes(groupFilter)) return false;
      if (departmentQuery && !contact.department.toLocaleLowerCase('ru').includes(departmentQuery)) {
        return false;
      }
      if (!query) return true;

      const values = [
        contact.fullName,
        contact.workPhone,
        contact.personalPhone,
        contact.workEmail,
        contact.personalEmail,
        organizationsById.get(contact.organizationId) ?? '',
        contact.department,
        contact.position,
        contact.notes,
        ...contact.groupIds.map((id) => groupsById.get(id) ?? ''),
      ];
      return values.some((value) => value.toLocaleLowerCase('ru').includes(query));
    });

    return filtered.sort((left, right) => {
      if (sort === 'newest') return right.createdAt - left.createdAt;
      if (sort === 'oldest') return left.createdAt - right.createdAt;
      return left.fullName.localeCompare(right.fullName, 'ru', { sensitivity: 'base' });
    });
  }, [
    contacts,
    departmentFilter,
    groupFilter,
    groups,
    organizationFilter,
    organizations,
    searchQuery,
    showFavorites,
    showTrash,
    sort,
    trashContacts,
  ]);

  const closeForm = () => {
    setShowForm(false);
    setEditingContact(undefined);
  };

  const saveContact = async (data: ContactInput) => {
    if (editingContact) await db.updateContact(editingContact.id, data);
    else await db.addContact(data);
    closeForm();
    await afterMutation();
  };

  const exportExcel = () => {
    exportContactsToExcel(contacts, organizations, groups);
  };

  const showSyncNotice =
    syncStatus === 'offline' || syncStatus === 'error' || syncStatus === 'pending';

  const footerStatus =
    syncStatus === 'syncing'
      ? 'Данные обновляются'
      : syncStatus === 'offline'
        ? 'Офлайн-режим'
        : syncStatus === 'error'
          ? 'Есть ошибка обмена данными'
          : pendingCount > 0
            ? `${pendingCount} изменений ожидают отправки`
            : 'Данные актуальны';

  return (
    <div className="app-shell">
      <header className="app-header cloud-header">
        <h1>Справочник контактов</h1>
        <nav className="header-actions" aria-label="Основные действия">
          <button type="button" className="header-button" onClick={() => setShowCatalogs(true)}>
            <FaCog aria-hidden="true" />
            Справочники
          </button>
          <button type="button" className="header-button" onClick={exportExcel}>
            <FaFileExcel aria-hidden="true" />
            Выгрузить в Excel
          </button>
          <button type="button" className="header-button" onClick={() => void onLogout()}>
            <FaSignOutAlt aria-hidden="true" />
            Выйти
          </button>
        </nav>
      </header>

      {showSyncNotice && (
        <div className={`sync-strip ${syncStatus}`}>
          <span>{syncMessage || 'Локальные изменения будут отправлены автоматически.'}</span>
        </div>
      )}

      <main className="main-content">
        <section className="toolbar" aria-label="Управление контактами">
          {!showTrash && (
            <SearchBar
              searchQuery={searchQuery}
              showFavorites={showFavorites}
              organizationId={organizationFilter}
              department={departmentFilter}
              groupId={groupFilter}
              sort={sort}
              organizations={organizations}
              groups={groups}
              onSearchChange={setSearchQuery}
              onToggleFavorites={() => setShowFavorites((current) => !current)}
              onOrganizationChange={setOrganizationFilter}
              onDepartmentChange={setDepartmentFilter}
              onGroupChange={setGroupFilter}
              onSortChange={setSort}
              onClear={() => {
                setSearchQuery('');
                setShowFavorites(false);
                setOrganizationFilter('');
                setDepartmentFilter('');
                setGroupFilter('');
                setSort('name');
              }}
            />
          )}

          <div className="toolbar-footer">
            <p>
              {showTrash ? 'В корзине' : 'Показано'}: <strong>{visibleContacts.length}</strong>
            </p>
            <div className="toolbar-buttons">
              <button type="button" className="secondary-button" onClick={() => setShowTrash((current) => !current)}>
                <FaTrash aria-hidden="true" />
                {showTrash ? 'Вернуться к контактам' : `Корзина (${trashContacts.length})`}
              </button>
              {!showTrash && (
                <button
                  type="button"
                  className="primary-button add-contact-button"
                  onClick={() => {
                    setEditingContact(undefined);
                    setShowForm(true);
                  }}
                >
                  <FaPlus aria-hidden="true" />
                  Добавить контакт
                </button>
              )}
            </div>
          </div>
        </section>

        <ContactList
          contacts={visibleContacts}
          organizations={organizations}
          groups={groups}
          isLoading={isLoading}
          isTrashView={showTrash}
          onEdit={(contact) => {
            setEditingContact(contact);
            setShowForm(true);
          }}
          onDelete={(id) => {
            void (async () => {
              if (showTrash) {
                if (!window.confirm('Скрыть контакт из корзины? Он останется технической записью для синхронизации удаления.')) return;
                await db.hideContactFromTrash(id);
              } else {
                if (!window.confirm('Переместить контакт в корзину на 90 дней?')) return;
                await db.softDeleteContact(id);
              }
              await afterMutation();
            })();
          }}
          onRestore={(id) => void db.restoreContact(id).then(afterMutation)}
          onToggleFavorite={(id) => {
            void (async () => {
              const contact = await db.contacts.get(id);
              if (!contact) return;
              await db.updateContact(id, { isFavorite: !contact.isFavorite });
              await afterMutation();
            })();
          }}
        />
      </main>

      {showForm && (
        <ContactForm
          contact={editingContact}
          organizations={organizations}
          groups={groups}
          onSave={saveContact}
          onCancel={closeForm}
        />
      )}

      {showCatalogs && (
        <CatalogModal
          organizations={organizations}
          groups={groups}
          onAddOrganization={async (name) => { await db.addOrganization(name); await afterMutation(); }}
          onRenameOrganization={async (id, name) => { await db.updateOrganization(id, name); await afterMutation(); }}
          onDeleteOrganization={async (id) => { await db.deleteOrganization(id); await afterMutation(); }}
          onAddGroup={async (name, color) => { await db.addGroup(name, color); await afterMutation(); }}
          onRenameGroup={async (id, name, color) => { await db.updateGroup(id, { name, color }); await afterMutation(); }}
          onDeleteGroup={async (id) => { await db.deleteGroup(id); await afterMutation(); }}
          onClose={() => setShowCatalogs(false)}
        />
      )}

      <footer className="app-footer">
        <span>{footerStatus}</span>
        <span>Последнее обновление: {formatSyncTime(metadata.lastSyncAt)}</span>
        <span>Ревизия {metadata.cloudRevision}</span>
        <span>{user.display_name || user.real_name || user.login}</span>
      </footer>
    </div>
  );
}

function CloudApp() {
  const [token, setToken] = useState<string | null>(() => getAccessToken());
  const [user, setUser] = useState<YandexUserInfo | null>(null);
  const [cloudExists, setCloudExists] = useState<boolean | null>(null);
  const [password, setPassword] = useState('');
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (!token) return;
    setIsBusy(true);
    setErrorMessage('');

    void loadYandexUser(token)
      .then(async (profile) => {
        setUser(profile);
        setCloudExists(await cloudDatabaseExists(token));
      })
      .catch((error: unknown) => {
        setErrorMessage(describeError(error));
        clearYandexSession();
        setToken(null);
      })
      .finally(() => setIsBusy(false));
  }, [token]);

  const logoutWithoutData = () => {
    clearYandexSession();
    setToken(null);
    setUser(null);
    setPassword('');
    setIsUnlocked(false);
    setCloudExists(null);
  };

  const logout = async () => {
    if (!window.confirm('Выйти и удалить локальную копию контактов с этого устройства? Облачная база останется на Яндекс Диске.')) return;
    await db.clearAllLocalData();
    logoutWithoutData();
  };

  if (!token) return <LoginGate errorMessage={errorMessage} />;
  if (isBusy || !user || cloudExists === null) {
    return (
      <main className="gate-page">
        <section className="gate-card"><h1>Подключаем Яндекс Диск…</h1><p>Проверяем общую папку и состояние базы.</p></section>
      </main>
    );
  }

  if (!isUnlocked) {
    return (
      <VaultGate
        cloudExists={cloudExists}
        isBusy={isBusy}
        errorMessage={errorMessage}
        onSetup={async (nextPassword) => {
          setIsBusy(true);
          setErrorMessage('');
          try {
            await initializeCloudDatabase(token, nextPassword, user);
            setPassword(nextPassword);
            setCloudExists(true);
            setIsUnlocked(true);
          } catch (error) {
            setErrorMessage(describeError(error));
          } finally {
            setIsBusy(false);
          }
        }}
        onUnlock={async (nextPassword) => {
          setIsBusy(true);
          setErrorMessage('');
          try {
            await syncWithCloud(token, nextPassword, user);
            setPassword(nextPassword);
            setIsUnlocked(true);
          } catch (error) {
            setErrorMessage(describeError(error));
          } finally {
            setIsBusy(false);
          }
        }}
        onLogout={logoutWithoutData}
      />
    );
  }

  return <ContactsApp token={token} user={user} password={password} onLogout={logout} />;
}

function getAppRelativePath(): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  const pathname = window.location.pathname;

  if (base && pathname.startsWith(base)) {
    return pathname.slice(base.length) || '/';
  }

  return pathname || '/';
}

function App() {
  const path = getAppRelativePath();
  const search = new URLSearchParams(window.location.search);
  const isOAuthResponse = search.has('code') || search.has('error');

  // На GitHub Pages Яндекс возвращает пользователя на корень приложения с
  // query-параметрами. Локально по-прежнему поддерживается /auth/callback.
  if (path === '/auth/callback' || isOAuthResponse) return <AuthCallback />;
  if (path === '/oauth-test') return <YandexDiskPrototype />;
  return <CloudApp />;
}

export default App;
