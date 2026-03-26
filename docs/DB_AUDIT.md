# Daber DB audit (LessonItems linkage + surface characteristics)

Generated: 2026-03-26

## Headline
The current content set is **overwhelmingly phrase/sentence-level**, not lemma-level. This strongly suggests we should:
- Treat phrases as first-class drill targets (not lexeme-backed).
- Make lexeme/inflection work a *separate track* used for dedicated conjugation/declension drills and for the minority of items that are truly single-lemma.

## Counts
- LessonItems total: **2936**
- LessonItems linked to a Lexeme: **78**
- LessonItems unlinked: **2858**

## Surface-form characteristics (using `target_hebrew`)
- Multiword targets (contains a space): **2436** (**83.0%**)
- Targets containing niqqud (Hebrew combining marks U+0591–U+05C7): **200** (**6.8%**)
- “Verb-ish” single-token infinitives (starts with `ל` and no space): **46** (**1.6%**)

## Representative samples

### Verb-ish single-token infinitives
- לֵהִתלַבֵּט
- לִשבּוֹר
- לִפתוֹחַ
- להיזכר
- להתלבט
- להשתדל
- לִמצוֹא
- לזרום
- להיזהר
- להחליט

Notes:
- Some items that match this heuristic aren’t verbs (e.g., **למרות** “despite”, **לאחר** “after”, **להפך** “on the contrary”). So even “starts with ל” needs a filter/list.

### Multiword targets
- אני מתכונן למסיבה מחר.
- הם התכוננו היטב למבחן.
- למה אתה לא מתכונן כמו שצריך?
- קודם קפה או קודם אינסטגרם?
- אתמול היא נפגשה איתו
- להזיז את

### Targets with niqqud
- הן שׂוֹרפוֹת
- לֵהִתלַבֵּט
- לִשבּוֹר
- לִפתוֹחַ
- לֵב שַבוּר

## Implications / decisions to make

1) **Validator scope**
   - If the admin validator is meant to ensure lexeme-backed items have matching inflections, it should apply only to items that *are intended* to be lexeme-backed.

2) **Canonicalization**
   - Keep canonical forms **without niqqud** for matching/grading.
   - Store niqqud’d variants for display / acceptance.

3) **Linking strategy**
   - Build a pipeline that first classifies items into:
     - single-token (candidate lemma)
     - phrase/collocation
     - sentence
   - Only attempt lexeme linking for the first bucket by default.

