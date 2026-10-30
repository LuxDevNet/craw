export function isChallengeHtml(body: string): boolean {
  if (!body || body.length < 50) return false;
  return /just a moment|attention required|cf-mitigated|challenge-running|turnstile|access denied|security check|verify you are human|bot detection|datadome/i.test(
    body,
  );
}
