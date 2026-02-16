const https = require("https");
const http = require("http");
const config = require("./config");

let lastRequestTime = 0;

/**
 * Enforce minimum delay between API requests.
 */
async function rateLimit() {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < config.REQUEST_DELAY_MS) {
    await sleep(config.REQUEST_DELAY_MS - elapsed);
  }
  lastRequestTime = Date.now();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Make an HTTP GET request with retries and rate limiting.
 * Does NOT retry on 401, 403, or 404 (auth / not-found errors).
 * @param {string} url - Full URL to fetch
 * @returns {Promise<object>} Parsed JSON response
 */
async function fetchJSON(url) {
  await rateLimit();

  for (let attempt = 0; attempt <= config.RETRY_ATTEMPTS; attempt++) {
    try {
      const data = await doGet(url);
      return JSON.parse(data);
    } catch (err) {
      // Never retry client errors — they won't succeed on retry
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

/**
 * Low-level HTTP GET returning the response body as a string.
 */
function doGet(url) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith("https") ? https : http;
    const options = { headers: {} };

    // Add user-agent to look like a browser
    options.headers["User-Agent"] =
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
    options.headers["Accept"] = "application/json";

    // Add JWT auth if available
    if (config.JWT_TOKEN) {
      options.headers["Authorization"] = `Bearer ${config.JWT_TOKEN}`;
    }

    const req = mod.get(url, options, (res) => {
      // Handle redirects
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
