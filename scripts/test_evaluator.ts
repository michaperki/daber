import path from 'node:path';
import fs from 'node:fs';
import { evaluateAttempt } from '../Daber/lib/evaluator';

type LessonSeed = {
  id: string;
  items: Array<{
    id: string;
    english_prompt: string;
    target_hebrew: string;
    transliteration?: string;
    accepted_variants: string[];
    near_miss_patterns: Array<{ type: string; examples: string[] }>;
  }>;
};

function expect(ok: boolean, msg: string) {
  if (!ok) throw new Error(msg);
}

function run() {
  const file = path.join(process.cwd(), 'Daber', 'data', 'lessons', 'present_tense_basics_01.json');
  const data: LessonSeed = JSON.parse(fs.readFileSync(file, 'utf8'));
  const get = (id: string) => data.items.find(i => i.id === id)!;

  // Exact target match → correct
  {
    const item = get('ptb01_001');
    const ev = evaluateAttempt(item as any, 'אני משתפר');
    expect(ev.grade === 'correct', 'target exact should be correct');
  }

  // Accepted variant (transliteration) → correct
  {
    const item = get('ptb01_001');
    const ev = evaluateAttempt(item as any, 'ani mishtaper');
    expect(ev.grade === 'correct', 'accepted variant should be correct');
  }

  // Near miss example → flawed
  {
    const item = get('ptb01_001');
    const ev = evaluateAttempt(item as any, 'אני משתפרת');
    expect(ev.grade === 'flawed', 'near miss wrong gender should be flawed');
  }

  // Pronoun omission heuristic → flawed (e.g., "משתפר" for ptb01_003)
  {
    const item = get('ptb01_003');
    const ev = evaluateAttempt(item as any, 'משתפר');
    expect(ev.grade === 'flawed', 'pronoun omission should be flawed');
  }

  // Wrong word → incorrect
  {
    const item = get('ptb01_001');
    const ev = evaluateAttempt(item as any, 'אני לומד');
    expect(ev.grade === 'incorrect', 'wrong verb should be incorrect');
  }

  // Edit distance 1 near target → flawed
  {
    const item = get('ptb01_005');
    const ev = evaluateAttempt(item as any, 'אני כותבּ'); // add dot-like char
    expect(ev.grade === 'flawed' || ev.grade === 'correct', 'tiny noise should not be incorrect');
  }

  // Hyphen and slash noise in transliteration should normalize
  {
    const item = get('ptb01_001');
    const ev1 = evaluateAttempt(item as any, 'ani-mishtaper');
    const ev2 = evaluateAttempt(item as any, 'ani/mishtaper');
    expect(ev1.grade !== 'incorrect', 'hyphenated transliteration should not be incorrect');
    expect(ev2.grade !== 'incorrect', 'slash-separated transliteration should not be incorrect');
  }

  // All good
  // eslint-disable-next-line no-console
  console.log('Evaluator tests passed');
}

try {
  run();
  process.exit(0);
} catch (e: any) {
  // eslint-disable-next-line no-console
  console.error('Evaluator tests failed:', e?.message || e);
  process.exit(1);
}
