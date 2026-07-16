import Dexie from 'dexie';
import type { Table } from 'dexie';
import type { Contact, ContactInput, ContactsBackup } from '../types';

const createId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
};

const cleanText = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

const cleanTags = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];

  return [...new Set(value.map(cleanText).filter(Boolean))];
};

const toTimestamp = (value: unknown, fallback: number): number => {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
};

const normalizeContact = (value: unknown): Contact => {
  if (!value || typeof value !== 'object') {
    throw new Error('Контакт должен быть объектом');
  }

  const source = value as Record<string, unknown>;
  const now = Date.now();
  const name = cleanText(source.name);

  if (!name) {
    throw new Error('У контакта отсутствует имя');
  }

  return {
    id: cleanText(source.id) || createId(),
    name,
    phone: cleanText(source.phone),
    email: cleanText(source.email),
    company: cleanText(source.company),
    notes: cleanText(source.notes),
    tags: cleanTags(source.tags),
    isFavorite: source.isFavorite === true,
    createdAt: toTimestamp(source.createdAt, now),
    updatedAt: toTimestamp(source.updatedAt, now),
  };
};

const sortContacts = (contacts: Contact[]): Contact[] => {
  return contacts.sort((a, b) => a.name.localeCompare(b.name, 'ru', { sensitivity: 'base' }));
};

export class ContactsDatabase extends Dexie {
  contacts!: Table<Contact, string>;

  constructor() {
    super('ContactsDB');

    // Схема исходной версии сохранена для корректного обновления уже созданных баз.
    this.version(1).stores({
      contacts: 'id, name, phone, email, company, isFavorite, createdAt, updatedAt',
    });

    // Boolean нельзя использовать как ключ IndexedDB, поэтому индекс isFavorite удалён.
    this.version(2)
      .stores({
        contacts: '&id, name, phone, email, company, createdAt, updatedAt, *tags',
      })
      .upgrade(async (transaction) => {
        await transaction
          .table<Contact>('contacts')
          .toCollection()
          .modify((contact) => {
            const normalized = normalizeContact(contact);
            Object.assign(contact, normalized);
          });
      });
  }

  async getAllContacts(): Promise<Contact[]> {
    return sortContacts(await this.contacts.toArray());
  }

  async addContact(input: ContactInput): Promise<string> {
    const now = Date.now();
    const contact = normalizeContact({
      ...input,
      id: createId(),
      createdAt: now,
      updatedAt: now,
    });

    await this.contacts.add(contact);
    return contact.id;
  }

  async updateContact(id: string, changes: Partial<ContactInput>): Promise<void> {
    const existing = await this.contacts.get(id);
    if (!existing) throw new Error('Контакт не найден');

    const updated = normalizeContact({
      ...existing,
      ...changes,
      id,
      createdAt: existing.createdAt,
      updatedAt: Date.now(),
    });

    await this.contacts.put(updated);
  }

  async deleteContact(id: string): Promise<void> {
    await this.contacts.delete(id);
  }

  async getFavorites(): Promise<Contact[]> {
    const favorites = await this.contacts.filter((contact) => contact.isFavorite === true).toArray();
    return sortContacts(favorites);
  }

  async searchContacts(query: string): Promise<Contact[]> {
    const normalizedQuery = query.trim().toLocaleLowerCase('ru');
    if (!normalizedQuery) return this.getAllContacts();

    const contacts = await this.contacts.toArray();
    const result = contacts.filter((contact) => {
      const searchableValues = [
        contact.name,
        contact.phone,
        contact.email,
        contact.company,
        contact.notes,
        ...(contact.tags ?? []),
      ];

      return searchableValues.some((value) =>
        value.toLocaleLowerCase('ru').includes(normalizedQuery),
      );
    });

    return sortContacts(result);
  }

  async exportContacts(): Promise<string> {
    const backup: ContactsBackup = {
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      contacts: await this.getAllContacts(),
    };

    return JSON.stringify(backup, null, 2);
  }

  async importContacts(json: string): Promise<number> {
    let parsed: unknown;

    try {
      parsed = JSON.parse(json) as unknown;
    } catch {
      throw new Error('Файл не является корректным JSON');
    }

    const rawContacts = Array.isArray(parsed)
      ? parsed
      : parsed && typeof parsed === 'object' && Array.isArray((parsed as { contacts?: unknown }).contacts)
        ? (parsed as { contacts: unknown[] }).contacts
        : null;

    if (!rawContacts) {
      throw new Error('В файле не найден массив contacts');
    }

    const contacts = rawContacts.map(normalizeContact);
    if (contacts.length === 0) return 0;

    await this.transaction('rw', this.contacts, async () => {
      await this.contacts.bulkPut(contacts);
    });

    return contacts.length;
  }
}

export const db = new ContactsDatabase();
