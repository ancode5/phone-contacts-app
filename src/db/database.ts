import Dexie from 'dexie';
import type { Table, Transaction } from 'dexie';
import { INITIAL_ORGANIZATION_NAMES } from '../constants/organizations';
import type {
  Contact,
  ContactInput,
  ContactsBackup,
  Group,
  Organization,
  PendingEntityType,
  PendingOperation,
  PendingOperationAction,
  SyncMetadata,
} from '../types';

const TRASH_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;

const createId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
};

const cleanText = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

const cleanStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(cleanText).filter(Boolean))];
};

const toTimestamp = (value: unknown, fallback: number): number => {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
};

const normalizeContact = (value: unknown): Contact => {
  if (!value || typeof value !== 'object') throw new Error('Контакт должен быть объектом.');

  const source = value as Record<string, unknown>;
  const now = Date.now();
  const fullName = cleanText(source.fullName) || cleanText(source.name);
  if (!fullName) throw new Error('У контакта отсутствует ФИО.');

  return {
    id: cleanText(source.id) || createId(),
    fullName,
    workPhone: cleanText(source.workPhone) || cleanText(source.phone),
    personalPhone: cleanText(source.personalPhone),
    workEmail: cleanText(source.workEmail) || cleanText(source.email),
    personalEmail: cleanText(source.personalEmail),
    organizationId: cleanText(source.organizationId),
    department: cleanText(source.department),
    position: cleanText(source.position),
    notes: cleanText(source.notes),
    groupIds: cleanStringArray(source.groupIds),
    isFavorite: source.isFavorite === true,
    createdAt: toTimestamp(source.createdAt, now),
    updatedAt: toTimestamp(source.updatedAt, now),
    deletedAt:
      typeof source.deletedAt === 'number' && Number.isFinite(source.deletedAt)
        ? source.deletedAt
        : null,
    version:
      typeof source.version === 'number' && Number.isFinite(source.version)
        ? Math.max(1, Math.floor(source.version))
        : 1,
  };
};

const normalizeOrganization = (value: unknown, fallbackOrder = 0): Organization => {
  if (!value || typeof value !== 'object') throw new Error('Организация должна быть объектом.');
  const source = value as Record<string, unknown>;
  const now = Date.now();
  const name = cleanText(source.name);
  if (!name) throw new Error('У организации отсутствует название.');

  return {
    id: cleanText(source.id) || createId(),
    name,
    sortOrder: toTimestamp(source.sortOrder, fallbackOrder),
    createdAt: toTimestamp(source.createdAt, now),
    updatedAt: toTimestamp(source.updatedAt, now),
    deletedAt:
      typeof source.deletedAt === 'number' && Number.isFinite(source.deletedAt)
        ? source.deletedAt
        : null,
  };
};

const normalizeGroup = (value: unknown, fallbackOrder = 0): Group => {
  if (!value || typeof value !== 'object') throw new Error('Группа должна быть объектом.');
  const source = value as Record<string, unknown>;
  const now = Date.now();
  const name = cleanText(source.name);
  if (!name) throw new Error('У группы отсутствует название.');

  return {
    id: cleanText(source.id) || createId(),
    name,
    color: cleanText(source.color) || '#2f855a',
    sortOrder: toTimestamp(source.sortOrder, fallbackOrder),
    createdAt: toTimestamp(source.createdAt, now),
    updatedAt: toTimestamp(source.updatedAt, now),
    deletedAt:
      typeof source.deletedAt === 'number' && Number.isFinite(source.deletedAt)
        ? source.deletedAt
        : null,
  };
};

const sortByName = <T extends { name: string; sortOrder: number }>(items: T[]): T[] =>
  items.sort(
    (left, right) =>
      left.sortOrder - right.sortOrder ||
      left.name.localeCompare(right.name, 'ru', { sensitivity: 'base' }),
  );

export class ContactsDatabase extends Dexie {
  contacts!: Table<Contact, string>;
  organizations!: Table<Organization, string>;
  groups!: Table<Group, string>;
  pendingOperations!: Table<PendingOperation, string>;
  syncMetadata!: Table<SyncMetadata, string>;

