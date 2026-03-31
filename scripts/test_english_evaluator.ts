import { evaluateEnglishAnswer } from '../Daber/lib/evaluator/englishEvaluator';

function expect(ok: boolean, msg: string) {
  if (!ok) throw new Error(msg);
}

function test(label: string, fn: () => void) {
  try { fn(); console.log(`ok - ${label}`); } catch (e: any) { console.error(`FAIL - ${label}:`, e?.message || e); process.exitCode = 1; }
}

// Present progressive vs simple present equivalence
test('he is writing ≈ he writes', () => {
  const ev = evaluateEnglishAnswer('he writes', 'How do I say: he is writing?');
  expect(ev.grade === 'correct', `expected correct, got ${ev.grade}`);
});

test('I am writing ≈ I write', () => {
  const ev = evaluateEnglishAnswer('I write', 'I am writing');
  expect(ev.grade === 'correct', `expected correct, got ${ev.grade}`);
});

test('she is reading ≈ she reads', () => {
  const ev = evaluateEnglishAnswer('she reads', 'she is reading');
  expect(ev.grade === 'correct', `expected correct, got ${ev.grade}`);
});

test('we are speaking ≈ we speak', () => {
  const ev = evaluateEnglishAnswer('we speak', 'we are speaking');
  expect(ev.grade === 'correct', `expected correct, got ${ev.grade}`);
});

test('they are hearing ≈ they hear', () => {
  const ev = evaluateEnglishAnswer('they hear', 'they are hearing');
  expect(ev.grade === 'correct', `expected correct, got ${ev.grade}`);
});

// Negative: past vs present should not be accepted as exact
test('he wrote ≠ he is writing', () => {
  const ev = evaluateEnglishAnswer('he wrote', 'he is writing');
  expect(ev.grade !== 'correct', `expected not correct, got ${ev.grade}`);
});

if (!process.exitCode) {
  console.log('English evaluator tests passed');
}

