/**
 * This is a special diagnostic version of the proxy function.
 * It includes a debug mode to inspect redirect locations.
 */
export async function onRequest(context) {
    const { request } = context;

    try {
        const requestUrl = new URL(request.url);
        const searchParams = requestUrl.searchParams;
        const targetUrlParam = searchParams.get('url');
        const isDebugMode = searchParams.get('debug') === 'true';

        if (!targetUrlParam) {
            return new Response("Query parameter 'url' is missing.", { status: 400 });
        }

        searchParams.delete('url');
        searchParams.delete('debug'); // Remove debug param for the target request
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

        if ([301, 302, 303, 307, 308].includes(response.status)) {
            const locationHeader = response.headers.get('location');

            // **DEBUG MODE LOGIC**
            if (isDebugMode) {
                const debugInfo = `--- DEBUG MODE ---\n\n` +
                                  `The proxy received a redirect response.\n\n` +
                                  `Status Code: ${response.status}\n` +
                                  `Location Header: ${locationHeader || 'Not Found'}`;
                return new Response(debugInfo, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
            }

            const finalHeaders = new Headers(response.headers);
            if (locationHeader) {
                const absoluteLocation = new URL(locationHeader, actualUrlStr).href;
                const modifiedLocation = `/proxy?url=${encodeURIComponent(absoluteLocation)}`;
                finalHeaders.set('Location', modifiedLocation);
            }
            return new Response(null, { status: response.status, headers: finalHeaders });
        }

        // For non-redirect responses, we just return the body for now.
        const body = await response.text();
        const finalHeaders = new Headers(response.headers);
        finalHeaders.delete('Set-Cookie');
        finalHeaders.delete('Content-Security-Policy');

        return new Response(body, { status: response.status, statusText: response.statusText, headers: finalHeaders });

    } catch (error) {
        return new Response(`Proxy Error: ${error.message}`, { status: 500 });
    }
}