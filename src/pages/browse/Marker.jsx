// src/pages/browser/Marker.jsx
import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { toast } from 'sonner';
import config from '../../config.json';

// Helpers
const parseTime = (val) => {
  if (val === '' || val == null) return null;
  const s = String(val).trim();
  if (/^\d+(\.\d+)?$/.test(s)) return Math.max(0, Number(s)); // seconds
  // hh:mm:ss(.ms) or mm:ss(.ms)
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

const Marker = () => {
  const [sp, setSp] = useSearchParams();
  const navigate = useNavigate();

  // State
  const [tmdbId, setTmdbId] = useState(sp.get('tmdb_id') || '');
  const [mediaType, setMediaType] = useState(sp.get('type') || (sp.get('season') && sp.get('episode') ? 'tv' : 'movie'));
  const [season, setSeason] = useState(sp.get('season') || '');
  const [episode, setEpisode] = useState(sp.get('episode') || '');

  const [introStart, setIntroStart] = useState('');
  const [introEnd, setIntroEnd] = useState('');
  const [outroStart, setOutroStart] = useState('');
  const [outroEnd, setOutroEnd] = useState('');

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

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

  // Load existing markers (if any)
  const loadExisting = async () => {
    if (!apiBase || !tmdbId) {
      toast.error('Provide a TMDB ID first');
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
        // Clear if none
        setIntroStart('');
        setIntroEnd('');
        setOutroStart('');
        setOutroEnd('');
        toast.message('No markers found yet for this item');
      }
    } catch (e) {
      console.error(e);
      toast.error(e.message || 'Failed to load markers');
    } finally {
      setLoading(false);
    }
  };

  // Validate & build payload
  const buildPayload = () => {
    const pIntroStart = parseTime(introStart);
    const pIntroEnd = parseTime(introEnd);
    const pOutroStart = parseTime(outroStart);
    const pOutroEnd = parseTime(outroEnd);

    const err = (msg) => {
      toast.error(msg);
      return null;
    };

    if (!tmdbId) return err('TMDB ID is required');
    if (mediaType === 'tv') {
      if (!season) return err('Season is required for TV');
      if (!episode) return err('Episode is required for TV');
    }

    // Allow any field to be empty (null) — but if both start & end given, ensure start < end
    if (pIntroStart != null && !Number.isNaN(pIntroStart) && pIntroEnd != null && !Number.isNaN(pIntroEnd)) {
      if (pIntroEnd <= pIntroStart) return err('Intro end must be greater than intro start');
    }
    if (pOutroStart != null && !Number.isNaN(pOutroStart) && pOutroEnd != null && !Number.isNaN(pOutroEnd)) {
      if (pOutroEnd <= pOutroStart) return err('Outro end must be greater than outro start');
    }

    const body = {
      tmdb_id: Number(tmdbId),
      media_type: mediaType,                     // optional for backend if needed
      season: Number(mediaType === 'tv' ? season || 0 : 0),
      episode: Number(mediaType === 'tv' ? episode || 0 : 0),
      intro_start_seconds: Number.isNaN(pIntroStart) ? null : pIntroStart ?? null,
      intro_end_seconds: Number.isNaN(pIntroEnd) ? null : pIntroEnd ?? null,
      outro_start_seconds: Number.isNaN(pOutroStart) ? null : pOutroStart ?? null,
      outro_end_seconds: Number.isNaN(pOutroEnd) ? null : pOutroEnd ?? null
    };
    return body;
  };

  const save = async () => {
    const payload = buildPayload();
    if (!payload) return;

    if (!apiBase) {
      toast.error('skipMarkerApi is not set in config.json');
      return;
    }

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
      // normalise back into UI
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

  // Keep URL query in sync (for easy sharing)
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

  // Auto-detect media type if season/episode provided
  useEffect(() => {
    if (season || episode) setMediaType('tv');
  }, [season, episode]);

  const shareLink = `${window.location.origin}/browser/marker?${q}`;

  return (
    <div className="min-h-screen w-full bg-gradient-to-b from-black to-[#0b0b0f] text-white">
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold">Skip Marker Editor</h1>
          <p className="text-white/70 mt-1">
            Add or edit intro/outro timestamps for movies and TV episodes. Enter seconds or a time like <code>1:23</code> or <code>00:01:23</code>.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-4 mb-6">
          <Field label="TMDB ID">
            <input
              className="w-full bg-white/5 text-white rounded-lg px-3 py-2 outline-none border border-white/10 focus:border-white/30"
              value={tmdbId}
              onChange={(e) => setTmdbId(e.target.value.replace(/\D/g, ''))}
              placeholder="e.g., 1399"
              inputMode="numeric"
            />
          </Field>

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

        <div className="grid md:grid-cols-2 gap-4 mb-8">
          <Field label="Intro start" hint="seconds or hh:mm:ss">
            <NumberOrTimeInput value={introStart} onChange={setIntroStart} placeholder="e.g., 0 or 0:00" />
          </Field>
          <Field label="Intro end" hint="must be greater than start">
            <NumberOrTimeInput value={introEnd} onChange={setIntroEnd} placeholder="e.g., 75 or 1:15" />
          </Field>
          <Field label="Outro start" hint="when credits begin">
            <NumberOrTimeInput value={outroStart} onChange={setOutroStart} placeholder="e.g., 2440 or 40:40" />
          </Field>
          <Field label="Outro end" hint="optionally set; auto-next uses this">
            <NumberOrTimeInput value={outroEnd} onChange={setOutroEnd} placeholder="e.g., 2520 or 42:00" />
          </Field>
        </div>

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

          <button
            onClick={resetForm}
            className="px-4 py-2 rounded-lg bg-white/10 text-white hover:bg-white/20"
          >
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
