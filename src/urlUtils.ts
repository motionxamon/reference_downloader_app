const urlPattern = /https?:\/\/[^\s<>"']+/gi;

function cleanUrlCandidate(value: string) {
  return value
    .trim()
    .replace(/[)\]\}>,.;:!]+$/g, "");
}

export function extractUrls(value: string) {
  const matches = value.match(urlPattern) || [];
  const urls = matches
    .map(cleanUrlCandidate)
    .filter((item) => {
      try {
        const url = new URL(item);
        return url.protocol === "http:" || url.protocol === "https:";
      } catch {
        return false;
      }
    });

  return Array.from(new Set(urls));
}
