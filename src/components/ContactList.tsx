import {
  FaBuilding,
  FaEdit,
  FaEnvelope,
  FaPhone,
  FaRegStar,
  FaStickyNote,
  FaStar,
  FaTrash,
  FaUser,
} from 'react-icons/fa';
import type { Contact } from '../types';

interface ContactListProps {
  contacts: Contact[];
  isLoading: boolean;
  onEdit: (contact: Contact) => void;
  onDelete: (id: string) => void;
  onToggleFavorite: (id: string) => void;
}

export function ContactList({
  contacts,
  isLoading,
  onEdit,
  onDelete,
  onToggleFavorite,
}: ContactListProps) {
  if (isLoading) {
    return <div className="empty-state">Загрузка контактов…</div>;
  }

  if (contacts.length === 0) {
    return (
      <div className="empty-state">
        <FaUser aria-hidden="true" />
        <h2>Контакты не найдены</h2>
        <p>Добавьте первый контакт или измените параметры поиска.</p>
      </div>
    );
  }

  return (
    <div className="contacts-grid">
      {contacts.map((contact) => (
        <article key={contact.id} className="contact-card">
          <div className="contact-card-header">
            <div className="avatar" aria-hidden="true">
              {contact.name.charAt(0).toLocaleUpperCase('ru') || '?'}
            </div>
            <div className="contact-heading">
              <h2>{contact.name}</h2>
              {contact.company && <p>{contact.company}</p>}
            </div>
            <button
              type="button"
              className={`icon-button favorite-button${contact.isFavorite ? ' active' : ''}`}
              onClick={() => onToggleFavorite(contact.id)}
              aria-label={contact.isFavorite ? 'Убрать из избранного' : 'Добавить в избранное'}
              aria-pressed={contact.isFavorite}
            >
              {contact.isFavorite ? <FaStar aria-hidden="true" /> : <FaRegStar aria-hidden="true" />}
            </button>
          </div>

          <div className="contact-details">
            {contact.phone && (
              <a href={`tel:${contact.phone}`}>
                <FaPhone aria-hidden="true" />
                <span>{contact.phone}</span>
              </a>
            )}
            {contact.email && (
              <a href={`mailto:${contact.email}`}>
                <FaEnvelope aria-hidden="true" />
                <span>{contact.email}</span>
              </a>
            )}
            {contact.company && (
              <div>
                <FaBuilding aria-hidden="true" />
                <span>{contact.company}</span>
              </div>
            )}
            {contact.notes && (
              <div className="notes-row">
                <FaStickyNote aria-hidden="true" />
                <span>{contact.notes}</span>
              </div>
            )}
          </div>

          {(contact.tags?.length ?? 0) > 0 && (
            <div className="tags" aria-label="Теги">
              {contact.tags.map((tag) => (
                <span key={tag}>{tag}</span>
              ))}
            </div>
          )}

          <div className="card-actions">
            <button type="button" className="secondary-button" onClick={() => onEdit(contact)}>
              <FaEdit aria-hidden="true" />
              Изменить
            </button>
            <button
              type="button"
              className="danger-button"
              onClick={() => onDelete(contact.id)}
            >
              <FaTrash aria-hidden="true" />
              Удалить
            </button>
          </div>
        </article>
      ))}
    </div>
  );
}
