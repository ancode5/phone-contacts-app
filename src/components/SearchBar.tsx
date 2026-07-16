import type { ChangeEvent } from 'react';
import { FaRegStar, FaSearch, FaStar, FaTimes } from 'react-icons/fa';

interface SearchBarProps {
  searchQuery: string;
  showFavorites: boolean;
  onSearchChange: (value: string) => void;
  onToggleFavorites: () => void;
}

export function SearchBar({
  searchQuery,
  showFavorites,
  onSearchChange,
  onToggleFavorites,
}: SearchBarProps) {
  return (
    <div className="search-panel">
      <label className="search-field">
        <FaSearch aria-hidden="true" />
        <span className="sr-only">Поиск контактов</span>
        <input
          type="search"
          value={searchQuery}
          onChange={(event: ChangeEvent<HTMLInputElement>) => onSearchChange(event.target.value)}
          placeholder="Поиск по имени, телефону, компании, тегам…"
        />
        {searchQuery && (
          <button
            type="button"
            className="icon-button clear-search"
            aria-label="Очистить поиск"
            onClick={() => onSearchChange('')}
          >
            <FaTimes aria-hidden="true" />
          </button>
        )}
      </label>

      <button
        type="button"
        className={`favorites-filter${showFavorites ? ' active' : ''}`}
        aria-pressed={showFavorites}
        onClick={onToggleFavorites}
      >
        {showFavorites ? <FaStar aria-hidden="true" /> : <FaRegStar aria-hidden="true" />}
        Избранное
      </button>
    </div>
  );
}
