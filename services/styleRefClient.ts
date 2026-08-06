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
  name: string | null;
  meta: { has_face?: boolean; niche?: string; keywords?: string[]; summary?: string; composition?: string } | null;
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

// ─────────────────────────────────────────────────────────────────────────────
// Topic-matched style pick — mirrors the sister project's own YouTube
// auto-match flow (match a topic to the best-fitting curated thumbnail),
// except that project's vector-search RPC is locked to its own service-role
// key (see its migrations 0014/0019), so it can't be called from here. This
// fetches the same public metadata instead (rich per-image `meta` JSON —
// niche/keywords/summary/composition — already anon-readable via RLS) and
// lets the caller rank it with an LLM, then picks a real image by path.
// ─────────────────────────────────────────────────────────────────────────────

let poolCache: StyleImageRow[] | null = null;

export interface StylePoolEntry { path: string; name: string | null; meta: StyleImageRow['meta'] }

// Metadata only (no image bytes) — cheap enough to hand the whole pool to an
// LLM for topic ranking. Cached for the session since the pool rarely changes.
export const fetchStylePoolMeta = async (): Promise<StylePoolEntry[]> => {
  if (poolCache) return poolCache;
  try {
    const { data: rows, error } = await styleRefClient
      .from('style_images')
      .select('path, name, meta')
      .like('path', 'admin/%')
      .eq('active', true)
      .eq('show_in_picker', true)
      .is('user_id', null)
      .limit(200);
    if (error || !rows?.length) return [];
    poolCache = rows as StyleImageRow[];
    return poolCache;
  } catch (e) {
    console.error('Failed to fetch style pool metadata', e);
    return [];
  }
};

// Fetches the actual image bytes for one pool entry, chosen after ranking.
export const fetchStyleImageByPath = async (path: string): Promise<{ data: string; mimeType: string } | null> => {
  try {
    const url = `${STYLE_REF_URL}/storage/v1/object/public/${STYLE_REF_BUCKET}/${path}`;
    return await fetchAsReference(url);
  } catch (e) {
    console.error('Failed to fetch style reference image by path', e);
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
