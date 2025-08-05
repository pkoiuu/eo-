/**
 * This function handles requests to /proxy and proxies based on the 'url' query parameter.
 * This version includes the critical fix for Set-Cookie headers.
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

        // **CRITICAL FIX: Create a new Headers object and filter out Set-Cookie.**
        const finalHeaders = new Headers();
        for (const [key, value] of response.headers.entries()) {
            if (key.toLowerCase() !== 'set-cookie') {
                finalHeaders.append(key, value);
            }
        }

        // Add our own required headers.
        setNoCacheHeaders(finalHeaders);
        setCorsHeaders(finalHeaders);

        if ([301, 302, 303, 307, 308].includes(response.status)) {
            // For redirects, we must also filter the headers.
            const location = new URL(response.headers.get('location'));
            const modifiedLocation = `/proxy?url=${encodeURIComponent(location.toString())}`;
            finalHeaders.set('Location', modifiedLocation);

            return new Response(response.body, {
                status: response.status,
                statusText: response.statusText,
                headers: finalHeaders
            });
        }

        if (response.headers.get("Content-Type")?.includes("text/html")) {
            body = await handleHtmlContent(response, actualUrlStr);
        }

        const modifiedResponse = new Response(body, {
            status: response.status,
            statusText: response.statusText,
            headers: finalHeaders // Use the sanitized headers
        });

        return modifiedResponse;

    } catch (error) {
        return new Response(`Proxy Error: ${error.message}`, { status: 500 });
    }
}

// --- Helper Functions (handleRedirect removed as logic is now inline) ---

function ensureProtocol(url, defaultProtocol) {
    if (url.startsWith("http://") || url.startsWith("https://")) {
        return url;
    }
    if (!url.includes('://')) {
        return defaultProtocol + "//" + url;
    }
    return url;
}

async function handleHtmlContent(response, actualUrlStr) {
    const originalText = await response.text();
    const targetOrigin = new URL(actualUrlStr).origin;

    const regex = /(href|src|action)=(["'])\/([^\/][^"']*?)\2/g;

    return originalText.replace(regex, (match, attr, quote, path) => {
        const proxiedUrl = `/proxy?url=${encodeURIComponent(`${targetOrigin}/${path}`)}`;
        return `${attr}=${quote}${proxiedUrl}${quote}`;
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