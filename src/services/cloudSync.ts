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
const LOCK_TTL_MS = 90_000;

export interface SyncResult {
  revision: number;
  syncedAt: number;
  updatedBy: string;
  contactsCount: number;
}

interface SyncLock {
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
  const rootExists = await diskResourceExists(token, getFolderName());
  if (!rootExists) {
    throw new Error(`На Яндекс Диске не найдена общая папка «${getFolderName()}».`);
  }
  await createDiskFolder(token, getBackupsPath());
}

async function acquireLock(token: string, user: YandexUserInfo): Promise<void> {
  const now = Date.now();
  const lock: SyncLock = {
    deviceId: getDeviceId(),
    userLogin: user.login,
    createdAt: now,
    expiresAt: now + LOCK_TTL_MS,
  };

  try {
    await uploadTextFile(token, getLockPath(), JSON.stringify(lock), false);
    return;
  } catch (error) {
    if (!(error instanceof DiskApiError) || error.status !== 409) throw error;
  }

  try {
    const current = JSON.parse(await downloadTextFile(token, getLockPath())) as Partial<SyncLock>;
    if (typeof current.expiresAt === 'number' && current.expiresAt > now) {
      throw new Error(
        `База сейчас синхронизируется пользователем ${current.userLogin || 'на другом устройстве'}. Повторите через минуту.`,
      );
    }
  } catch (error) {
    if (!(error instanceof DiskApiError) || error.status !== 404) {
      if (error instanceof Error && error.message.startsWith('База сейчас')) throw error;
    }
  }

  await uploadTextFile(token, getLockPath(), JSON.stringify(lock), true);
}

async function releaseLock(token: string): Promise<void> {
  try {
    await deleteDiskResource(token, getLockPath(), true);
  } catch (error) {
    if (!(error instanceof DiskApiError) || error.status !== 404) console.warn('Не удалось удалить sync-lock:', error);
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
  await acquireLock(token, user);

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

    return {
      revision: payload.revision,
      syncedAt: now,
      updatedBy: user.login,
      contactsCount: payload.contacts.filter((contact) => contact.deletedAt === null).length,
    };
  } finally {
    await releaseLock(token);
  }
}

export async function syncWithCloud(
  token: string,
  password: string,
  user: YandexUserInfo,
): Promise<SyncResult> {
  await ensureFolders(token);
  await acquireLock(token, user);

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
      await db.replaceFromCloud(cloud);
      await db.clearPendingOperations();
      await db.setSyncMetadata({
        lastSyncAt: now,
        cloudRevision: cloud.revision,
        lastSyncBy: cloud.updatedBy.login,
      });

      return {
        revision: cloud.revision,
        syncedAt: now,
        updatedBy: cloud.updatedBy.login,
        contactsCount: cloud.contacts.filter((contact) => contact.deletedAt === null).length,
      };
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
    await db.replaceFromCloud(merged);
    await db.clearPendingOperations();
    await db.setSyncMetadata({
      lastSyncAt: now,
      cloudRevision: merged.revision,
      lastSyncBy: user.login,
    });

    return {
      revision: merged.revision,
      syncedAt: now,
      updatedBy: user.login,
      contactsCount: contacts.filter((contact) => contact.deletedAt === null).length,
    };
  } finally {
    await releaseLock(token);
  }
}
