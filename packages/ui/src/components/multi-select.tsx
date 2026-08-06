import { useId, useMemo, useRef, useState, type FC, type KeyboardEvent } from 'react';
import { X } from 'lucide-react';
import { cn } from '../lib/utils';

export type MultiSelectOption = {
  value: string;
  label: string;
};

export type MultiSelectProps = {
  options: MultiSelectOption[];
  /** Selected values (controlled). */
  selected: string[];
  onChange: (values: string[]) => void;
  /** Filter input text. */
  placeholder?: string;
  /** ARIA placeholder for the input. */
  searchPlaceholder?: string;
  /** Message shown when no option matches the filter. */
  emptyLabel?: string;
  disabled?: boolean;
  /** Values hidden from the options (e.g. primary ∉ additional invariant). */
  excludeValues?: string[];
};

/**
 * Hand-rolled searchable MultiSelect with zero new dependencies (D31).
 * Filter-as-you-type, removable chips with ×, absolutely-positioned dropdown
 * INSIDE the control (not teleported — must stack correctly inside z-50
 * modals), and full keyboard navigation (↑/↓, Enter, Escape) with ARIA.
 */
export const MultiSelect: FC<MultiSelectProps> = ({
  options,
  selected,
  onChange,
  placeholder = 'Buscar...',
  searchPlaceholder,
  emptyLabel = 'Sin coincidencias',
  disabled = false,
  excludeValues = [],
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(-1);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listboxId = useId();

  /** Remaining options: not selected, not excluded, and matching the filter. */
  const visibleOptions = useMemo(() => {
    const excluded = new Set(excludeValues);
    const selectedSet = new Set(selected);
    const needle = query.trim().toLowerCase();
    return options.filter(
      (option) =>
        !selectedSet.has(option.value) &&
        !excluded.has(option.value) &&
        (needle === '' || option.label.toLowerCase().includes(needle)),
    );
  }, [options, selected, excludeValues, query]);

  const optionId = (value: string) => `${listboxId}-option-${value}`;

  const toggle = (value: string) => {
    if (disabled) return;
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);
  };

  const closeDropdown = () => {
    setOpen(false);
    setActiveIndex(-1);
    inputRef.current?.focus();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (disabled) return;
    switch (event.key) {
      case 'ArrowDown': {
        event.preventDefault();
        if (!open) {
          setOpen(true);
          setActiveIndex(visibleOptions.length > 0 ? 0 : -1);
        } else {
          setActiveIndex((i) =>
            visibleOptions.length === 0 ? -1 : i >= visibleOptions.length - 1 ? 0 : i + 1,
          );
        }
        break;
      }
      case 'ArrowUp': {
        event.preventDefault();
        if (!open) {
          setOpen(true);
          setActiveIndex(visibleOptions.length > 0 ? visibleOptions.length - 1 : -1);
        } else {
          setActiveIndex((i) =>
            visibleOptions.length === 0 ? -1 : i <= 0 ? visibleOptions.length - 1 : i - 1,
          );
        }
        break;
      }
      case 'Enter': {
        event.preventDefault();
        if (!open) {
          setOpen(true);
        } else if (activeIndex >= 0 && activeIndex < visibleOptions.length) {
          // Toggle the highlighted option; it leaves the visible list, so the
          // index is clamped (the toggled option was visible => not selected
          // => always removed from the list).
          toggle(visibleOptions[activeIndex].value);
          setActiveIndex(Math.min(activeIndex, visibleOptions.length - 2));
        }
        break;
      }
      case 'Escape': {
        closeDropdown();
        break;
      }
    }
  };

  return (
    <div
      ref={containerRef}
      role="combobox"
      aria-expanded={open}
      aria-controls={listboxId}
      aria-haspopup="listbox"
      aria-disabled={disabled}
      className="relative w-full"
    >
      {/* Chips + filter input */}
      <div className="flex flex-wrap items-center gap-1 rounded-md border border-gray-300 bg-white px-2 py-1.5 focus-within:ring-2 focus-within:ring-blue-600 focus-within:ring-offset-2">
        {selected.map((value) => {
          const label = options.find((option) => option.value === value)?.label ?? value;
          return (
            <span
              key={value}
              className="inline-flex items-center whitespace-nowrap rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs text-blue-700"
            >
              {label}
              <button
                type="button"
                aria-label={`Eliminar ${label}`}
                disabled={disabled}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => toggle(value)}
                className="ml-1 rounded-full p-0.5 text-blue-400 hover:bg-blue-200 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <X size={12} aria-hidden="true" />
              </button>
            </span>
          );
        })}
        <input
          ref={inputRef}
          value={query}
          disabled={disabled}
          placeholder={placeholder}
          aria-placeholder={searchPlaceholder}
          aria-autocomplete="list"
          aria-activedescendant={
            open && activeIndex >= 0 && activeIndex < visibleOptions.length
              ? optionId(visibleOptions[activeIndex].value)
              : undefined
          }
          onChange={(e) => {
            // Typing resets the active index (D31).
            setQuery(e.target.value);
            setActiveIndex(-1);
          }}
          onFocus={() => !disabled && setOpen(true)}
          onClick={() => !disabled && setOpen(true)}
          onKeyDown={handleKeyDown}
          className="h-9 min-w-[8rem] flex-1 rounded-md border-0 bg-transparent px-1 py-2 text-sm placeholder:text-gray-400 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
        />
      </div>

      {/* Absolute dropdown INSIDE the control (not teleported — z-50 modal-safe). */}
      {open && !disabled && (
        <div className="absolute z-10 mt-1 w-full rounded-md border border-gray-300 bg-white py-1 shadow-lg">
          {visibleOptions.length > 0 ? (
            <ul role="listbox" id={listboxId} aria-multiselectable="true" className="max-h-60 overflow-auto">
              {visibleOptions.map((option, index) => (
                <li
                  key={option.value}
                  id={optionId(option.value)}
                  role="option"
                  aria-selected={selected.includes(option.value)}
                  onClick={() => toggle(option.value)}
                  className={cn(
                    'cursor-pointer px-3 py-2 text-sm',
                    index === activeIndex ? 'bg-blue-50 text-blue-700' : 'text-gray-900',
                  )}
                >
                  {option.label}
                </li>
              ))}
            </ul>
          ) : (
            <p role="status" className="px-3 py-2 text-sm text-gray-500">
              {emptyLabel}
            </p>
          )}
        </div>
      )}
    </div>
  );
};
MultiSelect.displayName = 'MultiSelect';
