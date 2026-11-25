/*
 * Parvex's mark: the owner's logo (25 Nov 2026), trimmed to public/brand/mark.webp by referensi/tools/apply-owner-assets.mjs.
 * Drawn as a CSS mask filled with currentColor. Bump ?v= when the file changes so cached copies are replaced.
 */
const MARK_URL = "/brand/mark.webp?v=7600ada3";

export function MarkGlyph({ size = 22 }: { size?: number }) {
  const mask = `url(${MARK_URL}) center / contain no-repeat`;
  return <span aria-hidden="true" data-testid="brand-mark" className="block shrink-0 bg-current" style={{ width: size, height: size, WebkitMask: mask, mask }} />;
}

/** Wordmark: the mark in neon + the name, like the reference's logotype (accent glyph, light name). */
export function Wordmark({ size = 22, light = false }: { size?: number; light?: boolean }) {
  // On a light ground the neon mark and white name would vanish: both switch to ink there.
  return (
    <span className="wordmark" style={{ fontSize: size, ...(light ? { color: "var(--text)" } : {}) }}>
      <span className={light ? "text-[var(--text)]" : "text-[var(--neon)]"}>
        <MarkGlyph size={Math.round(size * 1.05)} />
      </span>
      <span>Parvex</span>
    </span>
  );
}
