// server.js
// ESP32 Spotify Proxy — holds the client secret, caches the access token,
// and exposes two slim routes for the ESP32 to poll/control.
//
// Routes:
//   GET  /now-playing   -> { title, artist, album_art_url, progress_ms, duration_ms, is_playing }
//   POST /control        -> body: { "action": "play" | "pause" | "next" | "previous" }
//
// Setup: see README.md for the one-time OAuth step to get your refresh token.

require('dotenv').config();
const express = require('express');
const app = express();
app.use(express.json());

const {
  SPOTIFY_CLIENT_ID,
  SPOTIFY_CLIENT_SECRET,
  SPOTIFY_REFRESH_TOKEN,
  PORT = 8888
} = process.env;

if (!SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET || !SPOTIFY_REFRESH_TOKEN) {
  console.error('Missing SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET / SPOTIFY_REFRESH_TOKEN in .env');
  process.exit(1);
}

// ---- Token cache (in-memory, ~1hr lifetime) -------------------------------

const tokenCache = {
  access_token: null,
  refresh_token: SPOTIFY_REFRESH_TOKEN,
  expires_at: 0 // epoch ms
};

async function getValidAccessToken() {
  const SAFETY_MARGIN_MS = 60_000; // refresh 60s before actual expiry

  if (tokenCache.access_token && Date.now() < tokenCache.expires_at - SAFETY_MARGIN_MS) {
    return tokenCache.access_token;
  }

  const basicAuth = Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64');

  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${basicAuth}`
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: tokenCache.refresh_token
    })
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Token refresh failed (${res.status}): ${errText}`);
  }

  const data = await res.json();
  tokenCache.access_token = data.access_token;
  tokenCache.expires_at = Date.now() + data.expires_in * 1000;
  if (data.refresh_token) {
    tokenCache.refresh_token = data.refresh_token; // Spotify sometimes rotates it
  }

  console.log(`[token] refreshed, valid until ${new Date(tokenCache.expires_at).toISOString()}`);
  return tokenCache.access_token;
}

// ---- Helper: authenticated Spotify API call --------------------------------

async function spotifyFetch(path, options = {}) {
  const token = await getValidAccessToken();
  return fetch(`https://api.spotify.com/v1${path}`, {
    ...options,
    headers: {
      ...(options.headers || {}),
      'Authorization': `Bearer ${token}`
    }
  });
}

// ---- Routes -----------------------------------------------------------------

app.get('/now-playing', async (req, res) => {
  try {
    const spRes = await spotifyFetch('/me/player/currently-playing');

    // No active playback -> Spotify returns 204 with no body
    if (spRes.status === 204) {
      return res.json({ is_playing: false, title: null, artist: null });
    }

    if (!spRes.ok) {
      const errText = await spRes.text();
      return res.status(spRes.status).json({ error: errText });
    }

    const data = await spRes.json();

    if (!data || !data.item) {
      return res.json({ is_playing: false, title: null, artist: null });
    }

    res.json({
      is_playing: data.is_playing,
      title: data.item.name,
      artist: data.item.artists.map(a => a.name).join(', '),
      album_art_url: data.item.album.images?.[0]?.url || null,
      progress_ms: data.progress_ms,
      duration_ms: data.item.duration_ms
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/control', async (req, res) => {
  const { action } = req.body;

  const routes = {
    play:     { path: '/me/player/play',     method: 'PUT' },
    pause:    { path: '/me/player/pause',    method: 'PUT' },
    next:     { path: '/me/player/next',     method: 'POST' },
    previous: { path: '/me/player/previous', method: 'POST' }
  };

  const route = routes[action];
  if (!route) {
    return res.status(400).json({ error: `Unknown action "${action}". Use play/pause/next/previous.` });
  }

  try {
    const spRes = await spotifyFetch(route.path, { method: route.method });

    // Premium-required or no active device -> Spotify returns 403/404
    if (!spRes.ok && spRes.status !== 204) {
      const errText = await spRes.text();
      return res.status(spRes.status).json({ error: errText });
    }

    res.json({ ok: true, action });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Spotify proxy listening on http://0.0.0.0:${PORT}`);
});
