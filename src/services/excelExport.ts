import type { Contact, Group, Organization } from '../types';

function csvCell(value: string | number | boolean): string {
  const text = String(value).replace(/\r?\n/g, ' ').trim();
  return `"${text.replace(/"/g, '""')}"`;
}

function formatDate(value: number): string {
  return new Intl.DateTimeFormat('ru-RU', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(value);
}

export function exportContactsToExcel(
  contacts: Contact[],
  organizations: Organization[],
  groups: Group[],
): void {
  const organizationsById = new Map(organizations.map((item) => [item.id, item.name]));
  const groupsById = new Map(groups.map((item) => [item.id, item.name]));

  const header = [
    'ФИО',
    'Рабочий телефон',
    'Личный телефон',
    'Рабочий email',
    'Личный email',
    'Место работы',
    'Структурное подразделение',
    'Должность',
    'Группы',
    'Заметки',
    'Избранное',
    'Дата создания',
    'Дата изменения',
  ];

  const rows = contacts
    .filter((contact) => contact.deletedAt === null)
    .sort((left, right) => left.fullName.localeCompare(right.fullName, 'ru', { sensitivity: 'base' }))
    .map((contact) => [
      contact.fullName,
      contact.workPhone,
      contact.personalPhone,
      contact.workEmail,
      contact.personalEmail,
      organizationsById.get(contact.organizationId) ?? '',
      contact.department,
      contact.position,
      contact.groupIds.map((id) => groupsById.get(id)).filter(Boolean).join(', '),
      contact.notes,
      contact.isFavorite ? 'Да' : 'Нет',
      formatDate(contact.createdAt),
      formatDate(contact.updatedAt),
    ]);

  // CSV с разделителем «;» корректно открывается в русской версии Excel.
  const content = [
    'sep=;',
    header.map(csvCell).join(';'),
    ...rows.map((row) => row.map(csvCell).join(';')),
  ].join('\r\n');

  const blob = new Blob([`\uFEFF${content}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `contacts_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
