/* ================================================================
   MARKDOWN RENDERING UTILITIES
   ================================================================ */

export function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function inlineMarkdown(value: string) {
  let text = escapeHtml(value);

  // Replace Markdown links [text](url) FIRST with temporary token
  const links: string[] = [];
  text = text.replace(
    /\[([^\]]+)\]\(((?:https?:\/\/#?|#)[^\s)]+)\)/g,
    (_, linkText, url) => {
      const idx = links.length;
      if (url.startsWith("#research/") || url.startsWith("#fit/")) {
        const hashStr = url.slice(1);
        const slashIdx = hashStr.indexOf("/");
        const page = slashIdx !== -1 ? hashStr.slice(0, slashIdx) : hashStr;
        const company = slashIdx !== -1 ? decodeURIComponent(hashStr.slice(slashIdx + 1)) : "";
        links.push(
          `<a class="md-link nav-internal-link" data-page="${page}" data-company="${escapeHtml(company)}" href="${url}">${linkText} <span class="ext-icon">→</span></a>`,
        );
      } else {
        links.push(
          `<a class="md-link" href="${url}" target="_blank" rel="noopener noreferrer">${linkText} <span class="ext-icon">↗</span></a>`,
        );
      }
      return `___MD_LINK_${idx}___`;
    },
  );

  // Replace numeric citation badges like [1], [2]
  text = text.replace(/\[(\d+)\]/g, '<sup class="citation-badge">$1</sup>');

  // Replace inline code `code`
  text = text.replace(/`([^`]+)`/g, '<code class="md-inline-code">$1</code>');

  // Replace bold **text**
  text = text.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");

  // Replace italic *text*
  text = text.replace(/\*([^*]+)\*/g, "<em>$1</em>");

  // Restore Markdown links
  text = text.replace(/___MD_LINK_(\d+)___/g, (_, idx) => links[parseInt(idx, 10)] || "");

  return text;
}

export function renderMarkdownTable(rows: string[]) {
  if (rows.length < 2) return rows.join("\n");
  const cleanRows = rows.map((r) =>
    r
      .trim()
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split("|")
      .map((cell) => cell.trim()),
  );

  const headers = cleanRows[0];
  const bodyRows = cleanRows.slice(2);

  const headerHtml = `<thead><tr>${headers.map((h) => `<th>${inlineMarkdown(h)}</th>`).join("")}</tr></thead>`;
  const bodyHtml = `<tbody>${bodyRows
    .map(
      (row) =>
        `<tr>${row.map((cell) => `<td>${inlineMarkdown(cell)}</td>`).join("")}</tr>`,
    )
    .join("")}</tbody>`;

  return `<div class="md-table-wrapper"><table class="md-table">${headerHtml}${bodyHtml}</table></div>`;
}

export function markdownHtml(markdown: string) {
  if (!markdown) return "";

  let text = markdown.replace(/\r\n/g, "\n").trim();

  // Code blocks
  const codeBlocks: string[] = [];
  text = text.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    const idx = codeBlocks.length;
    const cleanLang = lang || "code";
    const rawCode = code.trim();
    const escapedCode = escapeHtml(rawCode);
    codeBlocks.push(
      `<div class="md-code-block">` +
        `<div class="md-code-header">` +
          `<span class="md-code-lang">${escapeHtml(cleanLang)}</span>` +
          `<button class="md-code-copy" onclick="navigator.clipboard.writeText(\`${rawCode.replace(/`/g, "\\`").replace(/\$/g, "\\$")}\`).then(() => { this.innerText='Copied!'; setTimeout(() => this.innerText='Copy', 2000); })">Copy</button>` +
        `</div>` +
        `<pre><code>${escapedCode}</code></pre>` +
      `</div>`,
    );
    return `___CODE_BLOCK_${idx}___`;
  });

  // Table handling
  const lines = text.split("\n");
  const processedLines: string[] = [];
  let inTable = false;
  let tableRows: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim().startsWith("|") && line.trim().endsWith("|")) {
      if (!inTable) {
        inTable = true;
        tableRows = [];
      }
      tableRows.push(line);
    } else {
      if (inTable) {
        processedLines.push(renderMarkdownTable(tableRows));
        inTable = false;
        tableRows = [];
      }
      processedLines.push(line);
    }
  }
  if (inTable) {
    processedLines.push(renderMarkdownTable(tableRows));
  }

  text = processedLines.join("\n");

  const blocks = text.split(/\n{2,}/);

  return (
    blocks
      .filter(Boolean)
      .map((block) => {
        const trimmed = block.trim();

        if (trimmed.startsWith("___CODE_BLOCK_") && trimmed.endsWith("___")) {
          const idx = parseInt(trimmed.replace("___CODE_BLOCK_", "").replace("___", ""), 10);
          return codeBlocks[idx] || "";
        }

        if (trimmed.startsWith('<div class="md-table-wrapper">')) {
          return trimmed;
        }

        const h1Match = trimmed.match(/^#\s+(.+)$/m);
        if (h1Match) return `<h1 class="md-h1">${inlineMarkdown(h1Match[1])}</h1>`;

        const h2Match = trimmed.match(/^##\s+(.+)$/m);
        if (h2Match) return `<h2 class="md-h2">${inlineMarkdown(h2Match[1])}</h2>`;

        const h3Match = trimmed.match(/^###\s+(.+)$/m);
        if (h3Match) return `<h3 class="md-h3">${inlineMarkdown(h3Match[1])}</h3>`;

        const h4Match = trimmed.match(/^####\s+(.+)$/m);
        if (h4Match) return `<h4 class="md-h4">${inlineMarkdown(h4Match[1])}</h4>`;

        if (/^---+$/.test(trimmed)) return `<hr class="md-hr" />`;

        if (trimmed.startsWith(">")) {
          const quoteContent = trimmed
            .split("\n")
            .map((l) => l.replace(/^>\s?/, ""))
            .join("<br />");
          return `<blockquote class="md-blockquote">${inlineMarkdown(quoteContent)}</blockquote>`;
        }

        const blockLines = trimmed.split("\n");
        if (blockLines.every((l) => /^[-*]\s+/.test(l.trim()))) {
          return `<ul class="md-ul">${blockLines.map((l) => `<li>${inlineMarkdown(l.trim().replace(/^[-*]\s+/, ""))}</li>`).join("")}</ul>`;
        }
        if (blockLines.every((l) => /^\d+\.\s+/.test(l.trim()))) {
          return `<ol class="md-ol">${blockLines.map((l) => `<li>${inlineMarkdown(l.trim().replace(/^\d+\.\s+/, ""))}</li>`).join("")}</ol>`;
        }

        return `<p class="md-p">${inlineMarkdown(trimmed)}</p>`;
      })
      .join("") || "<p></p>"
  );
}
