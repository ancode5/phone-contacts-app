import { useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { FaGithub } from 'react-icons/fa';
import {
  saveGitHubStorageConfig,
  validateGitHubStorage,
} from '../services/githubStorage';
import type { GitHubStorageConfig } from '../services/githubStorage';

interface GitHubStorageGateProps {
  onConnected: (config: GitHubStorageConfig) => void;
  onBack: () => void;
}

export function GitHubStorageGate({ onConnected, onBack }: GitHubStorageGateProps) {
  const [owner, setOwner] = useState('ancode5');
  const [repo, setRepo] = useState('phone-contacts-data');
  const [branch, setBranch] = useState('main');
  const [token, setToken] = useState('');
  const [remember, setRemember] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage('');
    setIsBusy(true);
    try {
      const candidate: GitHubStorageConfig = { owner, repo, branch, token };
      await validateGitHubStorage(candidate);
      const saved = saveGitHubStorageConfig(candidate, remember);
      onConnected(saved);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <main className="gate-page">
      <section className="gate-card">
        <div className="gate-icon"><FaGithub aria-hidden="true" /></div>
        <p className="eyebrow">Приватное хранилище</p>
        <h1>Подключить базу GitHub</h1>
        <p>
          Укажите приватный репозиторий и ограниченный токен. Токен не добавляется
          в код и отправляется только в GitHub API.
        </p>

        <form onSubmit={submit} style={{ display: 'grid', gap: '12px' }}>
          <label>
            Владелец репозитория
            <input value={owner} onChange={(event: ChangeEvent<HTMLInputElement>) => setOwner(event.target.value)} required />
          </label>
          <label>
            Приватный репозиторий
            <input value={repo} onChange={(event: ChangeEvent<HTMLInputElement>) => setRepo(event.target.value)} required />
          </label>
          <label>
            Ветка
            <input value={branch} onChange={(event: ChangeEvent<HTMLInputElement>) => setBranch(event.target.value)} required />
          </label>
          <label>
            Fine-grained token
            <input
              type="password"
              value={token}
              onChange={(event: ChangeEvent<HTMLInputElement>) => setToken(event.target.value)}
              autoComplete="off"
              required
            />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <input
              type="checkbox"
              checked={remember}
              onChange={(event: ChangeEvent<HTMLInputElement>) => setRemember(event.target.checked)}
              style={{ width: 'auto' }}
            />
            Запомнить токен на этом устройстве
          </label>
          {errorMessage && <div className="error-box">{errorMessage}</div>}
          <button type="submit" className="primary-button" disabled={isBusy}>
            {isBusy ? 'Проверяем доступ…' : 'Подключить хранилище'}
          </button>
          <button type="button" className="link-button" onClick={onBack}>
            Выйти из Яндекс-аккаунта
          </button>
        </form>
      </section>
    </main>
  );
}
