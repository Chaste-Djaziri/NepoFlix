// src/pages/anime/details.jsx
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Play } from 'lucide-react';
import { fetchAnimeInfo, fetchEpisodesList } from '../../components/anime/animeData.jsx';
import {
  extractSeasonNumber,
  findTmdbIdForSeason,
  fetchTmdbCredits,          // <- now exported
  fetchTmdbRecommendations,   // <- now exported
} from '../../components/anime/animeDetailsData.jsx';
import { fetchEpisodeThumbnails } from '../../components/anime/episodeThumbnails.jsx';
import { searchAnime } from '../../components/anime/search.jsx';
import AnimeHeader from '../../components/anime/ui/header.jsx';
import { AnimeCard } from '../../components/anime/ui/card.jsx';
import { useAnimeWatchlistStore } from '../../store/animeWatchlistStore';

// ---------- tiny utils ----------
const get = (obj, path, def = undefined) => {
  try { return path.split('.').reduce((o, k) => (o ? o[k] : undefined), obj) ?? def; }
  catch { return def; }
};
const getGenres = (info) => {
  if (!info) return [];
  const split = (s) => s.split(',').map((g) => g.trim()).filter(Boolean);
  if (Array.isArray(info.Genres)) return info.Genres;
  if (typeof info.Genres === 'string') return split(info.Genres);
  if (Array.isArray(info.genres)) return info.genres;
  if (typeof info.genres === 'string') return split(info.genres);
  return [];
};

// Normalize provider cast
const normalizeCast = (animeData) => {
  if (!animeData) return [];
  let raw = animeData.characters || animeData.casts || animeData.cast || animeData.actors || animeData.staff;

  if (!Array.isArray(raw) || raw.length === 0) {
    const charEdges = get(animeData, 'characters.edges');
    if (Array.isArray(charEdges) && charEdges.length) {
      raw = charEdges.map((e, i) => ({
        name: get(e, 'node.name.full') || get(e, 'node.name.userPreferred') || get(e, 'node.name.native') || 'Unknown',
        character: get(e, 'node.name.full') || '',
        role: e.role || 'Character',
        image: get(e, 'node.image.large') || get(e, 'node.image.medium') || null,
        _k: get(e, 'node.id') || `ce-${i}`,
      }));
    }
  }
  if (!Array.isArray(raw) || raw.length === 0) {
    const staffEdges = get(animeData, 'staff.edges');
    if (Array.isArray(staffEdges) && staffEdges.length) {
      raw = staffEdges.map((e, i) => ({
        name: get(e, 'node.name.full') || get(e, 'node.name.userPreferred') || get(e, 'node.name.native') || 'Unknown',
        character: '',
        role: get(e, 'role') || 'Staff',
        image: get(e, 'node.image.large') || get(e, 'node.image.medium') || null,
        _k: get(e, 'node.id') || `se-${i}`,
      }));
    }
  }
  if (Array.isArray(raw) && raw.length) {
    return raw.map((c, i) =>
      typeof c === 'string'
        ? { name: c, role: 'Cast', image: null, _k: `s-${i}` }
        : {
            name: c.name || c.actor || c.character || c.role || 'Unknown',
            character: c.character || '',
            role: c.role || (c.character ? 'Character' : 'Cast'),
            image: c.image || c.img || c.profile || c.picture || null,
            _k: c.id || c._id || c.slug || i,
          }
    );
  }
  const infoStr =
    get(animeData, 'animeInfo.Casts') ||
    get(animeData, 'animeInfo.Actors') ||
    get(animeData, 'animeInfo.Characters') ||
    '';
  if (typeof infoStr === 'string' && infoStr.trim()) {
    return infoStr.split(',').map((n, i) => ({ name: n.trim(), role: 'Cast', image: null, _k: `is-${i}` }));
  }
  return [];
};

