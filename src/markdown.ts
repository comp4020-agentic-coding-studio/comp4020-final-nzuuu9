import { escapeHtml } from "./html.ts";

// A deliberately narrow markdown renderer for README.md only: headings,
// paragraphs, **bold**, *italic*, `code`, and [text](https://...) links.
// That's everything the file currently uses, and nothing else is safe to
// assume about markdown we didn't write ourselves.
//
// Safety comes from order: escape the whole line first (so &, <, >, " and
// ' can never form a tag or attribute), then run inline substitutions on
// the escaped text. Markdown's own syntax characters ([ ] ( ) * `) aren't
// touched by escaping, so the regexes below still find them; anything a
// reader could inject through the source text is already neutered by the
// time these run.

function renderInline(escapedLine: string): string {
  let out = escapedLine;
  // Links first, and only http(s) targets — anything else (a "javascript:"
  // scheme, say) is left as plain escaped text rather than turned into a
  // clickable link.
  out = out.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2">$1</a>');
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  out = out.replace(/`([^`]+)`/g, "<code>$1</code>");
  return out;
}

export function renderMarkdown(markdown: string): string {
  const html: string[] = [];
  for (const rawLine of markdown.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      const level = heading[1].length;
      html.push(`<h${level}>${renderInline(escapeHtml(heading[2].trim()))}</h${level}>`);
    } else {
      html.push(`<p>${renderInline(escapeHtml(line))}</p>`);
    }
  }
  return html.join("\n");
}
