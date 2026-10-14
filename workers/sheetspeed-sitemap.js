/**
 * Cloudflare Worker: sheetspeed-sitemap
 *
 * Serves /sitemap.xml and /robots.txt at the Cloudflare edge with correct
 * Content-Type, but ALWAYS fetches the live body from GitHub (origin of truth)
 * so lastmod / Allow lines cannot go stale when website/ is redeployed.
 *
 * Routes (zone agi-jarvis.com):
 *   sheetspeed.agi-jarvis.com/sitemap.xml
 *   sheetspeed.agi-jarvis.com/robots.txt
 */
const ORIGIN_SITEMAP =
  "https://raw.githubusercontent.com/jarvis-pd21/sheetspeed-website/main/sitemap.xml";
const ORIGIN_ROBOTS =
  "https://raw.githubusercontent.com/jarvis-pd21/sheetspeed-website/main/robots.txt";

const FALLBACK_SITEMAP = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://sheetspeed.agi-jarvis.com/</loc>
    <lastmod>2026-10-14</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>https://sheetspeed.agi-jarvis.com/features.html</loc>
    <lastmod>2026-10-14</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.9</priority>
  </url>
  <url>
    <loc>https://sheetspeed.agi-jarvis.com/install.html</loc>
    <lastmod>2026-10-14</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.9</priority>
  </url>
  <url>
    <loc>https://sheetspeed.agi-jarvis.com/pricing.html</loc>
    <lastmod>2026-10-14</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://sheetspeed.agi-jarvis.com/faq.html</loc>
    <lastmod>2026-10-14</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://sheetspeed.agi-jarvis.com/about.html</loc>
    <lastmod>2026-10-14</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>
  <url>
    <loc>https://sheetspeed.agi-jarvis.com/excel-shortcuts-google-sheets.html</loc>
    <lastmod>2026-10-14</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.95</priority>
  </url>
  <url>
    <loc>https://sheetspeed.agi-jarvis.com/sheetwhiz-alternative.html</loc>
    <lastmod>2026-10-14</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.85</priority>
  </url>
  <url>
    <loc>https://sheetspeed.agi-jarvis.com/compare-excel-shortcuts.html</loc>
    <lastmod>2026-10-14</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.95</priority>
  </url>
  <url>
    <loc>https://sheetspeed.agi-jarvis.com/changelog.html</loc>
    <lastmod>2026-10-14</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.75</priority>
  </url>
</urlset>
`;

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
  } catch {
    return fallback;
  }
}

export default {
  async fetch(request) {
    const { pathname } = new URL(request.url);

    if (pathname === "/sitemap.xml") {
      const body = await fetchText(ORIGIN_SITEMAP, FALLBACK_SITEMAP);
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
  },
};
