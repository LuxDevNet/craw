const PLUGINS_JSON = JSON.stringify(
  {
    plugins: [
      {
        id: "craw",
        name: "craw",
        title: "Craw",
        description: "Base host and plugin endpoint runtime for public-page scraping.",
        version: "0.1.0",
        npmName: "@agnamo/craw",
        kind: "host",
        endpoints: ["scrape", "doctor", "plugins"],
        vertical: "base",
        license: "MIT",
        homepage: "https://github.com/LuxDevNet/craw",
      },
      {
        id: "craw-jobs",
        name: "unjobbed",
        title: "Craw Jobs",
        description: "Jobs scraper plugin endpoint powered by Unjobbed for job boards and ATS sources.",
        version: "1.1.0",
        npmName: "@agnamo/craw-jobs",
        kind: "plugin",
        endpoints: ["scrape", "run", "doctor"],
        vertical: "jobs",
        license: "MIT",
        homepage: "https://github.com/LuxDevNet/jobhound",
      },
    ],
  },
  null,
  2,
) + "\n";

const INDEX_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>@agnamo/craw</title>
    <style>
      :root {
        color-scheme: dark;
        font-family: "JetBrains Mono", "SFMono-Regular", Consolas, monospace;
        background: #031107;
        color: #97ff5e;
      }

      body {
        min-height: 100vh;
        margin: 0;
        display: grid;
        place-items: center;
      }

      main {
        width: min(760px, calc(100vw - 48px));
        border: 1px solid #34ff4a;
        box-shadow: 0 0 48px rgb(52 255 74 / 0.25);
        padding: 40px;
        background: linear-gradient(135deg, rgb(4 31 10 / 0.96), rgb(2 10 6 / 0.96));
      }

      h1 {
        margin: 0 0 16px;
        font-size: clamp(2rem, 6vw, 4rem);
        letter-spacing: -0.08em;
      }

      p {
        line-height: 1.7;
      }

      a {
        color: #ccff00;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>@agnamo/craw</h1>
      <p>Craw is the public base host and plugin discovery endpoint for Agnamo scraping packages.</p>
      <p>This toxic-green placeholder is served by a Cloudflare Worker backed by R2 and can be replaced from <code>site/</code>.</p>
      <p><a href="/plugins.json">View plugin manifest JSON</a></p>
    </main>
  </body>
</html>
`;

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
};

function extensionFor(key) {
  const index = key.lastIndexOf(".");
  return index === -1 ? "" : key.slice(index).toLowerCase();
}

function fallbackForKey(key) {
  if (key === "index.html") return { body: INDEX_HTML, contentType: MIME_TYPES[".html"] };
  if (key === "plugins.json") return { body: PLUGINS_JSON, contentType: MIME_TYPES[".json"] };
  return undefined;
}

function objectHeaders(object, key) {
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  if (!headers.has("content-type")) {
    headers.set("content-type", MIME_TYPES[extensionFor(key)] ?? "application/octet-stream");
  }
  headers.set("cache-control", key === "index.html" || key === "plugins.json" ? "public, max-age=60" : "public, max-age=31536000, immutable");
  return headers;
}

async function getObject(env, key) {
  const object = await env.ASSETS_BUCKET.get(key);
  if (object) return object;
  if (!key.endsWith("/index.html")) return env.ASSETS_BUCKET.get(`${key}/index.html`);
  return null;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const method = request.method.toUpperCase();

    if (method !== "GET" && method !== "HEAD") {
      return new Response("Method Not Allowed", {
        status: 405,
        headers: { allow: "GET, HEAD" },
      });
    }

    const key = url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname.slice(1));
    console.log(JSON.stringify({ message: "craw site request", method, path: url.pathname, key }));

    const object = await getObject(env, key);
    if (object) {
      return new Response(method === "HEAD" ? null : object.body, {
        headers: objectHeaders(object, key),
      });
    }

    const fallback = fallbackForKey(key);
    if (fallback) {
      return new Response(method === "HEAD" ? null : fallback.body, {
        headers: {
          "content-type": fallback.contentType,
          "cache-control": "public, max-age=60",
        },
      });
    }

    return new Response("Not Found", {
      status: 404,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  },
};