  constructor() {
    super('ContactsDB');

    this.version(1).stores({
      contacts: 'id, name, phone, email, company, isFavorite, createdAt, updatedAt',
    });

    this.version(2).stores({
      contacts: '&id, name, phone, email, company, createdAt, updatedAt, *tags',
    });

    this.version(3)
      .stores({
        contacts:
          '&id, fullName, organizationId, department, position, createdAt, updatedAt, deletedAt, *groupIds',
        organizations: '&id, name, sortOrder, updatedAt, deletedAt',
        groups: '&id, name, sortOrder, updatedAt, deletedAt',
        pendingOperations: '&id, entityType, entityId, action, createdAt',
        syncMetadata: '&key',
      })
      .upgrade(async (transaction: Transaction) => {
        await transaction
          .table('contacts')
          .toCollection()
          .modify((contact: Record<string, unknown>) => {
            const normalized = normalizeContact(contact);
            Object.keys(contact).forEach((key) => delete contact[key]);
            Object.assign(contact, normalized);
          });
      });
  }

  async ensureSeedData(): Promise<void> {
    const count = await this.organizations.count();
    if (count > 0) return;

    const now = Date.now();
    const organizations = INITIAL_ORGANIZATION_NAMES.map((name, index) => ({
      id: createId(),
      name,
      sortOrder: index,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    }));

    await this.organizations.bulkAdd(organizations);
  }

  private async recordOperation(
    entityType: PendingEntityType,
    entityId: string,
    action: PendingOperationAction,
  ): Promise<void> {
    await this.pendingOperations.add({
      id: createId(),
      entityType,
      entityId,
      action,
      createdAt: Date.now(),
    });
  }

  async getAllContacts(includeDeleted = false): Promise<Contact[]> {
    const contacts = await this.contacts.toArray();
    return contacts
      .filter((contact) => includeDeleted || contact.deletedAt === null)
      .sort((left, right) =>
        left.fullName.localeCompare(right.fullName, 'ru', { sensitivity: 'base' }),
      );
  }

  async getTrashContacts(): Promise<Contact[]> {
    const cutoff = Date.now() - TRASH_RETENTION_MS;
    return (await this.contacts.toArray())
      .filter((contact) => contact.deletedAt !== null && contact.deletedAt >= cutoff)
      .sort((left, right) => (right.deletedAt ?? 0) - (left.deletedAt ?? 0));
  }

  async addContact(input: ContactInput): Promise<string> {
    const now = Date.now();
    const contact = normalizeContact({
      ...input,
      id: createId(),
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      version: 1,
    });

    await this.transaction('rw', this.contacts, this.pendingOperations, async () => {
      await this.contacts.add(contact);
      await this.recordOperation('contact', contact.id, 'create');
    });
    return contact.id;
  }

  async updateContact(id: string, changes: Partial<ContactInput>): Promise<void> {
    const existing = await this.contacts.get(id);
    if (!existing) throw new Error('Контакт не найден.');

    const updated = normalizeContact({
      ...existing,
      ...changes,
      id,
      createdAt: existing.createdAt,
      updatedAt: Date.now(),
      deletedAt: existing.deletedAt,
      version: existing.version + 1,
    });

    await this.transaction('rw', this.contacts, this.pendingOperations, async () => {
      await this.contacts.put(updated);
      await this.recordOperation('contact', id, 'update');
    });
  }

  async softDeleteContact(id: string): Promise<void> {
    const existing = await this.contacts.get(id);
    if (!existing) return;
    const now = Date.now();

    await this.transaction('rw', this.contacts, this.pendingOperations, async () => {
      await this.contacts.put({
        ...existing,
        deletedAt: now,
        updatedAt: now,
        version: existing.version + 1,
      });
      await this.recordOperation('contact', id, 'delete');
    });
  }

  async hideContactFromTrash(id: string): Promise<void> {
    const existing = await this.contacts.get(id);
    if (!existing) return;
    const now = Date.now();

    await this.transaction('rw', this.contacts, this.pendingOperations, async () => {
      await this.contacts.put({
        ...existing,
        deletedAt: 1,
        updatedAt: now,
        version: existing.version + 1,
      });
      await this.recordOperation('contact', id, 'delete');
    });
  }

