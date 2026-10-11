// 로그인 전에 열었던 주소(주로 초대 링크)를 기억한다.
// 인증 메일은 새 탭에서 열리는 경우가 많아 sessionStorage가 아니라 localStorage에 둔다.

const KEY = "studymate:returnTo";
const TTL = 24 * 60 * 60 * 1000;

export function createReturnToStore(storage, now = Date.now) {
    const safe = fn => { try { return fn(); } catch { return null; } };
    return {
        save(hash) {
            if (!String(hash).startsWith("#/")) return;
            safe(() => storage.setItem(KEY, JSON.stringify({ hash, at: now() })));
        },
        get() {
            const saved = safe(() => JSON.parse(storage.getItem(KEY)));
            if (!saved || !String(saved.hash).startsWith("#/") || now() - saved.at > TTL) return null;
            return saved.hash;
        },
        clear() {
            safe(() => storage.removeItem(KEY));
        },
    };
}

export const returnTo = createReturnToStore(globalThis.localStorage ?? {
    getItem: () => null, setItem: () => {}, removeItem: () => {},
});
