# ESP32 Spotify Proxy

Thin Node/Express backend that sits between your ESP32 and the Spotify Web API.
It holds the `client_secret`, refreshes the access token on its own (~hourly,
cached in memory), and exposes two plain-HTTP routes for the ESP32 to poll.

## Setup

1. **Create a Spotify app**: https://developer.spotify.com/dashboard
   - Add redirect URI: `http://localhost:8888/callback`
   - Copy the `Client ID` and `Client Secret`

2. **Install dependencies**
   ```
   npm install
   ```

3. **Configure env**
   ```
   cp .env.example .env
   ```
   Fill in `SPOTIFY_CLIENT_ID` and `SPOTIFY_CLIENT_SECRET`.

4. **One-time: get a refresh token**
   ```
   npm run auth
   ```
   Follow the printed instructions, then paste the resulting
   `SPOTIFY_REFRESH_TOKEN=...` line into your `.env`.

5. **Run the server**
   ```
   npm start
   ```
   You should see `Spotify proxy listening on http://0.0.0.0:8888`.

   Find your machine's LAN IP (`ipconfig` / `ifconfig`) — the ESP32 will hit
   that IP, not `localhost`.

## Routes

### `GET /now-playing`
```json
{
  "is_playing": true,
  "title": "Song Name",
  "artist": "Artist Name",
  "album_art_url": "https://...",
  "progress_ms": 42000,
  "duration_ms": 210000
}
```
Returns `{ "is_playing": false, "title": null, "artist": null }` when nothing
is playing.

### `POST /control`
```json
{ "action": "play" }        // or "pause", "next", "previous"
```
Returns `{ "ok": true, "action": "play" }` on success. Returns `403` with
Spotify's error body if the account isn't Premium (play/pause/next/previous
require Premium — see README note below).

## Notes

- **Premium required** for `/control` — Spotify rejects playback-control
  calls from Free accounts with a 403. `/now-playing` works on Free.
- **No active device** — if nothing is playing anywhere (phone/desktop/web
  player), `/now-playing` returns `is_playing: false` and `/control` calls
  will 404. The ESP32 isn't a playback device itself, just a remote.
- **Poll interval** — 2–5s is reasonable for the ESP32; don't go much
  tighter or you'll hit Spotify's rate limits.
- **Security** — this proxy has no auth of its own; only expose it on your
  LAN, not to the open internet, unless you add an API key check.

## Example ESP32-side request (Arduino/HTTPClient)

```cpp
HTTPClient http;
http.begin("http://192.168.1.42:8888/now-playing"); // your proxy's LAN IP
int code = http.GET();
if (code == 200) {
  String payload = http.getString();
  // parse with ArduinoJson
}
http.end();
```

```cpp
HTTPClient http;
http.begin("http://192.168.1.42:8888/control");
http.addHeader("Content-Type", "application/json");
http.POST("{\"action\":\"next\"}");
http.end();
```
