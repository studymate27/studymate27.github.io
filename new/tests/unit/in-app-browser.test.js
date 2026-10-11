import { describe, expect, it } from "vitest";
import { detectInAppBrowser, externalOpenUrl } from "../../src/application/in-app-browser.js";

const UA = {
    kakaoIos: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 KAKAOTALK 10.8.5",
    kakaoAndroid: "Mozilla/5.0 (Linux; Android 14; SM-S918N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36 KAKAOTALK/10.8.5",
    instagram: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 350.0.0",
    naverAndroid: "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36 NAVER(inapp; search; 2000; 12.10.1)",
    lineIos: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Line/14.0.0",
    safari: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
    chromeAndroid: "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36",
    desktop: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36",
};

describe("detectInAppBrowser", () => {
    it.each([
        ["kakaoIos", { app: "kakao", os: "ios" }],
        ["kakaoAndroid", { app: "kakao", os: "android" }],
        ["instagram", { app: "instagram", os: "ios" }],
        ["naverAndroid", { app: "naver", os: "android" }],
        ["lineIos", { app: "line", os: "ios" }],
        ["safari", null],
        ["chromeAndroid", null],
        ["desktop", null],
    ])("%s", (key, expected) => {
        expect(detectInAppBrowser(UA[key])).toEqual(expected);
    });
});

describe("externalOpenUrl", () => {
    const url = "https://studymate27.github.io/app/#/join/AB23CD45";

    it("카카오톡은 외부 브라우저 열기 주소를 쓴다", () => {
        expect(externalOpenUrl({ app: "kakao", os: "ios" }, url))
            .toBe("kakaotalk://web/openExternal?url=" + encodeURIComponent(url));
    });

    it("안드로이드의 다른 앱은 크롬으로 여는 intent 주소", () => {
        expect(externalOpenUrl({ app: "instagram", os: "android" }, url))
            .toBe("intent://studymate27.github.io/app/#/join/AB23CD45#Intent;scheme=https;package=com.android.chrome;end");
    });

    it("iOS의 다른 앱은 자동으로 열 방법이 없어 null (안내 문구로 처리)", () => {
        expect(externalOpenUrl({ app: "instagram", os: "ios" }, url)).toBeNull();
    });
});