  async clearTrash(): Promise<number> {
    const trashContacts = await this.getTrashContacts();
    if (trashContacts.length === 0) return 0;

    const now = Date.now();
    await this.transaction('rw', this.contacts, this.pendingOperations, async () => {
      for (const contact of trashContacts) {
        await this.contacts.put({
          ...contact,
          deletedAt: 1,
          updatedAt: now,
          version: contact.version + 1,
        });
        await this.recordOperation('contact', contact.id, 'delete');
      }
    });

    return trashContacts.length;
  }

  async restoreContact(id: string): Promise<void> {
    const existing = await this.contacts.get(id);
    if (!existing) return;
    const now = Date.now();

    await this.transaction('rw', this.contacts, this.pendingOperations, async () => {
      await this.contacts.put({
        ...existing,
        deletedAt: null,
        updatedAt: now,
        version: existing.version + 1,
      });
      await this.recordOperation('contact', id, 'restore');
    });
  }

  async getOrganizations(includeDeleted = false): Promise<Organization[]> {
    const organizations = await this.organizations.toArray();
    return sortByName(organizations.filter((item) => includeDeleted || item.deletedAt === null));
  }

  async addOrganization(name: string): Promise<string> {
    const normalizedName = name.trim();
    if (!normalizedName) throw new Error('Введите название организации.');
    const active = await this.getOrganizations();
    if (active.some((item) => item.name.localeCompare(normalizedName, 'ru', { sensitivity: 'base' }) === 0)) {
      throw new Error('Такая организация уже существует.');
    }

    const now = Date.now();
    const organization: Organization = {
      id: createId(),
      name: normalizedName,
      sortOrder: active.length,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };

    await this.transaction('rw', this.organizations, this.pendingOperations, async () => {
      await this.organizations.add(organization);
      await this.recordOperation('organization', organization.id, 'create');
    });
    return organization.id;
  }

  async updateOrganization(id: string, name: string): Promise<void> {
    const existing = await this.organizations.get(id);
    if (!existing) throw new Error('Организация не найдена.');
    const normalizedName = name.trim();
    if (!normalizedName) throw new Error('Введите название организации.');

    await this.transaction('rw', this.organizations, this.pendingOperations, async () => {
      await this.organizations.put({ ...existing, name: normalizedName, updatedAt: Date.now() });
      await this.recordOperation('organization', id, 'update');
    });
  }

  async deleteOrganization(id: string): Promise<void> {
    const existing = await this.organizations.get(id);
    if (!existing) return;
    const now = Date.now();

    await this.transaction('rw', this.organizations, this.contacts, this.pendingOperations, async () => {
      await this.organizations.put({ ...existing, deletedAt: now, updatedAt: now });
      await this.contacts.where('organizationId').equals(id).modify((contact) => {
        contact.organizationId = '';
        contact.updatedAt = now;
        contact.version += 1;
      });
      await this.recordOperation('organization', id, 'delete');
    });
  }

  async getGroups(includeDeleted = false): Promise<Group[]> {
    const groups = await this.groups.toArray();
    return sortByName(groups.filter((item) => includeDeleted || item.deletedAt === null));
  }

  async addGroup(name: string, color: string): Promise<string> {
    const normalizedName = name.trim();
    if (!normalizedName) throw new Error('Введите название группы.');
    const active = await this.getGroups();
    if (active.some((item) => item.name.localeCompare(normalizedName, 'ru', { sensitivity: 'base' }) === 0)) {
      throw new Error('Такая группа уже существует.');
    }

    const now = Date.now();
    const group: Group = {
      id: createId(),
      name: normalizedName,
      color: color || '#2f855a',
      sortOrder: active.length,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };

    await this.transaction('rw', this.groups, this.pendingOperations, async () => {
      await this.groups.add(group);
      await this.recordOperation('group', group.id, 'create');
    });
    return group.id;
  }

  async updateGroup(id: string, changes: Pick<Group, 'name' | 'color'>): Promise<void> {
    const existing = await this.groups.get(id);
    if (!existing) throw new Error('Группа не найдена.');
    const name = changes.name.trim();
    if (!name) throw new Error('Введите название группы.');

    await this.transaction('rw', this.groups, this.pendingOperations, async () => {
      await this.groups.put({ ...existing, name, color: changes.color, updatedAt: Date.now() });
      await this.recordOperation('group', id, 'update');
    });
  }

