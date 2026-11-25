/* The reference's SplitTitle: each word is its own span and fades up in turn once the title is in view (Motion.tsx adds .in).
   Without JavaScript, with reduced motion or in a hidden tab the words are simply visible. `accent` words get the neon. */
export function SplitTitle({ text, accent = [], as: Tag = "h2", className = "" }: { text: string; accent?: string[]; as?: "h1" | "h2" | "p"; className?: string }) {
  const words = text.split(" ");
  const Any = Tag as React.ElementType;
  return (
    <Any className={`split ${className}`} data-split="" aria-label={text}>
      {words.map((w, i) => (
        <span key={i} aria-hidden="true">
          <span className={`w ${accent.includes(w.replace(/[.,]$/, "")) ? "accent" : ""}`} style={{ "--i": i } as React.CSSProperties}>
            {w}
          </span>
          {i < words.length - 1 ? " " : ""}
        </span>
      ))}
    </Any>
  );
}
