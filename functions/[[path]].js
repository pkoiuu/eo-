const ROOT_HTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Proxy Everything - Modern</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="icon" type="image/png" href="https://s2.hdslb.com/bfs/openplatform/1682b11880f5c53171217a03c8adc9f2e2a27fcf.png@100w.webp">
  <meta name="Description" content="Proxy Everything with EdgeOne Pages. A modern, fast, and reliable proxy service.">
  <style>
    body {
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }
    .gradient-bg {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    }
    .dark .gradient-bg {
      background: linear-gradient(135deg, #1e293b 0%, #334155 100%);
    }
    .card-bg {
      background-color: rgba(255, 255, 255, 0.1);
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
      border: 1px solid rgba(255, 255, 255, 0.2);
    }
    .dark .card-bg {
      background-color: rgba(30, 41, 59, 0.5);
      border: 1px solid rgba(255, 255, 255, 0.1);
    }
  </style>
</head>
<body class="dark:bg-slate-900">
  <div class="relative min-h-screen w-full flex items-center justify-center p-4 gradient-bg">
    <div class="w-full max-w-lg">
      <div class="rounded-xl shadow-2xl card-bg">
        <div class="p-8">
          <div class="text-center mb-6">
            <h1 class="text-3xl font-bold text-white">Proxy Everything</h1>
            <p class="text-gray-200 mt-2">A modern, fast, and reliable proxy service.</p>
          </div>
          <form id="urlForm" onsubmit="redirectToProxy(event)">
            <div class="relative">
              <input type="text" id="targetUrl" required
                class="w-full px-4 py-3 text-lg text-white bg-white/10 rounded-lg border border-transparent focus:border-white/50 focus:ring-0 focus:outline-none transition duration-300"
                placeholder="Enter target URL...">
            </div>
            <button type="submit"
              class="w-full mt-4 px-4 py-3 text-lg font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-opacity-50 transition duration-300">
              Go Proxy
            </button>
          </form>
        </div>
      </div>
      <footer class="text-center mt-6">
        <p class="text-sm text-white/70">Powered by EdgeOne Pages. Fork me on GitHub.</p>
      </footer>
    </div>
  </div>
  <script>
    function redirectToProxy(event) {
      event.preventDefault();
      const targetUrl = document.getElementById('targetUrl').value.trim();
      if (targetUrl) {
        const proxyUrl = window.location.origin + '/' + encodeURIComponent(targetUrl);
        window.open(proxyUrl, '_blank');
      }
    }
    // Auto-switch dark mode based on system preference
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      document.documentElement.classList.add('dark');
    }
  </script>
</body>
</html>`;

export async function onRequest(context) {
    const { request } = context;

    try {
        const requestUrl = new URL(request.url);
        const pathname = requestUrl.pathname;

        if (pathname === '/') {
            return new Response(ROOT_HTML, {
                headers: { 'Content-Type': 'text/html; charset=utf-8' }
            });
        }

        let targetUrlParam = pathname.substring(1);
        const originalQueryString = requestUrl.search;

        let actualUrlStr = decodeURIComponent(targetUrlParam);
        actualUrlStr = ensureProtocol(actualUrlStr, requestUrl.protocol);
        actualUrlStr += originalQueryString;

        const newHeaders = filterHeaders(request.headers, 
            key => !key.startsWith('cf-') && !key.startsWith('x-forwarded-')
        );

        const modifiedRequest = new Request(actualUrlStr, {
            headers: newHeaders,
            method: request.method,
            body: request.body,
            redirect: 'manual'
        });

        const response = await fetch(modifiedRequest);
        let body = response.body;

        if ([301, 302, 303, 307, 308].includes(response.status)) {
            return handleRedirect(response);
        } else if (response.headers.get("Content-Type")?.includes("text/html")) {
            body = await handleHtmlContent(response, actualUrlStr);
        }

        const modifiedResponse = new Response(body, {
            status: response.status,
            statusText: response.statusText,
            headers: response.headers
        });

        setNoCacheHeaders(modifiedResponse.headers);
        setCorsHeaders(modifiedResponse.headers);

        return modifiedResponse;

    } catch (error) {
        return jsonResponse({ error: error.message }, 500);
    }
}

// --- Helper Functions ---

function ensureProtocol(url, defaultProtocol) {
    if (url.startsWith("http://") || url.startsWith("https://")) {
        return url;
    }
    if (!url.includes('://')) {
        return defaultProtocol + "//" + url;
    }
    return url;
}

function handleRedirect(response) {
    const location = new URL(response.headers.get('location'));
    const modifiedLocation = `/${encodeURIComponent(location.toString())}`;
    const headers = new Headers(response.headers);
    headers.set('Location', modifiedLocation);

    return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: headers
    });
}

async function handleHtmlContent(response, actualUrlStr) {
    const originalText = await response.text();
    const targetOrigin = new URL(actualUrlStr).origin;

    const regex = new RegExp('((href|src|action)=["\])/(?!/)', 'g');
    
    return originalText.replace(regex, `$1/${targetOrigin}/`);
}

function jsonResponse(data, status) {
    return new Response(JSON.stringify(data), {
        status: status,
        headers: { 'Content-Type': 'application/json; charset=utf-8' }
    });
}

function filterHeaders(headers, filterFunc) {
    const filteredEntries = [...headers.entries()].filter(([key]) => filterFunc(key.toLowerCase()));
    return new Headers(filteredEntries);
}

function setNoCacheHeaders(headers) {
    headers.set('Cache-Control', 'no-store');
}

function setCorsHeaders(headers) {
    headers.set('Access-Control-Allow-Origin', '*');
    headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
    headers.set('Access-Control-Allow-Headers', '*');
}
