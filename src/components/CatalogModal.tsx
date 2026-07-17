import { useState } from 'react';
import type { ChangeEvent, FormEvent, MouseEvent as ReactMouseEvent } from 'react';
import { FaEdit, FaPlus, FaTimes, FaTrash } from 'react-icons/fa';
import type { Group, Organization } from '../types';

interface CatalogModalProps {
  organizations: Organization[];
  groups: Group[];
  onAddOrganization: (name: string) => Promise<void>;
  onRenameOrganization: (id: string, name: string) => Promise<void>;
  onDeleteOrganization: (id: string) => Promise<void>;
  onAddGroup: (name: string, color: string) => Promise<void>;
  onRenameGroup: (id: string, name: string, color: string) => Promise<void>;
  onDeleteGroup: (id: string) => Promise<void>;
  onClose: () => void;
}

export function CatalogModal({
  organizations,
  groups,
  onAddOrganization,
  onRenameOrganization,
  onDeleteOrganization,
  onAddGroup,
  onRenameGroup,
  onDeleteGroup,
  onClose,
}: CatalogModalProps) {
  const [organizationName, setOrganizationName] = useState('');
  const [groupName, setGroupName] = useState('');
  const [groupColor, setGroupColor] = useState('#2f855a');
  const [isBusy, setIsBusy] = useState(false);

  const run = async (action: () => Promise<void>) => {
    setIsBusy(true);
    try {
      await action();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : String(error));
    } finally {
      setIsBusy(false);
    }
  };

  const submitOrganization = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = organizationName.trim();
    if (!value) return;
    void run(async () => {
      await onAddOrganization(value);
      setOrganizationName('');
    });
  };

  const submitGroup = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = groupName.trim();
    if (!value) return;
    void run(async () => {
      await onAddGroup(value, groupColor);
      setGroupName('');
    });
  };

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="contact-modal large-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="catalog-title"
        onMouseDown={(event: ReactMouseEvent<HTMLElement>) => event.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <p className="eyebrow">Настройки базы</p>
            <h2 id="catalog-title">Организации и группы</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Закрыть">
            <FaTimes aria-hidden="true" />
          </button>
        </div>

        <div className="catalog-columns">
          <section>
            <h3>Места работы</h3>
            <p className="muted-text">Обычный список названий для выбора и фильтрации.</p>
            <form className="inline-create" onSubmit={submitOrganization}>
              <input
                value={organizationName}
                onChange={(event: ChangeEvent<HTMLInputElement>) => setOrganizationName(event.target.value)}
                placeholder="Новая организация"
              />
              <button type="submit" className="primary-button" disabled={isBusy}>
                <FaPlus aria-hidden="true" />
                Добавить
              </button>
            </form>
            <div className="catalog-list">
              {organizations.map((organization) => (
                <div key={organization.id} className="catalog-item">
                  <span>{organization.name}</span>
                  <div>
                    <button
                      type="button"
                      className="icon-button"
                      aria-label="Переименовать"
                      onClick={() => {
                        const next = window.prompt('Новое название организации', organization.name);
                        if (next?.trim()) void run(() => onRenameOrganization(organization.id, next));
                      }}
                    >
                      <FaEdit aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className="icon-button danger-icon"
                      aria-label="Удалить"
                      onClick={() => {
                        if (window.confirm(`Удалить организацию «${organization.name}» из списка?`)) {
                          void run(() => onDeleteOrganization(organization.id));
                        }
                      }}
                    >
                      <FaTrash aria-hidden="true" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h3>Группы</h3>
            <p className="muted-text">Один контакт может одновременно входить в несколько групп.</p>
            <form className="inline-create group-create" onSubmit={submitGroup}>
              <input
                type="color"
                value={groupColor}
                onChange={(event: ChangeEvent<HTMLInputElement>) => setGroupColor(event.target.value)}
                aria-label="Цвет группы"
              />
              <input
                value={groupName}
                onChange={(event: ChangeEvent<HTMLInputElement>) => setGroupName(event.target.value)}
                placeholder="Новая группа"
              />
              <button type="submit" className="primary-button" disabled={isBusy}>
                <FaPlus aria-hidden="true" />
                Добавить
              </button>
            </form>
            <div className="catalog-list">
              {groups.length === 0 && <p className="muted-text">Групп пока нет.</p>}
              {groups.map((group) => (
                <div key={group.id} className="catalog-item">
                  <span><i className="group-dot" style={{ backgroundColor: group.color }} />{group.name}</span>
                  <div>
                    <button
                      type="button"
                      className="icon-button"
                      aria-label="Изменить"
                      onClick={() => {
                        const next = window.prompt('Новое название группы', group.name);
                        if (next?.trim()) void run(() => onRenameGroup(group.id, next, group.color));
                      }}
                    >
                      <FaEdit aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className="icon-button danger-icon"
                      aria-label="Удалить"
                      onClick={() => {
                        if (window.confirm(`Удалить группу «${group.name}»?`)) {
                          void run(() => onDeleteGroup(group.id));
                        }
                      }}
                    >
                      <FaTrash aria-hidden="true" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </section>
    </div>
  );
}
