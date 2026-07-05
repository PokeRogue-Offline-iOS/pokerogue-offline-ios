const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const https = require('https');

let mainWindow;

// Substituted at build time via `sed` in build-exe.yml, sourced from GitHub
// Secrets — same pattern already used for BUILD_NUMBER_PLACEHOLDER elsewhere
// in this pipeline. Neither value is confidential in the cryptographic
// sense for a Desktop-type OAuth client (see the write-up in the plan doc),
// but they're kept out of plain git history anyway.
const GOOGLE_CLIENT_ID = 'GOOGLE_DESKTOP_CLIENT_ID_PLACEHOLDER';
const GOOGLE_CLIENT_SECRET = 'GOOGLE_DESKTOP_CLIENT_SECRET_PLACEHOLDER';
const GOOGLE_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    icon: path.join(__dirname, 'appIcon.ico'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'dist/index.html'));

  if (process.env.DEBUG) {
    mainWindow.webContents.openDevTools();
  }
}

app.on('ready', createWindow);
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// ─────────────────────────────────────────────────────────────────────────
// Google Sign-In — "installed app" loopback flow (RFC 8252) with PKCE.
//
// NOTE: this has been written against Google's documented loopback-redirect
// flow, but has not been exercised against a real Google Cloud OAuth client
// yet. Treat as a solid first draft to verify once the real Desktop client
// ID/secret are wired in via CI.
// ─────────────────────────────────────────────────────────────────────────

function base64UrlEncode(buffer) {
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function makePkcePair() {
  const verifier = base64UrlEncode(crypto.randomBytes(32));
  const challenge = base64UrlEncode(crypto.createHash('sha256').update(verifier).digest());
  return { verifier, challenge };
}

/** Starts a one-shot loopback HTTP server, resolves with the ?code= from the redirect. */
function waitForAuthCode(port) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, `http://127.0.0.1:${port}`);
      const code = url.searchParams.get('code');
      const error = url.searchParams.get('error');

      res.setHeader('Content-Type', 'text/html');
      if (code) {
        res.end('<html><body>Signed in — you can close this tab and return to PokeRogue Offline.</body></html>');
      } else {
        res.end('<html><body>Sign-in failed or was cancelled. You can close this tab.</body></html>');
      }

      server.close();
      if (code) {
        resolve(code);
      } else {
        reject(new Error(error || 'No authorization code received.'));
      }
    });

    server.on('error', reject);
    server.listen(port, '127.0.0.1');
  });
}

/** Finds a free loopback port by briefly binding to port 0 and reading it back. */
function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = http.createServer();
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
    server.on('error', reject);
  });
}

function exchangeCodeForToken(code, verifier, redirectUri) {
  const body = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    client_secret: GOOGLE_CLIENT_SECRET,
    code,
    code_verifier: verifier,
    grant_type: 'authorization_code',
    redirect_uri: redirectUri,
  }).toString();

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: 'oauth2.googleapis.com',
        path: '/token',
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(body),
        },
      },
      res => {
        let data = '';
        res.on('data', chunk => {
          data += chunk;
        });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            if (parsed.access_token) {
              resolve(parsed.access_token);
            } else {
              reject(new Error(`Token exchange failed: ${data}`));
            }
          } catch (err) {
            reject(err);
          }
        });
      },
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

ipcMain.handle('google-sign-in', async () => {
  const port = await getFreePort();
  const redirectUri = `http://127.0.0.1:${port}`;
  const { verifier, challenge } = makePkcePair();

  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', GOOGLE_CLIENT_ID);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', GOOGLE_SCOPE);
  authUrl.searchParams.set('code_challenge', challenge);
  authUrl.searchParams.set('code_challenge_method', 'S256');
  authUrl.searchParams.set('access_type', 'online'); // no offline/server-auth-code flow needed — see plan doc.

  const codePromise = waitForAuthCode(port);
  await shell.openExternal(authUrl.toString());
  const code = await codePromise;

  return exchangeCodeForToken(code, verifier, redirectUri);
});
