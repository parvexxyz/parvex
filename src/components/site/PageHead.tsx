/* Title band for app pages: the reference's dot label over a light display headline, on the dark ribbon art. */
export function PageHead({ eyebrow, title, children, actions }: { eyebrow: string; title: string; children?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <section className="phead">
      <div className="wrap">
        <p className="label neon" data-reveal="">
          {eyebrow}
        </p>
        <h1 className="h-sec mt-6 max-w-[980px]" data-reveal="" style={{ "--delay": "80ms" } as React.CSSProperties}>
          {title}
        </h1>
        {children ? (
          <div className="lede muted mt-5 max-w-[760px]" data-reveal="" style={{ "--delay": "160ms" } as React.CSSProperties}>
            {children}
          </div>
        ) : null}
        {actions ? <div className="mt-7 flex flex-wrap gap-3">{actions}</div> : null}
      </div>
    </section>
  );
}

export function StatusBadge({ status }: { status: "Prototype" | "Concept" }) {
  return (
    <span className={`badge ${status === "Prototype" ? "proto" : "concept"}`}>
      <i aria-hidden="true" />
      {status}
    </span>
  );
}
export function SampleBadge({ label = "Sample data" }: { label?: string }) {
  return <span className="badge sample">{label}</span>;
}
export function LiveBadge({ label = "Live from chain" }: { label?: string }) {
  return (
    <span className="badge live">
      <i aria-hidden="true" />
      {label}
    </span>
  );
}
