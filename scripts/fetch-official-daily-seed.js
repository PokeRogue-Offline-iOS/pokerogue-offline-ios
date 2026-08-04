#!/usr/bin/env node

/**
 * Fetch the official Daily Run seed from a real pokerogue.net browser context.
 *
 * Cloudflare rejects direct requests from GitHub-hosted runner IPs even when
 * curl supplies the same headers as the game. GitHub's Ubuntu image includes
 * matching Chrome and ChromeDriver installations, so this script uses the
 * public endpoint exactly as the official browser client does. It does not
 * contact a proxy or another offline build's seed mirror.
 */

const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const clientVersion = process.env.POKEROGUE_CLIENT_VERSION;
const port = Number(process.env.CHROMEDRIVER_PORT || 9515);
const driverUrl = `http://127.0.0.1:${port}`;

if (!clientVersion) {
  throw new Error("POKEROGUE_CLIENT_VERSION is required.");
}

const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

function resolveChromeDriver() {
  const configured = process.env.CHROMEWEBDRIVER;
  if (!configured) {
    return "chromedriver";
  }

  try {
    if (fs.statSync(configured).isDirectory()) {
      return path.join(configured, process.platform === "win32" ? "chromedriver.exe" : "chromedriver");
    }
  } catch {
    // Let spawn report a useful error for a missing configured path.
  }

  return configured;
}

async function readJson(response, label) {
  const body = await response.text();
  let payload;

  try {
    payload = JSON.parse(body);
  } catch (error) {
    throw new Error(`${label} returned invalid JSON: ${body.slice(0, 500)}`, { cause: error });
  }

  if (!response.ok || payload?.value?.error) {
    throw new Error(`${label} failed: ${JSON.stringify(payload.value ?? payload)}`);
  }

  return payload;
}

async function webdriverRequest(method, endpoint, body) {
  const response = await fetch(`${driverUrl}${endpoint}`, {
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    method,
  });
  return readJson(response, `${method} ${endpoint}`);
}

async function waitForDriver(driver) {
  for (let attempt = 1; attempt <= 60; attempt++) {
    if (driver.exitCode !== null) {
      throw new Error(`ChromeDriver exited before becoming ready (code ${driver.exitCode}).`);
    }

    try {
      const response = await fetch(`${driverUrl}/status`);
      const payload = await readJson(response, "ChromeDriver status");
      if (payload.value?.ready) {
        return;
      }
    } catch {
      // ChromeDriver may not have opened its port yet.
    }

    await delay(250);
  }

  throw new Error("Timed out waiting for ChromeDriver.");
}

async function fetchSeed() {
  const driver = spawn(resolveChromeDriver(), [`--port=${port}`], {
    stdio: ["ignore", "ignore", "pipe"],
  });
  let driverErrors = "";
  let sessionId;

  driver.stderr.on("data", chunk => {
    driverErrors = `${driverErrors}${chunk}`.slice(-8_192);
  });

  try {
    await waitForDriver(driver);

    const chromeOptions = {
      args: ["--disable-dev-shm-usage", "--headless=new", "--no-sandbox", "--window-size=1280,720"],
    };
    if (process.env.CHROME_BIN) {
      chromeOptions.binary = process.env.CHROME_BIN;
    }

    const session = await webdriverRequest("POST", "/session", {
      capabilities: {
        alwaysMatch: {
          browserName: "chrome",
          pageLoadStrategy: "eager",
          "goog:chromeOptions": chromeOptions,
        },
      },
    });
    sessionId = session.value?.sessionId ?? session.sessionId;
    if (!sessionId) {
      throw new Error(`ChromeDriver did not return a session ID: ${JSON.stringify(session)}`);
    }

    await webdriverRequest("POST", `/session/${sessionId}/timeouts`, {
      pageLoad: 60_000,
      script: 30_000,
    });
    await webdriverRequest("POST", `/session/${sessionId}/url`, {
      url: "https://pokerogue.net/robots.txt",
    });

    const result = await webdriverRequest("POST", `/session/${sessionId}/execute/async`, {
      args: [clientVersion],
      script: `
        const clientVersion = arguments[0];
        const done = arguments[arguments.length - 1];
        fetch("https://api.pokerogue.net/daily/seed", {
          headers: {
            Authorization: "",
            "Content-Type": "application/json",
            "PKR-Client-Version": clientVersion,
          },
          method: "GET",
        })
          .then(async response => done({ body: await response.text(), status: response.status }))
          .catch(error => done({ error: String(error) }));
      `,
    });

    const fetchResult = result.value;
    if (fetchResult?.error) {
      throw new Error(`Official browser request failed: ${fetchResult.error}`);
    }
    if (fetchResult?.status !== 200) {
      throw new Error(`Official browser request returned HTTP ${fetchResult?.status}: ${fetchResult?.body}`);
    }

    const seed = String(fetchResult.body ?? "").replace(/[\r\n]/g, "");
    if (!seed || seed.length > 131_072 || !/^[A-Za-z0-9+/=_-]+$/.test(seed)) {
      throw new Error("Official browser request returned an invalid seed.");
    }

    process.stdout.write(seed);
  } catch (error) {
    if (driverErrors) {
      console.error(driverErrors);
    }
    throw error;
  } finally {
    if (sessionId) {
      try {
        await webdriverRequest("DELETE", `/session/${sessionId}`);
      } catch {
        // The driver process is terminated below even if session cleanup fails.
      }
    }
    driver.kill("SIGTERM");
  }
}

fetchSeed().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
