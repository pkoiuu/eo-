export async function onRequest(context) {
    try {
        // This function now ignores user input and tries to fetch a known public endpoint.
        const response = await fetch('https://httpbin.org/get');
        
        // Check if the fetch itself was successful
        if (!response.ok) {
            return new Response(`Fetch to httpbin.org failed with status: ${response.status}`, { status: 500 });
        }

        const data = await response.text();

        const headers = new Headers({
            'Content-Type': 'application/json; charset=utf-8',
            'X-Diagnostics-Message': 'Fetch to httpbin.org was successful!'
        });

        return new Response(data, { headers: headers });

    } catch (error) {
        // If the fetch promise itself is rejected, it will be caught here.
        return new Response(`A critical error occurred: ${error.message}`, { status: 500 });
    }
}