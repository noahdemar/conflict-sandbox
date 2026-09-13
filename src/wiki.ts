/** Fetch the main image for a Wikipedia article (REST summary API). */
export async function fetchWikiImage(
  title: string,
): Promise<{ imageUrl: string; wikiTitle: string } | null> {
  try {
    const res = await fetch(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`,
    );
    if (!res.ok) return null;
    const data = await res.json();
    const src = data?.originalimage?.source ?? data?.thumbnail?.source;
    if (!src) return null;
    return { imageUrl: src, wikiTitle: data?.title ?? title };
  } catch {
    return null;
  }
}
