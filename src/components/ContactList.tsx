import {
  FaBriefcase,
  FaEdit,
  FaEnvelope,
  FaPhone,
  FaRegStar,
  FaStickyNote,
  FaStar,
  FaTrash,
  FaUndo,
  FaUser,
} from 'react-icons/fa';
import type { Contact, Group, Organization } from '../types';

interface ContactListProps {
  contacts: Contact[];
  organizations: Organization[];
  groups: Group[];
  isLoading: boolean;
  isTrashView?: boolean;
  onEdit: (contact: Contact) => void;
  onDelete: (id: string) => void;
  onRestore?: (id: string) => void;
  onToggleFavorite: (id: string) => void;
}

export function ContactList({
  contacts,
  organizations,
  groups,
  isLoading,
  isTrashView = false,
  onEdit,
  onDelete,
  onRestore,
  onToggleFavorite,
}: ContactListProps) {
  const organizationsById = new Map(organizations.map((item) => [item.id, item]));
  const groupsById = new Map(groups.map((item) => [item.id, item]));

  if (isLoading) return <div className="empty-state">Загрузка контактов…</div>;

  if (contacts.length === 0) {
    return (
      <div className="empty-state">
        <FaUser aria-hidden="true" />
        <h2>{isTrashView ? 'Корзина пуста' : 'Контакты не найдены'}</h2>
        <p>
          {isTrashView
            ? 'Удалённые контакты будут храниться здесь 90 дней.'
            : 'Добавьте первый контакт или измените параметры поиска.'}
        </p>
      </div>
    );
  }

  return (
    <div className="contacts-grid">
      {contacts.map((contact) => {
        const organization = organizationsById.get(contact.organizationId);
        const contactGroups = contact.groupIds
          .map((id) => groupsById.get(id))
          .filter((group): group is Group => Boolean(group));

        return (
          <article key={contact.id} className="contact-card">
            <div className="contact-card-header">
              <div className="avatar" aria-hidden="true">
                {contact.fullName.charAt(0).toLocaleUpperCase('ru') || '?'}
              </div>
              <div className="contact-heading">
                <h2>{contact.fullName}</h2>
                {contact.position && <p>{contact.position}</p>}
              </div>
              {!isTrashView && (
                <button
                  type="button"
                  className={`icon-button favorite-button${contact.isFavorite ? ' active' : ''}`}
                  onClick={() => onToggleFavorite(contact.id)}
                  aria-label={contact.isFavorite ? 'Убрать из избранного' : 'Добавить в избранное'}
                  aria-pressed={contact.isFavorite}
                >
                  {contact.isFavorite ? <FaStar aria-hidden="true" /> : <FaRegStar aria-hidden="true" />}
                </button>
              )}
            </div>

            <div className="contact-details">
              {contact.workPhone && (
                <a href={`tel:${contact.workPhone}`}>
                  <FaPhone aria-hidden="true" />
                  <span><small>раб.</small> {contact.workPhone}</span>
                </a>
              )}
              {contact.personalPhone && (
                <a href={`tel:${contact.personalPhone}`}>
                  <FaPhone aria-hidden="true" />
                  <span><small>лич.</small> {contact.personalPhone}</span>
                </a>
              )}
              {contact.workEmail && (
                <a href={`mailto:${contact.workEmail}`}>
                  <FaEnvelope aria-hidden="true" />
                  <span>{contact.workEmail}</span>
                </a>
              )}
              {contact.personalEmail && (
                <a href={`mailto:${contact.personalEmail}`}>
                  <FaEnvelope aria-hidden="true" />
                  <span>{contact.personalEmail}</span>
                </a>
              )}
              {(organization || contact.department) && (
                <div>
                  <FaBriefcase aria-hidden="true" />
                  <span>
                    {organization?.name}
                    {organization && contact.department ? ' · ' : ''}
                    {contact.department}
                  </span>
                </div>
              )}
              {contact.notes && (
                <div className="notes-row">
                  <FaStickyNote aria-hidden="true" />
                  <span>{contact.notes}</span>
                </div>
              )}
            </div>

            {contactGroups.length > 0 && (
              <div className="tags" aria-label="Группы">
                {contactGroups.map((group) => (
                  <span key={group.id} style={{ borderColor: group.color }}>
                    <i style={{ backgroundColor: group.color }} />
                    {group.name}
                  </span>
                ))}
              </div>
            )}

            <p className="contact-date">
              {isTrashView && contact.deletedAt
                ? `Удалён: ${new Date(contact.deletedAt).toLocaleDateString('ru-RU')}`
                : `Изменён: ${new Date(contact.updatedAt).toLocaleDateString('ru-RU')}`}
            </p>

            <div className="card-actions">
              {isTrashView ? (
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => onRestore?.(contact.id)}
                >
                  <FaUndo aria-hidden="true" />
                  Восстановить
                </button>
              ) : (
                <button type="button" className="secondary-button" onClick={() => onEdit(contact)}>
                  <FaEdit aria-hidden="true" />
                  Изменить
                </button>
              )}
              <button type="button" className="danger-button" onClick={() => onDelete(contact.id)}>
                <FaTrash aria-hidden="true" />
                {isTrashView ? 'Скрыть из корзины' : 'В корзину'}
              </button>
            </div>
          </article>
        );
      })}
    </div>
  );
}
