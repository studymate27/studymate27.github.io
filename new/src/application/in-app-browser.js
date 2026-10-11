// 카톡·인스타 등 앱 안의 브라우저에서는 구글이 로그인을 막는다(disallowed_useragent).
// 이런 환경을 알아내 외부 브라우저로 여는 방법을 안내한다.

const APPS = [
    ["kakao", /KAKAOTALK/i],
    ["naver", /NAVER\(inapp/i],
    ["instagram", /Instagram/i],
    ["facebook", /FBAN|FBAV|FB_IAB/i],
    ["line", /\bLine\//i],
    ["daum", /DaumApps/i],
    ["band", /BAND\//i],
    ["everytime", /everytimeApp/i],
];

export function detectInAppBrowser(userAgent) {
    const ua = String(userAgent ?? "");
    const found = APPS.find(([, pattern]) => pattern.test(ua));
    if (!found) return null;
    const os = /Android/i.test(ua) ? "android" : /iPhone|iPad|iPod/i.test(ua) ? "ios" : "other";
    return { app: found[0], os };
}

/** 외부 브라우저로 바로 여는 주소. 방법이 없으면 null */
export function externalOpenUrl(inApp, url) {
    if (!inApp) return null;
    if (inApp.app === "kakao") return `kakaotalk://web/openExternal?url=${encodeURIComponent(url)}`;
    if (inApp.os === "android") {
        return `intent://${url.replace(/^https?:\/\//, "")}#Intent;scheme=https;package=com.android.chrome;end`;
    }
    return null;
}
