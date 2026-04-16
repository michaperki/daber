import { useMemo, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { useLocation, useRoute } from 'preact-iso';
import { songLessons, type Example, type LyricUnlock, type TeachableUnit } from '../content';
import panels from './panels.module.css';
import study from './study.module.css';

type Mode = 'teach' | 'vocab' | 'notes';

function typeLabel(type: string) {
  return type.replace(/_/g, ' ');
}

function unitHeading(unit: TeachableUnit) {
  if (unit.unit_type === 'grammar_pattern') return unit.pattern_name;
  if (unit.unit_type === 'bound_form' || unit.unit_type === 'literary_form') return unit.surface_form;
  return unit.base_form;
}

function renderList(items: string[] | undefined) {
  if (!items?.length) return null;
  return <div class={study.inlineList}>{items.map((item) => <span key={item}>{item}</span>)}</div>;
}

function ExampleList({ examples, label = 'Normal usage' }: { examples: Example[]; label?: string }) {
  return (
    <div class={study.unitSection}>
      <div class={panels.promptLabel}>{label}</div>
      {examples.map((example) => (
        <div key={`${example.he}:${example.en}`} class={study.examplePair}>
          <div class={study.hebrewLine}>{example.he}</div>
          <div class={study.englishLine}>{example.en}</div>
        </div>
      ))}
    </div>
  );
}

function LyricList({ title, unlocks }: { title: string; unlocks: LyricUnlock[] }) {
  if (!unlocks.length) return null;
  return (
    <div class={study.unitSection}>
      <div class={panels.promptLabel}>{title}</div>
      {unlocks.map((unlock) => (
        <div key={`${unlock.he}:${unlock.en}`} class={study.examplePair}>
          <div class={study.hebrewLine}>{unlock.he}</div>
          <div class={study.englishLine}>{unlock.en}</div>
          {unlock.note && <div class={panels.progress}>{unlock.note}</div>}
        </div>
      ))}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ComponentChildren }) {
  if (!children) return null;
  return (
    <div class={study.unitSection}>
      <div class={panels.promptLabel}>{label}</div>
      <div>{children}</div>
    </div>
  );
}

function UnitDetails({ unit }: { unit: TeachableUnit }) {
  switch (unit.unit_type) {
    case 'verb':
      return (
        <>
          <Field label="Family">
            {renderList([
              unit.family.infinitive,
              ...(unit.family.present || []),
              ...(unit.family.past || []),
              ...(unit.family.noun_forms || []),
              ...(unit.family.adjective_bridge || []),
            ])}
          </Field>
          <ExampleList examples={unit.normal_usage} />
          <Field label="Flexibility">{renderList(unit.flexibility_forms)}</Field>
          <Field label="Grammar pattern">{unit.grammar_pattern}</Field>
          {unit.governance && <Field label="Governance">{unit.governance.frame_he}</Field>}
        </>
      );
    case 'noun':
      return (
        <>
          <Field label="Family">
            {renderList([
              unit.family.singular,
              unit.family.definite,
              unit.family.plural,
              ...(unit.family.directional_or_prefixed || []),
              ...(unit.family.construct || []),
              ...(unit.family.possessive || []),
            ].filter(Boolean) as string[])}
          </Field>
          <ExampleList examples={unit.normal_usage} />
          <Field label="Flexibility">{renderList(unit.flexibility_forms)}</Field>
          <Field label="Grammar pattern">{unit.grammar_pattern}</Field>
        </>
      );
    case 'adjective_participle':
      return (
        <>
          <Field label="Agreement">
            {renderList([
              unit.agreement_family.m_sg,
              unit.agreement_family.f_sg,
              unit.agreement_family.m_pl,
              unit.agreement_family.f_pl,
            ])}
          </Field>
          {unit.linked_verb && <Field label="Linked verb">{unit.linked_verb}</Field>}
          <ExampleList examples={unit.normal_usage} />
          <Field label="Flexibility">{renderList(unit.flexibility_forms)}</Field>
          <Field label="Grammar pattern">{unit.grammar_pattern}</Field>
        </>
      );
    case 'function_word':
      return (
        <>
          <Field label="Function">{unit.function}</Field>
          <ExampleList examples={unit.normal_usage} />
          <Field label="Usage pattern">{unit.usage_pattern}</Field>
          <Field label="Flexibility">{renderList(unit.flexibility_forms)}</Field>
        </>
      );
    case 'grammar_pattern':
      return (
        <>
          <Field label="Pattern">{unit.pattern}</Field>
          <ExampleList examples={unit.normal_usage} />
          <Field label="Building blocks">{renderList(unit.building_blocks)}</Field>
          <Field label="Flexible slots">{renderList(unit.flexible_slots)}</Field>
        </>
      );
    case 'bound_form':
      return (
        <>
          <Field label="Base form">{unit.base_form}</Field>
          <Field label="Formation">{unit.formation}</Field>
          <ExampleList examples={unit.normal_usage} />
          <Field label="Family">{renderList(unit.family)}</Field>
          <Field label="Flexibility">{renderList(unit.flexibility_forms)}</Field>
          <Field label="Grammar pattern">{unit.grammar_pattern}</Field>
        </>
      );
    case 'literary_form':
      return (
        <>
          <Field label="Ordinary Hebrew">{unit.ordinary_equivalent}</Field>
          <ExampleList examples={unit.ordinary_usage} label="Ordinary usage" />
          <Field label="Literary function">{unit.literary_function}</Field>
          <Field label="Recognition family">{renderList(unit.recognition_family)}</Field>
        </>
      );
    default:
      return null;
  }
}

function priorUnlocks(units: TeachableUnit[], index: number) {
  const seen = new Set<string>();
  for (let i = 0; i < index; i++) {
    for (const unlock of units[i].lyric_unlocks) seen.add(unlock.he);
  }
  return seen;
}

function vocabGloss(unit: TeachableUnit): string {
  const first = unit.lyric_unlocks[0];
  if (first?.en) return first.en;
  if ('normal_usage' in unit && unit.normal_usage[0]?.en) return unit.normal_usage[0].en;
  if (unit.unit_type === 'literary_form' && unit.ordinary_usage[0]?.en) return unit.ordinary_usage[0].en;
  return '';
}

function vocabHebrew(unit: TeachableUnit): string {
  if (unit.unit_type === 'grammar_pattern') return unit.pattern_name;
  if (unit.unit_type === 'bound_form' || unit.unit_type === 'literary_form') return unit.surface_form;
  return unit.base_form;
}

function VocabCard({ unit }: { unit: TeachableUnit }) {
  const gloss = vocabGloss(unit);
  const heb = vocabHebrew(unit);
  return (
    <div class={study.vocabCard}>
      <div class={study.vocabCardHeader}>
        <span class={study.hebrewLine} style={{ fontSize: 20 }}>{heb}</span>
        <span class={study.badge}>{typeLabel(unit.unit_type)}</span>
      </div>
      {gloss && <div class={study.englishLine}>{gloss}</div>}
      {'flexibility_forms' in unit && unit.flexibility_forms.length > 0 && (
        <div class={study.inlineList}>
          {unit.flexibility_forms.slice(0, 6).map((item) => <span key={item}>{item}</span>)}
        </div>
      )}
    </div>
  );
}

function AnnotationCard({ unit }: { unit: TeachableUnit }) {
  const unlock = unit.lyric_unlocks[0];
  let headline = '';
  let subline = '';
  if (unit.unit_type === 'bound_form') {
    headline = `${unit.surface_form} → ${unit.base_form}`;
    subline = unit.formation;
  } else if (unit.unit_type === 'literary_form') {
    headline = `${unit.surface_form} → ${unit.ordinary_equivalent}`;
    subline = unit.literary_function;
  } else if (unit.unit_type === 'grammar_pattern') {
    headline = unit.pattern_name;
    subline = unit.pattern;
  } else if ('base_form' in unit) {
    headline = unit.base_form;
  }
  return (
    <div class={study.vocabCard}>
      <div class={study.vocabCardHeader}>
        <span class={study.hebrewLine} style={{ fontSize: 20 }}>{headline}</span>
        <span class={study.badge}>{typeLabel(unit.unit_type)}</span>
      </div>
      {subline && <div class={study.englishLine}>{subline}</div>}
      {unlock && (
        <div class={study.examplePair} style={{ marginTop: 6 }}>
          <div class={study.hebrewLine}>{unlock.he}</div>
          <div class={study.englishLine}>{unlock.en}</div>
        </div>
      )}
    </div>
  );
}

export function SongLessonStudy() {
  const { route } = useLocation();
  const { params } = useRoute();
  const song = songLessons.find((s) => s.id === params.id);
  const [mode, setMode] = useState<Mode>('teach');
  const [index, setIndex] = useState(0);

  const teachingTargets = useMemo(
    () => song?.teachable_units.filter((u) => u.role === 'teaching_target') ?? [],
    [song],
  );
  const vocabulary = useMemo(
    () => song?.teachable_units.filter((u) => u.role === 'vocabulary') ?? [],
    [song],
  );
  const annotations = useMemo(
    () => song?.teachable_units.filter((u) => u.role === 'annotation') ?? [],
    [song],
  );

  const unit = teachingTargets[index];
  const seenUnlocks = useMemo(
    () => priorUnlocks(teachingTargets, index),
    [teachingTargets, index],
  );

  if (!song) {
    return (
      <div class={panels.panel}>
        <div>Song lesson not found.</div>
        <button class={study.secondaryBtn} onClick={() => route('/')}>Back</button>
      </div>
    );
  }

  const header = (
    <div class={panels.panel}>
      <div class={panels.row}>
        <div>
          <div class={panels.promptLabel}>{song.title}</div>
          {mode === 'teach' && unit && (
            <div class={panels.progress}>Target {index + 1}/{teachingTargets.length}</div>
          )}
          {mode === 'vocab' && (
            <div class={panels.progress}>{vocabulary.length} vocabulary items</div>
          )}
          {mode === 'notes' && (
            <div class={panels.progress}>{annotations.length} lyric annotations</div>
          )}
        </div>
        <button class={study.secondaryBtn} style={{ marginLeft: 'auto' }} onClick={() => route(`/song/${song.id}`)}>
          Back
        </button>
      </div>
      <div class={study.badgeRow} style={{ marginTop: 8 }}>
        <button
          class={`${study.secondaryBtn} ${mode === 'teach' ? study.modeActive : ''}`}
          onClick={() => setMode('teach')}
        >
          Teach ({teachingTargets.length})
        </button>
        <button
          class={`${study.secondaryBtn} ${mode === 'vocab' ? study.modeActive : ''}`}
          onClick={() => setMode('vocab')}
        >
          Vocab ({vocabulary.length})
        </button>
        <button
          class={`${study.secondaryBtn} ${mode === 'notes' ? study.modeActive : ''}`}
          onClick={() => setMode('notes')}
        >
          Notes ({annotations.length})
        </button>
      </div>
    </div>
  );

  if (mode === 'vocab') {
    return (
      <>
        {header}
        <div class={panels.panel}>
          <div class={study.vocabGrid}>
            {vocabulary.map((u) => <VocabCard key={u.id} unit={u} />)}
          </div>
          {vocabulary.length === 0 && <div class={panels.progress}>No vocabulary items authored.</div>}
        </div>
      </>
    );
  }

  if (mode === 'notes') {
    return (
      <>
        {header}
        <div class={panels.panel}>
          <div class={panels.progress} style={{ marginBottom: 8 }}>
            Literary, bound, and advanced-pattern forms to recognize when you see the lyric.
          </div>
          <div class={study.vocabGrid}>
            {annotations.map((u) => <AnnotationCard key={u.id} unit={u} />)}
          </div>
          {annotations.length === 0 && <div class={panels.progress}>No annotations authored.</div>}
        </div>
      </>
    );
  }

  // teach mode
  if (!unit) {
    return (
      <>
        {header}
        <div class={panels.panel}>
          <div class={panels.progress}>No teaching targets authored for this song.</div>
        </div>
      </>
    );
  }

  const newUnlocks = unit.lyric_unlocks.filter((unlock) => !seenUnlocks.has(unlock.he));
  const repeatedUnlocks = unit.lyric_unlocks.filter((unlock) => seenUnlocks.has(unlock.he));
  const isLast = index >= teachingTargets.length - 1;

  return (
    <>
      {header}
      <div class={panels.panel}>
        <div class={study.unitTopline}>
          <span class={study.badge}>{typeLabel(unit.unit_type)}</span>
          <span class={study.badge}>{unit.priority}</span>
        </div>
        <div class={study.unitTitle}>{unitHeading(unit)}</div>
        {unit.prerequisites?.length ? (
          <div class={panels.progress}>Prerequisites: {unit.prerequisites.join(', ')}</div>
        ) : null}

        <UnitDetails unit={unit} />

        <LyricList title="Lyric unlock" unlocks={newUnlocks} />
        <LyricList title="Reinforces earlier lyric" unlocks={repeatedUnlocks} />
      </div>

      <div class={panels.panel}>
        <div class={panels.row}>
          <button
            class={study.secondaryBtn}
            disabled={index === 0}
            onClick={() => setIndex((i) => Math.max(0, i - 1))}
          >
            Previous
          </button>
          <button
            class={study.secondaryBtn}
            style={{ marginLeft: 'auto' }}
            onClick={() => {
              if (isLast) route(`/song/${song.id}`);
              else setIndex((i) => Math.min(teachingTargets.length - 1, i + 1));
            }}
          >
            {isLast ? 'Done' : 'Next'}
          </button>
        </div>
      </div>
    </>
  );
}
