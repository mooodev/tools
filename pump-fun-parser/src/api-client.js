const https = require("https");
const http = require("http");
const config = require("./config");

let lastRequestTime = 0;

async function rateLimit(delayMs) {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  const delay = delayMs || config.REQUEST_DELAY_MS;
  if (elapsed < delay) {
    await sleep(delay - elapsed);
  }
  lastRequestTime = Date.now();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Make an HTTP GET request with retries and rate limiting.
 * Does NOT retry on 401, 403, or 404.
 */
async function fetchJSON(url, { rateLimitMs } = {}) {
  await rateLimit(rateLimitMs);

  for (let attempt = 0; attempt <= config.RETRY_ATTEMPTS; attempt++) {
    try {
      const data = await doGet(url);
      return JSON.parse(data);
    } catch (err) {
      if (/HTTP (401|403|404)/.test(err.message)) throw err;

      const isLast = attempt === config.RETRY_ATTEMPTS;
      if (isLast) throw err;

      const delay = config.RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
      console.warn(
        `  [retry] Attempt ${attempt + 1} failed for ${url}: ${err.message}. Retrying in ${delay}ms...`
      );
      await sleep(delay);
    }
  }
}

function doGet(url) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith("https") ? https : http;
    const options = {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        Accept: "application/json",
      },
    };

    const req = mod.get(url, options, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        doGet(res.headers.location).then(resolve).catch(reject);
        return;
      }

      if (res.statusCode === 429) {
        reject(new Error("Rate limited (429)"));
        return;
      }

      if (res.statusCode < 200 || res.statusCode >= 300) {
        res.resume();
        reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        return;
      }

      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => resolve(body));
    });

    req.on("error", reject);
    req.setTimeout(30000, () => {
      req.destroy(new Error("Request timeout"));
    });
  });
}

module.exports = { fetchJSON, sleep };
