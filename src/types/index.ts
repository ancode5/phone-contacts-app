export interface Contact {
  id: string;
  fullName: string;
  workPhone: string;
  personalPhone: string;
  workEmail: string;
  personalEmail: string;
  organizationId: string;
  department: string;
  position: string;
  notes: string;
  groupIds: string[];
  isFavorite: boolean;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
  version: number;
}

export type ContactInput = Omit<
  Contact,
  'id' | 'createdAt' | 'updatedAt' | 'deletedAt' | 'version'
>;

export interface Organization {
  id: string;
  name: string;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
}

export interface Group {
  id: string;
  name: string;
  color: string;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
}

export type PendingOperationAction = 'create' | 'update' | 'delete' | 'restore';
export type PendingEntityType = 'contact' | 'organization' | 'group';

export interface PendingOperation {
  id: string;
  entityType: PendingEntityType;
  entityId: string;
  action: PendingOperationAction;
  createdAt: number;
}

export interface SyncMetadata {
  key: 'state';
  lastSyncAt: number | null;
  cloudRevision: number;
  lastSyncBy: string;
}

export interface CloudActor {
  id: string;
  login: string;
  displayName: string;
}

export interface CloudDatabase {
  schemaVersion: 2;
  revision: number;
  updatedAt: number;
  updatedBy: CloudActor;
  contacts: Contact[];
  organizations: Organization[];
  groups: Group[];
}

export interface EncryptedDatabaseEnvelope {
  format: 'contacts-aes-gcm';
  version: 1;
  kdf: {
    name: 'PBKDF2';
    hash: 'SHA-256';
    iterations: number;
    salt: string;
  };
  cipher: {
    name: 'AES-GCM';
    iv: string;
  };
  ciphertext: string;
}

export interface ContactsBackup {
  schemaVersion: 2;
  exportedAt: string;
  contacts: Contact[];
  organizations: Organization[];
  groups: Group[];
}

export type ContactSort = 'name' | 'newest' | 'oldest';
