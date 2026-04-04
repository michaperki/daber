# TODO — Known Issues & Bugs

## English prompt data quality (CC imports)
- Some english_prompt values have spacing issues: "iam waiting for a taxi" instead of "i am waiting for a taxi"
- Capitalization missing: "i" not capitalized to "I" in prompts
- Root cause: CC import data has these issues baked in
- Fix: write a one-time script to normalize english_prompt spacing and capitalization in the DB

## Hebrew evaluation false-negatives
- User typed "אני מחכה למונית" but was graded incorrect when target was the same text
- Likely cause: invisible Unicode characters in CC import data (zero-width joiners, different space chars, or lookalike Hebrew codepoints)
- The normalizer strips nikkud and some zero-width chars but may miss others
- Fix: audit CC import data for invisible chars; extend normalizer to strip all non-essential Unicode

## SentenceBank table missing on remote DB
- Schema has the model but table was never created on Heroku Postgres
- `getSentence()` is currently disabled (sentence generation code commented out in next route)
- Fix: run `cd Daber && npx prisma db push` on production

## OpenAI API quota exceeded
- The API key in .env has exhausted its quota
- Sentence generation is disabled as a result
- Fix: add billing to OpenAI account, or remove OpenAI dependency entirely
