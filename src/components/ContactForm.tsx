import { useEffect, useState } from 'react';
import type { ChangeEvent, FormEvent, MouseEvent as ReactMouseEvent } from 'react';
import { FaTimes } from 'react-icons/fa';
import type { Contact, ContactInput, Group, Organization } from '../types';

interface ContactFormProps {
  contact?: Contact;
  organizations: Organization[];
  groups: Group[];
  onSave: (contact: ContactInput) => Promise<void> | void;
  onCancel: () => void;
}

const emptyContact: ContactInput = {
  fullName: '',
  workPhone: '',
  personalPhone: '',
  workEmail: '',
  personalEmail: '',
  organizationId: '',
  department: '',
  position: '',
  notes: '',
  groupIds: [],
  isFavorite: false,
};

export function ContactForm({
  contact,
  organizations,
  groups,
  onSave,
  onCancel,
}: ContactFormProps) {
  const [formData, setFormData] = useState<ContactInput>(emptyContact);
  const [validationError, setValidationError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setFormData(
      contact
        ? {
            fullName: contact.fullName,
            workPhone: contact.workPhone,
            personalPhone: contact.personalPhone,
            workEmail: contact.workEmail,
            personalEmail: contact.personalEmail,
            organizationId: contact.organizationId,
            department: contact.department,
            position: contact.position,
            notes: contact.notes,
            groupIds: contact.groupIds ?? [],
            isFavorite: contact.isFavorite,
          }
        : emptyContact,
    );
    setValidationError('');
  }, [contact]);

  const updateField = <K extends keyof ContactInput>(key: K, value: ContactInput[K]) => {
    setFormData((current) => ({ ...current, [key]: value }));
  };

  const toggleGroup = (groupId: string) => {
    setFormData((current) => ({
      ...current,
      groupIds: current.groupIds.includes(groupId)
        ? current.groupIds.filter((id) => id !== groupId)
        : [...current.groupIds, groupId],
    }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const fullName = formData.fullName.trim();
    if (!fullName) {
      setValidationError('Введите ФИО контакта.');
      return;
    }

    setValidationError('');
    setIsSaving(true);
    try {
      await onSave({
        ...formData,
        fullName,
        workPhone: formData.workPhone.trim(),
        personalPhone: formData.personalPhone.trim(),
        workEmail: formData.workEmail.trim(),
        personalEmail: formData.personalEmail.trim(),
        department: formData.department.trim(),
        position: formData.position.trim(),
        notes: formData.notes.trim(),
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onCancel}>
      <section
        className="contact-modal large-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="contact-form-title"
        onMouseDown={(event: ReactMouseEvent<HTMLElement>) => event.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <p className="eyebrow">Карточка контакта</p>
            <h2 id="contact-form-title">{contact ? 'Редактировать контакт' : 'Новый контакт'}</h2>
          </div>
          <button type="button" className="icon-button" onClick={onCancel} aria-label="Закрыть">
            <FaTimes aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="contact-form">
          <label>
            ФИО <span aria-hidden="true">*</span>
            <input
              autoFocus
              required
              value={formData.fullName}
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                updateField('fullName', event.target.value)
              }
              placeholder="Иванов Иван Иванович"
            />
          </label>

          <div className="form-row">
            <label>
              Рабочий телефон
              <input
                type="tel"
                value={formData.workPhone}
                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                  updateField('workPhone', event.target.value)
                }
                placeholder="+7 831 000-00-00"
              />
            </label>
            <label>
              Личный телефон
              <input
                type="tel"
                value={formData.personalPhone}
                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                  updateField('personalPhone', event.target.value)
                }
                placeholder="+7 900 000-00-00"
              />
            </label>
          </div>

          <div className="form-row">
            <label>
              Рабочий email
              <input
                type="email"
                value={formData.workEmail}
                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                  updateField('workEmail', event.target.value)
                }
                placeholder="work@example.ru"
              />
            </label>
            <label>
              Личный email
              <input
                type="email"
                value={formData.personalEmail}
                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                  updateField('personalEmail', event.target.value)
                }
                placeholder="personal@example.ru"
              />
            </label>
          </div>

          <div className="form-row">
            <label>
              Место работы
              <select
                value={formData.organizationId}
                onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                  updateField('organizationId', event.target.value)
                }
              >
                <option value="">Не выбрано</option>
                {organizations.map((organization) => (
                  <option key={organization.id} value={organization.id}>
                    {organization.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Структурное подразделение
              <input
                value={formData.department}
                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                  updateField('department', event.target.value)
                }
                placeholder="Отделение, кафедра, отдел"
              />
            </label>
          </div>

          <label>
            Должность
            <input
              value={formData.position}
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                updateField('position', event.target.value)
              }
              placeholder="Должность контакта"
            />
          </label>

          <fieldset className="group-picker">
            <legend>Группы</legend>
            {groups.length === 0 ? (
              <p className="muted-text">Группы пока не созданы. Их можно добавить в справочниках.</p>
            ) : (
              <div className="group-checkboxes">
                {groups.map((group) => (
                  <label key={group.id} className="group-check">
                    <input
                      type="checkbox"
                      checked={formData.groupIds.includes(group.id)}
                      onChange={() => toggleGroup(group.id)}
                    />
                    <span className="group-dot" style={{ backgroundColor: group.color }} />
                    {group.name}
                  </label>
                ))}
              </div>
            )}
          </fieldset>

          <label>
            Заметки
            <textarea
              rows={5}
              value={formData.notes}
              onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
                updateField('notes', event.target.value)
              }
              placeholder="Любые дополнительные комментарии"
            />
          </label>

          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={formData.isFavorite}
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                updateField('isFavorite', event.target.checked)
              }
            />
            Добавить в избранное
          </label>

          {validationError && <p className="form-error">{validationError}</p>}

          <div className="form-actions">
            <button type="button" className="secondary-button" onClick={onCancel} disabled={isSaving}>
              Отмена
            </button>
            <button type="submit" className="primary-button" disabled={isSaving}>
              {isSaving ? 'Сохранение…' : 'Сохранить'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
