import type { ReactNode } from "react";

/**
 * Lightweight Markdown renderer for generated UoP instructions.
 * Supports H1/H2, ordered/unordered lists, bold (**), inline code (`), and italic (_).
 */
export function RenderMarkdown({ text }: { text: string }) {
  const lines = text.split("\n");
  const out: ReactNode[] = [];
  let listBuffer: { ordered: boolean; items: string[] } | null = null;

  function flushList() {
    if (!listBuffer) return;
    const Tag = listBuffer.ordered ? "ol" : "ul";
    out.push(
      <Tag
        key={out.length}
        className={listBuffer.ordered ? "list-decimal pl-5" : "list-disc pl-5"}
      >
        {listBuffer.items.map((it, i) => (
          <li key={i} className="my-0.5">
            {inline(it)}
          </li>
        ))}
      </Tag>,
    );
    listBuffer = null;
  }

  function inline(s: string): ReactNode {
    const nodes: ReactNode[] = [];
    let rest = s;
    let key = 0;
    const regex = /(\*\*[^*]+\*\*|`[^`]+`)/;
    while (true) {
      const m = rest.match(regex);
      if (!m) {
        nodes.push(rest);
        break;
      }
      const idx = m.index!;
      if (idx > 0) nodes.push(rest.slice(0, idx));
      const token = m[0];
      if (token.startsWith("**")) {
        nodes.push(
          <strong key={key++} className="font-semibold text-brand-ink">
            {token.slice(2, -2)}
          </strong>,
        );
      } else {
        nodes.push(
          <code
            key={key++}
            className="rounded bg-[var(--surface-muted)] px-1 py-0.5 font-mono text-[11px]"
          >
            {token.slice(1, -1)}
          </code>,
        );
      }
      rest = rest.slice(idx + token.length);
    }
    return <>{nodes}</>;
  }

  for (const raw of lines) {
    const line = raw.replace(/\r$/, "");
    if (line.startsWith("# ")) {
      flushList();
      out.push(
        <h1 key={out.length} className="mb-2 mt-3 text-base font-semibold text-brand-ink first:mt-0">
          {inline(line.slice(2))}
        </h1>,
      );
    } else if (line.startsWith("## ")) {
      flushList();
      out.push(
        <h2 key={out.length} className="mb-1.5 mt-2.5 text-sm font-semibold text-brand-ink">
          {inline(line.slice(3))}
        </h2>,
      );
    } else if (/^\d+\.\s/.test(line)) {
      if (!listBuffer || !listBuffer.ordered) {
        flushList();
        listBuffer = { ordered: true, items: [] };
      }
      listBuffer.items.push(line.replace(/^\d+\.\s/, ""));
    } else if (line.startsWith("- ")) {
      if (!listBuffer || listBuffer.ordered) {
        flushList();
        listBuffer = { ordered: false, items: [] };
      }
      listBuffer.items.push(line.slice(2));
    } else if (line.trim() === "") {
      flushList();
    } else if (line.startsWith("_") && line.endsWith("_")) {
      flushList();
      out.push(
        <p key={out.length} className="italic text-brand-muted">
          {line.slice(1, -1)}
        </p>,
      );
    } else {
      flushList();
      out.push(
        <p key={out.length} className="my-1">
          {inline(line)}
        </p>,
      );
    }
  }
  flushList();
  return <div className="space-y-0.5 text-sm leading-relaxed">{out}</div>;
}