// Normalize provider similar
const normalizeSimilar = (animeData) => {
  if (!animeData) return [];
  let pools = [
    animeData.similar,
    animeData.related,
    animeData.recommendations,
    get(animeData, 'relations'),
  ].filter(Boolean);

  const relEdges = get(animeData, 'relations.edges');
  if (Array.isArray(relEdges) && relEdges.length) {
    pools.push(relEdges.map((e) => ({ ...(get(e, 'node') || {}) })));
  }
  const recNodes = get(animeData, 'recommendations.nodes');
  if (Array.isArray(recNodes) && recNodes.length) {
    pools.push(recNodes.map((n) => get(n, 'mediaRecommendation') || n.media || n));
  }

  const flat = pools.flat().filter(Boolean);
  return flat
    .map((a, i) => ({
      id: a.id || a.route || a.slug || a.animeId || a._id || `sim-${i}`,
      title:
        a.title ||
        a.name ||
        get(a, 'titles.english') ||
        get(a, 'titles.romaji') ||
        get(a, 'node.title.english') ||
        get(a, 'node.title.romaji') ||
        'Unknown',
      poster: a.poster || a.image || a.cover || a.banner || get(a, 'coverImage.large') || null,
      tvInfo: a.tvInfo || {},
    }))
    .filter((x) => x.id);
};

