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

// Picks a random curated reference thumbnail (preferring ones with a visible
// face, since that best matches "dramatic scene + host face" compositions)
// and returns it as a base64 image ready to hand to generateThumbnail's
// `referenceImage` param. Best-effort — returns null on any failure so
// callers can fall back to generating without a reference.
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
    if (error || !rows?.length) return null;

    const withFace = (rows as StyleImageRow[]).filter(r => r.meta?.has_face);
    const pool = withFace.length ? withFace : (rows as StyleImageRow[]);
    const pick = pool[Math.floor(Math.random() * pool.length)];

    const url = `${STYLE_REF_URL}/storage/v1/object/public/${STYLE_REF_BUCKET}/${pick.path}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    const mimeType = blob.type || 'image/jpeg';
    const data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve((reader.result as string).split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    return { data, mimeType };
  } catch (e) {
    console.error('Failed to fetch style reference image', e);
    return null;
  }
};
