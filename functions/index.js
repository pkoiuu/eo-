export async function onRequest(context) {
    return new Response("Hello World from index.js!", {
        headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
}