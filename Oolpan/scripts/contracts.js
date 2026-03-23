// Minimal runtime validators for normalized JSON shapes (Zod-like, no deps)

function isString(v) { return typeof v === 'string'; }
function isNumber(v) { return typeof v === 'number' && Number.isFinite(v); }
function isStringOrNull(v) { return v == null || typeof v === 'string'; }
function isArray(v) { return Array.isArray(v); }

function validateFlashcardNorm(obj) {
  const errors = [];
  if (!obj || typeof obj !== 'object') return { ok: false, errors: ['not an object'] };
  if (!isString(obj.id)) errors.push('id (string)');
  if (!isString(obj.lesson)) errors.push('lesson (string)');
  if (!isString(obj.english)) errors.push('english (string)');
  if (!isString(obj.hebrew)) errors.push('hebrew (string)');
  if (!isArray(obj.contents)) errors.push('contents (array)');
  return { ok: errors.length === 0, errors };
}

function validatePracticeNorm(obj) {
  const errors = [];
  if (!obj || typeof obj !== 'object') return { ok: false, errors: ['not an object'] };
  if (!isString(obj.id)) errors.push('id (string)');
  if (!isString(obj.title)) errors.push('title (string)');
  if (!isString(obj.type)) errors.push('type (string)');
  // lesson can be number in normalized file; accept number or string coercible
  if (!(isNumber(obj.lesson) || isString(obj.lesson))) errors.push('lesson (number|string)');
  if (!isString(obj.segment)) errors.push('segment (string)');
  if (!isStringOrNull(obj.question_text)) errors.push('question_text (string|null)');
  if (!isString(obj.text_answer)) errors.push('text_answer (string)');
  if (!isStringOrNull(obj.question_audio_url)) errors.push('question_audio_url (string|null)');
  if (!isStringOrNull(obj.answer_audio_url)) errors.push('answer_audio_url (string|null)');
  return { ok: errors.length === 0, errors };
}

module.exports = {
  validateFlashcardNorm,
  validatePracticeNorm,
};

