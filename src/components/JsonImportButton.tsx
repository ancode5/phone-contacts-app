import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { createPortal } from 'react-dom';
import { FaFileImport } from 'react-icons/fa';
import { db } from '../db/database';
import type { ContactInput } from '../types';

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function sameName(left: string, right: string): boolean {
  return left.localeCompare(right, 'ru', { sensitivity: 'base' }) === 0;
}

interface ImportContact {
  id?: string;
  fullName?: string;
  name?: string;
  workPhone?: string;
  phone?: string;
  personalPhone?: string;
  workEmail?: string;
  email?: string;
  personalEmail?: string;
  organizationId?: string;
  department?: string;
  position?: string;
  notes?: string;
  groupIds?: string[];
  isFavorite?: boolean;
}

interface ImportNamedEntity {
  id?: string;
  name?: string;
}

interface ImportPayload {
  contacts?: ImportContact[];
  organizations?: ImportNamedEntity[];
  groups?: ImportNamedEntity[];
}

async function importJson(raw: string): Promise<{ imported: number; updated: number }> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new Error('Файл не является корректным JSON.');
  }

  const payload: ImportPayload = Array.isArray(parsed) ? { contacts: parsed as ImportContact[] } : parsed as ImportPayload;
  if (!Array.isArray(payload.contacts)) throw new Error('В файле не найден массив contacts.');

  const sourceOrganizations = new Map(
    (payload.organizations ?? [])
      .map((item) => [text(item.id), text(item.name)] as const)
      .filter(([id, name]) => id && name),
  );
  const sourceGroups = new Map(
    (payload.groups ?? [])
      .map((item) => [text(item.id), text(item.name)] as const)
      .filter(([id, name]) => id && name),
  );

  const existingOrganizations = await db.getOrganizations();
  const organizationIdsBySource = new Map<string, string>();
  for (const [sourceId, name] of sourceOrganizations) {
    let organization = existingOrganizations.find((item) => sameName(item.name, name));
    if (!organization) {
      const id = await db.addOrganization(name);
      organization = await db.organizations.get(id);
      if (organization) existingOrganizations.push(organization);
    }
    if (organization) organizationIdsBySource.set(sourceId, organization.id);
  }

  const existingGroups = await db.getGroups();
  const groupIdsBySource = new Map<string, string>();
  for (const [sourceId, name] of sourceGroups) {
    let group = existingGroups.find((item) => sameName(item.name, name));
    if (!group) {
      const id = await db.addGroup(name, '#2f855a');
      group = await db.groups.get(id);
      if (group) existingGroups.push(group);
    }
    if (group) groupIdsBySource.set(sourceId, group.id);
  }

  const existingContacts = await db.getAllContacts(true);
  let imported = 0;
  let updated = 0;

  for (const source of payload.contacts) {
    const fullName = text(source.fullName) || text(source.name);
    if (!fullName) throw new Error('У одного из контактов отсутствует ФИО.');

    const workPhone = text(source.workPhone) || text(source.phone);
    const groupIds = Array.isArray(source.groupIds)
      ? source.groupIds.map((id) => groupIdsBySource.get(text(id))).filter((id): id is string => Boolean(id))
      : [];

    const input: ContactInput = {
      fullName,
      workPhone,
      personalPhone: text(source.personalPhone),
      workEmail: text(source.workEmail) || text(source.email),
      personalEmail: text(source.personalEmail),
      organizationId: organizationIdsBySource.get(text(source.organizationId)) ?? '',
      department: text(source.department),
      position: text(source.position),
      notes: text(source.notes),
      groupIds,
      isFavorite: source.isFavorite === true,
    };

    const existing = existingContacts.find(
      (item) => sameName(item.fullName, fullName) && item.workPhone === workPhone,
    );

    if (existing) {
      await db.updateContact(existing.id, input);
      updated += 1;
    } else {
      const id = await db.addContact(input);
      const created = await db.contacts.get(id);
      if (created) existingContacts.push(created);
      imported += 1;
    }
  }

  return { imported, updated };
}

export function JsonImportButton() {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const findTarget = () => {
      setTarget(document.querySelector<HTMLElement>('.header-actions'));
    };

    findTarget();
    const observer = new MutationObserver(findTarget);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    try {
      const result = await importJson(await file.text());
      window.alert(
        `Импорт завершён. Новых контактов: ${result.imported}, обновлено: ${result.updated}. Изменения будут синхронизированы с облачной базой.`,
      );

      document.dispatchEvent(new Event('visibilitychange'));
    } catch (error) {
      window.alert(`Не удалось импортировать JSON: ${describeError(error)}`);
    } finally {
      setIsImporting(false);
      event.target.value = '';
    }
  };

  if (!target) return null;

  return createPortal(
    <>
      <input
        ref={inputRef}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={(event) => void handleFile(event)}
      />
      <button
        type="button"
        className="header-button"
        onClick={() => inputRef.current?.click()}
        disabled={isImporting}
      >
        <FaFileImport aria-hidden="true" />
        {isImporting ? 'Импорт…' : 'Импорт JSON'}
      </button>
    </>,
    target,
  );
}
