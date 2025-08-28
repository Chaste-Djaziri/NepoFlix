// src/components/anime/ui/card.jsx
import React from 'react';
import { Link } from 'react-router-dom';
import { useAnimeWatchlistStore } from '../../../store/animeWatchlistStore';

export function AnimeCard({ animeData }) {
  if (!animeData || !animeData.id) return null;

  const posterUrl =
    animeData.poster ||
    `https://placehold.co/300x450/141414/fff/?text=${encodeURIComponent(
      animeData.title || 'Anime'
    )}&font=poppins`;
  const title = animeData.title || 'Unknown Anime';

  // ✅ stable selector (read items once; compute membership locally)
  const toggle = useAnimeWatchlistStore((s) => s.toggle);
  const items = useAnimeWatchlistStore((s) => s.items);
  const isIn = !!items[animeData.id];

  const onToggle = (e) => {
    e.preventDefault();
    e.stopPropagation();
    toggle(animeData);
  };

  return (
    <Link
      to={`/anime/${animeData.id}`}
      className="relative overflow-hidden rounded-lg shadow-lg group"
      data-anime-id={animeData.id}
    >
      {/* Watchlist toggle */}
      <button
        onClick={onToggle}
        aria-label={isIn ? 'Remove from Anime Watchlist' : 'Add to Anime Watchlist'}
        aria-pressed={isIn}
        className={`absolute top-2 right-2 z-10 rounded-md backdrop-blur-md px-2.5 py-1.5 text-xs font-medium border transition
          ${isIn
            ? 'bg-green-500/20 text-green-200 border-green-400/30 hover:bg-green-500/30'
            : 'bg-white/10 text-white border-white/20 hover:bg-white/20'} 
        `}
      >
        {isIn ? 'In Watchlist' : 'Add to Watchlist'}
      </button>

      <div className="relative">
        <div className="aspect-[2/3] relative">
          <img
            src={posterUrl}
            alt={title}
            className="w-full h-full object-cover rounded-lg cursor-pointer"
            loading="lazy"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/0 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
        <div className="pt-1 flex flex-wrap gap-1">
          <span className="text-base font-medium text-white block w-full truncate">
            {title}
          </span>
          <AnimeTags animeData={animeData} />
        </div>
      </div>
    </Link>
  );
}

export function AnimeTags({ animeData }) {
  const tags = [];

  tags.push(
    <span
      key="hd"
      className="text-xs bg-anime-badge-bg border border-anime-badge-border px-1.5 py-0.5 rounded-md hover:bg-white hover:text-anime-badge-bg transition duration-200 cursor-pointer"
    >
      HD
    </span>
  );

  if (animeData.tvInfo?.sub) {
    tags.push(
      <span
        key="sub"
        className="text-xs bg-anime-badge-bg border border-anime-badge-border px-1.5 py-0.5 rounded-md flex items-center justify-center group hover:bg-white hover:text-anime-badge-bg transition duration-200 cursor-pointer"
      >
        <span className="bg-white text-black px-1 pt-[0.08rem] pb-[0.03rem] rounded-sm mr-1 text-[0.5rem] group-hover:bg-anime-badge-bg group-hover:text-white">
          CC
        </span>
        {animeData.tvInfo.sub}
      </span>
    );
  }

  if (animeData.tvInfo?.dub) {
    tags.push(
      <span
        key="dub"
        className="text-xs bg-anime-badge-bg border border-anime-badge-border px-1.5 py-0.5 rounded-md flex items-center justify-center group hover:bg-white hover:text-anime-badge-bg transition duration-200 cursor-pointer"
      >
        <span className="bg-white text-black px-1 pt-[0.08rem] pb-[0.03rem] rounded-sm mr-1 text-[0.5rem] group-hover:bg-anime-badge-bg group-hover:text-white">
          DUB
        </span>
        {animeData.tvInfo.dub}
      </span>
    );
  }

  if (animeData.duration) {
    tags.push(
      <span
        key="duration"
        className="text-xs bg-anime-badge-bg border border-anime-badge-border px-1.5 py-0.5 rounded-md hover:bg-white hover:text-anime-badge-bg transition duration-200 cursor-pointer"
      >
        {animeData.duration}
      </span>
    );
  }

  return tags.slice(0, 4);
}

export function SidebarAnimeItem({ animeData, index }) {
  const posterUrl =
    animeData.poster ||
    `https://placehold.co/80x120/141414/fff/?text=${encodeURIComponent(
      animeData.title || `Item ${index + 1}`
    )}&font=poppins`;
  const title = animeData.title || `Anime Title ${index + 1}`;

  const tags = [];

  tags.push(
    <span
      key="hd"
      className="text-xs bg-anime-badge-bg border border-anime-badge-border px-1.5 py-0.5 rounded-md hover:bg-white hover:text-anime-badge-bg transition duration-200 cursor-pointer"
    >
      HD
    </span>
  );

  if (animeData.tvInfo?.sub) {
    tags.push(
      <span
        key="sub"
        className="text-xs bg-anime-badge-bg border border-anime-badge-border px-1.5 py-0.5 rounded-md group hover:bg-white hover:text-anime-badge-bg transition duration-200 cursor-pointer"
      >
        <span className="bg-white text-black px-1 rounded-sm mr-1 group-hover:bg-anime-badge-bg group-hover:text-white">
          CC
        </span>
        {animeData.tvInfo.sub}
      </span>
    );
  }

  if (animeData.tvInfo?.dub) {
    tags.push(
      <span
        key="dub"
        className="text-xs bg-anime-badge-bg border border-anime-badge-border px-1.5 py-0.5 rounded-md group hover:bg-white hover:text-anime-badge-bg transition duration-200 cursor-pointer"
      >
        <span className="bg-white text-black px-1 rounded-sm mr-1 group-hover:bg-anime-badge-bg group-hover:text-white">
          DUB
        </span>
        {animeData.tvInfo.dub}
      </span>
    );
  }

  if (animeData.duration) {
    tags.push(
      <span
        key="duration"
        className="text-xs bg-anime-badge-bg border border-anime-badge-border px-1.5 py-0.5 rounded-md hover:bg-white hover:text-anime-badge-bg transition duration-200 cursor-pointer"
      >
        {animeData.duration}
      </span>
    );
  }

  return (
    <Link to={`/anime/${animeData.id}`} className="flex items-start space-x-3 cursor-pointer">
      <img src={posterUrl} alt={title} className="w-16 h-24 object-cover rounded-md cursor-pointer" />
      <div className="flex flex-col">
        <h3 className="font-semibold text-sm mb-1">{title}</h3>
        <div className="pt-1 flex flex-row flex-wrap gap-1">{tags.slice(0, 4)}</div>
      </div>
    </Link>
  );
}

export default AnimeCard;
