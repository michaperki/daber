#!/usr/bin/env node
/**
 * Song lesson content-review harness.
 *
 * This is intentionally separate from sim_drill.js. The drill simulator models
 * stochastic prompt selection and progress; this script reviews deterministic
 * teachable-unit ordering and payoff shape for the song lesson flow.
 */

const fs = require('fs');
const path = require('path');

function usage() {
  console.log(`
Song lesson review harness

Required artifact:
  packages/content/dist/song_lessons.json

If missing, run: npm -w packages/content run build

Usage:
  npm run song:review -- --list
  npm run song:review -- --song hofim --summary
  npm run song:review -- --song hofim --items
  npm run song:review -- --song hofim --markdown
  npm run song:review -- --song hofim --json

Args:
  --list             Print available song lessons and exit.
  --song <id>        Song lesson id to review.
  --format <name>    summary | items | markdown | json. Default: summary.
  --summary          Alias for --format summary.
  --items            Alias for --format items.
  --markdown         Alias for --format markdown.
  --json             Alias for --format json.
  --no-checks        Omit checks from human-readable output.
  --help, -h         Print this help.
`);
}

function parseArgs(argv) {
  const out = {
    list: false,
    song: null,
    format: 'summary',
    showChecks: true,
  };

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--list') {
      out.list = true;
    } else if (arg.startsWith('--song=')) {
      out.song = arg.slice('--song='.length);
    } else if (arg === '--song') {
      out.song = readArgValue(argv, ++i, '--song');
    } else if (arg.startsWith('--format=')) {
      out.format = arg.slice('--format='.length).toLowerCase();
    } else if (arg === '--format') {
      out.format = readArgValue(argv, ++i, '--format').toLowerCase();
    } else if (arg === '--summary') {
      out.format = 'summary';
    } else if (arg === '--items') {
      out.format = 'items';
    } else if (arg === '--markdown') {
      out.format = 'markdown';
    } else if (arg === '--json') {
      out.format = 'json';
    } else if (arg === '--no-checks') {
      out.showChecks = false;
    } else if (arg === '--help' || arg === '-h') {
      usage();
      process.exit(0);
    } else {
      console.error(`Unknown arg: ${arg}`);
      usage();
      process.exit(1);
    }
  }

  if (!['summary', 'items', 'markdown', 'json'].includes(out.format)) {
    console.error(`Unknown format: ${out.format}`);
    usage();
    process.exit(1);
  }

  return out;
}

function readArgValue(argv, index, flag) {
  const value = argv[index];
  if (!value || value.startsWith('--')) {
    console.error(`Missing value for ${flag}`);
    usage();
    process.exit(1);
  }
  return String(value);
}

