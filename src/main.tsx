import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Не найден элемент #root');

// В режиме разработки удаляем старый service worker и только кэши приложения.
// IndexedDB с локальными контактами при этом не очищается.
if ('serviceWorker' in navigator && import.meta.env.DEV) {
  void navigator.serviceWorker
    .getRegistrations()
    .then((registrations) => Promise.all(registrations.map((registration) => registration.unregister())))
    .catch((error: unknown) => console.warn('Не удалось отключить старый service worker:', error));

  if ('caches' in window) {
    void caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith('contacts-app-')).map((key) => caches.delete(key))))
      .catch((error: unknown) => console.warn('Не удалось очистить кэш приложения:', error));
  }
}

// Без StrictMode: в режиме разработки он намеренно запускает эффекты дважды,
// что может создавать две параллельные синхронизации.
createRoot(rootElement).render(<App />);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch((error: unknown) => {
      console.error('Не удалось зарегистрировать service worker:', error);
    });
  });
}
