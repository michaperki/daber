import React from 'react';
import fs from 'node:fs';
import path from 'node:path';
import StartOrContinueButton from '@/app/StartOrContinueButton';
import { prisma } from '@/lib/db';
type Card = { en: string; he: string; hint?: string };

function parseVocab(md: string): Card[] {
  const lines = md.split(/\r?\n/).map(s => s.trim());
  const base: Card[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i] === '=' || lines[i] === '＝') {
      let en = '';
      for (let j = i - 1; j >= 0; j--) {
        if (!lines[j]) continue;
        en = lines[j];
        break;
      }
      let he = '';
      for (let k = i + 1; k < lines.length; k++) {
        if (!lines[k]) continue;
        he = lines[k];
        break;
      }
      if (en && he && /[\u0590-\u05FF]/.test(he)) {
        base.push({ en, he });
      }
    }
  }
  const deduped = Array.from(new Map(base.map(c => [c.en + '|' + c.he, c])).values());
  return splitMultiFormCards(deduped);
}

function splitMultiFormCards(cards: Card[]): Card[] {
  const out: Card[] = [];
  for (const c of cards) {
    if (c.he.includes(',')) {
      const forms = c.he.split(',').map(s => s.trim()).filter(Boolean);
      if (forms.length === 4) {
        out.push({ en: c.en, he: forms[0], hint: '👨 m·sg' });
        out.push({ en: c.en, he: forms[1], hint: '👩 f·sg' });
        out.push({ en: c.en, he: forms[2], hint: '👨👩 m·pl' });
        out.push({ en: c.en, he: forms[3], hint: '👩👩 f·pl' });
        continue;
      }
      if (forms.length === 2) {
        out.push({ en: c.en, he: forms[0], hint: '👨 m·sg' });
        out.push({ en: c.en, he: forms[1], hint: '👩 f·sg' });
        continue;
      }
      for (const f of forms) out.push({ en: c.en, he: f });
      continue;
    }
    out.push(c);
  }
  return out;
}

export default async function VocabPage() {
  let cards: Card[] = [];
  try {
    const file = path.join(process.cwd(), '..', 'Mike_Hebrew_Vocab.md');
    const raw = fs.readFileSync(file, 'utf8');
    cards = parseVocab(raw);
  } catch {}
  const vocabLesson = await prisma.lesson.findUnique({ where: { id: 'user_vocab_01' }, select: { id: true } });
  return (
    <div className="drill-root">
      <div className="prompt-card" style={{ marginBottom: 12 }}>
        <div className="prompt-eyebrow">vocab</div>
        <div className="prompt-text">Flashcards from Mike_Hebrew_Vocab.md</div>
        {vocabLesson?.id ? (
          <div className="cta-row" style={{ marginTop: 8 }}>
            <StartOrContinueButton sessionId={null} lessonId={vocabLesson.id} label="start dynamic drill" />
          </div>
        ) : null}
      </div>
      <VocabClient cards={cards} />
    </div>
  );
}

// Client component lives in separate file
import VocabClient from './VocabClient';
