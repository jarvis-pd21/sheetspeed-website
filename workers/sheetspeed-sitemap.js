/**
 * Cloudflare Worker: sheetspeed-sitemap (classic service-worker format)
 *
 * Serves /sitemap.xml and /robots.txt at the Cloudflare edge with correct
 * Content-Type, reading the published GitHub origin (120-second edge cache).
 * An unavailable sitemap origin returns
 * a retryable 503 instead of a successful response containing obsolete URLs.
 *
 * Routes (zone agi-jarvis.com):
 *   sheetspeed.agi-jarvis.com/sitemap.xml
 *   sheetspeed.agi-jarvis.com/robots.txt
 *
 * Deployed 2026-10-15 via dash /api/v4 workers/scripts PUT (classic body_part).
 */
const ORIGIN_SITEMAP =
  "https://raw.githubusercontent.com/jarvis-pd21/sheetspeed-website/main/sitemap.xml";
const ORIGIN_ROBOTS =
  "https://raw.githubusercontent.com/jarvis-pd21/sheetspeed-website/main/robots.txt";

const FALLBACK_ROBOTS = `# SheetSpeed — https://sheetspeed.agi-jarvis.com/
User-agent: *
Allow: /

Sitemap: https://sheetspeed.agi-jarvis.com/sitemap.xml
`;

async function fetchText(url, fallback) {
  try {
    const res = await fetch(url, {
      cf: { cacheTtl: 120, cacheEverything: true },
      headers: { "user-agent": "sheetspeed-sitemap-worker/2" },
    });
    if (!res.ok) return fallback;
    const text = await res.text();
    if (!text || text.length < 20) return fallback;
    return text;
  } catch (e) {
    return fallback;
  }
}

addEventListener("fetch", (event) => {
  event.respondWith(handle(event.request));
});

async function handle(request) {
  const { pathname } = new URL(request.url);
  if (pathname === "/sitemap.xml") {
    const body = await fetchText(ORIGIN_SITEMAP, null);
    if (!body || !/<urlset\b[^>]*xmlns=["\']http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9["\']/.test(body) || !body.includes("</urlset>")) {
      return new Response("Sitemap temporarily unavailable. Please retry.", {
        status: 503,
        headers: { "content-type": "text/plain; charset=UTF-8", "cache-control": "no-store", "retry-after": "60" },
      });
    }
    return new Response(body, {
      status: 200,
      headers: {
        "content-type": "application/xml; charset=UTF-8",
        "cache-control": "public, max-age=300",
        "x-sheetspeed-sitemap": "worker-v2-origin-fetch",
      },
    });
  }
  if (pathname === "/robots.txt") {
    const body = await fetchText(ORIGIN_ROBOTS, FALLBACK_ROBOTS);
    return new Response(body, {
      status: 200,
      headers: {
        "content-type": "text/plain; charset=UTF-8",
        "cache-control": "public, max-age=300",
        "x-sheetspeed-sitemap": "worker-v2-origin-fetch",
      },
    });
  }
  return new Response("Not found", { status: 404 });
}
