import { SUPABASE_ANON_KEY, SUPABASE_URL } from "../application/settings.js";

export function createSupabaseClient() {
    try {
        if (window.supabase && typeof window.supabase.createClient === "function") {
            return window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        }
    } catch(e) {
        console.error("Supabase 로드 실패:", e);
    }
    return null;
}

function waitForSupabaseLib(timeoutMs = 4000, intervalMs = 150) {
    return new Promise(resolve => {
        const start = Date.now();
        (function check() {
            if (window.supabase && typeof window.supabase.createClient === "function") {
                resolve(true);
            } else if (Date.now() - start > timeoutMs) {
                resolve(false);
            } else {
                setTimeout(check, intervalMs);
            }
        })();
    });
}

function injectScript(src) {
    return new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = src;
        s.onload = () => resolve(true);
        s.onerror = () => reject(new Error("로드 실패: " + src));
        document.head.appendChild(s);
    });
}

export async function ensureSupabaseLib() {
    let ready = await waitForSupabaseLib(4000);
    if (ready) return true;

    console.warn("jsdelivr에서 Supabase 로드 지연/실패 - unpkg으로 재시도합니다.");
    try {
        await injectScript("https://unpkg.com/@supabase/supabase-js@2");
        ready = await waitForSupabaseLib(4000);
        if (ready) return true;
    } catch (e) {
        console.warn(e.message);
    }
    return false;
}
