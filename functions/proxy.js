/**
 * This is the final, correct version of the proxy function.
 * It uses a clean, whitelisted approach for headers to ensure compatibility.
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

        // **CRITICAL FIX: Create a new, clean Headers object.**
        // We will only forward a few safe headers from the original request.
        const newHeaders = new Headers();
        newHeaders.set('User-Agent', request.headers.get('User-Agent') || 'EdgeOne-Proxy');
        newHeaders.set('Accept', request.headers.get('Accept') || '*/*');
        newHeaders.set('Accept-Language', request.headers.get('Accept-Language') || 'en-US,en;q=0.9');

        const modifiedRequest = new Request(actualUrlStr, {
            headers: newHeaders,
            method: request.method,
            body: (request.method === 'POST' || request.method === 'PUT') ? request.body : null,
            redirect: 'manual'
        });

        const response = await fetch(modifiedRequest);

        const finalHeaders = new Headers();
        for (const [key, value] of response.headers.entries()) {
            if (key.toLowerCase() !== 'set-cookie' && key.toLowerCase() !== 'content-security-policy') {
                finalHeaders.append(key, value);
            }
        }

        if ([301, 302, 303, 307, 308].includes(response.status)) {
            const location = new URL(response.headers.get('location'));
            const modifiedLocation = `/proxy?url=${encodeURIComponent(location.toString())}`;
            finalHeaders.set('Location', modifiedLocation);
            return new Response(null, { status: response.status, headers: finalHeaders });
        }

        let body = response.body;
        if (response.headers.get("Content-Type")?.includes("text/html")) {
            body = await handleHtmlContent(response, actualUrlStr);
        }

        return new Response(body, { status: response.status, statusText: response.statusText, headers: finalHeaders });

    } catch (error) {
        return new Response(`Proxy Error: ${error.message}`, { status: 500 });
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

async function handleHtmlContent(response, actualUrlStr) {
    const originalText = await response.text();
    const targetOrigin = new URL(actualUrlStr).origin;

    const rewrite = (originalUrl) => {
        try {
            const absoluteUrl = new URL(originalUrl, actualUrlStr).href;
            return `/proxy?url=${encodeURIComponent(absoluteUrl)}`;
        } catch (e) {
            return originalUrl; // If it's a malformed URL, leave it as is.
        }
    };

    // A more robust regex to handle various URL formats
    return originalText.replace(/(href|src|action|data-src)=(["'])([^"']+?)\2/g, (match, attr, quote, path) => {
        if (path.startsWith('data:') || path.startsWith('#')) {
            return match; // Don't rewrite data URIs or anchor links
        }
        return `${attr}=${quote}${rewrite(path)}${quote}`;
    });
}