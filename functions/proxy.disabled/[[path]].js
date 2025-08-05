/**
 * This function handles all requests to /proxy/ and acts as the proxy.
 */
export async function onRequest(context) {
    const { request, params } = context;

    try {
        // The 'path' parameter from the filename [[path]].js captures the rest of the URL.
        // It's an array of path segments, so we join them.
        let targetUrlParam = params.path.join('/');

        if (!targetUrlParam) {
            return new Response("Target URL is missing.", { status: 400 });
        }

        const requestUrl = new URL(request.url);
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
    // Important: The new location must also be routed through our proxy.
    const modifiedLocation = `/proxy/${encodeURIComponent(location.toString())}`;
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

    // Regex to find relative paths in href, src, and action attributes.
    const regex = new RegExp('((href|src|action)=["
iversal_newline_placeholder"])(\/(?!\/))', 'g');
    
    // Prepend the proxy path and the target origin to make the paths absolute *to our proxy*.
    return originalText.replace(regex, `$1/proxy/${targetOrigin}/`);
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