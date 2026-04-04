'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import HebrewKeyboard from '../HebrewKeyboard';

type DrillItem = {
  id: string;
  prompt: string;
  direction: 'he_to_en' | 'en_to_he';
  targetHebrew: string;
  englishPrompt: string;
  sentenceHebrew: string | null;
  sentenceEnglish: string | null;
};

type NextResponse = {
  done: boolean;
  item?: DrillItem;
  index?: number;
  total?: number;
};

type AnswerResponse = {
  grade: 'correct' | 'flawed' | 'incorrect';
  reasons: { code: string; message: string }[];
  correctAnswer: string;
};

type Phase = 'loading' | 'prompt' | 'feedback';

const GRADE_STYLES = {
  correct: 'bg-green-100 border-green-500 text-green-800',
  flawed: 'bg-yellow-100 border-yellow-500 text-yellow-800',
  incorrect: 'bg-red-100 border-red-500 text-red-800',
};

const GRADE_LABELS = {
  correct: 'Correct!',
  flawed: 'Close!',
  incorrect: 'Incorrect',
};

export default function DrillPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const router = useRouter();

  const [phase, setPhase] = useState<Phase>('loading');
  const [item, setItem] = useState<DrillItem | null>(null);
  const [index, setIndex] = useState(0);
  const [total, setTotal] = useState(0);
  const [answer, setAnswer] = useState('');
  const [feedback, setFeedback] = useState<AnswerResponse | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null!);

  const loadNext = useCallback(async () => {
    setPhase('loading');
    setAnswer('');
    setFeedback(null);

    const res = await fetch(`/api/drill/${sessionId}/next`);
    const data: NextResponse = await res.json();

    if (data.done) {
      router.push(`/drill/${sessionId}/summary`);
      return;
    }

    setItem(data.item!);
    setIndex(data.index!);
    setTotal(data.total!);
    setPhase('prompt');
  }, [sessionId, router]);

  useEffect(() => {
    loadNext();
  }, [loadNext]);

  async function submitAnswer(skip = false) {
    if (!item || submitting) return;
    if (!skip && !answer.trim()) return;
    setSubmitting(true);

    try {
      const res = await fetch(`/api/drill/${sessionId}/answer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lessonItemId: item.id,
          answer: skip ? '' : answer.trim(),
          direction: item.direction,
        }),
      });
      const data: AnswerResponse = await res.json();
      setFeedback(data);
      setPhase('feedback');
    } finally {
      setSubmitting(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      if (phase === 'prompt') {
        submitAnswer();
      } else if (phase === 'feedback') {
        loadNext();
      }
    }
  }

  if (phase === 'loading') {
    return (
      <main className="max-w-md mx-auto px-4 py-12 text-center">
        <p className="text-gray-500">Loading...</p>
      </main>
    );
  }

  const isHebrew = item?.direction === 'en_to_he';
  const progressPct = total > 0 ? Math.round(((index - 1) / total) * 100) : 0;

  return (
    <main className="max-w-md mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={() => router.push('/')}
          className="text-gray-500 hover:text-gray-700 text-sm"
        >
          Quit
        </button>
        <span className="text-sm text-gray-500">
          {index} / {total}
        </span>
      </div>

      <div className="w-full bg-gray-200 rounded-full h-2 mb-8">
        <div
          className="bg-blue-500 h-2 rounded-full transition-all"
          style={{ width: `${progressPct}%` }}
        />
      </div>

      <div className="mb-2 text-xs font-medium text-gray-400 uppercase tracking-wide">
        {item?.direction === 'he_to_en' ? 'Translate to English' : 'Translate to Hebrew'}
      </div>

      <div
        className={`text-2xl font-semibold mb-8 ${
          item?.direction === 'he_to_en' ? 'text-right' : ''
        }`}
        dir={item?.direction === 'he_to_en' ? 'rtl' : 'ltr'}
      >
        {item?.prompt}
      </div>

      <input
        ref={inputRef}
        type="text"
        value={answer}
        onChange={(e) => !isHebrew && setAnswer(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={phase === 'feedback'}
        dir={isHebrew ? 'rtl' : 'ltr'}
        placeholder={isHebrew ? 'הקלד בעברית...' : 'Type in English...'}
        autoFocus
        className={`w-full border-2 rounded-lg px-4 py-3 text-lg outline-none transition-colors ${
          phase === 'feedback'
            ? 'border-gray-200 bg-gray-50'
            : 'border-gray-300 focus:border-blue-500'
        }`}
      />

      {isHebrew && phase === 'prompt' && (
        <HebrewKeyboard value={answer} onChange={setAnswer} inputRef={inputRef} />
      )}

      {phase === 'prompt' && (
        <div className="flex gap-2 mt-4">
          <button
            onClick={() => submitAnswer(true)}
            disabled={submitting}
            className="px-4 bg-gray-200 hover:bg-gray-300 disabled:bg-gray-100 text-gray-600 rounded-lg py-3 text-sm font-medium transition-colors whitespace-nowrap"
          >
            Skip
          </button>
          <button
            onClick={submitAnswer}
            disabled={!answer.trim() || submitting}
            className="flex-1 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 text-white rounded-lg py-3 text-lg font-medium transition-colors"
          >
            {submitting ? 'Checking...' : 'Submit'}
          </button>
        </div>
      )}

      {phase === 'feedback' && feedback && (
        <div className="mt-4">
          <div
            className={`border-l-4 rounded-lg px-4 py-3 mb-4 ${GRADE_STYLES[feedback.grade]}`}
          >
            <div className="font-semibold">{GRADE_LABELS[feedback.grade]}</div>
            {feedback.grade !== 'correct' && (
              <div className="mt-1">
                <span className="text-sm opacity-70">Correct answer: </span>
                <span
                  className="font-medium"
                  dir={item?.direction === 'en_to_he' ? 'rtl' : 'ltr'}
                >
                  {feedback.correctAnswer}
                </span>
              </div>
            )}
            {feedback.reasons[0]?.message && feedback.grade !== 'correct' && (
              <div className="text-sm mt-1 opacity-70">{feedback.reasons[0].message}</div>
            )}
          </div>

          <button
            onClick={loadNext}
            autoFocus
            className="w-full bg-gray-800 hover:bg-gray-900 text-white rounded-lg py-3 text-lg font-medium transition-colors"
          >
            Next
          </button>
        </div>
      )}
    </main>
  );
}
