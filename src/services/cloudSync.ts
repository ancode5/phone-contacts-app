import { db } from '../db/database';
import type { YandexUserInfo } from '../auth/yandexOAuth';
import type { CloudActor, CloudDatabase, Contact, Group, Organization } from '../types';
import { decryptJson, encryptJson } from './cryptoVault';
import {
  getGitHubFile,
  getGitHubStorageConfig,
  GitHubApiError,
  putGitHubFile,
  validateGitHubStorage,
} from './githubStorage';
import type { GitHubStorageConfig } from './githubStorage';

const DATABASE_FILENAME = 'contacts-database.enc';
const BACKUPS_FOLDER = 'backups';
const MAX_WRITE_ATTEMPTS = 4;

export interface SyncResult {
  revision: number;
  syncedAt: number;
  updatedBy: string;
  contactsCount: number;
}

let validatedRepositoryKey = '';

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function getConfig(): GitHubStorageConfig {
  const config = getGitHubStorageConfig();
  if (!config) throw new Error('Сначала подключите приватный репозиторий GitHub.');
  return config;
}

async function ensureRepository(config: GitHubStorageConfig): Promise<void> {
  const key = `${config.owner}/${config.repo}@${config.branch}:${config.token.slice(-8)}`;
  if (validatedRepositoryKey === key) return;
  await validateGitHubStorage(config);
  validatedRepositoryKey = key;
}

function actorFromUser(user: YandexUserInfo): CloudActor {
  return {
    id: user.id,
    login: user.login,
    displayName: user.display_name || user.real_name || user.login,
  };
}

function pickLatest<T extends { updatedAt: number; version?: number }>(left: T, right: T): T {
  if (left.updatedAt !== right.updatedAt) return left.updatedAt > right.updatedAt ? left : right;
  const leftVersion = typeof left.version === 'number' ? left.version : 0;
  const rightVersion = typeof right.version === 'number' ? right.version : 0;
  if (leftVersion !== rightVersion) return leftVersion > rightVersion ? left : right;
  return JSON.stringify(left).localeCompare(JSON.stringify(right)) >= 0 ? left : right;
}

function mergeEntities<T extends { id: string; updatedAt: number; version?: number }>(
  local: T[],
  cloud: T[],
): T[] {
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

async function createDailyBackup(
  config: GitHubStorageConfig,
  encryptedCloud: string,
): Promise<void> {
  const date = new Date().toISOString().slice(0, 10);
  const path = `${BACKUPS_FOLDER}/contacts-database-${date}.enc`;
  try {
    await putGitHubFile(config, path, encryptedCloud, `Backup contacts database ${date}`);
  } catch (error) {
    // 422 означает, что дневная резервная копия уже существует.
    if (!(error instanceof GitHubApiError) || error.status !== 422) throw error;
  }
}

export async function cloudDatabaseExists(_yandexToken: string): Promise<boolean> {
  const config = getConfig();
  await ensureRepository(config);
  return (await getGitHubFile(config, DATABASE_FILENAME)) !== null;
}

export async function initializeCloudDatabase(
  _yandexToken: string,
  password: string,
  user: YandexUserInfo,
): Promise<SyncResult> {
  const config = getConfig();
  await ensureRepository(config);

  if (await getGitHubFile(config, DATABASE_FILENAME)) {
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

  try {
    await putGitHubFile(
      config,
      DATABASE_FILENAME,
      await encryptJson(payload, password),
      `Initialize contacts database (revision ${payload.revision})`,
    );
  } catch (error) {
    if (error instanceof GitHubApiError && (error.status === 409 || error.status === 422)) {
      throw new Error('База была создана другим устройством. Обновите страницу и откройте её паролем.');
    }
    throw error;
  }

  await db.clearPendingOperations();
  await db.setSyncMetadata({
    lastSyncAt: now,
    cloudRevision: payload.revision,
    lastSyncBy: user.login,
  });
  return makeResult(payload, now);
}

export async function syncWithCloud(
  _yandexToken: string,
  password: string,
  user: YandexUserInfo,
): Promise<SyncResult> {
  const config = getConfig();
  await ensureRepository(config);
  const pendingCount = await db.getPendingCount();

  if (pendingCount === 0) {
    const file = await getGitHubFile(config, DATABASE_FILENAME);
    if (!file) throw new Error('В приватном репозитории не найден contacts-database.enc.');
    const cloud = validateCloudDatabase(await decryptJson(file.text, password));
    return storeCloudLocally(cloud, Date.now());
  }

  let lastConflict: unknown = null;
  for (let attempt = 0; attempt < MAX_WRITE_ATTEMPTS; attempt += 1) {
    const file = await getGitHubFile(config, DATABASE_FILENAME);
    if (!file) throw new Error('В приватном репозитории не найден contacts-database.enc.');

    const cloud = validateCloudDatabase(await decryptJson(file.text, password));
    const local = await db.getCloudSnapshot(false);
    const contacts = mergeEntities<Contact>(local.contacts, cloud.contacts);
    const organizations = mergeEntities<Organization>(local.organizations, cloud.organizations);
    const groups = mergeEntities<Group>(local.groups, cloud.groups);
    const now = Date.now();

    const cloudAlreadyContainsMergedData =
      entitiesEqual(contacts, cloud.contacts) &&
      entitiesEqual(organizations, cloud.organizations) &&
      entitiesEqual(groups, cloud.groups);

    if (cloudAlreadyContainsMergedData) return storeCloudLocally(cloud, now);

    const merged: CloudDatabase = {
      schemaVersion: 2,
      revision: cloud.revision + 1,
      updatedAt: now,
      updatedBy: actorFromUser(user),
      contacts,
      organizations,
      groups,
    };

    try {
      if (attempt === 0) await createDailyBackup(config, file.text);
      await putGitHubFile(
        config,
        DATABASE_FILENAME,
        await encryptJson(merged, password),
        `Update contacts database to revision ${merged.revision} by ${user.login}`,
        file.sha,
      );
      return storeCloudLocally(merged, now);
    } catch (error) {
      if (error instanceof GitHubApiError && (error.status === 409 || error.status === 422)) {
        lastConflict = error;
        await delay(350 * (attempt + 1));
        continue;
      }
      throw error;
    }
  }

  throw new Error(
    `База несколько раз изменилась на другом устройстве. Повторите синхронизацию. ${
      lastConflict instanceof Error ? lastConflict.message : ''
    }`.trim(),
  );
}
