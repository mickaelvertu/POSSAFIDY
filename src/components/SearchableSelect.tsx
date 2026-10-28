import { useEffect, useRef, useState } from "react";
import { ChevronDown, Search, X } from "lucide-react";

export interface SearchableSelectOption {
  value: string;
  label: string;
  description?: string;
}

interface SearchableSelectProps {
  value: string;
  options: SearchableSelectOption[];
  onChange: (value: string) => void;
  placeholder: string;
  allLabel?: string;
  clearable?: boolean;
  className?: string;
}

export default function SearchableSelect({
  value,
  options,
  onChange,
  placeholder,
  allLabel,
  clearable = true,
  className = "w-72"
}: SearchableSelectProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const selectedOption = options.find(option => option.value === value);
  const [query, setQuery] = useState(selectedOption?.label || "");
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    setQuery(selectedOption?.label || "");
  }, [selectedOption?.label, value]);

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
        setQuery(selectedOption?.label || "");
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [selectedOption?.label, value]);

  const normalizedQuery = query.trim().toLowerCase();
  const filteredOptions = options.filter(option =>
    `${option.label} ${option.description || ""}`.toLowerCase().includes(normalizedQuery)
  );

  const selectOption = (optionValue: string, label: string) => {
    onChange(optionValue);
    setQuery(optionValue === "ALL" ? "" : label);
    setIsOpen(false);
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <div className="flex items-center gap-2 rounded-lg border border-slate-300 bg-slate-50 px-3 py-1.5 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500">
        <Search className="h-3.5 w-3.5 shrink-0 text-slate-400" />
        <input
          type="search"
          value={query}
          onFocus={event => {
            setIsOpen(true);
            event.currentTarget.select();
          }}
          onChange={event => {
            setQuery(event.target.value);
            setIsOpen(true);
          }}
          placeholder={placeholder}
          className="min-w-0 flex-1 bg-transparent text-xs font-semibold text-slate-900 outline-none placeholder:font-normal placeholder:text-slate-400"
          aria-label={placeholder}
        />
        {clearable && value !== "ALL" && (
          <button
            type="button"
            onClick={() => selectOption("ALL", allLabel || "")}
            className="rounded-full p-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700"
            aria-label="Réinitialiser"
          >
            <X className="h-3 w-3" />
          </button>
        )}
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400" />
      </div>

      {isOpen && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-64 overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
          {allLabel && (
            <button
              type="button"
              onClick={() => selectOption("ALL", allLabel)}
              className={`w-full px-3 py-2 text-left text-xs font-semibold hover:bg-blue-50 ${value === "ALL" ? "bg-blue-50 text-blue-700" : "text-slate-700"}`}
            >
              {allLabel}
            </button>
          )}
          {filteredOptions.map(option => (
            <button
              key={option.value}
              type="button"
              onClick={() => selectOption(option.value, option.label)}
              className={`w-full px-3 py-2 text-left hover:bg-blue-50 ${value === option.value ? "bg-blue-50" : ""}`}
            >
              <span className="block text-xs font-semibold text-slate-900">{option.label}</span>
              {option.description && <span className="block text-[10px] text-slate-500">{option.description}</span>}
            </button>
          ))}
          {filteredOptions.length === 0 && (
            <p className="px-3 py-2 text-xs italic text-slate-400">Aucun résultat trouvé</p>
          )}
        </div>
      )}
    </div>
  );
}
