import { createClient } from "@supabase/supabase-js";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "../application/settings.js";

export function createSupabaseClient() {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
        console.error("Supabase 환경변수(VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY)가 없습니다.");
        return null;
    }
    return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        // 메일 링크·구글 로그인이 ?code= 로 돌아오게 해서 해시 라우터(#/...)와 겹치지 않게 한다
        auth: { flowType: "pkce" },
    });
}

export const supabase = createSupabaseClient();
