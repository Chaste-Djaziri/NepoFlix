import React, { useEffect, useState, useRef } from 'react';
import PlayerTemplate from './template';
import {
  initializeVideo,
  setupVideoEventListeners,
  handleSeek,
  skipTime,
  togglePlay,
  toggleMute,
  handleVolumeChange,
  toggleFullscreen,
  togglePictureInPicture,
  showControlsTemporarily,
  parseTimeToSeconds,
  changePlaybackSpeed,
  changeQuality
} from './helpers';
import { saveProgress, getProgress } from '../progress';
import { isMobileDevice } from '../../utils';

const VideoPlayer = ({
  videoUrl,
  onError,

  showCaptionsPopup,
  setShowCaptionsPopup,
  subtitlesEnabled,
  subtitleError,
  subtitlesLoading,
  availableSubtitles,
  selectedSubtitle,
  onSelectSubtitle,
  subtitleCues,

  availableQualities: externalQualities,
  selectedQuality: externalSelectedQuality,
  onQualityChange: externalOnQualityChange,

  mediaId,
  mediaType,
  season = 0,
  episode = 0,

  sourceIndex = 0,
  usedSource,
  manualSourceOverride,
  setManualSourceOverride,

  // NEW: timestamps + auto-next
  skipMarkers = null,                 // { intro_start_seconds, intro_end_seconds, outro_start_seconds, outro_end_seconds } | null
  skipMarkersLoading = false,
  skipMarkersError = '',
  onAutoNext = null                   // () => void
}) => {
  // Video state
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isPictureInPicture, setIsPictureInPicture] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [bufferedAmount, setBufferedAmount] = useState(0);
  const [isProgressHovered, setIsProgressHovered] = useState(false);
  const [isVideoLoading, setIsVideoLoading] = useState(true);

  // Volume slider state
  const [showVolumeSlider, setShowVolumeSlider] = useState(false);
  const [isVolumeDragging, setIsVolumeDragging] = useState(false);
  const [isVolumeHovered, setIsVolumeHovered] = useState(false);

  // Subtitle state
  const [currentSubtitleText, setCurrentSubtitleText] = useState('');

  // Subtitle settings state
  const [subtitleSettings, setSubtitleSettings] = useState({
    fontSize: 18,
    delay: 0,
    position: 'center'
  });

  // Settings state
  const [showSettingsPopup, setShowSettingsPopup] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [availableQualities, setAvailableQualities] = useState([]);
  const [selectedQuality, setSelectedQuality] = useState(null);
  const [qualitiesLoading, setQualitiesLoading] = useState(false);
  const [volumeBoost, setVolumeBoost] = useState(0);

  // Source management state
  const [showSourcesPopup, setShowSourcesPopup] = useState(false);

  // Progress tracking state
  const [progressLoaded, setProgressLoaded] = useState(false);
  const [savedProgress, setSavedProgress] = useState(null);

  // NEW: Skip UI state
  const [showSkipIntro, setShowSkipIntro] = useState(false);
  const [showSkipOutro, setShowSkipOutro] = useState(false);
  const [outroCountdown, setOutroCountdown] = useState(null);
  const [autoNextArmed, setAutoNextArmed] = useState(false); // prevent multiple triggers

  // Refs
  const videoRef = useRef(null);
  const hlsRef = useRef(null);
  const playerRef = useRef(null);
  const controlsTimeoutRef = useRef(null);
  const progressBarRef = useRef(null);
  const progressSaveTimeoutRef = useRef(null);
  const volumeTimeoutRef = useRef(null);
  const volumeSliderRef = useRef(null);

  // Web Audio API refs for volume boost
  const audioContextRef = useRef(null);
  const gainNodeRef = useRef(null);
  const sourceNodeRef = useRef(null);

  // Restore progress
  useEffect(() => {
    if (mediaId && mediaType) {
      const existingProgress = getProgress(parseInt(mediaId), mediaType, parseInt(season), parseInt(episode));
      setSavedProgress(existingProgress);
      setProgressLoaded(false);
      console.log('Loaded saved progress:', existingProgress);
    }
  }, [mediaId, mediaType, season, episode]);

  useEffect(() => {
    if (!progressLoaded && savedProgress && savedProgress.watchedDuration > 0 && videoRef.current) {
      const restorePosition = () => {
        if (videoRef.current && videoRef.current.duration > 0 && videoRef.current.readyState >= 2) {
          const targetTime = savedProgress.watchedDuration;
          console.log(`Restoring video position to: ${targetTime} seconds`);
          videoRef.current.currentTime = targetTime;
          setProgressLoaded(true);

          videoRef.current.removeEventListener('loadedmetadata', restorePosition);
          videoRef.current.removeEventListener('loadeddata', restorePosition);
          videoRef.current.removeEventListener('canplay', restorePosition);
          videoRef.current.removeEventListener('canplaythrough', restorePosition);
        }
      };

      if (videoRef.current.duration > 0 && videoRef.current.readyState >= 2) {
        restorePosition();
      } else {
        videoRef.current.addEventListener('loadedmetadata', restorePosition);
        videoRef.current.addEventListener('loadeddata', restorePosition);
        videoRef.current.addEventListener('canplay', restorePosition);
        videoRef.current.addEventListener('canplaythrough', restorePosition);
      }

      return () => {
        if (videoRef.current) {
          videoRef.current.removeEventListener('loadedmetadata', restorePosition);
          videoRef.current.removeEventListener('loadeddata', restorePosition);
          videoRef.current.removeEventListener('canplay', restorePosition);
          videoRef.current.removeEventListener('canplaythrough', restorePosition);
        }
      };
    } else if (!savedProgress || savedProgress.watchedDuration <= 0) {
      setProgressLoaded(true);
    }
  }, [savedProgress, progressLoaded, videoUrl]);

  // Save progress every 2s
  useEffect(() => {
    if (mediaId && mediaType && duration > 0) {
      if (progressSaveTimeoutRef.current) clearTimeout(progressSaveTimeoutRef.current);

      progressSaveTimeoutRef.current = setTimeout(() => {
        saveProgress({
          id: parseInt(mediaId),
          mediaType,
          season: parseInt(season),
          episode: parseInt(episode),
          sourceIndex: parseInt(sourceIndex),
          fullDuration: Math.floor(duration),
          watchedDuration: Math.floor(currentTime),
          timestamp: Date.now()
        });
      }, 2000);
    }
    return () => {
      if (progressSaveTimeoutRef.current) clearTimeout(progressSaveTimeoutRef.current);
    };
  }, [currentTime, duration, mediaId, mediaType, season, episode, sourceIndex]);

  const saveProgressNow = () => {
    if (mediaId && mediaType && duration > 0) {
      saveProgress({
        id: parseInt(mediaId),
        mediaType,
        season: parseInt(season),
        episode: parseInt(episode),
        sourceIndex: parseInt(sourceIndex),
        fullDuration: Math.floor(duration),
        watchedDuration: Math.floor(currentTime),
        timestamp: Date.now()
      });
    }
  };

  useEffect(() => {
    return () => {
      if (mediaId && mediaType && currentTime > 0 && duration > 0) {
        saveProgress({
          id: parseInt(mediaId),
          mediaType,
          season: parseInt(season),
          episode: parseInt(episode),
          sourceIndex: parseInt(sourceIndex),
          fullDuration: Math.floor(duration),
          watchedDuration: Math.floor(currentTime),
          timestamp: Date.now()
        });
      }
    };
  }, [videoUrl, mediaId, mediaType, season, episode, sourceIndex]);

  // Cleanup audio context on unmount
  useEffect(() => {
    return () => {
      if (audioContextRef.current) {
        audioContextRef.current.close();
        audioContextRef.current = null;
        gainNodeRef.current = null;
        sourceNodeRef.current = null;
      }
    };
  }, []);

  // Initialize video
  useEffect(() => {
    setIsVideoLoading(true);
    if (videoUrl) {
      setQualitiesLoading(true);
      initializeVideo(videoUrl, videoRef, hlsRef, onError, setAvailableQualities);
      setQualitiesLoading(false);
      setProgressLoaded(false);
      setAutoNextArmed(false); // reset for a new video
    }
    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [videoUrl, onError]);

  useEffect(() => {
    const cleanup = setupVideoEventListeners(
      videoRef,
      setCurrentTime,
      setDuration,
      setIsPlaying,
      setVolume,
      setIsMuted,
      setIsPictureInPicture,
      setBufferedAmount
    );

    const handleCanPlay = () => { setIsVideoLoading(false); setupAudioContext(); };
    const handleWaiting = () => { setIsVideoLoading(true); };
    const handleLoadStart = () => { setIsVideoLoading(true); };
    const handleSeeking = () => { setIsVideoLoading(true); };
    const handleSeeked = () => { setIsVideoLoading(false); };
    const handleProgress = () => {
      if (videoRef.current && videoRef.current.buffered.length > 0) {
        const buffered = videoRef.current.buffered;
        const ct = videoRef.current.currentTime;
        let bufferedEnd = 0;
        for (let i = 0; i < buffered.length; i++) {
          if (buffered.start(i) <= ct && buffered.end(i) > ct) {
            bufferedEnd = buffered.end(i);
            break;
          }
        }
        if (bufferedEnd === 0 && buffered.length > 0) {
          bufferedEnd = buffered.end(buffered.length - 1);
        }
        const dur = videoRef.current.duration;
        if (dur > 0) setBufferedAmount((bufferedEnd / dur) * 100);
      }
    };

    const handleEnded = () => {
      // If outro markers didn’t fire auto-next, let ended try (TV only)
      if (mediaType === 'tv' && onAutoNext && !autoNextArmed) {
        setAutoNextArmed(true);
        onAutoNext();
      }
    };

    if (videoRef.current) {
      videoRef.current.addEventListener('canplay', handleCanPlay);
      videoRef.current.addEventListener('waiting', handleWaiting);
      videoRef.current.addEventListener('loadstart', handleLoadStart);
      videoRef.current.addEventListener('seeking', handleSeeking);
      videoRef.current.addEventListener('seeked', handleSeeked);
      videoRef.current.addEventListener('progress', handleProgress);
      videoRef.current.addEventListener('ended', handleEnded);
    }

    return () => {
      cleanup();
      if (videoRef.current) {
        videoRef.current.removeEventListener('canplay', handleCanPlay);
        videoRef.current.removeEventListener('waiting', handleWaiting);
        videoRef.current.removeEventListener('loadstart', handleLoadStart);
        videoRef.current.removeEventListener('seeking', handleSeeking);
        videoRef.current.removeEventListener('seeked', handleSeeked);
        videoRef.current.removeEventListener('progress', handleProgress);
        videoRef.current.removeEventListener('ended', handleEnded);
      }
    };
  }, [videoUrl, mediaType, onAutoNext, autoNextArmed]);

  // Use external qualities if provided, otherwise internal ones
  const finalAvailableQualities = externalQualities || availableQualities;
  const finalSelectedQuality = externalSelectedQuality || selectedQuality;

  useEffect(() => {
    if (availableQualities.length > 0 && !selectedQuality && !externalQualities) {
      setSelectedQuality(availableQualities[0]);
    }
  }, [availableQualities, selectedQuality, externalQualities]);

  useEffect(() => {
    if (externalSelectedQuality && externalSelectedQuality !== selectedQuality) {
      setSelectedQuality(externalSelectedQuality);
    }
  }, [externalSelectedQuality, selectedQuality]);

  // Custom subtitles (desktop)
  useEffect(() => {
    if (isMobileDevice()) {
      setCurrentSubtitleText('');
      return;
    }
    if (!subtitlesEnabled || !selectedSubtitle || !subtitleCues || subtitleCues.length === 0) {
      setCurrentSubtitleText('');
      return;
    }
    const adjustedTime = currentTime - subtitleSettings.delay;
    const currentCue = subtitleCues.find(cue => {
      const startTime = parseTimeToSeconds(cue.startTime);
      const endTime = parseTimeToSeconds(cue.endTime);
      return adjustedTime >= startTime && adjustedTime <= endTime;
    });
    setCurrentSubtitleText(currentCue ? currentCue.text : '');
  }, [currentTime, subtitlesEnabled, selectedSubtitle, subtitleCues, subtitleSettings.delay]);

  // Native tracks (mobile)
  useEffect(() => {
    if (!videoRef.current) return;
    if (!isMobileDevice()) return;

    const video = videoRef.current;
    const existingTracks = video.querySelectorAll('track[kind="subtitles"]');
    existingTracks.forEach(track => track.remove());

    if (selectedSubtitle && selectedSubtitle.url) {
      const track = document.createElement('track');
      track.kind = 'subtitles';
      track.label = selectedSubtitle.display || selectedSubtitle.language || 'Subtitles';
      track.srclang = selectedSubtitle.language || 'en';
      track.default = true;

      if (selectedSubtitle.url.includes('.srt') || selectedSubtitle.format === 'srt') {
        convertSRTToVTTBlob(selectedSubtitle.url)
          .then(vttBlob => {
            if (vttBlob) {
              track.src = URL.createObjectURL(vttBlob);
              video.appendChild(track);
              track.addEventListener('load', () => {
                if (track.track) track.track.mode = subtitlesEnabled ? 'showing' : 'hidden';
              });
            }
          })
          .catch(err => console.error('Failed to convert SRT to VTT:', err));
      } else {
        track.src = selectedSubtitle.url;
        video.appendChild(track);
        track.addEventListener('load', () => {
          if (track.track) track.track.mode = subtitlesEnabled ? 'showing' : 'hidden';
        });
      }
    }

    const tracks = video.textTracks;
    for (let i = 0; i < tracks.length; i++) {
      if (tracks[i].kind === 'subtitles') {
        tracks[i].mode = subtitlesEnabled ? 'showing' : 'hidden';
      }
    }
  }, [selectedSubtitle, subtitlesEnabled]);

  // Helper: convert SRT to VTT
  const convertSRTToVTTBlob = async (srtUrl) => {
    try {
      const response = await fetch(srtUrl, {
        mode: 'cors',
        headers: { 'Accept': 'text/plain, text/vtt, application/x-subrip' }
      });
      if (!response.ok) throw new Error(`Failed to fetch SRT: ${response.status}`);
      const srtText = await response.text();
      const vttText = convertSRTToVTT(srtText);
      return new Blob([vttText], { type: 'text/vtt' });
    } catch (err) {
      console.error('Error converting SRT to VTT:', err);
      return null;
    }
  };

  const convertSRTToVTT = (srtText) => {
    let vttText = 'WEBVTT\n\n';
    const blocks = srtText.trim().split(/\n\s*\n/);
    blocks.forEach(block => {
      const lines = block.trim().split('\n');
      if (lines.length >= 3) {
        const timeString = lines[1];
        const text = lines.slice(2).join('\n');
        const vttTimeString = timeString.replace(/,/g, '.');
        vttText += `${vttTimeString}\n${text}\n\n`;
      }
    });
    return vttText;
  };

  // Handle progress bar dragging
  useEffect(() => {
    if (isDragging) {
      const handleGlobalMouseMove = (e) => {
        if (isDragging) { handleSeek(e, videoRef, duration, progressBarRef); }
      };
      const handleGlobalMouseUp = () => setIsDragging(false);
      document.addEventListener('mousemove', handleGlobalMouseMove);
      document.addEventListener('mouseup', handleGlobalMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleGlobalMouseMove);
        document.removeEventListener('mouseup', handleGlobalMouseUp);
      };
    }
  }, [isDragging, duration]);

  // Handle volume slider dragging
  useEffect(() => {
    if (isVolumeDragging) {
      const handleGlobalMouseMove = (e) => {
        if (isVolumeDragging) { handleVolumeSliderSeek(e); }
      };
      const handleGlobalMouseUp = () => setIsVolumeDragging(false);
      document.addEventListener('mousemove', handleGlobalMouseMove);
      document.addEventListener('mouseup', handleGlobalMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleGlobalMouseMove);
        document.removeEventListener('mouseup', handleGlobalMouseUp);
      };
    }
  }, [isVolumeDragging]);

  // Volume slider timeout management
  const showVolumeSliderTemporarily = () => {
    setShowVolumeSlider(true);
    if (volumeTimeoutRef.current) clearTimeout(volumeTimeoutRef.current);
    volumeTimeoutRef.current = setTimeout(() => setShowVolumeSlider(false), 5000);
  };

  const handleVolumeMouseEnter = () => { showVolumeSliderTemporarily(); };
  const handleVolumeMouseLeave = () => {
    if (volumeTimeoutRef.current) clearTimeout(volumeTimeoutRef.current);
    volumeTimeoutRef.current = setTimeout(() => setShowVolumeSlider(false), 300);
  };
  const handleVolumeSliderMouseEnter = () => {
    if (volumeTimeoutRef.current) clearTimeout(volumeTimeoutRef.current);
    setShowVolumeSlider(true);
    setIsVolumeHovered(true);
  };
  const handleVolumeSliderMouseLeave = () => {
    if (volumeTimeoutRef.current) clearTimeout(volumeTimeoutRef.current);
    volumeTimeoutRef.current = setTimeout(() => setShowVolumeSlider(false), 300);
    setIsVolumeHovered(false);
  };

  // Events
  const handleMouseMove = () => { showControlsTemporarily(setShowControls, controlsTimeoutRef, isPlaying); };
  const handleTogglePlay = () => { togglePlay(isPlaying, videoRef); saveProgressNow(); };
  const handleProgressMouseDown = (e) => {
    setIsDragging(true);
    handleSeek(e, videoRef, duration, progressBarRef);
    saveProgressNow();
    e.preventDefault();
  };
  const handleProgressMouseEnter = () => setIsProgressHovered(true);
  const handleProgressMouseLeave = () => setIsProgressHovered(false);
  const handleSkipTime = (seconds) => { skipTime(seconds, videoRef); saveProgressNow(); };
  const handleToggleMute = () => { toggleMute(videoRef); saveProgressNow(); };
  const handleVolumeChangeEvent = (e) => { handleVolumeChange(e, videoRef); saveProgressNow(); };
  const handleVolumeSliderMouseDown = (e) => {
    setIsVolumeDragging(true);
    handleVolumeSliderSeek(e);
    saveProgressNow();
    e.preventDefault();
  };
  const handleVolumeSliderSeek = (e) => {
    if (volumeSliderRef.current && videoRef.current) {
      const rect = volumeSliderRef.current.getBoundingClientRect();
      const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      videoRef.current.volume = pos;
      videoRef.current.muted = pos === 0;
      saveProgressNow();
    }
  };
  const handleToggleFullscreen = () => { toggleFullscreen(playerRef, setIsFullscreen); saveProgressNow(); };
  const handleTogglePictureInPicture = () => { togglePictureInPicture(videoRef, isPictureInPicture); saveProgressNow(); };
  const handleSelectSubtitle = (subtitle) => { onSelectSubtitle(subtitle, videoRef); saveProgressNow(); };
  const handleSubtitleSettingsChange = (newSettings) => { setSubtitleSettings(prev => ({ ...prev, ...newSettings })); saveProgressNow(); };
  const handleVideoError = (e) => { console.error('Video playback error:', e); onError('Video playback failed. Please try again.'); };
  const handleSpeedChange = (speed) => { setPlaybackSpeed(speed); changePlaybackSpeed(speed, videoRef); saveProgressNow(); };
  const handleQualityChange = async (quality) => {
    if (externalOnQualityChange) {
      externalOnQualityChange(quality);
    } else {
      setSelectedQuality(quality);
      await changeQuality(quality, hlsRef, videoRef, currentTime);
    }
    saveProgressNow();
  };
  const handleVolumeBoostChange = (boost) => { setVolumeBoost(boost); applyVolumeBoost(boost); saveProgressNow(); };

  // Setup Web Audio API
  const setupAudioContext = () => {
    if (!videoRef.current || audioContextRef.current) return;
    try {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const source = audioContext.createMediaElementSource(videoRef.current);
      const gainNode = audioContext.createGain();
      source.connect(gainNode);
      gainNode.connect(audioContext.destination);
      audioContextRef.current = audioContext;
      gainNodeRef.current = gainNode;
      sourceNodeRef.current = source;
      applyVolumeBoost(volumeBoost);
    } catch (error) {
      console.error('Failed to setup audio context for volume boost:', error);
    }
  };
  const applyVolumeBoost = (boost) => {
    if (gainNodeRef.current) {
      const gainValue = 1 + (boost / 100);
      gainNodeRef.current.gain.setValueAtTime(gainValue, audioContextRef.current.currentTime);
    }
  };

  // Source management handlers
  const handleSourceChange = (source) => {
    if (setManualSourceOverride) {
      setManualSourceOverride(source);
      saveProgressNow();
    }
  };

  // --- Skip Intro / Outro logic ---------------------------------------------

  // Recompute skip pill visibility as time changes
  useEffect(() => {
    if (!skipMarkers || !videoRef.current) {
      setShowSkipIntro(false);
      setShowSkipOutro(false);
      setOutroCountdown(null);
      return;
    }

    const { intro_start_seconds, intro_end_seconds, outro_start_seconds, outro_end_seconds } = skipMarkers;

    // Show “Skip Intro” while inside intro window
    const inIntro =
      Number.isFinite(intro_start_seconds) &&
      Number.isFinite(intro_end_seconds) &&
      currentTime >= intro_start_seconds &&
      currentTime < intro_end_seconds;

    setShowSkipIntro(Boolean(inIntro));

    // Show “Skip Outro” after outro starts
    const inOutroStart =
      Number.isFinite(outro_start_seconds) &&
      currentTime >= outro_start_seconds &&
      currentTime < (Number.isFinite(outro_end_seconds) ? outro_end_seconds : (duration || Infinity));

    setShowSkipOutro(Boolean(inOutroStart));

    // Optional: small countdown to auto-next when outro end is known
    if (inOutroStart && Number.isFinite(outro_end_seconds)) {
      const remaining = Math.max(0, Math.floor(outro_end_seconds - currentTime));
      setOutroCountdown(remaining);
    } else {
      setOutroCountdown(null);
    }

    // Auto-next: fire 2s after outro_end_seconds (TV only)
    if (
      mediaType === 'tv' &&
      onAutoNext &&
      !autoNextArmed &&
      Number.isFinite(outro_end_seconds) &&
      currentTime >= (outro_end_seconds - 0.25)
    ) {
      setAutoNextArmed(true);
      setTimeout(() => onAutoNext && onAutoNext(), 2000);
    }

    // If outro_end_seconds is unknown: allow ended handler to auto-next.
  }, [currentTime, duration, skipMarkers, mediaType, onAutoNext, autoNextArmed]);

  const handleSkipIntro = () => {
    if (!skipMarkers || !videoRef.current) return;
    const { intro_end_seconds } = skipMarkers;
    if (Number.isFinite(intro_end_seconds)) {
      videoRef.current.currentTime = Math.min(intro_end_seconds + 0.05, (duration || intro_end_seconds));
      saveProgressNow();
      setShowSkipIntro(false);
    }
  };

  const handleSkipOutro = () => {
    if (!skipMarkers || !videoRef.current) return;
    const { outro_end_seconds, outro_start_seconds } = skipMarkers;

    // If we know end, jump there; otherwise jump close to the end
    if (Number.isFinite(outro_end_seconds)) {
      videoRef.current.currentTime = Math.min(outro_end_seconds + 0.05, Math.max(outro_end_seconds - 0.1, duration - 1));
    } else if (Number.isFinite(outro_start_seconds)) {
      videoRef.current.currentTime = Math.max(outro_start_seconds, duration - 2);
    } else {
      videoRef.current.currentTime = Math.max(0, duration - 1);
    }
    saveProgressNow();

    // If TV and we have auto-next callback and know end, trigger immediately
    if (mediaType === 'tv' && onAutoNext && Number.isFinite(outro_end_seconds)) {
      if (!autoNextArmed) {
        setAutoNextArmed(true);
        onAutoNext();
      }
    }
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA') return;

      const handledKeys = [' ', 'Spacebar', 'k', 'K', 'ArrowRight', 'l', 'L', 'ArrowLeft', 'j', 'J', 'ArrowUp', 'ArrowDown', 'm', 'M', 'f', 'F', 's', 'S'];
      if (handledKeys.includes(e.key)) {
        e.preventDefault();
        e.stopPropagation();
      }

      switch (e.key) {
        case ' ':
        case 'Spacebar':
        case 'k':
        case 'K':
          handleTogglePlay();
          break;
        case 'ArrowRight':
        case 'l':
        case 'L':
          handleSkipTime(10);
          break;
        case 'ArrowLeft':
        case 'j':
        case 'J':
          handleSkipTime(-10);
          break;
        case 'ArrowUp':
          if (videoRef.current) {
            const newVolume = Math.min(1, videoRef.current.volume + 0.1);
            videoRef.current.volume = newVolume;
            if (videoRef.current.muted && newVolume > 0) videoRef.current.muted = false;
            saveProgressNow();
          }
          break;
        case 'ArrowDown':
          if (videoRef.current) {
            const newVolume = Math.max(0, videoRef.current.volume - 0.1);
            videoRef.current.volume = newVolume;
            if (newVolume === 0) videoRef.current.muted = true;
            saveProgressNow();
          }
          break;
        case 'm':
        case 'M':
          handleToggleMute();
          break;
        case 'f':
        case 'F':
          handleToggleFullscreen();
          break;
        // NEW: S = Skip (intro/outro preference: intro first if visible, else outro)
        case 's':
        case 'S':
          if (showSkipIntro) handleSkipIntro();
          else if (showSkipOutro) handleSkipOutro();
          break;
        default:
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => { document.removeEventListener('keydown', handleKeyDown); };
  }, [isPlaying, showSkipIntro, showSkipOutro]);

  return (
    <PlayerTemplate
      // Video refs
      videoRef={videoRef}
      playerRef={playerRef}
      progressBarRef={progressBarRef}

      // Video state
      isPlaying={isPlaying}
      currentTime={currentTime}
      duration={duration}
      volume={volume}
      isMuted={isMuted}
      bufferedAmount={bufferedAmount}
      isProgressHovered={isProgressHovered}
      isDragging={isDragging}
      showControls={showControls}
      isFullscreen={isFullscreen}
      isPictureInPicture={isPictureInPicture}
      isVideoLoading={isVideoLoading}

      // Volume slider state
      showVolumeSlider={showVolumeSlider}
      isVolumeDragging={isVolumeDragging}
      isVolumeHovered={isVolumeHovered}
      volumeSliderRef={volumeSliderRef}

      // Subtitles
      showCaptionsPopup={showCaptionsPopup}
      setShowCaptionsPopup={setShowCaptionsPopup}
      subtitlesEnabled={subtitlesEnabled}
      subtitleError={subtitleError}
      subtitlesLoading={subtitlesLoading}
      availableSubtitles={availableSubtitles}
      selectedSubtitle={selectedSubtitle}
      currentSubtitleText={currentSubtitleText}
      subtitleSettings={subtitleSettings}
      onSubtitleSettingsChange={handleSubtitleSettingsChange}

      // Settings
      showSettingsPopup={showSettingsPopup}
      setShowSettingsPopup={setShowSettingsPopup}
      playbackSpeed={playbackSpeed}
      availableQualities={finalAvailableQualities}
      selectedQuality={finalSelectedQuality}
      qualitiesLoading={qualitiesLoading}
      volumeBoost={volumeBoost}
      onVolumeBoostChange={handleVolumeBoostChange}

      // Sources
      showSourcesPopup={showSourcesPopup}
      setShowSourcesPopup={setShowSourcesPopup}
      usedSource={usedSource}
      onSourceChange={handleSourceChange}

      // Handlers
      onMouseMove={handleMouseMove}
      onTogglePlay={handleTogglePlay}
      onProgressMouseDown={handleProgressMouseDown}
      onProgressMouseEnter={handleProgressMouseEnter}
      onProgressMouseLeave={handleProgressMouseLeave}
      onSkipTime={handleSkipTime}
      onToggleMute={handleToggleMute}
      onVolumeChange={handleVolumeChangeEvent}
      onToggleFullscreen={handleToggleFullscreen}
      onTogglePictureInPicture={handleTogglePictureInPicture}
      onSelectSubtitle={handleSelectSubtitle}
      onVideoError={handleVideoError}
      onSpeedChange={handleSpeedChange}
      onQualityChange={handleQualityChange}

      // Volume slider handlers
      onVolumeMouseEnter={handleVolumeMouseEnter}
      onVolumeMouseLeave={handleVolumeMouseLeave}
      onVolumeSliderMouseEnter={handleVolumeSliderMouseEnter}
      onVolumeSliderMouseLeave={handleVolumeSliderMouseLeave}
      onVolumeSliderMouseDown={handleVolumeSliderMouseDown}
      onVolumeSliderHoverEnter={handleVolumeSliderMouseEnter}
      onVolumeSliderHoverLeave={handleVolumeSliderMouseLeave}

      // NEW: timestamps + auto-next UI hooks for the template
      skipMarkers={skipMarkers}
      skipMarkersLoading={skipMarkersLoading}
      skipMarkersError={skipMarkersError}
      showSkipIntro={showSkipIntro}
      showSkipOutro={showSkipOutro}
      outroCountdown={outroCountdown}
      onSkipIntro={handleSkipIntro}
      onSkipOutro={handleSkipOutro}
    />
  );
};

export default VideoPlayer;
