import { useEffect, useState } from 'react';
import type { ChangeEvent, FormEvent, MouseEvent as ReactMouseEvent } from 'react';
import { FaTimes } from 'react-icons/fa';
import type { Contact, ContactInput } from '../types';

interface ContactFormProps {
  contact?: Contact;
  onSave: (contact: ContactInput) => Promise<void> | void;
  onCancel: () => void;
}

const emptyContact: ContactInput = {
  name: '',
  phone: '',
  email: '',
  company: '',
  notes: '',
  tags: [],
  isFavorite: false,
};

export function ContactForm({ contact, onSave, onCancel }: ContactFormProps) {
  const [formData, setFormData] = useState<ContactInput>(emptyContact);
  const [tagsText, setTagsText] = useState('');
  const [validationError, setValidationError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const nextData: ContactInput = contact
      ? {
          name: contact.name,
          phone: contact.phone,
          email: contact.email,
          company: contact.company,
          notes: contact.notes,
          tags: contact.tags ?? [],
          isFavorite: contact.isFavorite,
        }
      : emptyContact;

    setFormData(nextData);
    setTagsText(nextData.tags.join(', '));
    setValidationError('');
  }, [contact]);

  const updateField = <K extends keyof ContactInput>(key: K, value: ContactInput[K]) => {
    setFormData((current) => ({ ...current, [key]: value }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const name = formData.name.trim();
    const phone = formData.phone.trim();
    const email = formData.email.trim();

    if (!name) {
      setValidationError('Введите имя контакта.');
      return;
    }

    if (!phone && !email) {
      setValidationError('Укажите хотя бы телефон или email.');
      return;
    }

    const tags = [...new Set(tagsText.split(',').map((tag) => tag.trim()).filter(Boolean))];

    setValidationError('');
    setIsSaving(true);

    try {
      await onSave({
        ...formData,
        name,
        phone,
        email,
        company: formData.company.trim(),
        notes: formData.notes.trim(),
        tags,
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onCancel}>
      <section
        className="contact-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="contact-form-title"
        onMouseDown={(event: ReactMouseEvent<HTMLElement>) => event.stopPropagation()}
      >
        <div className="modal-header">
          <h2 id="contact-form-title">{contact ? 'Редактировать контакт' : 'Новый контакт'}</h2>
          <button type="button" className="icon-button" onClick={onCancel} aria-label="Закрыть">
            <FaTimes aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="contact-form">
          <label>
            Имя <span aria-hidden="true">*</span>
            <input
              autoFocus
              required
              value={formData.name}
              onChange={(event: ChangeEvent<HTMLInputElement>) => updateField('name', event.target.value)}
              placeholder="Анна Смирнова"
            />
          </label>

          <div className="form-row">
            <label>
              Телефон
              <input
                type="tel"
                value={formData.phone}
                onChange={(event: ChangeEvent<HTMLInputElement>) => updateField('phone', event.target.value)}
                placeholder="+31 6 1234 5678"
              />
            </label>

            <label>
              Email
              <input
                type="email"
                value={formData.email}
                onChange={(event: ChangeEvent<HTMLInputElement>) => updateField('email', event.target.value)}
                placeholder="anna@example.com"
              />
            </label>
          </div>

          <label>
            Компания
            <input
              value={formData.company}
              onChange={(event: ChangeEvent<HTMLInputElement>) => updateField('company', event.target.value)}
              placeholder="Название компании"
            />
          </label>

          <label>
            Теги
            <input
              value={tagsText}
              onChange={(event: ChangeEvent<HTMLInputElement>) => setTagsText(event.target.value)}
              placeholder="работа, клиент, семья"
            />
            <small>Разделяйте теги запятыми.</small>
          </label>

          <label>
            Заметки
            <textarea
              rows={4}
              value={formData.notes}
              onChange={(event: ChangeEvent<HTMLTextAreaElement>) => updateField('notes', event.target.value)}
              placeholder="Дополнительная информация о контакте"
            />
          </label>

          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={formData.isFavorite}
              onChange={(event: ChangeEvent<HTMLInputElement>) => updateField('isFavorite', event.target.checked)}
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