function readJSON(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

function loadSongLessons() {
  const filePath = path.join(process.cwd(), 'packages', 'content', 'dist', 'song_lessons.json');
  const lessons = readJSON(filePath);
  if (!Array.isArray(lessons)) {
    console.error('Missing packages/content/dist/song_lessons.json. Run: npm -w packages/content run build');
    process.exit(2);
  }
  return lessons;
}

function countBy(items, getKey) {
  const counts = {};
  for (const item of items) {
    const key = getKey(item) || 'unknown';
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

function normalizeText(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function unlockKey(unlock) {
  return normalizeText(unlock && unlock.he);
}

function reviewLesson(lesson) {
  const units = Array.isArray(lesson.teachable_units) ? lesson.teachable_units : [];
  const idCounts = countBy(units, (unit) => unit.id);
  const duplicateIds = Object.entries(idCounts)
    .filter(([, count]) => count > 1)
    .map(([id, count]) => ({ id, count }));

  const indexById = new Map();
  units.forEach((unit, index) => {
    if (!indexById.has(unit.id)) indexById.set(unit.id, index);
  });

  const unknownPrerequisites = [];
  const forwardPrerequisites = [];
  units.forEach((unit, index) => {
    for (const prereq of unit.prerequisites || []) {
      if (!indexById.has(prereq)) {
        unknownPrerequisites.push({ unit: unit.id, prerequisite: prereq });
        continue;
      }
      const prereqIndex = indexById.get(prereq);
      if (prereqIndex >= index) {
        forwardPrerequisites.push({
          unit: unit.id,
          unitIndex: index,
          prerequisite: prereq,
          prerequisiteIndex: prereqIndex,
        });
      }
    }
  });

  const firstUnlockByKey = new Map();
  const repeatedUnlocks = [];
  const repeatedOnlyUnits = [];
  units.forEach((unit, index) => {
    const unlocks = unit.lyric_unlocks || [];
    let repeatedCount = 0;
    for (const unlock of unlocks) {
      const key = unlockKey(unlock);
      if (!key) continue;
      const first = firstUnlockByKey.get(key);
      if (first) {
        repeatedCount += 1;
        repeatedUnlocks.push({
          lyric: key,
          firstUnit: first.unit,
          firstIndex: first.index,
          repeatedUnit: unit.id,
          repeatedIndex: index,
        });
      } else {
        firstUnlockByKey.set(key, { unit: unit.id, index });
      }
    }
    if (unlocks.length > 0 && repeatedCount === unlocks.length) {
      repeatedOnlyUnits.push({ unit: unit.id, index, count: repeatedCount });
    }
  });

  return {
    counts: {
      units: units.length,
      unitTypes: countBy(units, (unit) => unit.unit_type),
      priorities: countBy(units, (unit) => unit.priority),
      roles: countBy(units, (unit) => unit.role || 'teaching_target'),
    },
    hardFailures: {
      duplicateIds,
      unknownPrerequisites,
      forwardPrerequisites,
    },
    reviewNotes: {
      repeatedUnlocks,
      repeatedOnlyUnits,
    },
  };
}

function hasHardFailures(review) {
  return Object.values(review.hardFailures).some((items) => items.length > 0);
}

function formatCounts(counts) {
  return Object.entries(counts)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, count]) => `${key}: ${count}`)
    .join(', ');
}

function firstExample(examples) {
  return Array.isArray(examples) && examples.length > 0 ? examples[0] : null;
}

function formatExample(example) {
  if (!example) return 'none';
  return `${example.he} - ${example.en}`;
}

function listValue(value) {
  if (!value) return '';
  if (Array.isArray(value)) return value.join(' / ');
  if (typeof value === 'object') {
    return Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .map(([key, item]) => `${key}: ${Array.isArray(item) ? item.join(' / ') : item}`)
      .join('; ');
  }
  return String(value);
}

function unitTitle(unit) {
  switch (unit.unit_type) {
    case 'grammar_pattern':
      return unit.pattern_name;
    case 'bound_form':
      return `${unit.surface_form} -> ${unit.base_form}`;
    case 'literary_form':
      return `${unit.surface_form} -> ${unit.ordinary_equivalent}`;
    case 'adjective_participle':
      return unit.linked_verb ? `${unit.base_form} -> ${unit.linked_verb}` : unit.base_form;
    default:
      return unit.base_form || unit.id;
  }
}

function unitDetails(unit) {
  switch (unit.unit_type) {
    case 'verb':
      return [
        ['Family', listValue(unit.family)],
        ['Normal', formatExample(firstExample(unit.normal_usage))],
        ['Flex', listValue(unit.flexibility_forms)],
        ['Pattern', unit.grammar_pattern],
        ['Governance', unit.governance ? `${unit.governance.marker}: ${unit.governance.frame_he}` : ''],
      ];
    case 'noun':
      return [
        ['Family', listValue(unit.family)],
        ['Normal', formatExample(firstExample(unit.normal_usage))],
        ['Flex', listValue(unit.flexibility_forms)],
        ['Pattern', unit.grammar_pattern],
        ['Gender', unit.gender || ''],
      ];
    case 'adjective_participle':
      return [
        ['Agreement', listValue(unit.agreement_family)],
        ['Normal', formatExample(firstExample(unit.normal_usage))],
        ['Flex', listValue(unit.flexibility_forms)],
        ['Pattern', unit.grammar_pattern],
      ];
    case 'function_word':
      return [
        ['Function', unit.function],
        ['Usage', unit.usage_pattern],
        ['Normal', formatExample(firstExample(unit.normal_usage))],
        ['Flex', listValue(unit.flexibility_forms)],
      ];
    case 'grammar_pattern':
      return [
        ['Pattern', unit.pattern],
        ['Blocks', listValue(unit.building_blocks)],
        ['Normal', formatExample(firstExample(unit.normal_usage))],
        ['Slots', listValue(unit.flexible_slots)],
      ];
    case 'bound_form':
      return [
        ['Formation', unit.formation],
        ['Family', listValue(unit.family)],
        ['Normal', formatExample(firstExample(unit.normal_usage))],
        ['Flex', listValue(unit.flexibility_forms)],
        ['Pattern', unit.grammar_pattern],
      ];
    case 'literary_form':
      return [
        ['Function', unit.literary_function],
        ['Recognition', listValue(unit.recognition_family)],
        ['Ordinary', formatExample(firstExample(unit.ordinary_usage))],
      ];
    default:
      return [];
  }
}

function buildUnlockMarkers(lesson) {
  const firstUnlockByKey = new Map();
  const markers = new Map();
  lesson.teachable_units.forEach((unit, index) => {
    for (const unlock of unit.lyric_unlocks || []) {
      const key = unlockKey(unlock);
      if (!key) continue;
      const first = firstUnlockByKey.get(key);
      if (first) {
        markers.set(`${unit.id}\u0000${key}`, `reinforces #${first.index + 1} ${first.unit}`);
      } else {
        firstUnlockByKey.set(key, { unit: unit.id, index });
      }
    }
  });
  return markers;
}

function printList(lessons) {
  for (const lesson of lessons) {
    const count = Array.isArray(lesson.teachable_units) ? lesson.teachable_units.length : 0;
    console.log(`${lesson.id}\t${lesson.title}\t${lesson.status || 'unknown'}\t${count} units`);
  }
}

function printChecks(review) {
  const hard = review.hardFailures;
  console.log('Checks:');
  printCheckLine('duplicate unit ids', hard.duplicateIds);
  printCheckLine('unknown prerequisites', hard.unknownPrerequisites);
  printCheckLine('forward prerequisites', hard.forwardPrerequisites);

  const notes = review.reviewNotes;
  console.log(`  NOTE repeated lyric unlocks: ${notes.repeatedUnlocks.length}`);
  console.log(`  NOTE repeated-only payoff units: ${notes.repeatedOnlyUnits.length}`);

  if (notes.repeatedOnlyUnits.length > 0) {
    const units = notes.repeatedOnlyUnits
      .map((item) => `#${item.index + 1} ${item.unit}`)
      .join(', ');
    console.log(`       ${units}`);
  }
}

function printCheckLine(label, items) {
  if (items.length === 0) {
    console.log(`  PASS ${label}`);
  } else {
    console.log(`  FAIL ${label}: ${items.length}`);
  }
}

function printSummary(lesson, review, showChecks) {
  console.log(`Song: ${lesson.title} (${lesson.id})`);
  console.log(`Status: ${lesson.status || 'unknown'}`);
  console.log(`Units: ${review.counts.units}`);
  console.log(`Roles: ${formatCounts(review.counts.roles)}`);
  console.log(`Unit types: ${formatCounts(review.counts.unitTypes)}`);
  console.log(`Priorities: ${formatCounts(review.counts.priorities)}`);
  if (showChecks) {
    console.log('');
    printChecks(review);
  }
}

function printItems(lesson, review, showChecks) {
  printSummary(lesson, review, showChecks);
  console.log('');

  const unlockMarkers = buildUnlockMarkers(lesson);
  lesson.teachable_units.forEach((unit, index) => {
    console.log(`[${String(index + 1).padStart(2, '0')}] ${unit.id} | ${unit.unit_type} | ${unit.priority} | role: ${unit.role || 'teaching_target'}`);
    console.log(`Title: ${unitTitle(unit)}`);
    console.log(`Prereqs: ${(unit.prerequisites || []).join(', ') || 'none'}`);
    for (const [label, value] of unitDetails(unit)) {
      if (value) console.log(`${label}: ${value}`);
    }
    console.log('Unlocks:');
    for (const unlock of unit.lyric_unlocks || []) {
      const marker = unlockMarkers.get(`${unit.id}\u0000${unlockKey(unlock)}`);
      const suffix = marker ? ` (${marker})` : '';
      console.log(`  - ${unlock.he} - ${unlock.en}${suffix}`);
    }
    console.log('');
  });
}

function printMarkdown(lesson, review, showChecks) {
  console.log(`# ${lesson.title} Song Flow Review`);
  console.log('');
  console.log(`- Song id: \`${lesson.id}\``);
  console.log(`- Status: \`${lesson.status || 'unknown'}\``);
  console.log(`- Units: ${review.counts.units}`);
  console.log(`- Roles: ${formatCounts(review.counts.roles)}`);
  console.log(`- Unit types: ${formatCounts(review.counts.unitTypes)}`);
  console.log(`- Priorities: ${formatCounts(review.counts.priorities)}`);

  if (showChecks) {
    console.log('');
    console.log('## Checks');
    console.log('');
    for (const [label, items] of [
      ['duplicate unit ids', review.hardFailures.duplicateIds],
      ['unknown prerequisites', review.hardFailures.unknownPrerequisites],
      ['forward prerequisites', review.hardFailures.forwardPrerequisites],
    ]) {
      console.log(`- ${items.length === 0 ? 'PASS' : 'FAIL'} ${label}${items.length === 0 ? '' : `: ${items.length}`}`);
    }
    console.log(`- NOTE repeated lyric unlocks: ${review.reviewNotes.repeatedUnlocks.length}`);
    console.log(`- NOTE repeated-only payoff units: ${review.reviewNotes.repeatedOnlyUnits.length}`);
  }

  const unlockMarkers = buildUnlockMarkers(lesson);
  console.log('');
  console.log('## Units');
  lesson.teachable_units.forEach((unit, index) => {
    console.log('');
    console.log(`### ${index + 1}. ${unit.id}`);
    console.log('');
    console.log(`- Type: \`${unit.unit_type}\``);
    console.log(`- Priority: \`${unit.priority}\``);
    console.log(`- Role: \`${unit.role || 'teaching_target'}\``);
    console.log(`- Title: ${unitTitle(unit)}`);
    console.log(`- Prereqs: ${(unit.prerequisites || []).map((id) => `\`${id}\``).join(', ') || 'none'}`);
    for (const [label, value] of unitDetails(unit)) {
      if (value) console.log(`- ${label}: ${value}`);
    }
    console.log('- Unlocks:');
    for (const unlock of unit.lyric_unlocks || []) {
      const marker = unlockMarkers.get(`${unit.id}\u0000${unlockKey(unlock)}`);
      const suffix = marker ? ` (${marker})` : '';
      console.log(`  - ${unlock.he} - ${unlock.en}${suffix}`);
    }
  });
}

function main() {
  const args = parseArgs(process.argv);
  const lessons = loadSongLessons();

  if (args.list) {
    printList(lessons);
    return;
  }

  const lesson = args.song
    ? lessons.find((item) => item.id === args.song)
    : lessons.length === 1
      ? lessons[0]
      : null;

  if (!lesson) {
    if (args.song) {
      console.error(`Unknown song lesson id: ${args.song}`);
    } else {
      console.error('Multiple song lessons are available. Choose one with --song <id>.');
    }
    printList(lessons);
    process.exit(1);
  }

  const review = reviewLesson(lesson);
  if (args.format === 'json') {
    console.log(JSON.stringify({ lesson, review }, null, 2));
  } else if (args.format === 'items') {
    printItems(lesson, review, args.showChecks);
  } else if (args.format === 'markdown') {
    printMarkdown(lesson, review, args.showChecks);
  } else {
    printSummary(lesson, review, args.showChecks);
  }

  if (hasHardFailures(review)) process.exit(1);
}

main();
