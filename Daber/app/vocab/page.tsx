import React from 'react';
import StartOrContinueButton from '@/app/StartOrContinueButton';
import { prisma } from '@/lib/db';

type Card = { en: string; he: string; hint?: string };

export default async function VocabPage() {
  const cards: Card[] = [];
  const vocabLesson = await prisma.lesson.findUnique({ where: { id: 'user_vocab_01' }, select: { id: true } });
  return (
    <div className="drill-root">
      <div className="prompt-card" style={{ marginBottom: 12 }}>
        <div className="prompt-eyebrow">vocab</div>
        <div className="prompt-text">Flashcards from your imported vocab</div>
        {vocabLesson?.id ? (
          <div className="cta-row" style={{ marginTop: 8 }}>
            <StartOrContinueButton sessionId={null} lessonId={vocabLesson.id} label="start dynamic drill" />
          </div>
        ) : (
          <div style={{ marginTop: 8, fontSize: 13, color: 'var(--color-text-secondary)' }}>
            No vocab imported yet. Seed locally or use the import script.
          </div>
        )}
      </div>
      <VocabClient cards={cards} />
    </div>
  );
}

// Client component lives in separate file
import VocabClient from './VocabClient';
