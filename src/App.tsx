import { useCallback, useEffect, useState } from 'react';
import type { ChangeEvent } from 'react';
import { FaDownload, FaPlus, FaUpload } from 'react-icons/fa';
import { ContactForm } from './components/ContactForm';
import { ContactList } from './components/ContactList';
import { SearchBar } from './components/SearchBar';
import { db } from './db/database';
import type { Contact, ContactInput } from './types';
import './App.css';

function App() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showFavorites, setShowFavorites] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact>();
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  const loadContacts = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage('');

    try {
      const data = showFavorites
        ? await db.getFavorites()
        : searchQuery.trim()
          ? await db.searchContacts(searchQuery)
          : await db.getAllContacts();

      setContacts(data);
    } catch (error) {
      console.error('Ошибка загрузки контактов:', error);
      setErrorMessage('Не удалось открыть локальную базу контактов. Обновите страницу.');
    } finally {
      setIsLoading(false);
    }
  }, [searchQuery, showFavorites]);

  useEffect(() => {
    void loadContacts();
  }, [loadContacts]);

  const closeForm = () => {
    setShowForm(false);
    setEditingContact(undefined);
  };

  const handleAddContact = async (contactData: ContactInput) => {
    try {
      await db.addContact(contactData);
      closeForm();
      await loadContacts();
    } catch (error) {
      console.error('Ошибка добавления контакта:', error);
      window.alert('Не удалось добавить контакт.');
    }
  };

  const handleEditContact = async (contactData: ContactInput) => {
    if (!editingContact) return;

    try {
      await db.updateContact(editingContact.id, contactData);
      closeForm();
      await loadContacts();
    } catch (error) {
      console.error('Ошибка обновления контакта:', error);
      window.alert('Не удалось обновить контакт.');
    }
  };

  const handleDeleteContact = async (id: string) => {
    if (!window.confirm('Удалить этот контакт? Это действие нельзя отменить.')) return;

    try {
      await db.deleteContact(id);
      await loadContacts();
    } catch (error) {
      console.error('Ошибка удаления контакта:', error);
      window.alert('Не удалось удалить контакт.');
    }
  };

  const handleToggleFavorite = async (id: string) => {
    try {
      const contact = await db.contacts.get(id);
      if (!contact) return;

      await db.updateContact(id, { isFavorite: !contact.isFavorite });
      await loadContacts();
    } catch (error) {
      console.error('Ошибка изменения избранного:', error);
      window.alert('Не удалось изменить избранное.');
    }
  };

  const handleExport = async () => {
    try {
      const jsonData = await db.exportContacts();
      const blob = new Blob([jsonData], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');

      anchor.href = url;
      anchor.download = `contacts_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Ошибка экспорта:', error);
      window.alert('Не удалось экспортировать контакты.');
    }
  };

  const handleImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    try {
      const text = await file.text();
      const count = await db.importContacts(text);
      window.alert(`Импорт завершён. Обработано контактов: ${count}.`);
      await loadContacts();
    } catch (error) {
      console.error('Ошибка импорта:', error);
      const message = error instanceof Error ? error.message : 'Неизвестная ошибка';
      window.alert(`Не удалось импортировать файл: ${message}`);
    }
  };

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">Локально и без регистрации</p>
          <h1>Мой справочник контактов</h1>
          <p>Личные и рабочие контакты хранятся только в этом браузере.</p>
        </div>

        <div className="header-actions">
          <button type="button" className="header-button" onClick={handleExport}>
            <FaDownload aria-hidden="true" />
            Экспорт
          </button>
          <label className="header-button file-button">
            <FaUpload aria-hidden="true" />
            Импорт
            <input type="file" accept="application/json,.json" onChange={handleImport} />
          </label>
        </div>
      </header>

      <main className="main-content">
        <section className="toolbar" aria-label="Управление контактами">
          <SearchBar
            searchQuery={searchQuery}
            showFavorites={showFavorites}
            onSearchChange={setSearchQuery}
            onToggleFavorites={() => setShowFavorites((current) => !current)}
          />

          <div className="toolbar-footer">
            <p>
              Показано: <strong>{contacts.length}</strong>
            </p>
            <button
              type="button"
              className="primary-button add-contact-button"
              onClick={() => {
                setEditingContact(undefined);
                setShowForm(true);
              }}
            >
              <FaPlus aria-hidden="true" />
              Добавить контакт
            </button>
          </div>
        </section>

        {errorMessage && <div className="error-banner">{errorMessage}</div>}

        <ContactList
          contacts={contacts}
          isLoading={isLoading}
          onEdit={(contact) => {
            setEditingContact(contact);
            setShowForm(true);
          }}
          onDelete={(id) => void handleDeleteContact(id)}
          onToggleFavorite={(id) => void handleToggleFavorite(id)}
        />
      </main>

      {showForm && (
        <ContactForm
          contact={editingContact}
          onSave={editingContact ? handleEditContact : handleAddContact}
          onCancel={closeForm}
        />
      )}
    </div>
  );
}

export default App;
