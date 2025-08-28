// src/pages/anime/search.jsx
import React, { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { searchAnime } from '../../components/anime/search.jsx';
import { AnimeCard } from '../../components/anime/ui/card.jsx';
import AnimeHeader from '../../components/anime/ui/header.jsx';
import { useAnimeSearchStore } from '../../store/animeSearchStore.js';

const DEBOUNCE_MS = 500;
const STALE_MS = 10 * 60 * 1000; // 10 minutes

export default function AnimeSearch() {
  const [searchParams, setSearchParams] = useSearchParams();

  // Zustand state/actions
  const {
    searchQuery,
    hasSearched,
    resultsByQuery,
    setQuery,
    setHasSearched,
    saveResults,
  } = useAnimeSearchStore();

  // UI flags
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const inputRef = useRef(null);
  const debounceRef = useRef(null);

  // Helpers
  const getCached = (query) => {
    const entry = resultsByQuery?.[query];
    if (!entry) return null;
    const fresh = Date.now() - (entry.fetchedAt || 0) < STALE_MS;
    return fresh ? entry.results : null;
  };

  const performSearch = async (query) => {
    if (!query.trim()) return;

    // use fresh cache if available
    const cached = getCached(query);
    if (cached) {
      setHasSearched(true);
      return;
    }

    try {
      setIsLoading(true);
      setHasSearched(true);
      setError(null);

      const { results = [] } = await searchAnime(query, 1);
      saveResults(query, results);
    } catch (e) {
      console.error('Anime search error:', e);
      setError(e?.message || 'Search failed');
    } finally {
      setIsLoading(false);
    }
  };

  const loadFromCacheOrFetch = async (query) => {
    const cached = getCached(query);
    if (cached) {
      setHasSearched(true);
    } else {
      await performSearch(query);
    }
  };

  // On mount: hydrate from URL (?query=…) or store
  useEffect(() => {
    document.body.style.backgroundColor = 'var(--color-anime-background)';

    // Accept both ?query and legacy ?q
    const urlQuery = searchParams.get('query') || searchParams.get('q') || '';

    if (urlQuery) {
      if (urlQuery !== searchQuery) setQuery(urlQuery);
      loadFromCacheOrFetch(urlQuery);
    } else if (searchQuery) {
      setSearchParams({ query: searchQuery });
      loadFromCacheOrFetch(searchQuery);
    }

    inputRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounced auto-search + URL sync
  const onInputChange = (e) => {
    const value = e.target.value;
    setQuery(value);

    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (value.trim()) {
        setSearchParams({ query: value });
        loadFromCacheOrFetch(value);
      } else {
        setSearchParams({});
        setHasSearched(false);
      }
    }, DEBOUNCE_MS);
  };

  const effectiveResults = searchQuery
    ? resultsByQuery?.[searchQuery]?.results || []
    : [];

  return (
    <div className="min-h-screen text-white">
      <AnimeHeader />

      <div className="pt-20 pb-10 px-4 w-full max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold mb-4">Search Anime</h1>

        {/* Search input (auto-search) */}
        <div className="mb-6">
          <div className="relative w-full">
            <input
              ref={inputRef}
              type="text"
              value={searchQuery}
              onChange={onInputChange}
              placeholder="Search anime titles…"
              className="w-full bg-anime-card-bg border border-anime-border/10 text-white text-base px-4 py-3 pr-12 rounded-lg focus:outline-none focus:border-white/30"
              inputMode="search"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-white/60 select-none">
              ⌘K
            </span>
          </div>
        </div>

        {error && (
          <div className="mb-6 text-red-400 bg-red-900/20 border border-red-700/30 rounded-lg px-4 py-3">
            Error: {error}
          </div>
        )}

        {/* States */}
        {isLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-4">
            {Array.from({ length: 15 }).map((_, i) => (
              <div key={i} className="bg-anime-card-bg border border-anime-border/10 rounded-lg overflow-hidden animate-pulse">
                <div className="w-full aspect-[2/3] bg-anime-skeleton-bg" />
                <div className="p-3">
                  <div className="h-4 bg-anime-skeleton-bg rounded mb-2" />
                  <div className="h-3 bg-anime-skeleton-bg rounded w-3/4" />
                </div>
              </div>
            ))}
          </div>
        ) : hasSearched && effectiveResults.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16">
            <div className="text-white text-xl mb-2">No results found</div>
            <p className="text-white/60">Try another title or adjust your spelling.</p>
          </div>
        ) : hasSearched ? (
          <>
            <div className="mb-4 text-white/70">
              Showing {effectiveResults.length} result{effectiveResults.length === 1 ? '' : 's'}
              {searchQuery ? ` for “${searchQuery}”` : ''}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-4">
              {effectiveResults.map((anime) => (
                <AnimeCard key={anime.id} animeData={anime} />
              ))}
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center py-16">
            <div className="text-white text-xl mb-2">Search for anime</div>
            <p className="text-white/60">Start typing a title above to see results.</p>
          </div>
        )}
      </div>
    </div>
  );
}
