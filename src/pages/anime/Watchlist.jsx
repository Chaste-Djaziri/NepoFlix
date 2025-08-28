// src/pages/anime/Watchlist.jsx
import React from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { AnimeCard } from '../../components/anime/ui/card.jsx';
import { useAnimeWatchlistStore } from '../../store/animeWatchlistStore';
import AnimeHeader from '../../components/anime/ui/header.jsx';
import { ArrowLeft } from 'lucide-react';

export default function AnimeWatchlistPage() {
  const navigate = useNavigate();
  const items = useAnimeWatchlistStore((s) => s.list)();

  return (
    <div className="min-h-screen text-white">
      <AnimeHeader />
      <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-20 pb-10">
        <div className="flex items-center justify-between mb-6">
          <button
            onClick={() => navigate(-1)}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-anime-card-bg border border-anime-border/10 hover:bg-anime-card-hover active:scale-95 transition"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back</span>
          </button>

          <div className="text-right">
            <h1 className="text-2xl sm:text-3xl font-bold">Anime Watchlist</h1>
            <p className="text-gray-400 mt-1 text-sm">
              Titles you’ve saved for later (anime-only).
            </p>
          </div>
        </div>

        {items.length ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4">
            {items.map((anime) => (
              <AnimeCard key={anime.id} animeData={anime} />
            ))}
          </div>
        ) : (
          <div className="text-gray-400">
            Your Anime Watchlist is empty.{' '}
            <Link className="underline" to="/anime">
              Browse anime
            </Link>
            .
          </div>
        )}
      </div>
    </div>
  );
}
