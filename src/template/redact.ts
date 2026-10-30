const EMAIL_PATTERN =
  /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+/g;
const PHONE_PATTERN =
  /(?:\+?\d{1,3}[\s.-]?)?(?:\(\d{3}\)|\d{3})[\s.-]?\d{3}[\s.-]?\d{4}\b|\b\d{3}[\s.-]\d{3}[\s.-]\d{4}\b/g;
const REDACTED = "[redacted]";

export function stripEmails(text: string): string {
  return text.replace(EMAIL_PATTERN, REDACTED);
}

export function stripPhoneNumbers(text: string): string {
  return text.replace(PHONE_PATTERN, REDACTED);
}

export function redactFieldValue(fieldName: string, text: string, schemaFields: readonly string[] = []): string {
  let out = text;
  if (!schemaFields.includes(fieldName)) out = stripEmails(out);
  if (!schemaFields.includes(fieldName)) out = stripPhoneNumbers(out);
  return out;
}

export function redactStringFields(fields: Record<string, string>, schemaFields: readonly string[] = []): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(fields)) out[key] = redactFieldValue(key, value, schemaFields);
  return out;
}
