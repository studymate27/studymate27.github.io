// 테스트용 주간 행(legacy 모양) 생성 도우미
export const week = (study, start, bonus, dayOff = []) => ({
    study_done_list: study,
    start_done_list: start,
    bonus_done_list: bonus,
    time_done_list: [0, 1, 2, 3, 4, 5, 6].map(i => dayOff.includes(i)),
});

export const N = null;
export const T = true;
export const F = false;
export const empty = () => [N, N, N, N, N, N, N];

// 재현 가능한 난수 (mulberry32)
export function seeded(seed) {
    return function () {
        seed |= 0; seed = seed + 0x6D2B79F5 | 0;
        let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}
