import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Не найден элемент #root');

// Без StrictMode: в режиме разработки он намеренно запускает эффекты дважды,
// что создавало две параллельные синхронизации с Яндекс Диском.
createRoot(rootElement).render(<App />);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch((error: unknown) => {
      console.error('Не удалось зарегистрировать service worker:', error);
    });
  });
}
