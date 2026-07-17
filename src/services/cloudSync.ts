import { db } from '../db/database';
import type { YandexUserInfo } from '../auth/yandexOAuth';
import type { CloudActor, CloudDatabase, Contact, Group, Organization } from '../types';
import { decryptJson, encryptJson } from './cryptoVault';
import {
  createDiskFolder,
  deleteDiskResource,
  diskResourceExists,
  DiskApiError,
  downloadTextFile,
  joinDiskPath,
  uploadTextFile,
} from './yandexDisk';

const DEFAULT_FOLDER = 'Справочник контактов';
const DATABASE_FILENAME = 'contacts-database.enc';
const LOCK_FILENAME = 'sync-lock.json';
const BACKUPS_FOLDER = 'backups';
const LOCK_TTL_MS = 25_000;
const LOCK_RETRY_DELAYS_MS = [1_200, 1_800, 2_500];

export interface SyncResult {
  revision: number;
  syncedAt: number;
  updatedBy: string;
  contactsCount: number;
}

interface SyncLock {
  lockId?: string;
  deviceId: string;
  userLogin: string;
  createdAt: number;
  expiresAt: number;
}

const getFolderName = (): string =>
  import.meta.env.VITE_YANDEX_DISK_FOLDER?.trim() || DEFAULT_FOLDER;

const getDatabasePath = (): string => joinDiskPath(getFolderName(), DATABASE_FILENAME);
const getLockPath = (): string => joinDiskPath(getFolderName(), LOCK_FILENAME);
const getBackupsPath = (): string => joinDiskPath(getFolderName(), BACKUPS_FOLDER);

let foldersReadyForToken = '';

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function getDeviceId(): string {
  const key = 'contacts_sync_device_id';
  const existing = localStorage.getItem(key);
  if (existing) return existing;
  const value = crypto.randomUUID();
  localStorage.setItem(key, value);
  return value;
}

function actorFromUser(user: YandexUserInfo): CloudActor {
  return {
    id: user.id,
    login: user.login,
    displayName: user.display_name || user.real_name || user.login,
  };
}

function pickLatest<T extends { id: string; updatedAt: number }>(left: T, right: T): T {
  if (left.updatedAt !== right.updatedAt) return left.updatedAt > right.updatedAt ? left : right;

  const leftVersion = 'version' in left && typeof left.version === 'number' ? left.version : 0;
  const rightVersion = 'version' in right && typeof right.version === 'number' ? right.version : 0;
  if (leftVersion !== rightVersion) return leftVersion > rightVersion ? left : right;

  return JSON.stringify(left).localeCompare(JSON.stringify(right)) >= 0 ? left : right;
}

function mergeEntities<T extends { id: string; updatedAt: number }>(local: T[], cloud: T[]): T[] {
  const result = new Map<string, T>();
  for (const item of cloud) result.set(item.id, item);
  for (const item of local) {
    const current = result.get(item.id);
    result.set(item.id, current ? pickLatest(item, current) : item);
  }
  return [...result.values()];
}

function entitiesEqual<T extends { id: string }>(left: T[], right: T[]): boolean {
  if (left.length !== right.length) return false;
  const normalize = (items: T[]) => [...items].sort((a, b) => a.id.localeCompare(b.id));
  return JSON.stringify(normalize(left)) === JSON.stringify(normalize(right));
}

function validateCloudDatabase(value: CloudDatabase): CloudDatabase {
  if (!value || value.schemaVersion !== 2 || !Array.isArray(value.contacts)) {
    throw new Error('Облачная база имеет неподдерживаемый формат.');
  }
  return value;
}

async function ensureFolders(token: string): Promise<void> {
  if (foldersReadyForToken === token) return;

  const rootExists = await diskResourceExists(token, getFolderName());
  if (!rootExists) {
    throw new Error(`На Яндекс Диске не найдена общая папка «${getFolderName()}».`);
  }
  await createDiskFolder(token, getBackupsPath());
  foldersReadyForToken = token;
}

async function readLock(token: string): Promise<Partial<SyncLock> | null> {
  try {
    return JSON.parse(await downloadTextFile(token, getLockPath())) as Partial<SyncLock>;
  } catch (error) {
    if (error instanceof DiskApiError && error.status === 404) return null;
    throw error;
  }
}

async function acquireLock(token: string, user: YandexUserInfo): Promise<SyncLock> {
  const deviceId = getDeviceId();

  for (let attempt = 0; attempt <= LOCK_RETRY_DELAYS_MS.length; attempt += 1) {
    const now = Date.now();
    const lock: SyncLock = {
      lockId: crypto.randomUUID(),
      deviceId,
      userLogin: user.login,
      createdAt: now,
      expiresAt: now + LOCK_TTL_MS,
    };

    try {
      await uploadTextFile(token, getLockPath(), JSON.stringify(lock), false);
      return lock;
    } catch (error) {
      if (!(error instanceof DiskApiError) || error.status !== 409) throw error;
    }

    const current = await readLock(token);
    const createdAt = typeof current?.createdAt === 'number' ? current.createdAt : 0;
    const expiresAt = typeof current?.expiresAt === 'number' ? current.expiresAt : 0;
    const ownedByThisDevice = current?.deviceId === deviceId;
    const staleByAge = !createdAt || now - createdAt > LOCK_TTL_MS;
    const expired = !expiresAt || expiresAt <= now;

    if (ownedByThisDevice || staleByAge || expired) {
      try {
        await deleteDiskResource(token, getLockPath(), true);
      } catch (error) {
        if (!(error instanceof DiskApiError) || error.status !== 404) throw error;
      }
      continue;
    }

    if (attempt < LOCK_RETRY_DELAYS_MS.length) {
      await delay(LOCK_RETRY_DELAYS_MS[attempt]);
      continue;
    }

    const seconds = Math.max(2, Math.ceil((expiresAt - now) / 1000));
    throw new Error(
      `Другой пользователь сейчас сохраняет изменения (${current?.userLogin || 'другое устройство'}). Повторите через ${seconds} сек.`,
    );
  }

  throw new Error('Не удалось получить доступ к записи базы.');
}

