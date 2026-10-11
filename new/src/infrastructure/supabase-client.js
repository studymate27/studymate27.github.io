import { createClient } from "@supabase/supabase-js";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "../application/settings.js";

export function createSupabaseClient() {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
        console.error("Supabase 환경변수(VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY)가 없습니다.");
        return null;
    }
    return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { flowType: "pkce" },
    });
}
