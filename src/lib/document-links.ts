/** Only ordinary public web/mail links become document annotations. */
export function documentLinks(text: string) {
  return [
    ...text.matchAll(
      /https?:\/\/[^\s<>]+|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,
    ),
  ].flatMap((match) => {
    const label = match[0].replace(/[.,;!?)]*$/, "");
    try {
      const url = label.includes("://")
        ? new URL(label)
        : new URL("mailto:" + label);
      if (
        !["https:", "http:", "mailto:"].includes(url.protocol) ||
        url.username ||
        url.password
      )
        return [];
      return [{ text: label, url: url.href, index: match.index! }];
    } catch {
      return [];
    }
  });
}
