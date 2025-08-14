// src/pages/browser/Marker.jsx
import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { toast } from 'sonner';
import config from '../../config.json';
import { fetchTmdb, getTmdbImage } from '../../utils.jsx';

// ---------------- Helpers ----------------
const parseTime = (val) => {
  if (val === '' || val == null) return null;
  const s = String(val).trim();
  if (/^\d+(\.\d+)?$/.test(s)) return Math.max(0, Number(s)); // seconds
  const parts = s.split(':').map(Number);
  if (parts.some(n => Number.isNaN(n))) return NaN;
  if (parts.length === 3) {
    const [h, m, sec] = parts;
    return Math.max(0, h * 3600 + m * 60 + sec);
  }
  if (parts.length === 2) {
    const [m, sec] = parts;
    return Math.max(0, m * 60 + sec);
  }
  return NaN;
};

const fmt = (n) => {
  if (n == null || Number.isNaN(n)) return '';
  const sec = Math.max(0, Number(n));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const pad = (x) => String(x).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
};

const Field = ({ label, hint, children }) => (
  <label className="block mb-3">
    <div className="text-sm text-white/90 mb-1">{label}</div>
    {children}
    {hint && <div className="text-xs text-white/60 mt-1">{hint}</div>}
  </label>
);

const NumberOrTimeInput = ({ value, onChange, placeholder }) => (
  <input
    className="w-full bg-white/5 text-white rounded-lg px-3 py-2 outline-none border border-white/10 focus:border-white/30"
    value={value}
    placeholder={placeholder}
    onChange={(e) => onChange(e.target.value)}
  />
);

