import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { createPortal } from 'react-dom';
import { FaFileImport } from 'react-icons/fa';
import { db } from '../db/database';

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function JsonImportButton() {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const findTarget = () => {
      setTarget(document.querySelector<HTMLElement>('.header-actions'));
    };

    findTarget();
    const observer = new MutationObserver(findTarget);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    try {
      const count = await db.importContacts(await file.text());
      window.alert(
        `Импортировано контактов: ${count}. Изменения сохранены локально и сейчас будут синхронизированы с облачной базой.`,
      );

      // ContactsApp уже умеет синхронизироваться при visibilitychange. Искусственно
      // отправляем это событие, чтобы не ждать следующего фонового интервала.
      document.dispatchEvent(new Event('visibilitychange'));
    } catch (error) {
      window.alert(`Не удалось импортировать JSON: ${describeError(error)}`);
    } finally {
      setIsImporting(false);
      event.target.value = '';
    }
  };

  if (!target) return null;

  return createPortal(
    <>
      <input
        ref={inputRef}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={(event) => void handleFile(event)}
      />
      <button
        type="button"
        className="header-button"
        onClick={() => inputRef.current?.click()}
        disabled={isImporting}
      >
        <FaFileImport aria-hidden="true" />
        {isImporting ? 'Импорт…' : 'Импорт JSON'}
      </button>
    </>,
    target,
  );
}
