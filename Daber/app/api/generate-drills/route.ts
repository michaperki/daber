// Fresh sentences API removed. Background generation via OpenAI pipeline remains available elsewhere.
export async function POST() {
  return new Response(JSON.stringify({ error: 'Not Found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
}
