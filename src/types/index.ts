export interface Contact {
  id: string;
  name: string;
  phone: string;
  email: string;
  company: string;
  notes: string;
  tags: string[];
  isFavorite: boolean;
  createdAt: number;
  updatedAt: number;
}

export type ContactInput = Omit<Contact, 'id' | 'createdAt' | 'updatedAt'>;

export interface ContactsBackup {
  schemaVersion: 1;
  exportedAt: string;
  contacts: Contact[];
}
