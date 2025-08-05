export async function onRequest(context) {
    return new Response("Proxy endpoint is alive!", {
        headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
}