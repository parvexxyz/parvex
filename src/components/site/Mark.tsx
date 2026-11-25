/*
 * Parvex's mark (placeholder drawn by referensi/tools/make-assets.mjs until the owner's files arrive; apply-owner-assets.mjs swaps it).
 * Drawn as a CSS mask filled with currentColor. Bump ?v= when the file changes so cached copies are replaced.
 */
const MARK_URL = "/brand/mark.webp?v=cbae44f0";

export function MarkGlyph({ size = 22 }: { size?: number }) {
  const mask = `url(${MARK_URL}) center / contain no-repeat`;
  return <span aria-hidden="true" data-testid="brand-mark" className="block shrink-0 bg-current" style={{ width: size, height: size, WebkitMask: mask, mask }} />;
}

/** Wordmark: the mark in neon + the name, like the reference's logotype (accent glyph, light name). */
export function Wordmark({ size = 22 }: { size?: number }) {
  return (
    <span className="wordmark" style={{ fontSize: size }}>
      <span className="text-[var(--neon)]">
        <MarkGlyph size={Math.round(size * 1.05)} />
      </span>
      <span>Parvex</span>
    </span>
  );
}
