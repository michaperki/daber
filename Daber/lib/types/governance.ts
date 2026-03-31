export type HebPrep = 'et' | 'b' | 'l' | 'al' | 'im' | 'min' | 'el' | 'none';

export type VerbGovernanceFrame = {
  prep: HebPrep;
  role?: 'do' | 'io' | 'comp';
  sense_en?: string;
  frame_he?: string;
  example_he?: string;
};

export type VerbGovernance = {
  transitivity: 'transitive' | 'intransitive' | 'both';
  frames: VerbGovernanceFrame[];
  notes?: string;
};

// Display map for parenthetical markers in Hebrew UI
export const PREP_DISPLAY_MAP: Record<Exclude<HebPrep, 'none'>, string> = {
  et: 'את',
  b: 'בּ',
  l: 'ל',
  al: 'על',
  im: 'עם',
  min: 'מ',
  el: 'אל',
};

