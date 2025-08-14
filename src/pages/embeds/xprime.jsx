// src/pages/embeds/xprime.jsx

import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import config from '../../config.json';
import { searchSubtitles } from 'wyzie-lib';
import VideoPlayer from '../../components/player/main';
import { initializeSourceTracking } from '../../components/progress';

const Xprime = () => {
  const { tmdbid, season, episode } = useParams();
  const navigate = useNavigate();

  const [videoUrl, setVideoUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [usedSource, setUsedSource] = useState('');
  const [sourceIndex, setSourceIndex] = useState(1); // Default to Fox source index
  const [manualSourceOverride, setManualSourceOverride] = useState(null); // Manual source selection

  // Subtitle states
  const [showCaptionsPopup, setShowCaptionsPopup] = useState(false);
  const [subtitlesEnabled, setSubtitlesEnabled] = useState(false);
  const [availableSubtitles, setAvailableSubtitles] = useState([]);
  const [selectedSubtitle, setSelectedSubtitle] = useState(null);
  const [subtitlesLoading, setSubtitlesLoading] = useState(false);
  const [subtitleError, setSubtitleError] = useState('');
  const [subtitleCues, setSubtitleCues] = useState([]);

  // Skip markers
  const [skipMarkers, setSkipMarkers] = useState(null);
  const [skipLoading, setSkipLoading] = useState(false);
  const [skipError, setSkipError] = useState('');

  const mediaType = season && episode ? 'tv' : 'movie';
  const sourceTrackingCleanupRef = useRef(null);

  // ---- Helpers --------------------------------------------------------------

  const toInt = (val, fallback = 0) => {
    const n = parseInt(val, 10);
    return Number.isFinite(n) ? n : fallback;
  };

  const tvSeason = toInt(season, 0);
  const tvEpisode = toInt(episode, 0);

  const goToNextEpisode = () => {
    if (mediaType !== 'tv') return;
    // naive next: increase episode number
    navigate(`/e/fox/${tmdbid}/${tvSeason}/${tvEpisode + 1}`);
  };

  const fetchVideoFromSource = async (sourceName) => {
    const foxParams = { id: tmdbid };
    if (mediaType === 'tv') {
      foxParams.season = tvSeason;
      foxParams.episode = tvEpisode;
    }

    if (sourceName === 'Fox') {
      const foxApiUrl = new URL('https://backend.xprime.tv/fox');
      Object.keys(foxParams).forEach(key => foxApiUrl.searchParams.append(key, foxParams[key]));

      const response = await fetch(foxApiUrl);
      if (!response.ok) throw new Error(`Fox API error! status: ${response.status}`);
      const data = await response.json();
      if (!data.url) throw new Error('No video URL found in Fox response');
      return {
        source: 'fox',
        url: data.url,
        headers: { origin: 'https://xprime.tv', referer: 'https://xprime.tv/' },
        sourceIndex: 1
      };
    } else if (sourceName === 'PrimeNet') {
      let primenetApiUrl;
      if (mediaType === 'tv') {
        primenetApiUrl = `https://backend.xprime.tv/primenet?id=${tmdbid}&season=${tvSeason}&episode=${tvEpisode}`;
      } else {
        primenetApiUrl = `https://backend.xprime.tv/primenet?id=${tmdbid}`;
      }

      const response = await fetch(primenetApiUrl);
      if (!response.ok) throw new Error(`PrimeNet API error! status: ${response.status}`);
      const data = await response.json();
      if (!data.url) throw new Error('No video URL found in PrimeNet response');
      return {
        source: 'primenet',
        url: data.url,
        headers: { origin: 'https://xprime.tv', referer: 'https://xprime.tv/' },
        sourceIndex: 0
      };
    }
  };

  // ---- Fetch video URL (auto or manual) ------------------------------------

  useEffect(() => {
    const fetchVideoUrl = async () => {
      try {
        setLoading(true);
        setError('');
        setUsedSource('');

        let result;
        if (manualSourceOverride && manualSourceOverride !== 'Auto') {
          result = await fetchVideoFromSource(manualSourceOverride);
        } else {
          const foxPromise = fetchVideoFromSource('Fox');
          const primenetPromise = fetchVideoFromSource('PrimeNet');
          result = await Promise.any([foxPromise, primenetPromise]);
        }

        setUsedSource(result.source);
        setSourceIndex(result.sourceIndex);

        const proxiedUrl = `${config.m3u8proxy}/m3u8-proxy?url=${encodeURIComponent(
          result.url
        )}&headers=${encodeURIComponent(JSON.stringify(result.headers))}`;
        setVideoUrl(proxiedUrl);

        if (sourceTrackingCleanupRef.current) {
          sourceTrackingCleanupRef.current();
        }
        sourceTrackingCleanupRef.current = initializeSourceTracking(
          null,
          result.source,
          tmdbid,
          mediaType,
          tvSeason,
          tvEpisode,
          result.sourceIndex
        );
      } catch (err) {
        console.error('Video source failed:', err);
        if (err?.errors) {
          const errorMessages = err.errors.map(e => e.message).join(', ');
          setError(`All sources failed: ${errorMessages}`);
        } else {
          setError(err.message || 'Failed to load video from selected source');
        }
      } finally {
        setLoading(false);
      }
    };

    if (tmdbid) fetchVideoUrl();

    return () => {
      if (sourceTrackingCleanupRef.current) {
        sourceTrackingCleanupRef.current();
      }
    };
  }, [tmdbid, tvSeason, tvEpisode, manualSourceOverride]);

  // ---- Fetch skip markers ---------------------------------------------------

  useEffect(() => {
    const fetchMarkers = async () => {
      if (!config.skipMarkerApi || !tmdbid) return;

      try {
        setSkipLoading(true);
        setSkipError('');

        const url = new URL(`${config.skipMarkerApi.replace(/\/$/, '')}/skip-markers`);
        url.searchParams.set('tmdb_id', String(tmdbid));
        url.searchParams.set('season', String(tvSeason));
        url.searchParams.set('episode', String(tvEpisode));

        const res = await fetch(url.toString());
        if (!res.ok) throw new Error(`Skip marker API error: ${res.status}`);

        const data = await res.json();
        // expected: { intro_start_seconds, intro_end_seconds, outro_start_seconds, outro_end_seconds } | null
        setSkipMarkers(
          data && typeof data === 'object'
            ? {
                intro_start_seconds: data.intro_start_seconds ?? null,
                intro_end_seconds: data.intro_end_seconds ?? null,
                outro_start_seconds: data.outro_start_seconds ?? null,
                outro_end_seconds: data.outro_end_seconds ?? null
              }
            : null
        );
      } catch (e) {
        console.error(e);
        setSkipMarkers(null);
        setSkipError(e.message || 'Failed to load skip markers');
      } finally {
        setSkipLoading(false);
      }
    };

    fetchMarkers();
  }, [tmdbid, tvSeason, tvEpisode]);

  // ---- Subtitles ------------------------------------------------------------

  useEffect(() => {
    const fetchSubtitles = async () => {
      if (!tmdbid) return;

      setSubtitlesLoading(true);
      try {
        const searchParams = {
          tmdb_id: parseInt(tmdbid, 10),
          format: 'srt'
        };

        if (mediaType === 'tv') {
          searchParams.season = tvSeason;
          searchParams.episode = tvEpisode;
        }

        const subtitles = await searchSubtitles(searchParams);
        setAvailableSubtitles(subtitles || []);
      } catch (err) {
        console.error(err);
        setAvailableSubtitles([]);
        setSubtitleError(`Failed to fetch subtitles: ${err.message}`);
        setTimeout(() => setSubtitleError(''), 3000);
      } finally {
        setSubtitlesLoading(false);
      }
    };

    fetchSubtitles();
  }, [tmdbid, tvSeason, tvEpisode]);

  const selectSubtitle = async (subtitle) => {
    setSelectedSubtitle(subtitle);
    if (subtitle === null) {
      setSubtitlesEnabled(false);
      setSubtitleCues([]);
    } else {
      setSubtitlesEnabled(true);
      await loadSubtitleCues(subtitle);
    }
  };

  const parseSRT = (srtText) => {
    const blocks = srtText.trim().split(/\n\s*\n/);
    const cues = [];
    blocks.forEach(block => {
      const lines = block.trim().split('\n');
      if (lines.length >= 3) {
        const index = lines[0];
        const timeString = lines[1];
        const text = lines.slice(2).join('\n');
        const timeMatch = timeString.match(/(\d{2}:\d{2}:\d{2},\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2},\d{3})/);
        if (timeMatch) {
          cues.push({
            index: parseInt(index, 10),
            startTime: timeMatch[1],
            endTime: timeMatch[2],
            text
          });
        }
      }
    });
    return cues;
  };

  const loadSubtitleCues = async (subtitle) => {
    if (!subtitle) return;
    try {
      let subtitleText = '';

      if (subtitle.url && subtitle.url.startsWith('http')) {
        const response = await fetch(subtitle.url, {
          mode: 'cors',
          headers: { Accept: 'text/plain, text/vtt, application/x-subrip' }
        });
        if (!response.ok) throw new Error(`Failed to fetch subtitle: ${response.status}`);
        subtitleText = await response.text();
      } else if (subtitle.content) {
        subtitleText = subtitle.content;
      } else if (subtitle.url) {
        subtitleText = subtitle.url;
      } else {
        throw new Error('No subtitle content or URL available');
      }

      const parsedSrt = parseSRT(subtitleText);
      setSubtitleCues(parsedSrt);
    } catch (err) {
      console.error(err);
      setSubtitleError(`Failed to load subtitles: ${err.message}`);
      setTimeout(() => setSubtitleError(''), 3000);
      setSubtitleCues([]);
    }
  };

  if (error) {
    return (
      <div className="fixed top-0 left-0 w-screen h-screen bg-black flex items-center justify-center text-red-500 text-lg text-center p-5">
        <div>
          <div>Error: {error}</div>
          <button
            onClick={() => window.location.reload()}
            className="mt-5 px-5 py-2.5 bg-gray-800 text-white border-none rounded cursor-pointer"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <VideoPlayer
      videoUrl={videoUrl}
      onError={setError}
      // subtitles
      showCaptionsPopup={showCaptionsPopup}
      setShowCaptionsPopup={setShowCaptionsPopup}
      subtitlesEnabled={subtitlesEnabled}
      subtitleError={subtitleError}
      subtitlesLoading={subtitlesLoading}
      availableSubtitles={availableSubtitles}
      selectedSubtitle={selectedSubtitle}
      onSelectSubtitle={selectSubtitle}
      subtitleCues={subtitleCues}
      // identity
      mediaId={tmdbid}
      mediaType={mediaType}
      season={tvSeason}
      episode={tvEpisode}
      sourceIndex={sourceIndex}
      usedSource={usedSource}
      manualSourceOverride={manualSourceOverride}
      setManualSourceOverride={setManualSourceOverride}
      // NEW: skip markers + auto-next hook
      skipMarkers={skipMarkers}              // { intro_start_seconds, intro_end_seconds, outro_start_seconds, outro_end_seconds } | null
      skipMarkersLoading={skipLoading}
      skipMarkersError={skipError}
      onAutoNext={goToNextEpisode}           // VideoPlayer calls this when outro finishes (or user presses "Next")
    />
  );
};

export default Xprime;
