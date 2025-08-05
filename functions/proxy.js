/**
 * This function handles requests to /proxy and proxies based on the 'url' query parameter.
 * This version strictly follows the logic of the original Cloudflare-Workers-Proxy project.
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
        // Return a more informative error message for debugging.
        return new Response(`Proxy Error: ${error.message}`, { status: 500 });
    }
}

// --- Helper Functions (Strictly adapted from original project) ---

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
    const modifiedLocation = `/proxy?url=${encodeURIComponent(location.toString())}`;
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

    // This regex is logically equivalent to the one in the original project.
    // It finds root-relative paths like href="/path" and prepends the proxy URL.
    const regex = /(href|src|action)=(["'])\/([^\/][^"']*?)\2/g;

    return originalText.replace(regex, (match, attr, quote, path) => {
        const proxiedUrl = `/proxy?url=${encodeURIComponent(`${targetOrigin}/${path}`)}`;
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
