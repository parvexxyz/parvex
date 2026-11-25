import Link from "next/link";
import { PageHead } from "@/components/site/PageHead";

export default function NotFound() {
  return (
    <PageHead eyebrow="404" title="No deal at this address." actions={<><Link href="/terminal" className="btn btn-neon">Open the terminal</Link><Link href="/" className="btn btn-dark">Home</Link></>}>
      <p>This page does not exist. The terminal does.</p>
    </PageHead>
  );
}
