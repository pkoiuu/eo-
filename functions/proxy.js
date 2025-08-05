export async function onRequest(context) {
    const { request } = context;

    try {
        const requestUrl = new URL(request.url);
        const targetUrlParam = requestUrl.searchParams.get('url');

        if (!targetUrlParam) {
            return new Response("Query parameter 'url' is missing.", { status: 400 });
        }

        let actualUrlStr = decodeURIComponent(targetUrlParam);

        const newHeaders = new Headers();
        for (const [key, value] of request.headers.entries()) {
            if (!key.toLowerCase().startsWith('cf-') && !key.toLowerCase().startsWith('x-forwarded-') && key.toLowerCase() !== 'host') {
                newHeaders.append(key, value);
            }
        }

        const modifiedRequest = new Request(actualUrlStr, {
            headers: newHeaders,
            method: request.method,
            body: request.body,
            redirect: 'manual'
        });

        const response = await fetch(modifiedRequest);

        const finalHeaders = new Headers();
        for (const [key, value] of response.headers.entries()) {
            if (key.toLowerCase() !== 'set-cookie') {
                finalHeaders.append(key, value);
            }
        }

        if ([301, 302, 303, 307, 308].includes(response.status)) {
            const location = new URL(response.headers.get('location'));
            const modifiedLocation = `/proxy?url=${encodeURIComponent(location.toString())}`;
            finalHeaders.set('Location', modifiedLocation);
            // For redirects, the body is often empty, so we can return it directly.
            return new Response(response.body, { status: response.status, headers: finalHeaders });
        }

        // **CRITICAL FIX: Buffer the response body instead of streaming it.**
        const body = await response.text();

        return new Response(body, { status: response.status, headers: finalHeaders });

    } catch (error) {
        return new Response(`Proxy Error: ${error.message}`, { status: 500 });
    }
}