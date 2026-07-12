export function normalizeIban(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function isValidIban(value: string) {
  const iban = normalizeIban(value);
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) return false;
  if (iban.startsWith('DE') && iban.length !== 22) return false;

  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let remainder = 0;
  for (const character of rearranged) {
    const numeric = /[A-Z]/.test(character) ? String(character.charCodeAt(0) - 55) : character;
    for (const digit of numeric) remainder = (remainder * 10 + Number(digit)) % 97;
  }
  return remainder === 1;
}

export function findValidIbans(text: string) {
  const compact = normalizeIban(text);
  const results: Array<{ value: string; index: number }> = [];
  for (const startMatch of compact.matchAll(/[A-Z]{2}\d{2}/g)) {
    const index = startMatch.index ?? 0;
    const maximumLength = Math.min(34, compact.length - index);
    for (let length = 15; length <= maximumLength; length += 1) {
      const candidate = compact.slice(index, index + length);
      if (!isValidIban(candidate)) continue;
      results.push({ value: candidate, index });
      break;
    }
  }
  return results;
}

export function shouldDetectGermanTaxId(line: string, value: string) {
  const digits = value.replace(/\D/g, '');
  if (!/^\d{11}$/.test(digits) || /^(\d)\1{10}$/.test(digits)) return false;
  return /(?:STEUER(?:LICHE)?(?:IDENTIFIKATIONSNUMMER|ID)|IDENTIFIKATIONSNUMMER|IDNR|STEUERLICHEIDNR|TIN)/.test(line);
}

export function shouldDetectSocialSecurityNumber(line: string, value: string) {
  if (!/^\d{8}[A-Z]\d{3}$/.test(value)) return false;
  return /(?:SOZIALVERSICHERUNG|VERSICHERUNGSNUMMER|SVNUMMER|RENTENVERSICHERUNG)/.test(line);
}
