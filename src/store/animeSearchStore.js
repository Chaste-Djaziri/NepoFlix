// src/store/animeSearchStore.js
import { create } from 'zustand';

export const useAnimeSearchStore = create((set, get) => ({
  searchQuery: '',
  hasSearched: false,
  // resultsByQuery: { [query]: { results: [], fetchedAt: number } }
  resultsByQuery: {},

  setQuery: (q) => set({ searchQuery: q }),
  setHasSearched: (v) => set({ hasSearched: v }),
  saveResults: (query, results) =>
    set({
      resultsByQuery: {
        ...get().resultsByQuery,
        [query]: { results, fetchedAt: Date.now() },
      },
    }),
}));
