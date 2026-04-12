// Re-export the built vocab artifact at runtime.
// Consumers should import this module after running the build.

// eslint-disable-next-line @typescript-eslint/no-var-requires
export const vocab: { he: string; en: string; pos: string }[] = (() => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('../dist/vocab.json');
  } catch {
    return [];
  }
})();

