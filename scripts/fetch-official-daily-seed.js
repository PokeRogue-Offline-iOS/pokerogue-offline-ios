#!/usr/bin/env node

/**
 * Fetch the official Daily Run seed through a real browser navigation.
 *
 * Cloudflare rejects direct command-line requests from GitHub-hosted runner
 * IPs even when curl supplies the same headers as the game. ChromeDriver's
 * DevTools bridge adds the official client headers before navigating Chrome
 * directly to the endpoint. Top-level navigation avoids the cross-origin
 * fetch restriction while retaining a first-party PokeRogue connection.
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
    await webdriverRequest("POST", `/session/${sessionId}/goog/cdp/execute`, {
      cmd: "Network.enable",
      params: {},
    });
    await webdriverRequest("POST", `/session/${sessionId}/goog/cdp/execute`, {
      cmd: "Network.setExtraHTTPHeaders",
      params: {
        headers: {
          Authorization: "",
          "Content-Type": "application/json",
          "PKR-Client-Version": clientVersion,
        },
      },
    });
    await webdriverRequest("POST", `/session/${sessionId}/url`, {
      url: "https://api.pokerogue.net/daily/seed",
    });

    let seed = "";
    let lastBody = "";
    for (let attempt = 1; attempt <= 30; attempt++) {
      const result = await webdriverRequest("POST", `/session/${sessionId}/execute/sync`, {
        args: [],
        script: `return {
          body: document.body?.innerText ?? document.documentElement?.textContent ?? "",
          contentType: document.contentType,
          readyState: document.readyState,
          url: location.href,
        };`,
      });
      lastBody = String(result.value?.body ?? "").replace(/[\r\n]/g, "").trim();
      if (lastBody && lastBody.length <= 131_072 && /^[A-Za-z0-9+/=_-]+$/.test(lastBody)) {
        seed = lastBody;
        break;
      }
      await delay(1_000);
    }

    if (!seed) {
      throw new Error(`Official browser navigation returned an invalid seed: ${lastBody.slice(0, 500)}`);
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
