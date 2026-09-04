'use client';

import { useEffect, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { MapPin, Loader2 } from 'lucide-react';

interface AddressSuggestion {
  street: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  fullLabel: string;
}

interface AddressAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  onAddressSelect?: (addr: { street: string; city: string; state: string; zip: string }) => void;
  placeholder?: string;
  className?: string;
  id?: string;
  disabled?: boolean;
}

export function AddressAutocomplete({
  value, onChange, onAddressSelect, placeholder, className, id, disabled,
}: AddressAutocompleteProps) {
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Fetch suggestions from Photon (free OpenStreetMap-powered geocoder, no API key)
  async function fetchSuggestions(query: string) {
    if (query.trim().length < 3) {
      setSuggestions([]);
      setShowDropdown(false);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(
        `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=8&lang=en`,
        { headers: { 'Accept': 'application/json' } }
      );
      const data = await res.json();
      const features = data.features || [];
      const mapped: AddressSuggestion[] = features
        .filter((f: any) => f.properties && (f.properties.street || f.properties.name || f.properties.city))
        .map((f: any) => {
          const p = f.properties;
          const street = p.street || p.name || '';
          const house = p.housenumber || '';
          const streetFull = house ? `${house} ${street}`.trim() : street;
          const city = p.city || p.town || p.village || p.county || '';
          const state = p.state || '';
          const zip = p.postcode || '';
          const country = p.country || 'USA';
          // Build a readable label
          const parts = [streetFull, city, state].filter(Boolean);
          const fullLabel = parts.join(', ') + (zip ? ` ${zip}` : '') + (country && country !== 'USA' ? `, ${country}` : '');
          return { street: streetFull, city, state, zip, country, fullLabel };
        });
      setSuggestions(mapped);
      setShowDropdown(mapped.length > 0);
      setHighlightIndex(-1);
    } catch {
      setSuggestions([]);
      setShowDropdown(false);
    } finally {
      setLoading(false);
    }
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value;
    onChange(v);
    // Debounce API calls
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchSuggestions(v), 350);
  }

  function selectSuggestion(s: AddressSuggestion) {
    onChange(s.street);
    setShowDropdown(false);
    setSuggestions([]);
    if (onAddressSelect) {
      onAddressSelect({ street: s.street, city: s.city, state: s.state, zip: s.zip });
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!showDropdown || suggestions.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIndex(i => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIndex(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && highlightIndex >= 0) {
      e.preventDefault();
      selectSuggestion(suggestions[highlightIndex]);
    } else if (e.key === 'Escape') {
      setShowDropdown(false);
    }
  }

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={containerRef}>
      <div className="relative">
        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        <Input
          id={id}
          disabled={disabled}
          className={`pl-9 ${className || ''}`}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onFocus={() => { if (suggestions.length > 0) setShowDropdown(true); }}
          placeholder={placeholder || 'Start typing an address…'}
          autoComplete="off"
        />
        {loading && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground animate-spin" />
        )}
      </div>

      {/* Dropdown suggestions */}
      {showDropdown && suggestions.length > 0 && (
        <div className="absolute z-50 left-0 right-0 mt-1 bg-popover border border-border rounded-md shadow-lg max-h-64 overflow-y-auto arvest-scroll">
          {suggestions.map((s, i) => (
            <button
              key={i}
              type="button"
              className={`w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors border-b border-border last:border-0 flex items-start gap-2 ${
                i === highlightIndex ? 'bg-accent' : ''
              }`}
              onMouseDown={(e) => { e.preventDefault(); selectSuggestion(s); }}
              onMouseEnter={() => setHighlightIndex(i)}
            >
              <MapPin className="w-3.5 h-3.5 text-primary mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{s.street}</div>
                <div className="text-xs text-muted-foreground truncate">
                  {[s.city, s.state, s.zip].filter(Boolean).join(', ')}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
