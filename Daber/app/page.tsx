'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

type Level = { level: string; itemCount: number };

const LEVEL_COLORS: Record<string, string> = {
  green: 'bg-green-500 hover:bg-green-600',
  blue: 'bg-blue-500 hover:bg-blue-600',
  lime: 'bg-lime-500 hover:bg-lime-600',
  orange: 'bg-orange-500 hover:bg-orange-600',
  pink: 'bg-pink-500 hover:bg-pink-600',
  red: 'bg-red-500 hover:bg-red-600',
  yellow: 'bg-yellow-500 hover:bg-yellow-600',
  all: 'bg-gray-700 hover:bg-gray-800',
};

export default function Home() {
  const [levels, setLevels] = useState<Level[]>([]);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    fetch('/api/levels')
      .then((r) => r.json())
      .then(setLevels)
      .finally(() => setLoading(false));
  }, []);

  async function startDrill(level: string) {
    setStarting(level);
    try {
      const res = await fetch('/api/drill/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ level }),
      });
      const data = await res.json();
      if (data.sessionId) {
        router.push(`/drill/${data.sessionId}`);
      }
    } finally {
      setStarting(null);
    }
  }

  return (
    <main className="max-w-md mx-auto px-4 py-12">
      <h1 className="text-3xl font-bold text-center mb-8">Daber</h1>

      {loading ? (
        <p className="text-center text-gray-500">Loading levels...</p>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {levels.map((l) => (
            <button
              key={l.level}
              onClick={() => startDrill(l.level)}
              disabled={starting !== null}
              className={`${
                LEVEL_COLORS[l.level] || 'bg-gray-500 hover:bg-gray-600'
              } text-white rounded-lg px-4 py-4 text-left transition-colors disabled:opacity-50`}
            >
              <div className="font-semibold capitalize text-lg">{l.level}</div>
              <div className="text-sm opacity-80">{l.itemCount} items</div>
            </button>
          ))}
        </div>
      )}
    </main>
  );
}