export default function AnimeDetails() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [animeData, setAnimeData] = useState(null);
  const [episodesData, setEpisodesData] = useState(null);
  const [currentSeason, setCurrentSeason] = useState(1);
  const [loading, setLoading] = useState(true);
  const [episodesLoading, setEpisodesLoading] = useState(false);
  const [error, setError] = useState(null);

  const [episodeThumbnails, setEpisodeThumbnails] = useState({});
  const [tmdbMeta, setTmdbMeta] = useState(null); // { tmdbId, seasonNumber, usedTitle }

  // TMDB fallbacks
  const [castFallback, setCastFallback] = useState([]);
  const [similarFallback, setSimilarFallback] = useState([]);
  const [resolvedSimilar, setResolvedSimilar] = useState([]);
  const [resolvingSimilar, setResolvingSimilar] = useState(false);

  const loadedSeasons = useRef(new Set());
  const thumbnailsLoaded = useRef(false);

  // Zustand (stable selectors)
  const toggleWatch = useAnimeWatchlistStore((s) => s.toggle);
  const items = useAnimeWatchlistStore((s) => s.items);
  const inWatchlist = animeData ? !!items[animeData.id] : false;

  useEffect(() => {
    document.body.style.backgroundColor = 'var(--color-anime-background)';
    setEpisodeThumbnails({});
    thumbnailsLoaded.current = false;
    loadedSeasons.current.clear();

    setTmdbMeta(null);
    setCastFallback([]);
    setSimilarFallback([]);
    setResolvedSimilar([]);

    loadAnimeData();
  }, [id]);

  // Cache TMDB season/series match once
  useEffect(() => {
    const ensureTmdb = async () => {
      if (!animeData || !episodesData?.episodes || tmdbMeta) return;
      const baseTitle =
        animeData.seasons && animeData.seasons.length > 0
          ? animeData.seasons[0].name
          : animeData.title;
      try {
        const match = await findTmdbIdForSeason(baseTitle);
        if (match?.tmdbId) {
          setTmdbMeta({ tmdbId: match.tmdbId, seasonNumber: match.seasonNumber, usedTitle: baseTitle });
        }
      } catch (e) {
        console.warn('TMDB season match error:', e);
      }
    };
    ensureTmdb();
  }, [animeData, episodesData, tmdbMeta]);

  // Thumbnails (TMDB-driven)
  useEffect(() => {
    const fetchThumbs = async () => {
      if (!animeData || !episodesData?.episodes || thumbnailsLoaded.current) return;
      const titleForSearch =
        animeData.seasons && animeData.seasons.length > 0
          ? animeData.seasons[0].name
          : animeData.title;
      try {
        let seasonNum = 1;
        if (tmdbMeta?.seasonNumber) {
          seasonNum = tmdbMeta.seasonNumber;
        } else {
          const tmp = await findTmdbIdForSeason(titleForSearch);
          seasonNum = tmp?.seasonNumber || 1;
        }
        const thumbs = await fetchEpisodeThumbnails(
          episodesData.episodes.length,
          seasonNum,
          titleForSearch
        );
        if (thumbs?.length) {
          const map = {};
          thumbs.forEach((t) => {
            if (t.thumbnail) {
              map[t.episode_no] = {
                thumbnail: t.thumbnail,
                name: t.name,
                description: t.description,
              };
            }
          });
          setEpisodeThumbnails(map);
        }
      } catch (e) {
        console.warn('Episode thumbnails error:', e);
      } finally {
        thumbnailsLoaded.current = true;
      }
    };
    fetchThumbs();
  }, [animeData, episodesData, tmdbMeta]);

  // Cast fallback via TMDB if provider cast is empty
  useEffect(() => {
    const maybeFetchCast = async () => {
      if (!animeData || !tmdbMeta?.tmdbId) return;
      const haveProviderCast = normalizeCast(animeData).length > 0;
      if (haveProviderCast || castFallback.length > 0) return;
      const res = await fetchTmdbCredits(tmdbMeta.tmdbId);
      if (Array.isArray(res?.cast) && res.cast.length) {
        setCastFallback(
          res.cast.map((c, i) => ({
            name: c.name || 'Unknown',
            character: c.role || '',
            role: c.role || 'Cast',
            image: c.image || null,
            _k: `tmdbc-${i}`,
          }))
        );
      }
    };
    maybeFetchCast();
  }, [animeData, tmdbMeta, castFallback.length]);

  // Similar fallback via TMDB if provider similar is empty
  useEffect(() => {
    const maybeFetchSimilar = async () => {
      if (!animeData || !tmdbMeta?.tmdbId) return;
      const haveProviderSimilar = normalizeSimilar(animeData).length > 0;
      if (haveProviderSimilar || similarFallback.length > 0) return;
      const list = await fetchTmdbRecommendations(tmdbMeta.tmdbId);
      setSimilarFallback(list.slice(0, 12));
    };
    maybeFetchSimilar();
  }, [animeData, tmdbMeta, similarFallback.length]);

  // Resolve TMDB similar to provider IDs via your search endpoint
  useEffect(() => {
    const resolveIds = async () => {
      if (!similarFallback.length || resolvingSimilar || resolvedSimilar.length) return;
      setResolvingSimilar(true);
      try {
        const mapped = [];
        for (const item of similarFallback) {
          const title = item.title;
          try {
            const { results } = await searchAnime(title, 1);
            const first = Array.isArray(results) ? results[0] : null;
            if (first?.id) {
              mapped.push({
                id: first.id,
                title: first.title || title,
                poster: first.poster || item.poster,
                tvInfo: first.tvInfo || {},
              });
            }
          } catch {}
        }
        setResolvedSimilar(mapped);
      } finally {
        setResolvingSimilar(false);
      }
    };
    resolveIds();
  }, [similarFallback, resolvingSimilar, resolvedSimilar.length]);

  const loadAnimeData = async () => {
    try {
      setLoading(true);
      const [animeInfo, episodesList] = await Promise.all([
        fetchAnimeInfo(id),
        fetchEpisodesList(id),
      ]);
      if (!animeInfo) throw new Error('Failed to fetch anime data');

      setAnimeData(animeInfo);
      setEpisodesData(episodesList);
      loadedSeasons.current.add(id);

      if (animeInfo.seasons && animeInfo.seasons.length > 0) {
        const firstSeasonNumber = extractSeasonNumber(animeInfo.seasons[0].name);
        setCurrentSeason(firstSeasonNumber);
      }
    } catch (err) {
      console.error('Error loading anime details:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSeasonChange = async (seasonRoute) => {
    if (!seasonRoute) return;
    try {
      setEpisodesLoading(true);
      setEpisodeThumbnails({});
      thumbnailsLoaded.current = false;

      const [newAnimeInfo, newEpisodesData] = await Promise.all([
        fetchAnimeInfo(seasonRoute),
        fetchEpisodesList(seasonRoute),
      ]);

      if (newAnimeInfo && newEpisodesData) {
        setAnimeData((prev) => ({
          ...prev,
          ...newAnimeInfo,
          seasons: prev.seasons,
        }));
        setEpisodesData(newEpisodesData);
        loadedSeasons.current.add(seasonRoute);

        const seasonNumber = extractSeasonNumber(newAnimeInfo.title);
        setCurrentSeason(seasonNumber);

        // reset TMDB fallbacks so they refresh for the new season/title
        setCastFallback([]);
        setSimilarFallback([]);
        setResolvedSimilar([]);
        setTmdbMeta(null);
      }
    } catch (e) {
      console.error('Season change error:', e);
    } finally {
      setEpisodesLoading(false);
    }
  };

  const SkeletonEpisode = () => (
    <div className="bg-anime-card-bg border border-anime-border/10 rounded-xl p-3 animate-pulse">
      <div className="aspect-video rounded-md bg-gray-700" />
      <div className="h-3 w-2/3 bg-gray-700 rounded mt-2" />
    </div>
  );

  const firstEpisodeLink = useMemo(() => {
    const ep = episodesData?.episodes?.[0];
    if (!animeData?.id || !ep) return null;
    return `/anime/watch/${animeData.id}?ep=${encodeURIComponent(ep.episode_no)}&epid=${encodeURIComponent(ep.episodeid || '')}`;
  }, [episodesData, animeData]);

  const renderEpisodes = (episodes) => {
    if (episodesLoading) {
      return (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {Array.from({ length: 8 }, (_, i) => (
            <SkeletonEpisode key={i} />
          ))}
        </div>
      );
    }
    if (!episodes || episodes.length === 0) {
      return <div className="text-center py-10 text-gray-400">No episodes available</div>;
    }

    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {episodes.map((episode, idx) => {
          const epNo = parseInt(episode.episode_no);
          const t = episodeThumbnails[epNo];
          const thumb =
            t?.thumbnail ||
            episode.thumbnail ||
            'https://placehold.co/320x180/141414/fff/?text=Episode&font=poppins';
          const title =
            t?.name || episode.title || episode.japanese_title || `Episode ${episode.episode_no}`;

          return (
            <Link
              to={`/anime/watch/${animeData?.id}?ep=${encodeURIComponent(
                episode.episode_no
              )}&epid=${encodeURIComponent(episode.episodeid || '')}`}
              key={episode.episodeid || idx}
              className="group bg-anime-card-bg/70 border border-anime-border/10 rounded-xl overflow-hidden hover:border-white/20 transition"
            >
              <div className="relative aspect-video">
                <img
                  src={thumb}
                  alt={title}
                  className="w-full h-full object-cover"
                  loading="lazy"
                  onError={(e) => {
                    e.currentTarget.src =
                      'https://placehold.co/320x180/141414/fff/?text=Episode&font=poppins';
                  }}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent opacity-0 group-hover:opacity-100 transition" />
                <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between">
                  <span className="text-[11px] px-2 py-1 rounded bg-black/70 border border-white/10">
                    Ep {episode.episode_no}
                  </span>
                  <Play className="w-4 h-4 opacity-0 group-hover:opacity-100 transition" />
                </div>
              </div>
              <div className="p-3">
                <div className="text-sm font-medium line-clamp-2">{title}</div>
                {t?.description && (
                  <p className="mt-1 text-xs text-white/70 line-clamp-2">{t.description}</p>
                )}
                {episode.filler && (
                  <span className="inline-block mt-2 text-[10px] px-2 py-[2px] rounded-full bg-yellow-600/90">
                    Filler
                  </span>
                )}
              </div>
            </Link>
          );
        })}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen w-full">
        <div className="text-white">Loading anime details...</div>
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex justify-center items-center h-screen w-full flex-col gap-4">
        <h2 className="text-2xl font-bold text-white">Failed to load anime details</h2>
        <p className="text-white/80">{error}</p>
        <button
          onClick={() => window.history.back()}
          className="px-4 py-2 bg-anime-card-bg border border-anime-border/10 rounded-lg text-white hover:bg-anime-card-hover transition"
        >
          Go Back
        </button>
      </div>
    );
  }
  if (!animeData) {
    return (
      <div className="flex justify-center items-center h-screen w-full">
        <div className="text-white">No anime data found</div>
      </div>
    );
  }

  const info = animeData?.animeInfo || {};
  const genres = getGenres(info);

  // Provider first; fallback to TMDB if needed
  const providerCast = normalizeCast(animeData);
  const cast = providerCast.length ? providerCast : castFallback;

  const providerSimilar = normalizeSimilar(animeData);
  const similar =
    providerSimilar.length ? providerSimilar : (resolvedSimilar.length ? resolvedSimilar : []);

  const poster =
    animeData?.poster ||
    animeData?.cover ||
    animeData?.banner ||
    'https://placehold.co/600x900/141414/fff/?text=Poster&font=poppins';

  return (
    <div className="min-h-screen text-white">
      <AnimeHeader />

      {/* Top bar */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-20">
        <div className="flex items-center justify-between gap-3">
          <button
            onClick={() => navigate(-1)}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-anime-card-bg border border-anime-border/10 hover:bg-anime-card-hover active:scale-95 transition"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back</span>
          </button>
        </div>
      </div>

      {/* Hero (poster left, details right) */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 mt-4">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          {/* Left: Poster */}
          <div className="md:col-span-2">
            <div className="rounded-2xl overflow-hidden border border-anime-border/10 bg-anime-card-bg md:sticky md:top-24">
              <div className="aspect-[2/3] w-full">
                <img
                  src={poster}
                  alt={animeData?.title}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              </div>
            </div>
          </div>

          {/* Right: Details */}
          <div className="md:col-span-3">
            <div className="bg-anime-modal-bg border border-anime-border/10 rounded-2xl p-4 sm:p-6">
              <h1 className="text-2xl sm:text-4xl font-bold">{animeData.title}</h1>

              {/* Meta chips */}
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-white/80">
                {info.Type && <span className="bg-white/10 px-2 py-1 rounded">{info.Type}</span>}
                {info.Status && <span className="bg-white/10 px-2 py-1 rounded">{info.Status}</span>}
                {info.Duration && <span className="bg-white/10 px-2 py-1 rounded">{info.Duration}</span>}
                {episodesData?.episodes?.length > 0 && (
                  <span className="bg-white/10 px-2 py-1 rounded">
                    {episodesData.episodes.length} ep
                  </span>
                )}
                {currentSeason && (
                  <span className="bg-white/10 px-2 py-1 rounded">Season {currentSeason}</span>
                )}
              </div>

              {/* Genres */}
              {genres.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {genres.slice(0, 12).map((g) => (
                    <span
                      key={g}
                      className="text-xs bg-anime-badge-bg/60 border border-anime-badge-border/50 px-2 py-1 rounded-md"
                    >
                      {g}
                    </span>
                  ))}
                </div>
              )}

              {/* Overview */}
              <p className="mt-4 text-sm sm:text-base text-white/80 leading-relaxed">
                {info.Overview || animeData.description || 'No description available'}
              </p>

              {/* Actions */}
              <div className="mt-5 flex flex-wrap items-center gap-2">
                {firstEpisodeLink && (
                  <Link
                    to={firstEpisodeLink}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white text-black font-medium hover:bg-zinc-200 active:scale-95 transition"
                  >
                    <Play className="w-4 h-4" />
                    Watch now
                  </Link>
                )}
                <button
                  onClick={() => toggleWatch(animeData)}
                  aria-pressed={inWatchlist}
                  className={`px-4 py-2 rounded-lg font-medium border transition
                    ${
                      inWatchlist
                        ? 'bg-green-500/20 text-green-200 border-green-400/30 hover:bg-green-500/30'
                        : 'bg-white/10 text-white border-white/15 hover:bg-white/20'
                    }`}
                >
                  {inWatchlist ? 'In Watchlist' : 'Add to Watchlist'}
                </button>
              </div>
            </div>

            {/* Inline Info panel */}
            <div className="mt-4 bg-anime-modal-bg border border-anime-border/10 rounded-2xl p-4 sm:p-6">
              <h2 className="text-lg font-semibold mb-3">Info</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-y-3 gap-x-6 text-sm">
                {info.Title && (
                  <div>
                    <div className="text-white/60">Original Title</div>
                    <div className="text-white">{info.Title}</div>
                  </div>
                )}
                {info.Aired && (
                  <div>
                    <div className="text-white/60">Aired</div>
                    <div className="text-white">{info.Aired}</div>
                  </div>
                )}
                {info.Studios && (
                  <div>
                    <div className="text-white/60">Studios</div>
                    <div className="text-white">
                      {Array.isArray(info.Studios) ? info.Studios.join(', ') : info.Studios}
                    </div>
                  </div>
                )}
                {info.Producer && (
                  <div>
                    <div className="text-white/60">Producers</div>
                    <div className="text-white">
                      {Array.isArray(info.Producer) ? info.Producer.join(', ') : info.Producer}
                    </div>
                  </div>
                )}
                {(info.Score || info.Rating) && (
                  <div>
                    <div className="text-white/60">Rating</div>
                    <div className="text-white">{info.Score || info.Rating}</div>
                  </div>
                )}
                {info.Season && (
                  <div>
                    <div className="text-white/60">Season</div>
                    <div className="text-white">{info.Season}</div>
                  </div>
                )}
                {info.Year && (
                  <div>
                    <div className="text-white/60">Year</div>
                    <div className="text-white">{info.Year}</div>
                  </div>
                )}
                {info.Source && (
                  <div>
                    <div className="text-white/60">Source</div>
                    <div className="text-white">{info.Source}</div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Body */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 mt-6 pb-12 space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Episodes & Seasons */}
          <div className="lg:col-span-2 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold">Episodes</h2>
              {animeData.seasons && animeData.seasons.length > 1 && (
                <div className="relative">
                  <select
                    className="appearance-none bg-anime-card-bg border border-anime-border/10 rounded-lg px-4 py-2 pr-8 text-white cursor-pointer outline-none hover:bg-anime-card-hover transition"
                    defaultValue=""
                    onChange={(e) => handleSeasonChange(e.target.value)}
                  >
                    {animeData.seasons.map((season, i) => (
                      <option key={i} value={season.route}>{season.name}</option>
                    ))}
                  </select>
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-white">
                    <svg className="fill-current h-4 w-4" viewBox="0 0 20 20">
                      <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" />
                    </svg>
                  </div>
                </div>
              )}
            </div>
            {renderEpisodes(episodesData?.episodes || [])}
          </div>

          {/* Right rail */}
          <div className="space-y-6">
            {/* Cast / Characters */}
            <div className="bg-anime-modal-bg border border-anime-border/10 rounded-2xl p-4">
              <h3 className="text-lg font-semibold mb-3">Cast / Characters</h3>
              {cast.length > 0 ? (
                <div className="flex gap-4 overflow-x-auto no-scrollbar pb-1">
                  {cast.slice(0, 20).map((c, idx) => (
                    <div key={c._k || idx} className="min-w-[110px]">
                      <div className="w-[110px] h-[150px] bg-anime-card-bg rounded-lg overflow-hidden">
                        <img
                          src={
                            c.image ||
                            'https://placehold.co/220x300/141414/fff/?text=Cast&font=poppins'
                          }
                          alt={c.name || c.character || 'Character'}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      </div>
                      <div className="mt-2 text-xs">
                        <div className="font-medium line-clamp-2">{c.name || c.character}</div>
                        {(c.role || c.character) && (
                          <div className="text-white/60 line-clamp-1">{c.role || c.character}</div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-white/60 text-sm">No cast information available.</div>
              )}
            </div>

            {/* Similar */}
            <div className="bg-anime-modal-bg border border-anime-border/10 rounded-2xl p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-semibold">Similar</h3>
              </div>
              {similar.length > 0 ? (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {similar.slice(0, 9).map((a) => (
                    <AnimeCard key={a.id} animeData={a} />
                  ))}
                </div>
              ) : resolvingSimilar ? (
                <div className="text-white/60 text-sm">Loading similar…</div>
              ) : (
                <div className="text-white/60 text-sm">No similar titles yet.</div>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
