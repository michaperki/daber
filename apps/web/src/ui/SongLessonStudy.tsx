import { useMemo, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { useLocation, useRoute } from 'preact-iso';
import { songLessons, type Example, type LyricUnlock, type TeachableUnit } from '../content';
import panels from './panels.module.css';
import study from './study.module.css';

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

function ExampleList({ examples }: { examples: Example[] }) {
  return (
    <div class={study.unitSection}>
      <div class={panels.promptLabel}>Normal usage</div>
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
          <ExampleList examples={unit.ordinary_usage} />
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

export function SongLessonStudy() {
  const { route } = useLocation();
  const { params } = useRoute();
  const song = songLessons.find((s) => s.id === params.id);
  const [index, setIndex] = useState(0);

  const unit = song?.teachable_units[index];
  const seenUnlocks = useMemo(() => song ? priorUnlocks(song.teachable_units, index) : new Set<string>(), [song, index]);

  if (!song || !unit) {
    return (
      <div class={panels.panel}>
        <div>Song lesson not found.</div>
        <button class={study.secondaryBtn} onClick={() => route('/')}>Back</button>
      </div>
    );
  }

  const newUnlocks = unit.lyric_unlocks.filter((unlock) => !seenUnlocks.has(unlock.he));
  const repeatedUnlocks = unit.lyric_unlocks.filter((unlock) => seenUnlocks.has(unlock.he));
  const isLast = index >= song.teachable_units.length - 1;

  return (
    <>
      <div class={panels.panel}>
        <div class={panels.row}>
          <div>
            <div class={panels.promptLabel}>{song.title}</div>
            <div class={panels.progress}>Unit {index + 1}/{song.teachable_units.length}</div>
          </div>
          <button class={study.secondaryBtn} style={{ marginLeft: 'auto' }} onClick={() => route(`/song/${song.id}`)}>
            Back
          </button>
        </div>
      </div>

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
              else setIndex((i) => Math.min(song.teachable_units.length - 1, i + 1));
            }}
          >
            {isLast ? 'Done' : 'Next'}
          </button>
        </div>
      </div>
    </>
  );
}
