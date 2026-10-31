/**
 * EAMCET Question Deduplication & Content Quality Validator
 * Provides stem-based fingerprinting, cross-chapter duplicate detection,
 * dummy placeholder detection, and subject/chapter relevance checks.
 */

// Normalizes question text for stem comparison (strips punctuation, LaTeX formatting, variation tags, numbers/spaces)
export function normalizeQuestionStem(text: string): string {
  if (!text) return '';
  return text
    .toLowerCase()
    // Strip variation tags: (Variation 1), (var 2), etc.
    .replace(/(\(variation\s*\d+\))/gi, '')
    // Strip leading question numbering: Q1., 1., Question 1:, etc.
    .replace(/^q(?:uestion)?\s*\d+[\.\:\-\)]\s*/i, '')
    .replace(/^\d+[\.\:\-\)]\s*/, '')
    // Normalize multiple backslashes (e.g. \\\int or \\sin)
    .replace(/\\+/g, '\\')
    // Strip LaTeX operator and text wrappers
    .replace(/\\operatorname\*?\{([^}]+)\}/g, '$1')
    .replace(/\\operatorname\b/g, '')
    .replace(/\\text\{([^}]+)\}/g, '$1')
    .replace(/\\mathrm\{([^}]+)\}/g, '$1')
    .replace(/\\mathbf\{([^}]+)\}/g, '$1')
    .replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, '$1/$2')
    .replace(/[$_{}\\^]/g, '')
    // Strip non-alphanumeric BUT preserve digits so numeric variants stay distinct
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Checks if a question is a dummy template, placeholder, or low-quality generated shell
 */
export function isPlaceholderQuestion(q: any): { isPlaceholder: boolean; reason?: string } {
  const text = String(q.question_text_en || '').toLowerCase().trim();
  const options = Array.isArray(q.options_en) ? q.options_en : [];

  // Check dummy question texts
  if (
    text.includes('first, determine initial') ||
    text.includes('first, determine preliminary') ||
    text.includes('first, determine base quantity') ||
    text.includes('question 1 about') ||
    text.includes('question 2 about') ||
    text.includes('lorem ipsum') ||
    text.includes('analyze the behavior of physical system when external force') ||
    text.includes('given theoretical predictions, determine the most likely outcome') ||
    text.includes('given observed values, determine the most likely outcome')
  ) {
    return { isPlaceholder: true, reason: 'Generic template placeholder text' };
  }

  // Check dummy options like ["Option A", "Option B", "Option C", "Option D"]
  if (options.length > 0) {
    const hasDummyOption = options.some((opt: any) => {
      const s = String(opt || '').trim().toLowerCase();
      return (
        s === 'option a' ||
        s === 'option b' ||
        s === 'option c' ||
        s === 'option d' ||
        s === 'ఆప్షన్ a' ||
        s === 'ఆప్షన్ b' ||
        s === 'ఆప్షన్ c' ||
        s === 'ఆప్షన్ d'
      );
    });
    if (hasDummyOption) {
      return { isPlaceholder: true, reason: 'Dummy options ("Option A", "Option B", ...)' };
    }
  }

  // Check if options are all identical
  if (options.length === 4) {
    const first = String(options[0]).trim();
    if (options.every((o: any) => String(o).trim() === first)) {
      return { isPlaceholder: true, reason: 'All 4 options are identical' };
    }
  }

  return { isPlaceholder: false };
}

/**
 * Checks if a question belongs to a completely different subject or chapter (cross-chapter mismatch)
 */
export function checkTopicMismatch(subject: string, topic: string, questionText: string): { isMismatch: boolean; reason?: string } {
  const text = String(questionText || '').toLowerCase();
  const sub = String(subject || '').trim();
  const top = String(topic || '').trim().toLowerCase();

  // 1. Math formulas inside Chemistry / Biology / Zoology
  if (['Chemistry', 'Biology', 'Zoology'].includes(sub)) {
    if (
      text.includes('vector a =') ||
      text.includes('vector b =') ||
      text.includes('dot product a · b') ||
      text.includes('cross product a × b') ||
      text.includes('matrix a =') ||
      text.includes('det(a)') ||
      text.includes('det(adj(a))') ||
      (text.includes('\\int') && text.includes('dx') && !text.includes('arrhenius') && !text.includes('rate law'))
    ) {
      return { isMismatch: true, reason: `Mathematics question filed under ${sub}` };
    }
  }

  // 1b. Chemistry kinetics / equilibrium / reactions inside Biology or Zoology
  // NOTE: Many physiology questions legitimately use terms like 'rate', 'energy', etc.
  // Only flag very obvious pure-chemistry structural/inorganic patterns.
  if (['Biology', 'Zoology'].includes(sub)) {
    if (
      text.includes('gaseous reaction') ||
      text.includes('le chatelier') ||
      text.includes('rightleftharpoons') ||
      text.includes('hybridization of carbon') ||
      text.includes('oxidation state of iron') ||
      text.includes('oxidation state of copper')
    ) {
      return { isMismatch: true, reason: `Chemistry structural question filed under ${sub}` };
    }
  }

  // 2. Botany topics inside Zoology
  if (sub === 'Zoology' || top.includes('zoology')) {
    if (
      text.includes('photosynthesis') ||
      text.includes('chlorophyll') ||
      text.includes('transpiration') ||
      text.includes('stomata') ||
      text.includes('calvin cycle') ||
      text.includes('c3 cycle') ||
      text.includes('c4 cycle') ||
      text.includes('gymnosperm') ||
      text.includes('bryophyte')
    ) {
      return { isMismatch: true, reason: 'Botany/Plant question filed under Zoology' };
    }
  }

  // 3. Organic chemistry reactions inside Physics or Mathematics
  if (['Physics', 'Mathematics'].includes(sub)) {
    if (
      text.includes('iupac name') ||
      text.includes('functional group') ||
      text.includes('grignard reagent') ||
      text.includes('sn1 reaction') ||
      text.includes('sn2 reaction') ||
      text.includes('electronegativity') ||
      text.includes('hybridization') ||
      text.includes('oxidation state')
    ) {
      return { isMismatch: true, reason: `Chemistry question filed under ${sub}` };
    }
  }

  return { isMismatch: false };
}
