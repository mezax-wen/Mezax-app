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

export function findIdentityDocumentNumber(text: string) {
  const compact = text.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const label = /(?:AUSWEIS(?:NUMMER|NR)|DOKUMENT(?:EN)?(?:NUMMER|NR)|DOCUMENT(?:NUMBER|NO|NR))/.exec(compact);
  if (!label) return undefined;

  const valueStart = (label.index ?? 0) + label[0].length;
  const valueMatch = /[A-Z0-9]{8,12}/.exec(compact.slice(valueStart));
  if (!valueMatch) return undefined;

  return {
    value: valueMatch[0],
    index: valueStart + (valueMatch.index ?? 0),
  };
}

export type PositionedIdentityToken = {
  normalized: string;
  left: number;
  top: number;
  width: number;
  height: number;
};

export function findLabeledIdentityDocumentNumber(tokens: PositionedIdentityToken[]) {
  const labels = tokens.filter((token) =>
    /^(?:AUSWEIS(?:NUMMER|NR)|DOKUMENT(?:EN)?(?:NUMMER|NR))$/.test(token.normalized),
  );

  for (const label of labels) {
    const candidates = tokens
      .filter((token) => {
        if (!/^[A-Z0-9]{8,12}$/.test(token.normalized)) return false;
        if (!/[A-Z]/.test(token.normalized) || !/\d/.test(token.normalized)) return false;
        const verticalDistance = token.top - (label.top + label.height);
        const horizontalDistance = Math.abs(token.left - label.left);
        return verticalDistance >= -4 && verticalDistance <= Math.max(80, label.height * 5) && horizontalDistance <= 180;
      })
      .sort((a, b) => {
        const aDistance = Math.abs(a.top - (label.top + label.height)) + Math.abs(a.left - label.left) * 0.2;
        const bDistance = Math.abs(b.top - (label.top + label.height)) + Math.abs(b.left - label.left) * 0.2;
        return aDistance - bDistance;
      });
    if (candidates[0]) return candidates[0];
  }
  return undefined;
}

export function isMachineReadableZoneLine(text: string) {
  const machineText = text.toUpperCase().replace(/\s/g, '').replace(/[^A-Z0-9<]/g, '');
  if (machineText.length < 20) return false;

  const fillerCount = machineText.match(/</g)?.length ?? 0;
  if (fillerCount >= 3) return true;

  const compact = machineText.replace(/</g, '');
  const identityPrefix = /^I[D0]D/.test(compact) || /^P[A-Z0-9]{1,3}/.test(compact);
  return identityPrefix && compact.length >= 24 && /\d{6}/.test(compact);
}
