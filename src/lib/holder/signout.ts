/** Records a sign-out; a store failure is reported, never swallowed (the client drops the session locally either way). */
export async function recordSignout(revoke: (nonce: string, until: number) => Promise<void>, nonce: string, expiresAt: number): Promise<{ ok: true } | { ok: false; status: 503; error: string }> {
  try {
    await revoke(nonce, expiresAt);
    return { ok: true };
  } catch {
    return { ok: false, status: 503, error: `Sign out could not be recorded; this session still expires at ${new Date(expiresAt * 1000).toISOString()}.` };
  }
}
