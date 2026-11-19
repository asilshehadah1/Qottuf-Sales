// Translate the brand rulebook's Python regular expressions into JavaScript ones with the same meaning.
//
// Why this exists: brand-rules.json is written for Python's `re`, where \w, \b and \d understand Arabic.
// In JavaScript they are ASCII-only, so a pattern like \bأنا\b never matches anything. A naive port would
// silently disable every Arabic rule. This translator rewrites the Unicode-sensitive escapes and fails loud
// on any Python feature it can't translate, so a future rule can't be quietly ignored.

const WORD = "\\p{L}\\p{N}\\p{M}_";
const WORD_CLASS = `[${WORD}]`;
const NOT_WORD_CLASS = `[^${WORD}]`;
const BOUNDARY = `(?:(?<=${WORD_CLASS})(?!${WORD_CLASS})|(?<!${WORD_CLASS})(?=${WORD_CLASS}))`;
const NON_BOUNDARY = `(?:(?<=${WORD_CLASS})(?=${WORD_CLASS})|(?<!${WORD_CLASS})(?!${WORD_CLASS}))`;
const SYNTAX_CHARS = new Set(["^", "$", "\\", ".", "*", "+", "?", "(", ")", "[", "]", "{", "}", "|", "/"]);

export class UntranslatableRegexError extends Error {}

export interface TranslatedRegex {
  source: string;
  flags: string;
}

/** Translate a Python `re` pattern. `extraFlags` may contain i, m or s. The result always uses the u flag. */
export function translatePythonRegex(pattern: string, extraFlags = ""): TranslatedRegex {
  let flags = new Set(["u", ...extraFlags.split("").filter(Boolean)]);
  let body = pattern;

  // A whole-pattern inline flag group, e.g. (?i:\bmy\b): JavaScript in Node 22 has no inline modifiers.
  const whole = /^\(\?([ims]+):([\s\S]*)\)$/.exec(body);
  if (whole && balancedGroup(body)) {
    for (const f of whole[1]!) flags.add(f);
    body = whole[2]!;
  }
  const leading = /^\(\?([aiLmsux]+)\)/.exec(body);
  if (leading) {
    for (const f of leading[1]!) {
      if (!"ims".includes(f)) throw new UntranslatableRegexError(`Unsupported Python flag (?${f}) in ${pattern}`);
      flags.add(f);
    }
    body = body.slice(leading[0].length);
  }

  let out = "";
  let inClass = false;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i]!;
    if (ch === "\\") {
      const next = body[i + 1];
      if (next === undefined) throw new UntranslatableRegexError(`Trailing backslash in ${pattern}`);
      i++;
      switch (next) {
        case "w":
          out += inClass ? WORD : WORD_CLASS;
          break;
        case "W":
          if (inClass) throw new UntranslatableRegexError(`\\W inside a character class in ${pattern}`);
          out += NOT_WORD_CLASS;
          break;
        case "b":
          if (inClass) {
            out += "\\x08"; // inside a class \b means backspace, as in Python
          } else {
            out += BOUNDARY;
          }
          break;
        case "B":
          if (inClass) throw new UntranslatableRegexError(`\\B inside a character class in ${pattern}`);
          out += NON_BOUNDARY;
          break;
        case "d":
          out += "\\p{Nd}";
          break;
        case "D":
          out += "\\P{Nd}";
          break;
        case "A":
          out += "(?<![\\s\\S])";
          break;
        case "Z":
          out += "(?![\\s\\S])";
          break;
        case "U": {
          const hex = body.slice(i + 1, i + 9);
          if (!/^[0-9a-fA-F]{8}$/.test(hex)) throw new UntranslatableRegexError(`Bad \\U escape in ${pattern}`);
          out += `\\u{${parseInt(hex, 16).toString(16).toUpperCase()}}`;
          i += 8;
          break;
        }
        case "u": {
          const hex = body.slice(i + 1, i + 5);
          if (!/^[0-9a-fA-F]{4}$/.test(hex)) throw new UntranslatableRegexError(`Bad \\u escape in ${pattern}`);
          out += `\\u${hex}`;
          i += 4;
          break;
        }
        default:
          if (/[A-Za-z0-9]/.test(next)) {
            // \s \S \n \t \x.. and back-references keep their meaning in JavaScript.
            out += "\\" + next;
          } else if (SYNTAX_CHARS.has(next) || (inClass && next === "-")) {
            out += "\\" + next;
          } else {
            // Python accepts identity escapes such as \# \' or \- outside a class; the u flag doesn't.
            // They mean the character itself.
            out += next;
          }
      }
      continue;
    }
    if (inClass) {
      if (ch === "]") inClass = false;
      out += ch;
      continue;
    }
    if (ch === "[") {
      inClass = true;
      out += ch;
      if (body[i + 1] === "^") {
        out += "^";
        i++;
      }
      if (body[i + 1] === "]") {
        // A ']' right after '[' or '[^' is a literal in Python.
        out += "\\]";
        i++;
      }
      continue;
    }
    if (ch === "(" && body[i + 1] === "?") {
      const rest = body.slice(i + 2);
      if (rest.startsWith("P<")) {
        out += "(?<";
        i += 3;
        continue;
      }
      if (rest.startsWith("P=")) {
        const end = body.indexOf(")", i);
        out += `\\k<${body.slice(i + 4, end)}>`;
        i = end;
        continue;
      }
      if (/^[aiLmsux-]+[:)]/.test(rest)) {
        throw new UntranslatableRegexError(`Inline flags inside a pattern are not supported: ${pattern}`);
      }
      if (rest.startsWith("#")) throw new UntranslatableRegexError(`Regex comments are not supported: ${pattern}`);
    }
    out += ch;
  }
  if (inClass) throw new UntranslatableRegexError(`Unclosed character class in ${pattern}`);

  // Python's re.M is needed for anchors at line starts; keep the caller's choice.
  const flagString = [...flags].sort().join("");
  // Validate now, so a broken rule fails at load time rather than at the first check.
  new RegExp(out, flagString);
  return { source: out, flags: flagString };
}

/** Compile a Python pattern for global matching. */
export function pyRegex(pattern: string, extraFlags = ""): RegExp {
  const t = translatePythonRegex(pattern, extraFlags);
  return new RegExp(t.source, t.flags.includes("g") ? t.flags : t.flags + "g");
}

export function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\\/-]/g, "\\$&");
}

function balancedGroup(pattern: string): boolean {
  // True if the opening "(" at index 0 closes at the very last character.
  let depth = 0;
  let inClass = false;
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    if (ch === "\\") {
      i++;
      continue;
    }
    if (inClass) {
      if (ch === "]") inClass = false;
      continue;
    }
    if (ch === "[") inClass = true;
    else if (ch === "(") depth++;
    else if (ch === ")") {
      depth--;
      if (depth === 0 && i !== pattern.length - 1) return false;
    }
  }
  return depth === 0;
}
