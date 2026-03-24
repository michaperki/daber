import { POST } from '../Daber/app/api/generate-drills/route';

async function main() {
  const req = new Request('http://local/api/generate-drills', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ background: false }),
  });
  const res = await POST(req as any);
  const data = await (res as Response).json();
  console.log('API response keys:', Object.keys(data));
  console.log('\nRaw LLM JSON (first 2000 chars):\n');
  console.log(String(data.raw || '').slice(0, 2000));
  console.log('\nParsed items (first 6):');
  console.log((data.items || []).slice(0, 6));
  console.log('\nPersisted item ids:', data.itemIds);
}

main().catch((e) => { console.error(e); process.exit(1); });
