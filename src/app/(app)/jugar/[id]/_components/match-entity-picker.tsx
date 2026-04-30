'use client';

import { useEffect, useId, useRef, useState } from 'react';

type UserCandidate = { kind: 'user'; id: string; name: string; avatarUrl: string | null };
type TeamCandidate = { kind: 'team'; id: string; name: string; logoUrl: string | null; memberCount: number };
type Candidate = UserCandidate | TeamCandidate;

interface Props {
  matchId: string;
  /** Free slots in the match. When < 2, team results are hidden. */
  availableSlots: number;
}

const MIN_CHARS = 2;
const DEBOUNCE_MS = 250;

export function MatchEntityPicker({ matchId, availableSlots }: Props) {
  const inputId = useId();
  const listId = useId();
  const liveId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Candidate[]>([]);
  const [highlighted, setHighlighted] = useState(0);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Candidate | null>(null);
  const [liveMessage, setLiveMessage] = useState('');

  useEffect(() => {
    if (selected || query.trim().length < MIN_CHARS) return;
    const timeout = setTimeout(() => {
      setLoading(true);
      setError(null);

      const userUrl = new URL('/api/users/search', window.location.origin);
      userUrl.searchParams.set('q', query.trim());
      userUrl.searchParams.set('matchId', matchId);
      const userPromise = fetch(userUrl.toString()).then(async (res) => {
        if (!res.ok) throw new Error(`users ${res.status}`);
        return (await res.json()) as Omit<UserCandidate, 'kind'>[];
      });

      const teamPromise = availableSlots >= 2
        ? (() => {
            const teamUrl = new URL('/api/teams/search', window.location.origin);
            teamUrl.searchParams.set('q', query.trim());
            teamUrl.searchParams.set('matchId', matchId);
            return fetch(teamUrl.toString()).then(async (res) => {
              if (!res.ok) throw new Error(`teams ${res.status}`);
              return (await res.json()) as Omit<TeamCandidate, 'kind'>[];
            });
          })()
        : Promise.resolve([] as Omit<TeamCandidate, 'kind'>[]);

      Promise.all([userPromise, teamPromise])
        .then(([users, teams]) => {
          const merged: Candidate[] = [
            ...teams.map((t) => ({ ...t, kind: 'team' as const })),
            ...users.map((u) => ({ ...u, kind: 'user' as const })),
          ];
          setResults(merged);
          setHighlighted(0);
          setOpen(true);
          setLiveMessage(
            merged.length === 0
              ? 'Sin resultados.'
              : `${merged.length} resultado${merged.length === 1 ? '' : 's'}.`,
          );
        })
        .catch(() => {
          setResults([]);
          setError('No se pudo cargar la búsqueda.');
        })
        .finally(() => setLoading(false));
    }, DEBOUNCE_MS);

    return () => clearTimeout(timeout);
  }, [query, matchId, availableSlots, selected]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  function onChangeQuery(value: string) {
    setQuery(value);
    if (value.trim().length < MIN_CHARS) {
      setOpen(false);
      setResults([]);
    }
  }

  function selectCandidate(c: Candidate) {
    setSelected(c);
    setQuery(c.name);
    setOpen(false);
    setResults([]);
  }

  function clearSelection() {
    setSelected(null);
    setQuery('');
    setResults([]);
    setOpen(false);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || results.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlighted((h) => Math.min(h + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlighted((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const c = results[highlighted];
      if (c) selectCandidate(c);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  const selectedUserId = selected?.kind === 'user' ? selected.id : '';
  const selectedTeamId = selected?.kind === 'team' ? selected.id : '';

  return (
    <div ref={containerRef} className="relative w-full">
      <input type="hidden" name="invitedUserId" value={selectedUserId} />
      <input type="hidden" name="invitedTeamId" value={selectedTeamId} />

      {selected ? (
        <div className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm">
          <Avatar candidate={selected} />
          <span className="flex-1 font-medium text-slate-700">
            {selected.name}
            {selected.kind === 'team' && (
              <span className="ml-2 text-xs text-slate-400">{selected.memberCount} jugadores</span>
            )}
          </span>
          <button
            type="button"
            onClick={clearSelection}
            aria-label="Limpiar selección"
            className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
          >
            ✕
          </button>
        </div>
      ) : (
        <input
          ref={inputRef}
          id={inputId}
          type="text"
          value={query}
          onChange={(e) => onChangeQuery(e.target.value)}
          onKeyDown={onKeyDown}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder="Buscar jugador o equipo por nombre…"
          autoComplete="off"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-transparent focus:bg-white transition-all"
        />
      )}

      <span id={liveId} aria-live="polite" className="sr-only">
        {liveMessage}
      </span>

      {open && !selected && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-10 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-md max-h-60 overflow-auto"
        >
          {loading && <li className="px-3 py-2 text-sm text-slate-400">Buscando…</li>}
          {!loading && results.length === 0 && (
            <li className="px-3 py-2 text-sm text-slate-400">Sin resultados.</li>
          )}
          {!loading &&
            results.map((c, idx) => (
              <li
                key={`${c.kind}-${c.id}`}
                role="option"
                aria-selected={idx === highlighted}
                onMouseEnter={() => setHighlighted(idx)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  selectCandidate(c);
                }}
                className={`px-3 py-2 text-sm flex items-center gap-2 cursor-pointer ${
                  idx === highlighted ? 'bg-slate-100' : 'hover:bg-slate-50'
                }`}
              >
                <Avatar candidate={c} />
                <span className="flex-1 text-slate-700">
                  {c.name}
                  {c.kind === 'team' && (
                    <span className="ml-2 text-xs text-slate-400">{c.memberCount} jugadores</span>
                  )}
                </span>
                <span className="text-xs text-slate-400 shrink-0">
                  {c.kind === 'team' ? 'Equipo' : 'Jugador'}
                </span>
              </li>
            ))}
        </ul>
      )}

      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

function Avatar({ candidate }: { candidate: Candidate }) {
  const url = candidate.kind === 'user' ? candidate.avatarUrl : candidate.logoUrl;
  if (url) {
    return (
      <span
        className="w-6 h-6 rounded-full bg-slate-100 overflow-hidden inline-block shrink-0"
        style={{ backgroundImage: `url(${url})`, backgroundSize: 'cover', backgroundPosition: 'center' }}
        aria-hidden
      />
    );
  }
  const initial = candidate.name.trim().charAt(0).toUpperCase();
  return (
    <span
      className={`w-6 h-6 rounded-full text-white text-xs font-bold flex items-center justify-center shrink-0 ${
        candidate.kind === 'team'
          ? 'bg-gradient-to-br from-amber-500 to-amber-700'
          : 'bg-gradient-to-br from-brand-navy to-brand-navy-light'
      }`}
      aria-hidden
    >
      {initial}
    </span>
  );
}
