import { createClient } from '@supabase/supabase-js';

// Read-only reference into a sister project's curated library of real,
// high-performing YouTube thumbnails (admin-curated, publicly readable by
// design — RLS explicitly allows `user_id IS NULL` rows to anon). Used only
// as a style/composition reference for thumbnail generation, never modified
// from here.
const STYLE_REF_URL = 'https://vowgdlbvundorxwjdntu.supabase.co';
const STYLE_REF_ANON_KEY = 'sb_publishable_8b-sv6g_bPqHRtL1LBin2g_f-yB_zAa';
const STYLE_REF_BUCKET = 'styles';

const styleRefClient = createClient(STYLE_REF_URL, STYLE_REF_ANON_KEY);

interface StyleImageRow {
  path: string;
  meta: { has_face?: boolean } | null;
}

// A handful of the same curated thumbnails bundled locally — used only if the
// sister project is unreachable, so this feature doesn't hard-depend on an
// external project staying up.
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

const fetchLocalFallback = async (): Promise<{ data: string; mimeType: string } | null> => {
  if (!LOCAL_FALLBACK_REFS.length) return null;
  try {
    const url = LOCAL_FALLBACK_REFS[Math.floor(Math.random() * LOCAL_FALLBACK_REFS.length)];
    return await fetchAsReference(url);
  } catch (e) {
    console.error('Failed to load local fallback style reference', e);
    return null;
  }
};

// Picks a random curated reference thumbnail (preferring ones with a visible
// face, since that best matches "dramatic scene + host face" compositions)
// and returns it as a base64 image ready to hand to generateThumbnail's
// `referenceImage` param. Best-effort — falls back to a small bundled local
// set if the sister project is unreachable, and returns null only if both fail.
export const fetchRandomStyleReference = async (): Promise<{ data: string; mimeType: string } | null> => {
  try {
    const { data: rows, error } = await styleRefClient
      .from('style_images')
      .select('path, meta')
      .like('path', 'admin/%')
      .eq('active', true)
      .eq('show_in_picker', true)
      .is('user_id', null)
      .limit(200);
    if (error || !rows?.length) return await fetchLocalFallback();

    const withFace = (rows as StyleImageRow[]).filter(r => r.meta?.has_face);
    const pool = withFace.length ? withFace : (rows as StyleImageRow[]);
    const pick = pool[Math.floor(Math.random() * pool.length)];

    const url = `${STYLE_REF_URL}/storage/v1/object/public/${STYLE_REF_BUCKET}/${pick.path}`;
    const result = await fetchAsReference(url);
    return result ?? (await fetchLocalFallback());
  } catch (e) {
    console.error('Failed to fetch style reference image, trying local fallback', e);
    return await fetchLocalFallback();
  }
};
