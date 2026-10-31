/**
 * Robust JSON cleaner and partial parser for LLM responses containing LaTeX
 */
export function safeParseJsonQuestions(rawText: string): any[] {
  // 1. Strip markdown code fences if present
  let text = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

  // Find array start '[' or object start '{'
  const firstBracket = text.indexOf('[');
  const firstBrace = text.indexOf('{');
  
  if (firstBracket !== -1 && (firstBrace === -1 || firstBracket < firstBrace)) {
    text = text.substring(firstBracket);
  } else if (firstBrace !== -1) {
    text = text.substring(firstBrace);
  }

  // First try direct JSON.parse
  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : (parsed.questions || [parsed]);
  } catch (initialErr) {
    // Continue to repair
  }

  // 2. Repair unescaped LaTeX backslashes
  // In JSON, valid escape sequences are: \" \\ \/ \b \f \n \r \t \uXXXX
  // But in LaTeX, \b in \begin{...} is interpreted as backspace, \f in \frac is form feed!
  // We need to fix backslashes that are part of LaTeX commands:
  let repaired = text.replace(/\\([a-zA-Z])/g, (match, letter) => {
    // If it's valid JSON escape like \b, \f, \n, \r, \t, let's check if it's followed by LaTeX keyword
    if (['b', 'f', 'n', 'r', 't'].includes(letter)) {
      // Check if it's likely LaTeX: \begin, \frac, \beta, \theta, \times, etc.
      return '\\\\' + letter;
    }
    return '\\\\' + letter;
  });

  try {
    const parsed = JSON.parse(repaired);
    return Array.isArray(parsed) ? parsed : (parsed.questions || [parsed]);
  } catch (err) {
    // Continue to truncated recovery
  }

  // 3. Truncated JSON recovery:
  // If the LLM stopped generating midway due to token limit, find the last completed question object '}'
  const lastCloseBrace = repaired.lastIndexOf('}');
  if (lastCloseBrace !== -1) {
    const sub = repaired.substring(0, lastCloseBrace + 1);
    const candidate = sub.trim().startsWith('[') ? sub + ']' : '[' + sub + ']';
    try {
      const parsed = JSON.parse(candidate);
      return Array.isArray(parsed) ? parsed : (parsed.questions || [parsed]);
    } catch {
      // Try regex extraction of individual question objects
    }
  }

  // 4. Fallback: regex to extract individual completed JSON objects
  const objects: any[] = [];
  const objectRegex = /\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g;
  let match;
  while ((match = objectRegex.exec(repaired)) !== null) {
    try {
      const obj = JSON.parse(match[0]);
      if (obj && (obj.question_text_en || obj.question_text_te)) {
        objects.push(obj);
      }
    } catch {
      // Try double escaping backslashes on this chunk
      try {
        const doubleEscaped = match[0].replace(/\\/g, '\\\\');
        const obj = JSON.parse(doubleEscaped);
        if (obj && (obj.question_text_en || obj.question_text_te)) {
          objects.push(obj);
        }
      } catch {
        // Skip unparseable chunk
      }
    }
  }

  if (objects.length > 0) {
    return objects;
  }

  throw new Error('AI రెస్పాన్స్‌ని పార్స్ చేయలేకపోయాము. దయచేసి మళ్లీ ప్రయత్నించండి లేదా తక్కువ ప్రశ్నలతో ఒక పేజీని ఎంచుకోండి.');
}
