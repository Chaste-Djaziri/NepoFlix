// src/components/anime/animeDetailsData.jsx
import appConfig from '../../config.json';

const TMDB_BASE = appConfig.tmdbBaseUrl;            // e.g. "https://api.themoviedb.org/3"
const TMDB_IMAGE_BASE = appConfig.tmdbImageBaseUrl; // e.g. "https://image.tmdb.org/t/p/"
const TMDB_BEARER = appConfig.tmdbApiKey;           // "Bearer <token>"

// Generic TMDB fetcher (v3 endpoints with your v4 Bearer token)
async function tmdbJson(path, params = {}) {
  const url = new URL(`${TMDB_BASE}${path}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, String(v)));
  const res = await fetch(url.toString(), {
    headers: {
      Authorization: TMDB_BEARER,
      Accept: 'application/json',
    },
  });
  if (!res.ok) throw new Error(`TMDB ${path} failed: ${res.status}`);
  return res.json();
}

/** Get season number from strings like "Season 2" (default 1) */
export function extractSeasonNumber(input = '') {
  const m = String(input).match(/season\s*(\d+)/i);
  const n = m ? parseInt(m[1], 10) : 1;
  return Number.isFinite(n) && n > 0 ? n : 1;
}

function stripSeason(text = '') {
  return String(text).replace(/\bseason\s*\d+\b/i, '').trim();
}

/**
 * Find a TMDB TV show id for a given title/season string and return { tmdbId, seasonNumber }
 * Examples accepted: "Jujutsu Kaisen Season 2", "Attack on Titan"
 */
export async function findTmdbIdForSeason(titleLike) {
  if (!titleLike) return null;

  const seasonNumber = extractSeasonNumber(titleLike);
  const query = stripSeason(titleLike);

  // Helpful logs (seen in your console)
  console.log(`Searching TMDB for: "${query}" (Season ${seasonNumber})`);

  // Search TV
  const search = await tmdbJson('/search/tv', { query, include_adult: false, page: 1 });
  const results = Array.isArray(search?.results) ? search.results : [];
  if (!results.length) return null;

  // Pick the most popular as the best match
  results.sort((a, b) => (b.popularity || 0) - (a.popularity || 0));
  const best = results[0];
  console.log(`Found anime TMDB match for "${query}": ${best.name || best.original_name}`);

  // Fetch full TV details to inspect seasons
  const show = await tmdbJson(`/tv/${best.id}`);
  let chosenSeason = seasonNumber;

  const hasWanted =
    Array.isArray(show?.seasons) &&
    show.seasons.some((s) => String(s.season_number) === String(seasonNumber));

  if (!hasWanted) {
    // Fallback to S1 or first available season
    chosenSeason = 1;
    if (!show?.seasons?.some((s) => s.season_number === 1) && show?.seasons?.length) {
      chosenSeason = show.seasons[0].season_number;
    }
  }

  console.log(`Found season ${chosenSeason} data for TMDB ID ${best.id}`);
  return { tmdbId: best.id, seasonNumber: chosenSeason, title: query, imageBase: TMDB_IMAGE_BASE };
}

/**
 * Fetch aggregated credits for a TV show (better multi-season roles)
 * @param {number|string} tvId
 * @returns {Promise<{cast: Array<{name:string, role:string, image:string|null}>}>}
 */
export async function fetchTmdbCredits(tvId) {
  if (!tvId || !TMDB_BEARER) return { cast: [] };
  try {
    const data = await tmdbJson(`/tv/${tvId}/aggregate_credits`);
    const castArr = Array.isArray(data?.cast) ? data.cast : [];
    return {
      cast: castArr.map((c) => ({
        name: c.name || c.original_name || 'Unknown',
        role:
          (Array.isArray(c.roles) && c.roles[0]?.character) ||
          c.character ||
          'Cast',
        image: c.profile_path ? `${TMDB_IMAGE_BASE}w300${c.profile_path}` : null,
      })),
    };
  } catch (e) {
    console.warn('TMDB credits error:', e);
    return { cast: [] };
  }
}

/**
 * Fetch merged Recommendations + Similar for a TV show
 * @param {number|string} tvId
 * @returns {Promise<Array<{tmdbId:number,title:string,poster:string|null}>>}
 */
export async function fetchTmdbRecommendations(tvId) {
  if (!tvId || !TMDB_BEARER) return [];
  try {
    const [rec, sim] = await Promise.all([
      tmdbJson(`/tv/${tvId}/recommendations`, { page: 1 }),
      tmdbJson(`/tv/${tvId}/similar`, { page: 1 }),
    ]);

    const pick = (arr) =>
      (Array.isArray(arr) ? arr : []).map((it) => ({
        tmdbId: it.id,
        title:
          it.name ||
          it.original_name ||
          it.title ||
          it.original_title ||
          'Unknown',
        poster: it.poster_path ? `${TMDB_IMAGE_BASE}w342${it.poster_path}` : null,
      }));

    const merged = [...pick(rec?.results), ...pick(sim?.results)];
    const seen = new Set();
    const uniq = [];
    for (const m of merged) {
      if (seen.has(m.tmdbId)) continue;
      seen.add(m.tmdbId);
      uniq.push(m);
    }
    return uniq;
  } catch (e) {
    console.warn('TMDB recs/similar error:', e);
    return [];
  }
}


// Back-compat alias for older imports
export { findTmdbIdForSeason as findTmdbIdForTitle };