// ---------------- Page ----------------
const Marker = () => {
  const [sp, setSp] = useSearchParams();
  const navigate = useNavigate();

  // -------- Search UI for normal users --------
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState([]);
  const [showResults, setShowResults] = useState(false);

  // Query sync / selection
  const [tmdbId, setTmdbId] = useState(sp.get('tmdb_id') || '');
  const [mediaType, setMediaType] = useState(sp.get('type') || (sp.get('season') && sp.get('episode') ? 'tv' : 'movie'));
  const [season, setSeason] = useState(sp.get('season') || '');
  const [episode, setEpisode] = useState(sp.get('episode') || '');

  // Markers
  const [introStart, setIntroStart] = useState('');
  const [introEnd, setIntroEnd] = useState('');
  const [outroStart, setOutroStart] = useState('');
  const [outroEnd, setOutroEnd] = useState('');

  // API state
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Player state
  const [playerStatus, setPlayerStatus] = useState('idle'); // idle | loading | ready | error
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration]   = useState(0);
  const [usedSource, setUsedSource] = useState('');
  const [sourceMode, setSourceMode] = useState('Auto'); // Auto | Fox | PrimeNet
  const [videoUrl, setVideoUrl] = useState('');

  // Selected item preview (for UX niceness)
  const [selectedItem, setSelectedItem] = useState(null);

  // Refs
  const videoRef = useRef(null);
  const hlsRef = useRef(null);
  const timeJumpRef = useRef(null);
  const resultsBoxRef = useRef(null);

  const apiBase = (config.skipMarkerApi || '').replace(/\/$/, '');

  const q = useMemo(() => {
    const qs = new URLSearchParams();
    if (tmdbId) qs.set('tmdb_id', String(tmdbId));
    if (mediaType === 'tv') {
      qs.set('season', String(season || 0));
      qs.set('episode', String(episode || 0));
    } else {
      qs.set('season', '0');
      qs.set('episode', '0');
    }
    return qs.toString();
  }, [tmdbId, mediaType, season, episode]);

  const shareLink = `${window.location.origin}/browser/marker?${q}`;

  // --------- TMDB Search (debounced with utils.fetchTmdb) ---------
  useEffect(() => {
    if (!query || query.trim().length < 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    const id = setTimeout(async () => {
      try {
        setSearching(true);
        setShowResults(true);
        // Use multi-search so users can find movies & TV in one box
        const route = `/search/multi?query=${encodeURIComponent(query.trim())}&include_adult=false&language=en-US&page=1`;
        const data = await fetchTmdb(route);
        if (!cancelled) {
          const cleaned = (data?.results || []).filter(r => r.media_type === 'movie' || r.media_type === 'tv');
          setResults(cleaned.slice(0, 12)); // keep it tidy
        }
      } catch (e) {
        if (!cancelled) {
          console.error(e);
          toast.error('Search failed');
          setResults([]);
        }
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 300);
    return () => { cancelled = true; clearTimeout(id); };
  }, [query]);

  // Close results when clicking outside
  useEffect(() => {
    const onClick = (e) => {
      if (!resultsBoxRef.current) return;
      if (!resultsBoxRef.current.contains(e.target)) setShowResults(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const pickResult = (item) => {
    setSelectedItem(item);
    setTmdbId(String(item.id));
    const mt = item.media_type === 'tv' ? 'tv' : 'movie';
    setMediaType(mt);
    if (mt === 'tv') {
      if (!season) setSeason('1');
      if (!episode) setEpisode('1');
    } else {
      setSeason('');
      setEpisode('');
    }
    setQuery(item.title || item.name || '');
    setShowResults(false);
    toast.success(`Selected ${item.title || item.name}`);
  };

  // ----------- Load / Save markers -----------
  const loadExisting = async () => {
    if (!apiBase || !tmdbId) {
      toast.error('Pick a title first');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${apiBase}/skip-markers?${q}`);
      if (!res.ok) throw new Error(`Load failed: ${res.status}`);
      const data = await res.json();
      if (data && typeof data === 'object') {
        setIntroStart(data.intro_start_seconds ?? '');
        setIntroEnd(data.intro_end_seconds ?? '');
        setOutroStart(data.outro_start_seconds ?? '');
        setOutroEnd(data.outro_end_seconds ?? '');
        toast.success('Loaded existing markers');
      } else {
        setIntroStart(''); setIntroEnd(''); setOutroStart(''); setOutroEnd('');
        toast.message('No markers found yet for this item');
      }
    } catch (e) {
      console.error(e);
      toast.error(e.message || 'Failed to load markers');
    } finally {
      setLoading(false);
    }
  };

  const buildPayload = () => {
    const pIntroStart = parseTime(introStart);
    const pIntroEnd = parseTime(introEnd);
    const pOutroStart = parseTime(outroStart);
    const pOutroEnd = parseTime(outroEnd);

    const err = (msg) => { toast.error(msg); return null; };

    if (!tmdbId) return err('Pick a title first');
    if (mediaType === 'tv') {
      if (!season) return err('Season is required for TV');
      if (!episode) return err('Episode is required for TV');
    }
    if (pIntroStart != null && !Number.isNaN(pIntroStart) && pIntroEnd != null && !Number.isNaN(pIntroEnd) && pIntroEnd <= pIntroStart) {
      return err('Intro end must be greater than intro start');
    }
    if (pOutroStart != null && !Number.isNaN(pOutroStart) && pOutroEnd != null && !Number.isNaN(pOutroEnd) && pOutroEnd <= pOutroStart) {
      return err('Outro end must be greater than outro start');
    }

    return {
      tmdb_id: Number(tmdbId),
      media_type: mediaType,
      season: Number(mediaType === 'tv' ? season || 0 : 0),
      episode: Number(mediaType === 'tv' ? episode || 0 : 0),
      intro_start_seconds: Number.isNaN(pIntroStart) ? null : pIntroStart ?? null,
      intro_end_seconds: Number.isNaN(pIntroEnd) ? null : pIntroEnd ?? null,
      outro_start_seconds: Number.isNaN(pOutroStart) ? null : pOutroStart ?? null,
      outro_end_seconds: Number.isNaN(pOutroEnd) ? null : pOutroEnd ?? null
    };
  };

  const save = async () => {
    const payload = buildPayload();
    if (!payload) return;
    if (!apiBase) { toast.error('skipMarkerApi is not set in config.json'); return; }

    setSaving(true);
    try {
      const res = await fetch(`${apiBase}/skip-markers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error(`Save failed: ${res.status}`);
      const data = await res.json();
      toast.success('Markers saved');
      setIntroStart(data.intro_start_seconds ?? payload.intro_start_seconds ?? '');
      setIntroEnd(data.intro_end_seconds ?? payload.intro_end_seconds ?? '');
      setOutroStart(data.outro_start_seconds ?? payload.outro_start_seconds ?? '');
      setOutroEnd(data.outro_end_seconds ?? payload.outro_end_seconds ?? '');
    } catch (e) {
      console.error(e);
      toast.error(e.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const resetForm = () => {
    setIntroStart('');
    setIntroEnd('');
    setOutroStart('');
    setOutroEnd('');
  };

  // ----------- Keep URL query in sync -----------
  useEffect(() => {
    const params = new URLSearchParams();
    if (tmdbId) params.set('tmdb_id', tmdbId);
    if (mediaType) params.set('type', mediaType);
    if (mediaType === 'tv') {
      if (season) params.set('season', season);
      if (episode) params.set('episode', episode);
    }
    setSp(params, { replace: true });
  }, [tmdbId, mediaType, season, episode, setSp]);

  useEffect(() => { if (season || episode) setMediaType('tv'); }, [season, episode]);

  // ---------------- Video fetching (Fox / PrimeNet) ----------------
  const fetchVideoFromSource = useCallback(async (name) => {
    const foxParams = { id: tmdbId };
    if (mediaType === 'tv') { foxParams.season = season; foxParams.episode = episode; }

    if (name === 'Fox') {
      const url = new URL('https://backend.xprime.tv/fox');
      Object.keys(foxParams).forEach(k => url.searchParams.append(k, foxParams[k]));
      const r = await fetch(url);
      if (!r.ok) throw new Error(`Fox API ${r.status}`);
      const d = await r.json();
      if (!d.url) throw new Error('Fox: no url');
      return { url: d.url, headers: { origin: 'https://xprime.tv', referer: 'https://xprime.tv/' }, label: 'Fox' };
    }
    if (name === 'PrimeNet') {
      const qs = mediaType === 'tv'
        ? `?id=${tmdbId}&season=${season}&episode=${episode}`
        : `?id=${tmdbId}`;
      const r = await fetch(`https://backend.xprime.tv/primenet${qs}`);
      if (!r.ok) throw new Error(`PrimeNet API ${r.status}`);
      const d = await r.json();
      if (!d.url) throw new Error('PrimeNet: no url');
      return { url: d.url, headers: { origin: 'https://xprime.tv', referer: 'https://xprime.tv/' }, label: 'PrimeNet' };
    }
    throw new Error('Unknown source');
  }, [tmdbId, mediaType, season, episode]);

  const loadPreview = useCallback(async () => {
    if (!tmdbId) { toast.error('Pick a title first'); return; }
    setPlayerStatus('loading');
    try {
      let picked = null;
      if (sourceMode === 'Auto') {
        const p1 = fetchVideoFromSource('Fox');
        const p2 = fetchVideoFromSource('PrimeNet');
        picked = await Promise.any([p1, p2]);
      } else {
        picked = await fetchVideoFromSource(sourceMode);
      }
      setUsedSource(picked.label);

      const proxied = `${config.m3u8proxy}/m3u8-proxy?url=${encodeURIComponent(picked.url)}&headers=${encodeURIComponent(JSON.stringify(picked.headers))}`;
      setVideoUrl(proxied);
      setPlayerStatus('ready');
      toast.success(`Loaded preview from ${picked.label}`);
    } catch (e) {
      console.error(e);
      setPlayerStatus('error');
      toast.error(e.message || 'Failed to load preview');
    }
  }, [tmdbId, sourceMode, fetchVideoFromSource]);

  // ---------------- HLS.js setup ----------------
  useEffect(() => {
    const setup = async () => {
      if (!videoUrl || !videoRef.current) return;
      const video = videoRef.current;

      // cleanup any previous
      if (hlsRef.current) {
        try { hlsRef.current.destroy(); } catch {}
        hlsRef.current = null;
      }
      video.removeAttribute('src');
      video.load();

      try {
        const Hls = (await import('hls.js')).default;
        if (Hls.isSupported()) {
          const hls = new Hls({ enableWorker: true, autoStartLoad: true });
          hlsRef.current = hls;
          hls.on(Hls.Events.ERROR, (_e, d) => {
            console.warn('HLS error (preview):', d);
          });
          hls.attachMedia(video);
          hls.on(Hls.Events.MEDIA_ATTACHED, () => {
            hls.loadSource(videoUrl);
          });
        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
          video.src = videoUrl;
        } else {
          toast.error('HLS not supported in this browser');
        }
      } catch (e) {
        console.error(e);
        toast.error('Failed to init preview player');
      }
    };
    setup();

    return () => {
      if (hlsRef.current) {
        try { hlsRef.current.destroy(); } catch {}
        hlsRef.current = null;
      }
    };
  }, [videoUrl]);

  // Track time/duration
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onTime = () => setCurrentTime(v.currentTime);
    const onDur  = () => setDuration(isFinite(v.duration) ? v.duration : 0);
    v.addEventListener('timeupdate', onTime);
    v.addEventListener('durationchange', onDur);
    v.addEventListener('loadedmetadata', onDur);
    return () => {
      v.removeEventListener('timeupdate', onTime);
      v.removeEventListener('durationchange', onDur);
      v.removeEventListener('loadedmetadata', onDur);
    };
  }, [videoUrl]);

  // Seek helpers
  const nudge = (s) => {
    const v = videoRef.current; if (!v) return;
    v.currentTime = Math.max(0, Math.min((duration || 0), (v.currentTime || 0) + s));
  };
  const jumpTo = () => {
    const val = parseTime(timeJumpRef.current?.value || '');
    if (val == null || Number.isNaN(val)) { toast.error('Invalid time'); return; }
    const v = videoRef.current; if (!v) return;
    v.currentTime = Math.max(0, Math.min(duration || 0, val));
  };
  const togglePlay = () => {
    const v = videoRef.current; if (!v) return;
    if (v.paused) v.play().catch(() => {}); else v.pause();
  };

  // One-click setters from current time
  const setFromNow = (setter) => {
    setter(Math.floor(currentTime));
  };

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e) => {
      if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;
      const withShift = e.shiftKey;
      if (e.code === 'Space') { e.preventDefault(); togglePlay(); return; }
      switch (e.key) {
        case 'ArrowLeft':  e.preventDefault(); nudge(withShift ? -60 : -10); break;
        case 'ArrowRight': e.preventDefault(); nudge(withShift ?  60 :  10); break;
        case 'i': case 'I': e.preventDefault(); setFromNow(setIntroStart); break;
        case 'o': case 'O': e.preventDefault(); setFromNow(setIntroEnd); break;
        case 'k': case 'K': e.preventDefault(); setFromNow(setOutroStart); break;
        case 'l': case 'L': e.preventDefault(); setFromNow(setOutroEnd); break;
        default: break;
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [currentTime, duration]);

  // ---------------- UI ----------------
  return (
    <div className="min-h-screen w-full bg-gradient-to-b from-black to-[#0b0b0f] text-white">
      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* Top bar */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-semibold">Skip Marker Editor</h1>
          <div className="flex gap-3">
            <Link
              to="/"
              className="px-4 py-2 rounded-lg bg-white text-black font-semibold hover:bg-gray-200"
              title="Back to Home"
            >
              Go Home
            </Link>
            <a
              href={shareLink}
              target="_blank"
              rel="noreferrer"
              className="px-4 py-2 rounded-lg bg-white/10 text-white hover:bg-white/20"
            >
              Open shared link
            </a>
          </div>
        </div>

        {/* Search box */}
        <div className="mb-6 relative" ref={resultsBoxRef}>
          <div className="grid md:grid-cols-3 gap-3">
            <div className="md:col-span-2">
              <Field label="Search for a movie or TV show" hint="Pick a title; we’ll fill the ID for you.">
                <input
                  className="w-full bg-white/5 text-white rounded-lg px-3 py-2 outline-none border border-white/10 focus:border-white/30"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="e.g., Oppenheimer, The Office"
                  onFocus={() => results.length && setShowResults(true)}
                />
              </Field>
            </div>
            <div className="md:col-span-1">
              <Field label="(Optional) TMDB ID">
                <input
                  className="w-full bg-white/5 text-white rounded-lg px-3 py-2 outline-none border border-white/10 focus:border-white/30"
                  value={tmdbId}
                  onChange={(e) => setTmdbId(e.target.value.replace(/\D/g, ''))}
                  placeholder="Auto-filled when you pick"
                  inputMode="numeric"
                />
              </Field>
            </div>
          </div>

          {showResults && (query?.trim()?.length >= 2) && (
            <div className="absolute z-30 mt-1 w-full md:w-[66%] bg-[#141414] border border-white/10 rounded-xl max-h-[420px] overflow-auto shadow-2xl">
              <div className="p-2 text-sm text-white/60">{searching ? 'Searching…' : 'Results'}</div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 p-2">
                {results.length === 0 && !searching && (
                  <div className="col-span-full text-white/60 text-sm px-2 py-6 text-center">No results</div>
                )}
                {results.map((r) => {
                  const title = r.title || r.name || 'Untitled';
                  const year = (r.release_date || r.first_air_date || '').slice(0, 4);
                  const poster = getTmdbImage(r.poster_path) || getTmdbImage(r.backdrop_path);
                  return (
                    <button
                      key={`${r.media_type}-${r.id}`}
                      className="text-left bg-white/5 hover:bg-white/10 rounded-lg overflow-hidden border border-white/10"
                      onClick={() => pickResult(r)}
                    >
                      <div className="aspect-[2/3] w-full bg-black/40">
                        {poster ? (
                          <img src={poster} alt={title} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-white/40 text-xs">No Image</div>
                        )}
                      </div>
                      <div className="p-2">
                        <div className="text-sm font-medium text-white line-clamp-2">{title}</div>
                        <div className="text-xs text-white/60 mt-0.5 uppercase">{r.media_type}{year ? ` • ${year}` : ''}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Selected title preview & type/episode controls */}
        <div className="grid md:grid-cols-2 gap-4 mb-4">
          <Field label="Type">
            <select
              className="w-full bg-white/5 text-white rounded-lg px-3 py-2 outline-none border border-white/10 focus:border-white/30"
              value={mediaType}
              onChange={(e) => setMediaType(e.target.value)}
            >
              <option value="movie">Movie</option>
              <option value="tv">TV</option>
            </select>
          </Field>

          {mediaType === 'tv' && (
            <>
              <Field label="Season">
                <input
                  className="w-full bg-white/5 text-white rounded-lg px-3 py-2 outline-none border border-white/10 focus:border-white/30"
                  value={season}
                  onChange={(e) => setSeason(e.target.value.replace(/\D/g, ''))}
                  placeholder="e.g., 1"
                  inputMode="numeric"
                />
              </Field>
              <Field label="Episode">
                <input
                  className="w-full bg-white/5 text-white rounded-lg px-3 py-2 outline-none border border-white/10 focus:border-white/30"
                  value={episode}
                  onChange={(e) => setEpisode(e.target.value.replace(/\D/g, ''))}
                  placeholder="e.g., 3"
                  inputMode="numeric"
                />
              </Field>
            </>
          )}
        </div>

        {selectedItem && (
          <div className="flex items-center gap-3 mb-6 bg-white/5 border border-white/10 rounded-xl p-3">
            <div className="w-12 h-16 bg-black/40 rounded overflow-hidden">
              <img
                src={getTmdbImage(selectedItem.poster_path) || getTmdbImage(selectedItem.backdrop_path) || ''}
                className="w-full h-full object-cover"
                alt=""
              />
            </div>
            <div className="text-sm">
              <div className="text-white font-semibold">{selectedItem.title || selectedItem.name}</div>
              <div className="text-white/60 uppercase">
                {selectedItem.media_type} • TMDB {tmdbId}
              </div>
            </div>
          </div>
        )}

        {/* Source + Preview controls */}
        <div className="rounded-xl bg-white/5 border border-white/10 p-3 md:p-4 mb-6">
          <div className="flex flex-wrap items-center gap-3 mb-3">
            <div className="flex items-center gap-2">
              <span className="text-sm text-white/80">Source:</span>
              <select
                className="bg-white/10 text-white px-3 py-2 rounded-lg border border-white/10 focus:border-white/30"
                value={sourceMode}
                onChange={(e) => setSourceMode(e.target.value)}
              >
                <option>Auto</option>
                <option>Fox</option>
                <option>PrimeNet</option>
              </select>
              <button
                onClick={loadPreview}
                className="px-3 py-2 rounded-lg bg-white text-black font-semibold hover:bg-gray-200"
              >
                {playerStatus === 'loading' ? 'Loading…' : 'Load Preview'}
              </button>
              {usedSource && <span className="text-white/60 text-sm">Using: {usedSource}</span>}
            </div>

            <div className="ml-auto flex items-center gap-2">
              <input
                ref={timeJumpRef}
                placeholder="hh:mm:ss or seconds"
                className="bg-white/10 text-white px-3 py-2 rounded-lg border border-white/10 focus:border-white/30 w-44"
              />
              <button
                onClick={jumpTo}
                className="px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20"
              >
                Jump
              </button>
            </div>
          </div>

          <div className="relative w-full aspect-video bg-black/60 rounded-lg overflow-hidden">
            <video
              ref={videoRef}
              className="w-full h-full object-contain"
              controls
              playsInline
              onError={() => toast.error('Preview playback error')}
            />
          </div>

          {/* Transport + current time */}
          <div className="flex flex-wrap items-center gap-2 mt-3">
            <button onClick={() => nudge(-60)} className="px-3 py-1.5 rounded bg-white/10 hover:bg-white/20">−60s</button>
            <button onClick={() => nudge(-10)} className="px-3 py-1.5 rounded bg-white/10 hover:bg-white/20">−10s</button>
            <button onClick={togglePlay} className="px-3 py-1.5 rounded bg-white hover:bg-gray-200 text-black font-semibold">Play/Pause</button>
            <button onClick={() => nudge(10)}  className="px-3 py-1.5 rounded bg-white/10 hover:bg-white/20">+10s</button>
            <button onClick={() => nudge(60)}  className="px-3 py-1.5 rounded bg-white/10 hover:bg-white/20">+60s</button>

            <div className="ml-auto text-white/80 text-sm">
              {fmt(currentTime)} / {fmt(duration)}
            </div>
          </div>
        </div>

        {/* Marker fields with one-click set-from-player */}
        <div className="grid md:grid-cols-2 gap-4 mb-6">
          <Field label="Intro start" hint="seconds or hh:mm:ss">
            <div className="flex gap-2">
              <NumberOrTimeInput value={introStart} onChange={setIntroStart} placeholder="e.g., 0 or 0:00" />
              <button onClick={() => setFromNow(setIntroStart)} className="px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20">Set</button>
            </div>
          </Field>
          <Field label="Intro end" hint="must be greater than start">
            <div className="flex gap-2">
              <NumberOrTimeInput value={introEnd} onChange={setIntroEnd} placeholder="e.g., 75 or 1:15" />
              <button onClick={() => setFromNow(setIntroEnd)} className="px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20">Set</button>
            </div>
          </Field>
          <Field label="Outro start" hint="when credits begin">
            <div className="flex gap-2">
              <NumberOrTimeInput value={outroStart} onChange={setOutroStart} placeholder="e.g., 2440 or 40:40" />
              <button onClick={() => setFromNow(setOutroStart)} className="px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20">Set</button>
            </div>
          </Field>
          <Field label="Outro end" hint="optionally set; auto-next uses this">
            <div className="flex gap-2">
              <NumberOrTimeInput value={outroEnd} onChange={setOutroEnd} placeholder="e.g., 2520 or 42:00" />
              <button onClick={() => setFromNow(setOutroEnd)} className="px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20">Set</button>
            </div>
          </Field>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-3">
          <button
            disabled={loading}
            onClick={loadExisting}
            className="px-4 py-2 rounded-lg bg-white text-black font-semibold hover:bg-gray-200 disabled:opacity-60"
          >
            {loading ? 'Loading…' : 'Load existing'}
          </button>

          <button
            disabled={saving}
            onClick={save}
            className="px-4 py-2 rounded-lg bg-emerald-500 text-white font-semibold hover:bg-emerald-600 disabled:opacity-60"
          >
            {saving ? 'Saving…' : 'Save markers'}
          </button>

          <button onClick={resetForm} className="px-4 py-2 rounded-lg bg-white/10 text-white hover:bg-white/20">
            Reset fields
          </button>

          <button
            onClick={() => { navigator.clipboard.writeText(shareLink); toast.success('Link copied'); }}
            className="px-4 py-2 rounded-lg bg-white/10 text-white hover:bg-white/20"
          >
            Copy share link
          </button>

          {tmdbId && mediaType === 'tv' && (
            <Link
              className="px-4 py-2 rounded-lg bg-white/10 text-white hover:bg-white/20"
              to={`/e/fox/${tmdbId}/${Number(season || 1)}/${Number(episode || 1)}`}
              title="Open episode to test"
            >
              Open player (test)
            </Link>
          )}

          {tmdbId && mediaType === 'movie' && (
            <Link
              className="px-4 py-2 rounded-lg bg-white/10 text-white hover:bg-white/20"
              to={`/e/fox/${tmdbId}`}
              title="Open movie to test"
            >
              Open player (test)
            </Link>
          )}
        </div>

        {/* Preview parsed seconds */}
        <div className="mt-6 grid md:grid-cols-2 gap-4 text-sm text-white/80">
          <div className="space-y-1">
            <div>Intro: {introStart ? `${parseTime(introStart)}s` : '—'} → {introEnd ? `${parseTime(introEnd)}s` : '—'}</div>
            <div className="text-white/50">{introStart && `(${fmt(parseTime(introStart))})`} {introEnd && `→ (${fmt(parseTime(introEnd))})`}</div>
          </div>
          <div className="space-y-1">
            <div>Outro: {outroStart ? `${parseTime(outroStart)}s` : '—'} → {outroEnd ? `${parseTime(outroEnd)}s` : '—'}</div>
            <div className="text-white/50">{outroStart && `(${fmt(parseTime(outroStart))})`} {outroEnd && `→ (${fmt(parseTime(outroEnd))})`}</div>
          </div>
        </div>

        {!apiBase && (
          <div className="mt-6 text-amber-300">
            Heads up: <code>skipMarkerApi</code> is not configured in <code>config.json</code>.
          </div>
        )}
      </div>
    </div>
  );
};

export default Marker;
