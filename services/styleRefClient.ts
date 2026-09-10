// A handful of curated thumbnail references bundled locally — used as a
// style/composition reference for thumbnail generation.
const LOCAL_FALLBACK_REFS = Object.values(
  import.meta.glob('../assets/thumbnailStyleRefs/*.jpg', { eager: true, query: '?url', import: 'default' })
) as string[];

const blobToBase64 = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });

const fetchAsReference = async (url: string): Promise<{ data: string; mimeType: string } | null> => {
  const res = await fetch(url);
  if (!res.ok) return null;
  const blob = await res.blob();
  return { data: await blobToBase64(blob), mimeType: blob.type || 'image/jpeg' };
};

// Picks a random curated reference thumbnail from the bundled local set,
// ready to hand to generateThumbnail's `referenceImage` param.
export const fetchRandomStyleReference = async (): Promise<{ data: string; mimeType: string } | null> => {
  if (!LOCAL_FALLBACK_REFS.length) return null;
  try {
    const url = LOCAL_FALLBACK_REFS[Math.floor(Math.random() * LOCAL_FALLBACK_REFS.length)];
    return await fetchAsReference(url);
  } catch (e) {
    console.error('Failed to load local style reference', e);
    return null;
  }
};
