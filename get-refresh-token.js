// get-refresh-token.js
// Run this ONCE to get your initial SPOTIFY_REFRESH_TOKEN.
// After that, server.js handles refreshing forever on its own — you never
// run this again unless you revoke access or change scopes.
//
// Usage:
//   1. node get-refresh-token.js
//   2. Open the printed URL, log in, approve access
//   3. You'll be redirected to your REDIRECT_URI with ?code=... in the URL
//   4. Paste that full redirected URL back into the terminal when prompted
//   5. Copy the printed refresh_token into your .env

require('dotenv').config();
const readline = require('readline');

const {
  SPOTIFY_CLIENT_ID,
  SPOTIFY_CLIENT_SECRET,
  SPOTIFY_REDIRECT_URI = 'http://127.0.0.1:8888/callback'
} = process.env;

const SCOPES = [
  'user-read-currently-playing',
  'user-read-playback-state',
  'user-modify-playback-state'
].join(' ');

const authUrl = `https://accounts.spotify.com/authorize?` + new URLSearchParams({
  response_type: 'code',
  client_id: SPOTIFY_CLIENT_ID,
  scope: SCOPES,
  redirect_uri: SPOTIFY_REDIRECT_URI
});

console.log('\n1. Open this URL in your browser and approve access:\n');
console.log(authUrl + '\n');
console.log('2. After approving, you will land on a page that may fail to load —');
console.log('   that is fine. Copy the FULL URL from your browser address bar.\n');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

rl.question('Paste the full redirected URL here: ', async (redirectedUrl) => {
  rl.close();

  let code;
  try {
    code = new URL(redirectedUrl).searchParams.get('code');
  } catch {
    console.error('Could not parse a URL from that input.');
    process.exit(1);
  }

  if (!code) {
    console.error('No "code" param found in that URL.');
    process.exit(1);
  }

  const basicAuth = Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64');

  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${basicAuth}`
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: SPOTIFY_REDIRECT_URI
    })
  });

  const data = await res.json();

  if (!res.ok) {
    console.error('Token exchange failed:', data);
    process.exit(1);
  }

  console.log('\nSuccess. Add this to your .env file:\n');
  console.log(`SPOTIFY_REFRESH_TOKEN=${data.refresh_token}\n`);
});
