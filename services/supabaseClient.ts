import { createClient } from '@supabase/supabase-js';

// Publishable (anon) key — safe to ship in client bundle. RLS on the tables/
// bucket this app touches is intentionally open (no login flow, single project).
const SUPABASE_URL = 'https://jsqdhgdedizsuunemdhh.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_dDM_WFO_-YKS5lt3WFvBZQ_jDK8Ie6B';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export const ASSETS_BUCKET = 'project-assets';
export const PROJECT_ROW_ID = 'default';
