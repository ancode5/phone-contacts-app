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
import { GitHubStorageGate } from './components/GitHubStorageGate';
import { db } from './db/database';
import { exportContactsToExcel } from './services/excelExport';
import { clearGitHubStorageConfig, getGitHubStorageConfig } from './services/githubStorage';
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
  if (!value) return 'РµС‰С‘ РЅРµ РІС‹РїРѕР»РЅСЏР»Р°СЃСЊ';
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
        <p className="eyebrow">Р•РґРёРЅР°СЏ СЂР°Р±РѕС‡Р°СЏ Р±Р°Р·Р°</p>
        <h1>РЎРїСЂР°РІРѕС‡РЅРёРє РєРѕРЅС‚Р°РєС‚РѕРІ</h1>
        <p>
          Р’РѕР№РґРёС‚Рµ С‡РµСЂРµР· СЂР°Р·СЂРµС€С‘РЅРЅС‹Р№ РЇРЅРґРµРєСЃ-Р°РєРєР°СѓРЅС‚. РџСЂРёР»РѕР¶РµРЅРёРµ РёСЃРїРѕР»СЊР·СѓРµС‚ РЇРЅРґРµРєСЃ ID РґР»СЏ РІС…РѕРґР° Рё РїСЂРёРІР°С‚РЅС‹Р№ СЂРµРїРѕР·РёС‚РѕСЂРёР№ GitHub
          РґР»СЏ Р·Р°С€РёС„СЂРѕРІР°РЅРЅРѕР№ Р±Р°Р·С‹.
        </p>
        {errorMessage && <p className="form-error">{errorMessage}</p>}
        <button
          type="button"
          className="primary-button gate-action"
          onClick={() => void beginYandexAuthorization('/')}
        >
          Р’РѕР№С‚Рё С‡РµСЂРµР· РЇРЅРґРµРєСЃ
        </button>
        <p className="gate-note">Р’ GitHub С…СЂР°РЅРёС‚СЃСЏ С‚РѕР»СЊРєРѕ Р·Р°С€РёС„СЂРѕРІР°РЅРЅС‹Р№ С„Р°Р№Р» Р±Р°Р·С‹; РїР°СЂРѕР»СЊ РІ GitHub РЅРµ РїРµСЂРµРґР°С‘С‚СЃСЏ.</p>
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
      setLocalError('РСЃРїРѕР»СЊР·СѓР№С‚Рµ РїР°СЂРѕР»СЊ РґР»РёРЅРѕР№ РЅРµ РјРµРЅРµРµ 10 СЃРёРјРІРѕР»РѕРІ.');
      return;
    }
    if (!cloudExists && password !== confirmation) {
      setLocalError('РџР°СЂРѕР»Рё РЅРµ СЃРѕРІРїР°РґР°СЋС‚.');
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
        <p className="eyebrow">Р—Р°С€РёС„СЂРѕРІР°РЅРЅР°СЏ Р±Р°Р·Р°</p>
        <h1>{cloudExists ? 'РћС‚РєСЂС‹С‚СЊ СЃРїСЂР°РІРѕС‡РЅРёРє' : 'РЎРѕР·РґР°С‚СЊ РѕР±Р»Р°С‡РЅСѓСЋ Р±Р°Р·Сѓ'}</h1>
        <p>
          {cloudExists
            ? 'Р’РІРµРґРёС‚Рµ РѕР±С‰РёР№ РїР°СЂРѕР»СЊ СЃРїСЂР°РІРѕС‡РЅРёРєР°. РћРЅ РЅРµ РѕС‚РїСЂР°РІР»СЏРµС‚СЃСЏ РЇРЅРґРµРєСЃСѓ РёР»Рё GitHub Рё РЅРµ СЃРѕС…СЂР°РЅСЏРµС‚СЃСЏ РІ РєРѕРґРµ.'
            : 'РџСЂРёРґСѓРјР°Р№С‚Рµ РѕР±С‰РёР№ РїР°СЂРѕР»СЊ Рё РїРµСЂРµРґР°Р№С‚Рµ РµРіРѕ СѓС‡Р°СЃС‚РЅРёРєР°Рј РѕС‚РґРµР»СЊРЅРѕ. РџРѕС‚РµСЂСЏРЅРЅС‹Р№ РїР°СЂРѕР»СЊ РІРѕСЃСЃС‚Р°РЅРѕРІРёС‚СЊ РЅРµРІРѕР·РјРѕР¶РЅРѕ.'}
        </p>
        <label className="gate-field">
          РџР°СЂРѕР»СЊ СЃРїСЂР°РІРѕС‡РЅРёРєР°
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event: ChangeEvent<HTMLInputElement>) => setPassword(event.target.value)}
          />
        </label>
        {!cloudExists && (
          <label className="gate-field">
            РџРѕРІС‚РѕСЂРёС‚Рµ РїР°СЂРѕР»СЊ
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
          {isBusy ? 'РџРѕРґРіРѕС‚РѕРІРєР° Р±Р°Р·С‹вЂ¦' : cloudExists ? 'РћС‚РєСЂС‹С‚СЊ Рё СЃРёРЅС…СЂРѕРЅРёР·РёСЂРѕРІР°С‚СЊ' : 'РЎРѕР·РґР°С‚СЊ Р±Р°Р·Сѓ'}
        </button>
        <button type="button" className="text-button" onClick={onLogout} disabled={isBusy}>
          Р’С‹Р№С‚Рё РёР· РЇРЅРґРµРєСЃ-Р°РєРєР°СѓРЅС‚Р°
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
      setSyncMessage('РќРµС‚ РёРЅС‚РµСЂРЅРµС‚Р°. РР·РјРµРЅРµРЅРёСЏ СЃРѕС…СЂР°РЅРµРЅС‹ РЅР° СѓСЃС‚СЂРѕР№СЃС‚РІРµ.');
      return;
    }

    syncInProgress.current = true;
    setSyncStatus('syncing');
    if (!silent) setSyncMessage('РЎРёРЅС…СЂРѕРЅРёР·Р°С†РёСЏ СЃ РїСЂРёРІР°С‚РЅС‹Рј СЂРµРїРѕР·РёС‚РѕСЂРёРµРјвЂ¦');

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
    // Р’С…РѕРґ/СЂР°Р·Р±Р»РѕРєРёСЂРѕРІРєР° СѓР¶Рµ РІС‹РїРѕР»РЅРёР»Рё СЃРёРЅС…СЂРѕРЅРёР·Р°С†РёСЋ. Р—РґРµСЃСЊ РґРѕСЃС‚Р°С‚РѕС‡РЅРѕ РјРіРЅРѕРІРµРЅРЅРѕ
    // РїРѕРєР°Р·Р°С‚СЊ Р»РѕРєР°Р»СЊРЅСѓСЋ Dexie-РєРѕРїРёСЋ, РЅРµ Р·Р°РїСѓСЃРєР°СЏ РІС‚РѕСЂРѕР№ РѕРґРёРЅР°РєРѕРІС‹Р№ Р·Р°РїСЂРѕСЃ.
    void loadLocalData().finally(() => setIsLoading(false));
  }, [loadLocalData]);

  useEffect(() => {
    const handleOnline = () => void syncNow(true);
    const handleOffline = () => {
      setSyncStatus('offline');
      setSyncMessage('РќРµС‚ РёРЅС‚РµСЂРЅРµС‚Р°. Р Р°Р±РѕС‚Р° РїСЂРѕРґРѕР»Р¶Р°РµС‚СЃСЏ СЃ Р»РѕРєР°Р»СЊРЅРѕР№ РєРѕРїРёРµР№.');
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
        ? 'РР·РјРµРЅРµРЅРёРµ СЃРѕС…СЂР°РЅРµРЅРѕ Р»РѕРєР°Р»СЊРЅРѕ Рё РѕС‚РїСЂР°РІР»СЏРµС‚СЃСЏ РІ РѕР±Р»Р°С‡РЅРѕРµ С…СЂР°РЅРёР»РёС‰Рµ.'
        : 'РР·РјРµРЅРµРЅРёРµ СЃРѕС…СЂР°РЅРµРЅРѕ Р»РѕРєР°Р»СЊРЅРѕ Рё РѕР¶РёРґР°РµС‚ РёРЅС‚РµСЂРЅРµС‚.',
    );
    // РЎРѕС…СЂР°РЅРµРЅРёРµ РёРЅС‚РµСЂС„РµР№СЃР° РЅРµ Р¶РґС‘С‚ СЃРµС‚СЊ: СЃРёРЅС…СЂРѕРЅРёР·Р°С†РёСЏ РїСЂРѕРґРѕР»Р¶Р°РµС‚СЃСЏ РІ С„РѕРЅРµ.
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
      ? 'Р”Р°РЅРЅС‹Рµ РѕР±РЅРѕРІР»СЏСЋС‚СЃСЏ'
      : syncStatus === 'offline'
        ? 'РћС„Р»Р°Р№РЅ-СЂРµР¶РёРј'
        : syncStatus === 'error'
          ? 'Р•СЃС‚СЊ РѕС€РёР±РєР° РѕР±РјРµРЅР° РґР°РЅРЅС‹РјРё'
          : pendingCount > 0
            ? `${pendingCount} РёР·РјРµРЅРµРЅРёР№ РѕР¶РёРґР°СЋС‚ РѕС‚РїСЂР°РІРєРё`
            : 'Р”Р°РЅРЅС‹Рµ Р°РєС‚СѓР°Р»СЊРЅС‹';

  return (
    <div className="app-shell">
      <header className="app-header cloud-header">
        <h1>РЎРїСЂР°РІРѕС‡РЅРёРє РєРѕРЅС‚Р°РєС‚РѕРІ</h1>
        <nav className="header-actions" aria-label="РћСЃРЅРѕРІРЅС‹Рµ РґРµР№СЃС‚РІРёСЏ">
          <button type="button" className="header-button" onClick={() => setShowCatalogs(true)}>
            <FaCog aria-hidden="true" />
            РЎРїСЂР°РІРѕС‡РЅРёРєРё
          </button>
          <button type="button" className="header-button" onClick={exportExcel}>
            <FaFileExcel aria-hidden="true" />
            Р’С‹РіСЂСѓР·РёС‚СЊ РІ Excel
          </button>
          <button type="button" className="header-button" onClick={() => void onLogout()}>
            <FaSignOutAlt aria-hidden="true" />
            Р’С‹Р№С‚Рё
          </button>
        </nav>
      </header>

      {showSyncNotice && (
        <div className={`sync-strip ${syncStatus}`}>
          <span>{syncMessage || 'Р›РѕРєР°Р»СЊРЅС‹Рµ РёР·РјРµРЅРµРЅРёСЏ Р±СѓРґСѓС‚ РѕС‚РїСЂР°РІР»РµРЅС‹ Р°РІС‚РѕРјР°С‚РёС‡РµСЃРєРё.'}</span>
        </div>
      )}

      <main className="main-content">
        <section className="toolbar" aria-label="РЈРїСЂР°РІР»РµРЅРёРµ РєРѕРЅС‚Р°РєС‚Р°РјРё">
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
              {showTrash ? 'Р’ РєРѕСЂР·РёРЅРµ' : 'РџРѕРєР°Р·Р°РЅРѕ'}: <strong>{visibleContacts.length}</strong>
            </p>
            <div className="toolbar-buttons">
              <button type="button" className="secondary-button" onClick={() => setShowTrash((current) => !current)}>
                <FaTrash aria-hidden="true" />
                {showTrash ? 'Р’РµСЂРЅСѓС‚СЊСЃСЏ Рє РєРѕРЅС‚Р°РєС‚Р°Рј' : `РљРѕСЂР·РёРЅР° (${trashContacts.length})`}
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
                  Р”РѕР±Р°РІРёС‚СЊ РєРѕРЅС‚Р°РєС‚
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
                if (!window.confirm('РЎРєСЂС‹С‚СЊ РєРѕРЅС‚Р°РєС‚ РёР· РєРѕСЂР·РёРЅС‹? РћРЅ РѕСЃС‚Р°РЅРµС‚СЃСЏ С‚РµС…РЅРёС‡РµСЃРєРѕР№ Р·Р°РїРёСЃСЊСЋ РґР»СЏ СЃРёРЅС…СЂРѕРЅРёР·Р°С†РёРё СѓРґР°Р»РµРЅРёСЏ.')) return;
                await db.hideContactFromTrash(id);
              } else {
                if (!window.confirm('РџРµСЂРµРјРµСЃС‚РёС‚СЊ РєРѕРЅС‚Р°РєС‚ РІ РєРѕСЂР·РёРЅСѓ РЅР° 90 РґРЅРµР№?')) return;
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
        <span>РџРѕСЃР»РµРґРЅРµРµ РѕР±РЅРѕРІР»РµРЅРёРµ: {formatSyncTime(metadata.lastSyncAt)}</span>
        <span>Р РµРІРёР·РёСЏ {metadata.cloudRevision}</span>
        <span>{user.display_name || user.real_name || user.login}</span>
      </footer>
    </div>
  );
}

function CloudApp() {
  const [storageConfig, setStorageConfig] = useState(() => getGitHubStorageConfig());
  const [token, setToken] = useState<string | null>(() => getAccessToken());
  const [user, setUser] = useState<YandexUserInfo | null>(null);
  const [cloudExists, setCloudExists] = useState<boolean | null>(null);
  const [password, setPassword] = useState('');
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (!token || !storageConfig) return;
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
  }, [storageConfig, token]);

  const logoutWithoutData = () => {
    clearYandexSession();
    clearGitHubStorageConfig();
    setStorageConfig(null);
    setToken(null);
    setUser(null);
    setPassword('');
    setIsUnlocked(false);
    setCloudExists(null);
  };

  const logout = async () => {
    if (!window.confirm('Р’С‹Р№С‚Рё Рё СѓРґР°Р»РёС‚СЊ Р»РѕРєР°Р»СЊРЅСѓСЋ РєРѕРїРёСЋ РєРѕРЅС‚Р°РєС‚РѕРІ СЃ СЌС‚РѕРіРѕ СѓСЃС‚СЂРѕР№СЃС‚РІР°? РћР±Р»Р°С‡РЅР°СЏ Р±Р°Р·Р° РѕСЃС‚Р°РЅРµС‚СЃСЏ РІ РїСЂРёРІР°С‚РЅРѕРј СЂРµРїРѕР·РёС‚РѕСЂРёРё GitHub.')) return;
    await db.clearAllLocalData();
    logoutWithoutData();
  };

  if (!token) return <LoginGate errorMessage={errorMessage} />;

  if (!storageConfig) {
    return (
      <GitHubStorageGate
        onConnected={(config) => {
          setStorageConfig(config);
          setCloudExists(null);
          setErrorMessage('');
        }}
        onBack={logoutWithoutData}
      />
    );
  }

  if (isBusy || !user || cloudExists === null) {
    return (
      <main className="gate-page">
        <section className="gate-card"><h1>РџРѕРґРєР»СЋС‡Р°РµРј С…СЂР°РЅРёР»РёС‰РµвЂ¦</h1><p>РџСЂРѕРІРµСЂСЏРµРј РїСЂРёРІР°С‚РЅС‹Р№ СЂРµРїРѕР·РёС‚РѕСЂРёР№ Рё СЃРѕСЃС‚РѕСЏРЅРёРµ Р±Р°Р·С‹.</p></section>
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

  // РќР° GitHub Pages РЇРЅРґРµРєСЃ РІРѕР·РІСЂР°С‰Р°РµС‚ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ РЅР° РєРѕСЂРµРЅСЊ РїСЂРёР»РѕР¶РµРЅРёСЏ СЃ
  // query-РїР°СЂР°РјРµС‚СЂР°РјРё. Р›РѕРєР°Р»СЊРЅРѕ РїРѕ-РїСЂРµР¶РЅРµРјСѓ РїРѕРґРґРµСЂР¶РёРІР°РµС‚СЃСЏ /auth/callback.
  if (path === '/auth/callback' || isOAuthResponse) return <AuthCallback />;
  return <CloudApp />;
}

export default App;
