// src/store/animeWatchlistStore.js
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export const useAnimeWatchlistStore = create(
  persist(
    (set, get) => ({
      // keyed by anime.id
      items: {},
      add: (anime) => set((s) => ({ items: { ...s.items, [anime.id]: anime } })),
      remove: (id) =>
        set((s) => {
          const next = { ...s.items };
          delete next[id];
          return { items: next };
        }),
      toggle: (anime) => {
        const has = !!get().items[anime.id];
        return has ? get().remove(anime.id) : get().add(anime);
      },
      isInWatchlist: (id) => !!get().items[id],
      clear: () => set({ items: {} }),
      list: () => Object.values(get().items),
    }),
    {
      name: 'anime_watchlist_v1',
      storage: createJSONStorage(() => localStorage),
      version: 1,
    }
  )
);
