// skip-marker-backend/index.js
const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false } // Neon requires SSL
});

// Helpers
const toInt = (v, fallback = null) => {
  if (v === undefined || v === null || v === '') return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? parseInt(n, 10) : fallback;
};

// Health
app.get('/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

/**
 * GET /skip-markers?tmdb_id=123&season=1&episode=2
 * - Movies: season=0&episode=0
 * - Returns 200 with object or null
 */
app.get('/skip-markers', async (req, res) => {
  try {
    const tmdbId = toInt(req.query.tmdb_id, null);
    const season = toInt(req.query.season, 0);
    const episode = toInt(req.query.episode, 0);

    if (tmdbId === null) {
      return res.status(400).json({ error: 'tmdb_id is required' });
    }

    const { rows } = await pool.query(
      `SELECT id, tmdb_id, season, episode,
              intro_start_seconds, intro_end_seconds,
              outro_start_seconds, outro_end_seconds,
              created_at
         FROM skip_markers
        WHERE tmdb_id = $1 AND season = $2 AND episode = $3
        ORDER BY created_at DESC
        LIMIT 1`,
      [tmdbId, season, episode]
    );

    return res.json(rows[0] ?? null);
  } catch (error) {
    console.error('GET /skip-markers error:', error);
    return res.status(500).json({ error: 'Internal server error', detail: error.message });
  }
});

/**
 * Legacy/back-compat:
 * GET /skip-markers/:tmdbEpisodeId
 * - Only if you still need it; otherwise you can remove this route.
 */
app.get('/skip-markers/:tmdbEpisodeId', async (req, res) => {
  try {
    const idNum = toInt(req.params.tmdbEpisodeId, null);
    if (idNum === null) return res.status(400).json({ error: 'Invalid tmdbEpisodeId' });

    const { rows } = await pool.query(
      `SELECT id, tmdb_id, season, episode, tmdb_episode_id,
              intro_start_seconds, intro_end_seconds,
              outro_start_seconds, outro_end_seconds,
              created_at
         FROM skip_markers
        WHERE tmdb_episode_id = $1
        ORDER BY created_at DESC
        LIMIT 1`,
      [idNum]
    );

    if (!rows.length) return res.json(null);
    res.json(rows[0]);
  } catch (error) {
    console.error('GET /skip-markers/:tmdbEpisodeId error:', error);
    res.status(500).json({ error: 'Internal server error', detail: error.message });
  }
});

/**
 * POST /skip-markers
 * Body:
 * {
 *   "tmdb_id": number,          // required
 *   "season": number,           // default 0 for movie
 *   "episode": number,          // default 0 for movie
 *   "intro_start_seconds": number|null,
 *   "intro_end_seconds": number|null,
 *   "outro_start_seconds": number|null,
 *   "outro_end_seconds": number|null
 * }
 *
 * Behavior: UPSERT on (tmdb_id, season, episode)
 */
app.post('/skip-markers', async (req, res) => {
  try {
    const tmdb_id = toInt(req.body.tmdb_id, null);
    const season   = toInt(req.body.season, 0);
    const episode  = toInt(req.body.episode, 0);

    if (tmdb_id === null) {
      return res.status(400).json({ error: 'tmdb_id is required' });
    }

    const intro_start_seconds = req.body.intro_start_seconds ?? null;
    const intro_end_seconds   = req.body.intro_end_seconds ?? null;
    const outro_start_seconds = req.body.outro_start_seconds ?? null;
    const outro_end_seconds   = req.body.outro_end_seconds ?? null;

    const { rows } = await pool.query(
      `INSERT INTO skip_markers
         (tmdb_id, season, episode,
          intro_start_seconds, intro_end_seconds,
          outro_start_seconds, outro_end_seconds, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7, NOW())
       ON CONFLICT ON CONSTRAINT uq_skip_identity
       DO UPDATE SET
          intro_start_seconds = EXCLUDED.intro_start_seconds,
          intro_end_seconds   = EXCLUDED.intro_end_seconds,
          outro_start_seconds = EXCLUDED.outro_start_seconds,
          outro_end_seconds   = EXCLUDED.outro_end_seconds,
          created_at          = NOW()
       RETURNING id, tmdb_id, season, episode,
                 intro_start_seconds, intro_end_seconds,
                 outro_start_seconds, outro_end_seconds,
                 created_at`,
      [
        tmdb_id, season, episode,
        intro_start_seconds, intro_end_seconds,
        outro_start_seconds, outro_end_seconds
      ]
    );

    return res.status(201).json(rows[0]);
  } catch (error) {
    console.error('POST /skip-markers error:', error);
    return res.status(500).json({ error: 'Internal server error', detail: error.message });
  }
});

// Fallback error handler
app.use((err, _req, res, _next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error', detail: err?.message });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Skip Marker API listening on port ${PORT}`);
});
