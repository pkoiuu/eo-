/**
 * This is the final, correct version of the proxy function.
 * It includes a critical fix for handling relative redirect Locations.
 */
export async function onRequest(context) {
    const { request } = context;

    try {
        const requestUrl = new URL(request.url);
        const searchParams = requestUrl.searchParams;
        const targetUrlParam = searchParams.get('url');

        if (!targetUrlParam) {
            return new Response("Query parameter 'url' is missing.", { status: 400 });
        }

        searchParams.delete('url');
        const remainingParams = searchParams.toString();
        let actualUrlStr = decodeURIComponent(targetUrlParam);
        if (remainingParams) {
            actualUrlStr += (actualUrlStr.includes('?') ? '&' : '?') + remainingParams;
        }

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
            // **CRITICAL FIX: Correctly handle relative and absolute redirect Locations.**
            const locationHeader = response.headers.get('location');
            if (locationHeader) {
                const absoluteLocation = new URL(locationHeader, actualUrlStr).href;
                const modifiedLocation = `/proxy?url=${encodeURIComponent(absoluteLocation)}`;
                finalHeaders.set('Location', modifiedLocation);
            }
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

async function handleHtmlContent(response, actualUrlStr) {
    const originalText = await response.text();

    const rewrite = (originalUrl) => {
        try {
            const absoluteUrl = new URL(originalUrl, actualUrlStr).href;
            return `/proxy?url=${encodeURIComponent(absoluteUrl)}`;
        } catch (e) {
            return originalUrl;
        }
    };

    return originalText.replace(/(href|src|action|data-src)=(["'])([^"']+?)\2/g, (match, attr, quote, path) => {
        if (path.startsWith('data:') || path.startsWith('#') || path.startsWith('//')) {
            return match;
        }
        return `${attr}=${quote}${rewrite(path)}${quote}`;
    });
}
