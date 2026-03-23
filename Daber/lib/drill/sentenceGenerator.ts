import { getOpenAI } from '@/lib/openai';

export type GeneratedSentence = {
  english: string;
  hebrew: string;
  difficulty: number;
};

export async function generateSentences(
  vocabulary: string[],
  count: number = 5
): Promise<GeneratedSentence[]> {
  const openai = getOpenAI();
  const vocabList = vocabulary.slice(0, 30).join(', ');

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    temperature: 0.7,
    messages: [
      {
        role: 'system',
        content: `You are a Hebrew language teacher. Generate simple Hebrew sentences for a beginner student to practice translating. Use the vocabulary words provided. Return a JSON array of objects with "english", "hebrew", and "difficulty" (1=easy, 2=medium, 3=hard) fields. Only use common sentence structures. Include nikud (vowel marks) in Hebrew text if possible.`,
      },
      {
        role: 'user',
        content: `Generate ${count} Hebrew sentences using these vocabulary words: ${vocabList}. Mix difficulties. Return only valid JSON array.`,
      },
    ],
    response_format: { type: 'json_object' },
  });

  const content = response.choices[0]?.message?.content;
  if (!content) return [];

  try {
    const parsed = JSON.parse(content);
    const sentences: GeneratedSentence[] = (parsed.sentences || parsed || [])
      .filter(
        (s: any) =>
          typeof s.english === 'string' &&
          typeof s.hebrew === 'string' &&
          typeof s.difficulty === 'number'
      )
      .slice(0, count);
    return sentences;
  } catch {
    return [];
  }
}
