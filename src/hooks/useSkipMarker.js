import { useState, useEffect } from 'react';

export default function useSkipMarker(tmdbEpisodeId) {
  const [marker, setMarker] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!tmdbEpisodeId) return;
    const fetchMarker = async () => {
      try {
        setLoading(true);
        const res = await fetch(`${import.meta.env.VITE_SKIP_API_URL}/skip-markers/${tmdbEpisodeId}`);
        if (!res.ok) {
          setMarker(null);
        } else {
          const data = await res.json();
          setMarker(data);
        }
      } catch (err) {
        setError(err);
      } finally {
        setLoading(false);
      }
    };
    fetchMarker();
  }, [tmdbEpisodeId]);

  return { marker, loading, error };
}
