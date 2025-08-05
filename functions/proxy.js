/**
 * This function handles requests to /proxy and proxies based on the 'url' query parameter.
 */
export async function onRequest(context) {
    const { request } = context;

    try {
        const requestUrl = new URL(request.url);
        const targetUrlParam = requestUrl.searchParams.get('url');

        if (!targetUrlParam) {
            return new Response("Query parameter 'url' is missing.", { status: 400 });
        }

        let actualUrlStr = decodeURIComponent(targetUrlParam);
        actualUrlStr = ensureProtocol(actualUrlStr, requestUrl.protocol);

        // **CRITICAL FIX 1: Filter out the Host header.**
        const newHeaders = filterHeaders(request.headers, 
            key => !key.startsWith('cf-') && !key.startsWith('x-forwarded-') && key !== 'host'
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
    // Important: The new location must also be routed through our proxy via query string.
    const modifiedLocation = `/proxy?url=${encodeURIComponent(location.toString())}`;
    const headers = new Headers(response.headers);
    headers.set('Location', modifiedLocation);

    return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: headers
    });
}

// **CRITICAL FIX 2: A robust HTML path rewriter.**
async function handleHtmlContent(response, actualUrlStr) {
    const originalText = await response.text();
    const targetOrigin = new URL(actualUrlStr).origin;

    // This regex finds attributes like href="/path" or src='/path'
    const pathRegex = /(href|src|action)=(["'])(?!https?://|//|data:)([^"']*?)\2/g;

    return originalText.replace(pathRegex, (match, attr, quote, path) => {
        // Create a full absolute URL from the path.
        const absoluteUrl = new URL(path, actualUrlStr).href;
        // Re-proxy this new absolute URL.
        const proxiedUrl = `/proxy?url=${encodeURIComponent(absoluteUrl)}`;
        return `${attr}=${quote}${proxiedUrl}${quote}`;
    });
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