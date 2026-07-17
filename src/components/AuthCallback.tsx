import { useEffect, useState } from 'react';
import {
  consumeAuthorizationReturnPath,
  finishYandexAuthorization,
  getAppUrl,
} from '../auth/yandexOAuth';

export function AuthCallback() {
  const [message, setMessage] = useState('Завершаем вход через Яндекс…');
  const [error, setError] = useState(false);

  useEffect(() => {
    void finishYandexAuthorization(window.location.search)
      .then(() => {
        const returnPath = consumeAuthorizationReturnPath();
        setMessage('Вход выполнен. Открываем справочник…');
        window.setTimeout(() => window.location.replace(getAppUrl(returnPath)), 500);
      })
      .catch((reason: unknown) => {
        setError(true);
        setMessage(reason instanceof Error ? reason.message : String(reason));
      });
  }, []);

  return (
    <main className="gate-page">
      <section className="gate-card">
        <p className="eyebrow">Яндекс ID</p>
        <h1>{error ? 'Не удалось войти' : 'Авторизация'}</h1>
        <p className={error ? 'form-error' : ''}>{message}</p>
        {error && (
          <a className="primary-button link-button" href={getAppUrl('/')}>
            Вернуться к входу
          </a>
        )}
      </section>
    </main>
  );
}
