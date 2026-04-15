/// <reference types="vite/client" />

// CSS Modules: importing a *.module.css file yields a classname map.
declare module '*.module.css' {
  const classes: { readonly [key: string]: string };
  export default classes;
}

// Ambient typing for the raw vocab.json artifact (generated at content build).
declare module '*/packages/content/dist/vocab.json' {
  const value: { he: string; en: string; pos: string; variant?: string; lemma?: string }[];
  export default value;
}

// Ambient typing for curriculum.json (generated at content build).
declare module '*/packages/content/dist/lessons.json' {
  const value: { id: string; title: string; tagline?: string; estimated_minutes?: number; endpoint?: { description?: string }; core?: { verbs?: Record<string, string[]>; adjectives?: Record<string, string[]>; nouns?: Record<string, string[]> }; supporting?: { verbs?: Record<string, string[]>; adjectives?: Record<string, string[]>; nouns?: Record<string, string[]> }; phases?: { id: string; title?: string; goal?: string }[]; wishlist?: string[] }[];
  export default value;
}

declare module '*/packages/content/dist/song_lessons.json' {
  const value: unknown[];
  export default value;
}

// Screen Wake Lock API
interface WakeLockSentinel extends EventTarget {
  readonly released: boolean;
  readonly type: 'screen';
  release(): Promise<void>;
}

interface Navigator {
  wakeLock?: {
    request(type: 'screen'): Promise<WakeLockSentinel>;
  };
  vibrate?(pattern: number | number[]): boolean;
}
