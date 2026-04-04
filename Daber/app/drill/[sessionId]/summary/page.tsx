'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';

type Summary = {
  sessionId: string;
  totalItems: number;
  totalAttempted: number;
  correct: number;
  flawed: number;
  incorrect: number;
};

export default function SummaryPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const router = useRouter();
  const [summary, setSummary] = useState<Summary | null>(null);

  useEffect(() => {
    fetch(`/api/drill/${sessionId}/summary`)
      .then((r) => r.json())
      .then(setSummary);
  }, [sessionId]);

  if (!summary) {
    return (
      <main className="max-w-md mx-auto px-4 py-12 text-center">
        <p className="text-gray-500">Loading summary...</p>
      </main>
    );
  }

  const total = summary.correct + summary.flawed + summary.incorrect;
  const pct = total > 0 ? Math.round((summary.correct / total) * 100) : 0;

  return (
    <main className="max-w-md mx-auto px-4 py-12">
      <h1 className="text-2xl font-bold text-center mb-2">Session Complete</h1>
      <p className="text-center text-gray-500 mb-8">{total} items reviewed</p>

      <div className="text-center mb-8">
        <div className="text-5xl font-bold text-blue-600">{pct}%</div>
        <div className="text-sm text-gray-500 mt-1">accuracy</div>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-10">
        <div className="text-center bg-green-50 rounded-lg py-4">
          <div className="text-2xl font-bold text-green-600">{summary.correct}</div>
          <div className="text-xs text-green-700">Correct</div>
        </div>
        <div className="text-center bg-yellow-50 rounded-lg py-4">
          <div className="text-2xl font-bold text-yellow-600">{summary.flawed}</div>
          <div className="text-xs text-yellow-700">Close</div>
        </div>
        <div className="text-center bg-red-50 rounded-lg py-4">
          <div className="text-2xl font-bold text-red-600">{summary.incorrect}</div>
          <div className="text-xs text-red-700">Incorrect</div>
        </div>
      </div>

      <button
        onClick={() => router.push('/')}
        className="w-full bg-gray-800 hover:bg-gray-900 text-white rounded-lg py-3 text-lg font-medium transition-colors"
      >
        Drill Again
      </button>
    </main>
  );
}
