// src/pages/anime/home.jsx
import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { extractSpotlights } from '../../components/anime/spotlightData.jsx';
import { fetchAnimeData } from '../../components/anime/animeData.jsx';
import { AnimeCard } from '../../components/anime/ui/card.jsx';
import AnimeHeader from '../../components/anime/ui/header.jsx';
import { AnimeSpotlightSkeleton } from '../../components/Skeletons.jsx';
import { useAnimeWatchlistStore } from '../../store/animeWatchlistStore';

export default function AnimeHome() {
  const [spotlights, setSpotlights] = useState([]);
  const [currentSpotlightIndex, setCurrentSpotlightIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [currentCategory, setCurrentCategory] = useState('trending');
  const [animeCache, setAnimeCache] = useState({});
  const [animeData, setAnimeData] = useState([]);
  const [sidebarData, setSidebarData] = useState({
    recentlyAdded: [],
    recentlyUpdated: [],
    topUpcoming: [],
  });

  const [loading, setLoading] = useState(true);
  const [spotlightLoading, setSpotlightLoading] = useState(true);
  const [sidebarLoading, setSidebarLoading] = useState(true);

  const slideIntervalRef = useRef(null);
  const progressIntervalRef = useRef(null);
  const loadedCategories = useRef(new Set());

  // anime watchlist
  const toggleAnimeWatchlist = useAnimeWatchlistStore((s) => s.toggle);
  const isInAnimeWatchlist = useAnimeWatchlistStore((s) => s.isInWatchlist);

  useEffect(() => {
    document.body.style.backgroundColor = 'var(--color-anime-background)';
    document.body.style.fontFamily = 'Inter, sans-serif';
    loadInitialData();
    return () => clearAllIntervals();
  }, []);

  useEffect(() => {
    if (spotlights.length > 1) startSpotlightIntervals();
    return () => clearAllIntervals();
  }, [spotlights, currentSpotlightIndex]);

  const clearAllIntervals = () => {
    if (slideIntervalRef.current) clearInterval(slideIntervalRef.current);
    if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
  };

  const startSpotlightIntervals = () => {
    clearAllIntervals();
    setProgress(0);
    slideIntervalRef.current = setInterval(() => {
      setCurrentSpotlightIndex((prev) => (prev + 1) % spotlights.length);
    }, 7000);
    const step = 100 / 70;
    progressIntervalRef.current = setInterval(() => {
      setProgress((p) => (p >= 100 ? 0 : p + step));
    }, 100);
  };

  const loadInitialData = async () => {
    try {
      const [spotlightData, trendingData] = await Promise.all([
        extractSpotlights(),
        fetchAnimeData('top-airing'),
      ]);

      setSpotlights(spotlightData || []);
      setSpotlightLoading(false);

      const trending = trendingData?.results || [];
      setAnimeCache((c) => ({ ...c, trending }));
      setAnimeData(trending);
      loadedCategories.current.add('trending');
      setLoading(false);

      loadSidebarData();
    } catch (error) {
      console.error('Error loading initial data:', error);
      setSpotlightLoading(false);
      setLoading(false);
    }
  };

  const loadSidebarData = async () => {
    try {
      setSidebarLoading(true);

      const recentlyAddedData = await fetchAnimeData('recently-added');
      const recentlyUpdatedData = await fetchAnimeData('recently-updated');
      const topUpcomingData = await fetchAnimeData('top-upcoming');

      setSidebarData({
        recentlyAdded: recentlyAddedData?.results?.slice(0, 8) || [],
        recentlyUpdated: recentlyUpdatedData?.results?.slice(0, 8) || [],
        topUpcoming: topUpcomingData?.results?.slice(0, 8) || [],
      });
    } catch (error) {
      console.error('Error loading sidebar data:', error);
    } finally {
      setSidebarLoading(false);
    }
  };

  const loadAnimeData = async (category) => {
    if (loadedCategories.current.has(category)) {
      setAnimeData(animeCache[category] || []);
      return;
    }
    setLoading(true);

    let endpoint = 'top-airing';
    if (category === 'popular') endpoint = 'most-popular';
    if (category === 'toprated') endpoint = 'most-favorite';

    try {
      const { results } = await fetchAnimeData(endpoint);
      const list = results || [];
      setAnimeCache((c) => ({ ...c, [category]: list }));
      setAnimeData(list);
      loadedCategories.current.add(category);
    } catch (error) {
      console.error(`Error loading ${category} anime:`, error);
      setAnimeData([]);
    } finally {
      setLoading(false);
    }
  };

  const showNextSpotlight = () => {
    setCurrentSpotlightIndex((prev) => (prev + 1) % spotlights.length);
    startSpotlightIntervals();
  };
  const showPreviousSpotlight = () => {
    setCurrentSpotlightIndex((prev) => (prev - 1 + spotlights.length) % spotlights.length);
    startSpotlightIntervals();
  };
  const jumpToSpotlight = (i) => {
    setCurrentSpotlightIndex(i);
    startSpotlightIntervals();
  };

  const handleCategoryChange = (category) => {
    setCurrentCategory(category);
    loadAnimeData(category);
  };

  const currentSpotlight = spotlights[currentSpotlightIndex];

  const renderSkeletonGrid = () => (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4">
      {Array.from({ length: 12 }).map((_, index) => (
        <div key={index} className="rounded-xl overflow-hidden aspect-[2/3] bg-anime-card-bg animate-pulse" />
      ))}
    </div>
  );

  const renderSidebarSkeletonRow = () => (
    <div className="flex gap-3 overflow-x-auto no-scrollbar">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="min-w-[160px] bg-anime-card-bg rounded-lg p-3 animate-pulse">
          <div className="w-full h-32 rounded bg-anime-skeleton-bg" />
          <div className="h-3 bg-anime-skeleton-bg rounded w-3/4 mt-3" />
          <div className="h-2 bg-anime-skeleton-bg rounded w-1/2 mt-2" />
        </div>
      ))}
    </div>
  );

  const SidebarItem = ({ anime }) => (
    <Link
      to={`/anime/${anime.id}`}
      className="bg-anime-card-bg hover:bg-anime-card-hover transition rounded-lg flex items-center gap-3 p-3"
    >
      <img
        src={anime.poster || 'https://placehold.co/64x88/141414/fff/?text=No+Image&font=poppins'}
        alt={anime.title}
        className="w-14 h-20 object-cover rounded"
        loading="lazy"
      />
      <div className="min-w-0">
        <h4 className="text-sm font-medium text-white truncate">{anime.title}</h4>
        <p className="text-xs text-gray-400">{anime.tvInfo?.showType || 'Anime'}</p>
        <div className="mt-1 flex flex-wrap items-center gap-1">
          <span className="text-[10px] bg-anime-badge-bg border border-anime-badge-border px-1.5 py-0.5 rounded">HD</span>
          {anime.tvInfo?.sub && (
            <span className="text-[10px] bg-anime-badge-bg border border-anime-badge-border px-1.5 py-0.5 rounded">
              SUB {anime.tvInfo.sub}
            </span>
          )}
          {anime.tvInfo?.dub && (
            <span className="text-[10px] bg-anime-badge-bg border border-anime-badge-border px-1.5 py-0.5 rounded">
              DUB {anime.tvInfo.dub}
            </span>
          )}
          {anime.duration && (
            <span className="text-[10px] bg-anime-badge-bg border border-anime-badge-border px-1.5 py-0.5 rounded">
              {anime.duration}
            </span>
          )}
        </div>
      </div>
    </Link>
  );

  return (
    <div className="min-h-screen text-white overflow-x-hidden">
      <AnimeHeader />

      <main className="p-3 sm:p-4 md:pt-6 mt-16">
        {/* HERO */}
        {spotlightLoading || !currentSpotlight ? (
          <AnimeSpotlightSkeleton />
        ) : (
          <section className="relative rounded-2xl overflow-hidden min-h-[48vh] sm:h-[55vh] mb-4" aria-roledescription="carousel" aria-live="polite">
            <img
              src={currentSpotlight?.poster || 'https://placehold.co/1200x600/0e1117/fff/?text=Loading...&font=poppins'}
              alt={currentSpotlight?.title}
              className="absolute inset-0 w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-anime-background/95 via-anime-background/50 to-transparent" />
            <div className="absolute inset-0 bg-black/20 mix-blend-multiply" />

            <div className="absolute bottom-0 left-0 right-0 p-4 sm:p-6 md:p-10">
              <div className="backdrop-blur-md bg-white/5 border border-white/10 rounded-2xl p-4 sm:p-6 md:p-8 max-w-2xl">
                <h1 className="text-2xl sm:text-4xl md:text-5xl font-bold tracking-tight">{currentSpotlight?.title}</h1>
                <p className="mt-3 text-sm sm:text-base text-gray-200 leading-6 line-clamp-4">
                  {currentSpotlight?.description || 'Loading description...'}
                </p>
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <Link
                    to={`/anime/${currentSpotlight?.id || ''}`}
                    className="bg-white text-black px-4 sm:px-5 py-2 rounded-lg font-semibold hover:bg-zinc-200 transition hover:scale-[1.04] active:scale-95"
                  >
                    Watch now
                  </Link>
                  <Link
                    to={`/anime/${currentSpotlight?.id || ''}`}
                    className="bg-anime-button-bg/30 border border-anime-border/10 text-white px-4 sm:px-5 py-2 rounded-lg font-medium hover:bg-anime-button-bg/50 transition"
                  >
                    Details
                  </Link>

                  {/* NEW: Anime watchlist toggle */}
                  <button
                    onClick={() => toggleAnimeWatchlist(currentSpotlight)}
                    aria-label={
                      isInAnimeWatchlist(currentSpotlight?.id)
                        ? 'Remove from Anime Watchlist'
                        : 'Add to Anime Watchlist'
                    }
                    aria-pressed={isInAnimeWatchlist(currentSpotlight?.id)}
                    className={`px-4 sm:px-5 py-2 rounded-lg font-medium border transition ${
                      isInAnimeWatchlist(currentSpotlight?.id)
                        ? 'bg-green-500/20 text-green-200 border-green-400/30 hover:bg-green-500/30'
                        : 'bg-white/5 text-white border-white/15 hover:bg-white/10'
                    }`}
                  >
                    {isInAnimeWatchlist(currentSpotlight?.id) ? 'In Watchlist' : 'Add to Watchlist'}
                  </button>
                </div>
              </div>
            </div>

            <div className="absolute bottom-3 right-3 sm:bottom-6 sm:right-6 z-10 flex gap-2">
              <button
                onClick={showPreviousSpotlight}
                aria-label="Previous spotlight"
                className="bg-anime-button-bg/40 border border-anime-border/20 p-2 rounded-lg hover:bg-anime-button-bg/60 transition"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 sm:h-6 sm:w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <button
                onClick={showNextSpotlight}
                aria-label="Next spotlight"
                className="bg-anime-button-bg/40 border border-anime-border/20 p-2 rounded-lg hover:bg-anime-button-bg/60 transition"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 sm:h-6 sm:w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>

            <div className="absolute left-0 right-0 bottom-0 p-3 sm:p-4">
              <div className="mx-auto flex items-center justify-center gap-2">
                {spotlights.map((_, i) => (
                  <button
                    key={i}
                    aria-label={`Go to slide ${i + 1}`}
                    onClick={() => jumpToSpotlight(i)}
                    className={`h-2 rounded-full transition-all ${i === currentSpotlightIndex ? 'w-8 bg-white' : 'w-2 bg-white/40 hover:bg-white/70'}`}
                  />
                ))}
              </div>
              <div className="mt-3 h-1.5 w-full bg-white/10 rounded-full overflow-hidden">
                <div className="h-full bg-white/80 transition-[width] duration-100 ease-linear" style={{ width: `${Math.min(100, progress)}%` }} />
              </div>
            </div>
          </section>
        )}

        {/* BODY */}
        <div className="flex flex-col lg:flex-row gap-4">
          {/* Main */}
          <section className="flex-1 bg-anime-modal-bg rounded-2xl p-4 sm:p-6">
            <div className="flex items-center justify-between mb-4 sm:mb-6">
              <div className="inline-flex bg-white/5 border border-white/10 rounded-full p-1">
                {[
                  { key: 'trending', label: 'Trending' },
                  { key: 'popular', label: 'Popular' },
                  { key: 'toprated', label: 'Top rated' },
                ].map((tab) => {
                  const active = currentCategory === tab.key;
                  return (
                    <button
                      key={tab.key}
                      onClick={() => handleCategoryChange(tab.key)}
                      className={`px-3 sm:px-4 py-1.5 sm:py-2 rounded-full text-sm font-medium transition ${
                        active ? 'bg-white text-black shadow' : 'text-gray-300 hover:text-white hover:bg-white/10'
                      }`}
                    >
                      {tab.label}
                    </button>
                  );
                })}
              </div>

              <Link to="/anime/watchlist" className="text-sm text-gray-300 hover:text-white underline underline-offset-4">
                Anime Watchlist
              </Link>
            </div>

            {loading ? (
              renderSkeletonGrid()
            ) : animeData.length ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4">
                {animeData.map((anime) => (
                  <AnimeCard key={anime.id} animeData={anime} />
                ))}
              </div>
            ) : (
              <p className="text-gray-400 text-sm">No titles found.</p>
            )}
          </section>

          {/* Sidebar */}
          <aside className="lg:w-[380px] xl:w-[420px] shrink-0">
            <div className="bg-anime-modal-bg rounded-2xl p-4 sm:p-6 sticky top-20 max-lg:static space-y-6">
              <SidebarSection title="Recently Added" items={sidebarData.recentlyAdded} loading={sidebarLoading} />
              <SidebarSection title="Recently Updated" items={sidebarData.recentlyUpdated} loading={sidebarLoading} />
              <SidebarSection title="Top Upcoming" items={sidebarData.topUpcoming} loading={sidebarLoading} />
            </div>
          </aside>
        </div>
      </main>
    </div>
  );

  function SidebarSection({ title, items, loading }) {
    return (
      <div>
        <h3 className="text-base sm:text-lg font-semibold mb-3">{title}</h3>

        <div className="lg:hidden">
          {loading ? (
            renderSidebarSkeletonRow()
          ) : (
            <div className="flex gap-3 overflow-x-auto no-scrollbar snap-x snap-mandatory">
              {items.map((anime) => (
                <Link
                  key={anime.id}
                  to={`/anime/${anime.id}`}
                  className="snap-start min-w-[160px] bg-anime-card-bg hover:bg-anime-card-hover transition rounded-lg p-3"
                >
                  <img
                    src={anime.poster || 'https://placehold.co/160x220/141414/fff/?text=No+Image&font=poppins'}
                    alt={anime.title}
                    className="w-full h-40 object-cover rounded"
                    loading="lazy"
                  />
                  <h4 className="mt-3 text-sm font-medium line-clamp-2">{anime.title}</h4>
                  <p className="text-xs text-gray-400 mt-1">{anime.tvInfo?.showType || 'Anime'}</p>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="hidden lg:block">
          {loading ? (
            <div className="space-y-3">{renderSidebarSkeletonRow()}</div>
          ) : (
            <div className="space-y-3">
              {items.map((anime) => (
                <SidebarItem key={anime.id} anime={anime} />
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }
}