  async deleteGroup(id: string): Promise<void> {
    const existing = await this.groups.get(id);
    if (!existing) return;
    const now = Date.now();

    await this.transaction('rw', this.groups, this.contacts, this.pendingOperations, async () => {
      await this.groups.put({ ...existing, deletedAt: now, updatedAt: now });
      await this.contacts.toCollection().modify((contact) => {
        if (!contact.groupIds.includes(id)) return;
        contact.groupIds = contact.groupIds.filter((groupId) => groupId !== id);
        contact.updatedAt = now;
        contact.version += 1;
      });
      await this.recordOperation('group', id, 'delete');
    });
  }

  async getPendingCount(): Promise<number> {
    return this.pendingOperations.count();
  }

  async clearPendingOperations(): Promise<void> {
    await this.pendingOperations.clear();
  }

  async getSyncMetadata(): Promise<SyncMetadata> {
    return (
      (await this.syncMetadata.get('state')) ?? {
        key: 'state',
        lastSyncAt: null,
        cloudRevision: 0,
        lastSyncBy: '',
      }
    );
  }

  async setSyncMetadata(metadata: Omit<SyncMetadata, 'key'>): Promise<void> {
    await this.syncMetadata.put({ key: 'state', ...metadata });
  }

  async getCloudSnapshot(ensureSeed = true): Promise<Pick<ContactsBackup, 'contacts' | 'organizations' | 'groups'>> {
    if (ensureSeed) await this.ensureSeedData();
    return {
      contacts: await this.contacts.toArray(),
      organizations: await this.organizations.toArray(),
      groups: await this.groups.toArray(),
    };
  }

  async replaceFromCloud(snapshot: Pick<ContactsBackup, 'contacts' | 'organizations' | 'groups'>): Promise<void> {
    const contacts = snapshot.contacts.map(normalizeContact);
    const organizations = snapshot.organizations.map((value, index) => normalizeOrganization(value, index));
    const groups = snapshot.groups.map((value, index) => normalizeGroup(value, index));

    await this.transaction(
      'rw',
      this.contacts,
      this.organizations,
      this.groups,
      async () => {
        await this.contacts.clear();
        await this.organizations.clear();
        await this.groups.clear();
        if (contacts.length > 0) await this.contacts.bulkPut(contacts);
        if (organizations.length > 0) await this.organizations.bulkPut(organizations);
        if (groups.length > 0) await this.groups.bulkPut(groups);
      },
    );
  }

  async exportContacts(): Promise<string> {
    const snapshot = await this.getCloudSnapshot();
    const backup: ContactsBackup = {
      schemaVersion: 2,
      exportedAt: new Date().toISOString(),
      ...snapshot,
    };
    return JSON.stringify(backup, null, 2);
  }

  async importContacts(json: string): Promise<number> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(json) as unknown;
    } catch {
      throw new Error('Файл не является корректным JSON.');
    }

    const source = parsed as { contacts?: unknown; organizations?: unknown; groups?: unknown };
    const rawContacts = Array.isArray(parsed)
      ? parsed
      : Array.isArray(source.contacts)
        ? source.contacts
        : null;
    if (!rawContacts) throw new Error('В файле не найден массив contacts.');

    const contacts = rawContacts.map(normalizeContact);
    const organizations = Array.isArray(source.organizations)
      ? source.organizations.map((item, index) => normalizeOrganization(item, index))
      : [];
    const groups = Array.isArray(source.groups)
      ? source.groups.map((item, index) => normalizeGroup(item, index))
      : [];

    await this.transaction(
      'rw',
      this.contacts,
      this.organizations,
      this.groups,
      this.pendingOperations,
      async () => {
        if (contacts.length > 0) await this.contacts.bulkPut(contacts);
        if (organizations.length > 0) await this.organizations.bulkPut(organizations);
        if (groups.length > 0) await this.groups.bulkPut(groups);
        for (const contact of contacts) {
          await this.recordOperation('contact', contact.id, 'update');
        }
      },
    );

    return contacts.length;
  }

  async clearAllLocalData(): Promise<void> {
    await this.transaction(
      'rw',
      this.contacts,
      this.organizations,
      this.groups,
      this.pendingOperations,
      this.syncMetadata,
      async () => {
        await Promise.all([
          this.contacts.clear(),
          this.organizations.clear(),
          this.groups.clear(),
          this.pendingOperations.clear(),
          this.syncMetadata.clear(),
        ]);
      },
    );
  }
}

export const db = new ContactsDatabase();
