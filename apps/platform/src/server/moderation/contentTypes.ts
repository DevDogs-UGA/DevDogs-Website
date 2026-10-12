const CONTENT_TYPE = /^[a-z][a-z0-9_]{0,62}$/;

export interface DeclaredContentType {
  contentType: string;
  label: string;
  urlTemplate: string | null;
}

export type ParsedContentTypes =
  { ok: true; types: DeclaredContentType[] } | { ok: false; message: string };

/**
 * One content type per line: `type | Label | https://app.example/{ref}`. The
 * URL template is optional, and `{ref}` stands for the content reference.
 */
export function parseContentTypes(text: string): ParsedContentTypes {
  const types: DeclaredContentType[] = [];
  const seen = new Set<string>();
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const [contentType = "", label = "", urlTemplate = ""] = line
      .split("|")
      .map((part) => part.trim());
    if (!CONTENT_TYPE.test(contentType)) {
      return {
        ok: false,
        message: `"${contentType}" is not a content type: lowercase letters, digits and underscores`,
      };
    }
    if (seen.has(contentType)) {
      return { ok: false, message: `"${contentType}" is declared twice` };
    }
    seen.add(contentType);
    if (!label) {
      return { ok: false, message: `"${contentType}" needs a label` };
    }
    if (urlTemplate && !urlTemplate.startsWith("https://")) {
      return {
        ok: false,
        message: `The link for "${contentType}" must start with https://`,
      };
    }
    types.push({ contentType, label, urlTemplate: urlTemplate || null });
  }
  if (types.length === 0) {
    return { ok: false, message: "Declare at least one content type" };
  }
  return { ok: true, types };
}
