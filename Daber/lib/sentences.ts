import { prisma } from './db';
import { getOpenAI } from './openai';

type LexemeForGeneration = {
  id: string;
  lemma: string;
  pos: string;
  gloss: string | null;
  inflections: { form: string; tense?: string | null; person?: string | null }[];
};

export async function getSentence(lexemeId: string): Promise<{ hebrew: string; english: string } | null> {
  try {
    const existing = await prisma.sentenceBank.findMany({
      where: { lexeme_id: lexemeId },
    });

    if (existing.length > 0) {
      const pick = existing[Math.floor(Math.random() * existing.length)];
      return { hebrew: pick.hebrew, english: pick.english };
    }

    const lexeme = await prisma.lexeme.findUnique({
      where: { id: lexemeId },
      include: { inflections: { take: 3 } },
    });

    if (!lexeme) return null;

    const sentences = await generateSentences({
      id: lexeme.id,
      lemma: lexeme.lemma,
      pos: lexeme.pos,
      gloss: lexeme.gloss,
      inflections: lexeme.inflections.map((i) => ({
        form: i.form,
        tense: i.tense,
        person: i.person,
      })),
    });

    if (sentences.length === 0) return null;

    const pick = sentences[Math.floor(Math.random() * sentences.length)];
    return { hebrew: pick.hebrew, english: pick.english };
  } catch (e) {
    console.error('getSentence failed (table may not exist):', e);
    return null;
  }
}

async function generateSentences(
  lexeme: LexemeForGeneration
): Promise<{ hebrew: string; english: string }[]> {
  const inflectionExamples = lexeme.inflections
    .map((i) => {
      const parts = [i.form];
      if (i.tense) parts.push(`(${i.tense})`);
      if (i.person) parts.push(`(${i.person})`);
      return parts.join(' ');
    })
    .join(', ');

  const prompt = `You are a Hebrew language tutor. Generate 4 short, natural Hebrew sentences (4-8 words each) using the word "${lexeme.lemma}" (${lexeme.pos}, meaning: "${lexeme.gloss || 'unknown'}").

Sample inflections: ${inflectionExamples || 'none available'}

Requirements:
- Each sentence should use the word naturally in context
- Keep sentences simple and clear (A2-B1 level)
- Provide a literal English translation for each
- Use different inflections/forms of the word across sentences when possible

Return ONLY a JSON array like:
[{"hebrew": "...", "english": "..."}]`;

  try {
    const openai = getOpenAI();
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      max_tokens: 500,
    });

    const content = response.choices[0]?.message?.content?.trim() || '';
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];

    const parsed: { hebrew: string; english: string }[] = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(parsed)) return [];

    const valid = parsed.filter(
      (s) => typeof s.hebrew === 'string' && typeof s.english === 'string'
    );

    await prisma.sentenceBank.createMany({
      data: valid.map((s) => ({
        lexeme_id: lexeme.id,
        hebrew: s.hebrew,
        english: s.english,
        direction: 'both',
      })),
    });

    return valid;
  } catch (e) {
    console.error('Sentence generation failed:', e);
    return [];
  }
}