async function releaseLock(token: string, lock: SyncLock): Promise<void> {
  try {
    const current = await readLock(token);
    if (current && current.lockId && current.lockId !== lock.lockId) return;
    if (current && !current.lockId && current.deviceId !== lock.deviceId) return;
    await deleteDiskResource(token, getLockPath(), true);
  } catch (error) {
    if (!(error instanceof DiskApiError) || error.status !== 404) {
      console.warn('Не удалось удалить sync-lock:', error);
    }
  }
}

async function createDailyBackup(token: string, encryptedCloud: string): Promise<void> {
  const date = new Date().toISOString().slice(0, 10);
  const path = joinDiskPath(getBackupsPath(), `contacts-database-${date}.enc`);
  try {
    await uploadTextFile(token, path, encryptedCloud, false);
  } catch (error) {
    if (!(error instanceof DiskApiError) || error.status !== 409) throw error;
  }
}

function makeResult(cloud: CloudDatabase, syncedAt: number): SyncResult {
  return {
    revision: cloud.revision,
    syncedAt,
    updatedBy: cloud.updatedBy.login,
    contactsCount: cloud.contacts.filter((contact) => contact.deletedAt === null).length,
  };
}

async function storeCloudLocally(cloud: CloudDatabase, syncedAt: number): Promise<SyncResult> {
  await db.replaceFromCloud(cloud);
  await db.clearPendingOperations();
  await db.setSyncMetadata({
    lastSyncAt: syncedAt,
    cloudRevision: cloud.revision,
    lastSyncBy: cloud.updatedBy.login,
  });
  return makeResult(cloud, syncedAt);
}

export async function cloudDatabaseExists(token: string): Promise<boolean> {
  await ensureFolders(token);
  return diskResourceExists(token, getDatabasePath());
}

export async function initializeCloudDatabase(
  token: string,
  password: string,
  user: YandexUserInfo,
): Promise<SyncResult> {
  await ensureFolders(token);
  const lock = await acquireLock(token, user);

  try {
    if (await diskResourceExists(token, getDatabasePath())) {
      throw new Error('Облачная база уже существует. Используйте вход с действующим паролем.');
    }

    await db.ensureSeedData();
    const snapshot = await db.getCloudSnapshot();
    const now = Date.now();
    const payload: CloudDatabase = {
      schemaVersion: 2,
      revision: 1,
      updatedAt: now,
      updatedBy: actorFromUser(user),
      ...snapshot,
    };

    await uploadTextFile(token, getDatabasePath(), await encryptJson(payload, password), false);
    await db.clearPendingOperations();
    await db.setSyncMetadata({
      lastSyncAt: now,
      cloudRevision: payload.revision,
      lastSyncBy: user.login,
    });

    return makeResult(payload, now);
  } finally {
    await releaseLock(token, lock);
  }
}

export async function syncWithCloud(
  token: string,
  password: string,
  user: YandexUserInfo,
): Promise<SyncResult> {
  await ensureFolders(token);

  // Обычное обновление без локальных изменений выполняется только на чтение — без lock-файла.
  const pendingCount = await db.getPendingCount();
  if (pendingCount === 0) {
    const encryptedCloud = await downloadTextFile(token, getDatabasePath());
    const cloud = validateCloudDatabase(await decryptJson<CloudDatabase>(encryptedCloud, password));
    return storeCloudLocally(cloud, Date.now());
  }

  // Блокировка нужна только на короткое время фактической записи.
  const lock = await acquireLock(token, user);
  try {
    const encryptedCloud = await downloadTextFile(token, getDatabasePath());
    const cloud = validateCloudDatabase(await decryptJson<CloudDatabase>(encryptedCloud, password));
    const local = await db.getCloudSnapshot(false);

    const contacts = mergeEntities<Contact>(local.contacts, cloud.contacts);
    const organizations = mergeEntities<Organization>(local.organizations, cloud.organizations);
    const groups = mergeEntities<Group>(local.groups, cloud.groups);
    const now = Date.now();
    const cloudAlreadyContainsMergedData =
      entitiesEqual(contacts, cloud.contacts) &&
      entitiesEqual(organizations, cloud.organizations) &&
      entitiesEqual(groups, cloud.groups);

    if (cloudAlreadyContainsMergedData) {
      return storeCloudLocally(cloud, now);
    }

    const merged: CloudDatabase = {
      schemaVersion: 2,
      revision: cloud.revision + 1,
      updatedAt: now,
      updatedBy: actorFromUser(user),
      contacts,
      organizations,
      groups,
    };

    await createDailyBackup(token, encryptedCloud);
    await uploadTextFile(token, getDatabasePath(), await encryptJson(merged, password), true);
    return storeCloudLocally(merged, now);
  } finally {
    await releaseLock(token, lock);
  }
}
