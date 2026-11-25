import { redirect } from "next/navigation";

/** Legacy URL — Correlations lives under Six Sigma. */
export default function CognitionPlaneRedirect() {
  redirect("/six-sigma/correlations");
}
