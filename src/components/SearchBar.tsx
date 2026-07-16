import type { ChangeEvent } from 'react';
import { FaRegStar, FaSearch, FaStar, FaTimes } from 'react-icons/fa';
import type { ContactSort, Group, Organization } from '../types';

interface SearchBarProps {
  searchQuery: string;
  showFavorites: boolean;
  organizationId: string;
  department: string;
  groupId: string;
  sort: ContactSort;
  organizations: Organization[];
  groups: Group[];
  onSearchChange: (value: string) => void;
  onToggleFavorites: () => void;
  onOrganizationChange: (value: string) => void;
  onDepartmentChange: (value: string) => void;
  onGroupChange: (value: string) => void;
  onSortChange: (value: ContactSort) => void;
  onClear: () => void;
}

export function SearchBar({
  searchQuery,
  showFavorites,
  organizationId,
  department,
  groupId,
  sort,
  organizations,
  groups,
  onSearchChange,
  onToggleFavorites,
  onOrganizationChange,
  onDepartmentChange,
  onGroupChange,
  onSortChange,
  onClear,
}: SearchBarProps) {
  const hasFilters = Boolean(
    searchQuery || showFavorites || organizationId || department || groupId || sort !== 'name',
  );

  return (
    <div className="search-panel">
      <div className="search-row">
        <label className="search-box">
          <FaSearch aria-hidden="true" />
          <input
            value={searchQuery}
            onChange={(event: ChangeEvent<HTMLInputElement>) => onSearchChange(event.target.value)}
            placeholder="ФИО, телефон, email, организация, должность, заметки…"
          />
        </label>
        <button
          type="button"
          className={`favorite-filter${showFavorites ? ' active' : ''}`}
          onClick={onToggleFavorites}
          aria-pressed={showFavorites}
        >
          {showFavorites ? <FaStar aria-hidden="true" /> : <FaRegStar aria-hidden="true" />}
          Избранное
        </button>
      </div>

      <div className="filters-row">
        <label>
          <span>Место работы</span>
          <select value={organizationId} onChange={(event: ChangeEvent<HTMLSelectElement>) => onOrganizationChange(event.target.value)}>
            <option value="">Все организации</option>
            {organizations.map((organization) => (
              <option key={organization.id} value={organization.id}>{organization.name}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Подразделение</span>
          <input
            value={department}
            onChange={(event: ChangeEvent<HTMLInputElement>) => onDepartmentChange(event.target.value)}
            placeholder="Любая часть названия"
          />
        </label>
        <label>
          <span>Группа</span>
          <select value={groupId} onChange={(event: ChangeEvent<HTMLSelectElement>) => onGroupChange(event.target.value)}>
            <option value="">Все группы</option>
            {groups.map((group) => (
              <option key={group.id} value={group.id}>{group.name}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Сортировка</span>
          <select value={sort} onChange={(event: ChangeEvent<HTMLSelectElement>) => onSortChange(event.target.value as ContactSort)}>
            <option value="name">По ФИО</option>
            <option value="newest">Сначала новые</option>
            <option value="oldest">Сначала ранние</option>
          </select>
        </label>
        {hasFilters && (
          <button type="button" className="clear-filters" onClick={onClear}>
            <FaTimes aria-hidden="true" />
            Сбросить
          </button>
        )}
      </div>
    </div>
  );
}
