// src/pages/anime/watch.jsx
import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate, useParams, useSearchParams, Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import AnimeHeader from '../../components/anime/ui/header.jsx';
import { fetchAnimeInfo, fetchEpisodesList } from '../../components/anime/animeData.jsx';
import { getSourceUrl, getDefaultSource, animeSources } from './sources.jsx';

export default function AnimeWatch() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [searchParams] = useSearchParams();

  const [animeData, setAnimeData] = useState(null);
  const [episodesData, setEpisodesData] = useState(null);
  const [currentSource, setCurrentSource] = useState(getDefaultSource());
  const [currentLanguage, setCurrentLanguage] = useState('sub');
  const [currentEpisode, setCurrentEpisode] = useState(null);
  const [loading, setLoading] = useState(true);

  const epNoParam = searchParams.get('ep');
  const epidParam = searchParams.get('epid');

  useEffect(() => {
    document.body.style.backgroundColor = 'var(--color-anime-background)';

    const load = async () => {
      try {
        setLoading(true);
        const [info, eps] = await Promise.all([fetchAnimeInfo(id), fetchEpisodesList(id)]);
        setAnimeData(info);
        setEpisodesData(eps);

        const pick =
          eps?.episodes?.find((e) =>
            epidParam ? `${e.episodeid}` === `${epidParam}` : `${e.episode_no}` === `${epNoParam || 1}`
          ) || eps?.episodes?.[0];

        setCurrentEpisode(pick || null);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [id, epNoParam, epidParam]);

  const iframeSrc = useMemo(() => {
    if (!currentEpisode || !animeData) return 'about:blank';
    const withSeason = {
      ...animeData,
      season:
        animeData.seasons && animeData.seasons.length > 0
          ? (animeData.seasons[0].name || '').match(/\d+/)?.[0] || '1'
          : '1',
    };
    return getSourceUrl(currentSource.id, currentLanguage, currentEpisode, withSeason);
  }, [currentEpisode, animeData, currentSource, currentLanguage]);

  if (loading) {
    return (
      <div className="min-h-screen text-white flex items-center justify-center">
        Loading player...
      </div>
    );
  }

  return (
    <div className="min-h-screen text-white">
      <AnimeHeader />
      <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-20 pb-10">
        {/* Top bar */}
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={() => navigate(-1)}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-anime-card-bg border border-anime-border/10 hover:bg-anime-card-hover active:scale-95 transition"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back</span>
          </button>

          <div className="text-right">
            <div className="text-sm text-white/70">Watching</div>
            <div className="text-lg font-semibold line-clamp-1">
              {animeData?.title || 'Anime'}
            </div>
          </div>
        </div>

        {/* Player */}
        <div className="rounded-xl border border-anime-border/10 overflow-hidden">
          <iframe
            className="w-full h-[48vh] sm:h-[60vh]"
            src={iframeSrc}
            allowFullScreen
            title="Anime Player"
          />
        </div>

        {/* Server + Language */}
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* SUB */}
          <div className="bg-anime-modal-bg border border-anime-border/10 rounded-xl p-4">
            <div className="text-xs text-white/60 mb-2">SUB</div>
            <div className="grid grid-cols-3 gap-2">
              {animeSources.map((s) => (
                <button
                  key={`${s.id}-sub`}
                  onClick={() => {
                    setCurrentSource(s);
                    setCurrentLanguage('sub');
                  }}
                  className={`px-2 py-1.5 rounded-lg text-sm border transition ${
                    currentSource.id === s.id && currentLanguage === 'sub'
                      ? '!bg-white text-anime-card-bg'
                      : 'bg-anime-card-bg hover:bg-anime-card-hover border-anime-border/10'
                  }`}
                >
                  {s.name}
                </button>
              ))}
            </div>
          </div>
          {/* DUB */}
          <div className="bg-anime-modal-bg border border-anime-border/10 rounded-xl p-4">
            <div className="text-xs text-white/60 mb-2">DUB</div>
            <div className="grid grid-cols-3 gap-2">
              {animeSources.map((s) => (
                <button
                  key={`${s.id}-dub`}
                  onClick={() => {
                    setCurrentSource(s);
                    setCurrentLanguage('dub');
                  }}
                  className={`px-2 py-1.5 rounded-lg text-sm border transition ${
                    currentSource.id === s.id && currentLanguage === 'dub'
                      ? '!bg-white text-anime-card-bg'
                      : 'bg-anime-card-bg hover:bg-anime-card-hover border-anime-border/10'
                  }`}
                >
                  {s.name}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Episode picker */}
        {episodesData?.episodes?.length > 0 && (
          <div className="mt-6 bg-anime-modal-bg border border-anime-border/10 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold">Episodes</h3>
              <Link
                to={`/anime/${animeData?.id}`}
                className="text-sm text-white/80 underline underline-offset-4"
              >
                Back to details
              </Link>
            </div>
            <div className="flex gap-2 overflow-x-auto no-scrollbar">
              {episodesData.episodes.map((ep) => {
                const active =
                  currentEpisode && `${currentEpisode.episodeid}` === `${ep.episodeid}`;
                return (
                  <button
                    key={ep.episodeid}
                    onClick={() => setCurrentEpisode(ep)}
                    className={`px-3 py-1.5 rounded-lg text-sm border whitespace-nowrap transition ${
                      active
                        ? '!bg-white text-anime-card-bg'
                        : 'bg-anime-card-bg hover:bg-anime-card-hover border-anime-border/10'
                    }`}
                  >
                    Ep {ep.episode_no}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
