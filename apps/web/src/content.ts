// Thin wrapper around the built @daber/content vocab artifact.
//
// The content package emits `dist/vocab.json` via `npm -w packages/content
// run build`. If that build hasn't run yet we fall back to an empty array so
// Vite doesn't fail to start — the Vocab tab will just show an empty state.

export type VocabEntry = { he: string; en: string; pos: string };

// Vite's import.meta.glob with `eager: true` statically bundles matching
// files, but tolerates zero matches (it yields an empty record). This gives
// us a build-time optional import for the generated vocab.json.
const modules = import.meta.glob('../../../packages/content/dist/vocab.json', {
  eager: true,
  import: 'default',
}) as Record<string, VocabEntry[]>;

const first = Object.values(modules)[0];
export const vocab: VocabEntry[] = Array.isArray(first) ? first : [];

export function randomVocabEntry(): VocabEntry | null {
  if (!vocab.length) return null;
  return vocab[Math.floor(Math.random() * vocab.length)];
}
