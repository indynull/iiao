/**
 * Board voice: the user said "my cat" — we answer about *your* cat.
 * Leave "the/a/an" and bare names alone.
 */
export function boardVoice(name: string): string {
  const t = name.trim();
  if (!t) return t;
  return t.replace(/^(my|our)\b/i, (m) => {
    if (m === m.toUpperCase() && m.length > 1) return "YOUR";
    if (m[0] === m[0]!.toUpperCase()) return "Your";
    return "your";
  });
}

/** Swap "my cat" → "your cat" anywhere it appears in model copy. */
export function revoiceText(text: string, subject: string): string {
  const raw = subject.trim();
  if (!raw || !/^(my|our)\b/i.test(raw)) return text;
  const yours = boardVoice(raw);
  const escaped = raw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return text.replace(new RegExp(escaped, "gi"), (m) => {
    if (m[0] === m[0]!.toUpperCase() && m[0] !== m[0]!.toLowerCase()) {
      return yours.charAt(0).toUpperCase() + yours.slice(1);
    }
    return yours;
  });
}
