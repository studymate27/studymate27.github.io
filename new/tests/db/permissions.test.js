// 권한 규칙이 DB에서 강제되는지 확인한다 (화면이 아니라 DB가 막아야 함).
// A = 방장, B = 멤버, C = 외부인
import { execSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import WebSocket from "ws";

// Node 20에는 기본 WebSocket이 없어 supabase-js가 요구함 (realtime은 쓰지 않음)
globalThis.WebSocket ??= WebSocket;

const env = Object.fromEntries(
    execSync("npx supabase status -o env", { encoding: "utf8" })
        .split("\n")
        .map(line => line.match(/^(\w+)="?(.*?)"?$/))
        .filter(Boolean)
        .map(([, key, value]) => [key, value]),
);
const URL = env.API_URL;
const ANON = env.ANON_KEY;
const SERVICE = env.SERVICE_ROLE_KEY;
const options = { auth: { persistSession: false, autoRefreshToken: false } };

const admin = createClient(URL, SERVICE, options);
const anon = createClient(URL, ANON, options);

async function makeUser(label) {
    const email = `${label}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@test.local`;
    const password = "password-1234";
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw error;
    const client = createClient(URL, ANON, options);
    const { error: signInError } = await client.auth.signInWithPassword({ email, password });
    if (signInError) throw signInError;
    return { id: data.user.id, email, client };
}

const ok = ({ data, error }) => {
    if (error) throw new Error(`예상치 못한 오류: ${error.message}`);
    return data;
};
const rpc = (user, fn, args) => user.client.rpc(fn, args);
const record = (gid, uid, date, values = {}) =>
    ({ group_id: gid, user_id: uid, date, study_done: false, start_done: true, ...values });

let A, B, C, gid, code;

beforeAll(async () => {
    [A, B, C] = await Promise.all([makeUser("a"), makeUser("b"), makeUser("c")]);
    gid = ok(await rpc(A, "create_group", { p_name: "테스트 그룹", p_nickname: "에이" }));
    code = ok(await A.client.from("groups").select("invite_code").eq("id", gid).single()).invite_code;
    ok(await rpc(B, "join_group", { p_code: code.toLowerCase(), p_nickname: "비" }));
});

describe("그룹 만들기·가입", () => {
    it("만든 사람은 방장, 초대 코드로 들어온 사람은 멤버", async () => {
        const members = ok(await A.client.from("group_members").select("user_id, role, nickname, sort_order").eq("group_id", gid).order("sort_order"));
        expect(members).toEqual([
            expect.objectContaining({ user_id: A.id, role: "admin", nickname: "에이", sort_order: 0 }),
            expect.objectContaining({ user_id: B.id, role: "member", nickname: "비", sort_order: 1 }),
        ]);
    });

    it("초대 코드는 8자리 대문자·숫자", () => {
        expect(code).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
    });

    it("이미 가입한 그룹에 다시 가입해도 오류 없이 같은 그룹", async () => {
        expect(ok(await rpc(B, "join_group", { p_code: code, p_nickname: "비" }))).toBe(gid);
    });

    it("잘못된 초대 코드는 거부", async () => {
        const { error } = await rpc(C, "join_group", { p_code: "WRONG123", p_nickname: "씨" });
        expect(error.message).toBe("invalid_invite_code");
    });

    it("닉네임이 비어 있으면 거부", async () => {
        const { error } = await rpc(C, "create_group", { p_name: "x", p_nickname: "  " });
        expect(error.message).toBe("invalid_nickname");
    });

    it("초대 미리보기는 코드를 아는 로그인 사용자만", async () => {
        expect(ok(await rpc(C, "preview_invite", { p_code: code }))).toEqual([
            { group_id: gid, group_name: "테스트 그룹", member_count: 2 },
        ]);
        expect(ok(await rpc(C, "preview_invite", { p_code: "WRONG123" }))).toEqual([]);
        expect((await rpc({ client: anon }, "preview_invite", { p_code: code })).error).toBeTruthy();
    });
});

describe("다른 그룹 데이터 차단", () => {
    it("외부인은 그룹·멤버·기록을 볼 수 없다", async () => {
        ok(await A.client.from("daily_records").upsert(record(gid, A.id, "2026-10-05")));
        for (const table of ["groups", "group_members", "daily_records", "group_ddays", "fine_payments"]) {
            const column = table === "groups" ? "id" : "group_id";
            expect(ok(await C.client.from(table).select("*").eq(column, gid))).toEqual([]);
        }
    });

    it("로그인하지 않으면 아무것도 볼 수 없다", async () => {
        const { data, error } = await anon.from("groups").select("*");
        expect(error ?? data).toBeTruthy();
        expect(data ?? []).toEqual([]);
    });

    it("다른 사람의 프로필(이메일)은 볼 수 없다", async () => {
        expect(ok(await B.client.from("profiles").select("*").eq("id", A.id))).toEqual([]);
        expect(ok(await B.client.from("profiles").select("email").eq("id", B.id))).toEqual([{ email: B.email }]);
    });
});

describe("자율 모드 (기본)", () => {
    it("멤버는 본인 기록을 쓸 수 있다", async () => {
        ok(await B.client.from("daily_records").upsert(record(gid, B.id, "2026-10-06")));
        ok(await B.client.from("daily_records").upsert(record(gid, B.id, "2026-10-06", { study_done: true })));
        const row = ok(await A.client.from("daily_records").select("study_done, updated_by").match({ group_id: gid, user_id: B.id, date: "2026-10-06" }).single());
        expect(row).toEqual({ study_done: true, updated_by: B.id });
    });

    it("멤버는 다른 사람 기록을 쓸 수 없다", async () => {
        const { error } = await B.client.from("daily_records").upsert(record(gid, A.id, "2026-10-07"));
        expect(error).toBeTruthy();
    });

    it("방장은 멤버 기록을 쓸 수 있고, 수정자는 방장으로 남는다", async () => {
        ok(await A.client.from("daily_records").upsert({ ...record(gid, B.id, "2026-10-07"), updated_by: B.id }));
        const row = ok(await B.client.from("daily_records").select("updated_by").match({ group_id: gid, user_id: B.id, date: "2026-10-07" }).single());
        expect(row.updated_by).toBe(A.id);
    });

    it("멤버는 본인 요일별 시작 시간을 바꿀 수 있고 남의 것은 못 바꾼다", async () => {
        ok(await B.client.from("member_day_targets").upsert({ group_id: gid, user_id: B.id, weekday: 0, start_time: "09:00" }));
        const { error } = await B.client.from("member_day_targets").upsert({ group_id: gid, user_id: A.id, weekday: 0, start_time: "09:00" });
        expect(error).toBeTruthy();
    });

    it("외부인은 그룹에 기록을 쓸 수 없다", async () => {
        const { error } = await C.client.from("daily_records").upsert(record(gid, C.id, "2026-10-06"));
        expect(error).toBeTruthy();
    });
});

describe("방장 관리 모드", () => {
    beforeAll(async () => {
        ok(await A.client.from("groups").update({ edit_mode: "admin_only" }).eq("id", gid));
    });

    it("멤버는 본인 기록도 쓸 수 없다", async () => {
        const { error } = await B.client.from("daily_records").upsert(record(gid, B.id, "2026-10-08"));
        expect(error).toBeTruthy();
        const del = await B.client.from("daily_records").delete().match({ group_id: gid, user_id: B.id, date: "2026-10-06" }).select();
        expect(del.data ?? []).toEqual([]);
    });

    it("멤버는 조회는 할 수 있다", async () => {
        expect(ok(await B.client.from("daily_records").select("date").eq("group_id", gid)).length).toBeGreaterThan(0);
    });

    it("방장은 멤버 기록을 쓸 수 있다", async () => {
        ok(await A.client.from("daily_records").upsert(record(gid, B.id, "2026-10-08")));
    });

    afterAll(async () => {
        ok(await A.client.from("groups").update({ edit_mode: "self" }).eq("id", gid));
    });
});

describe("그룹 설정·디데이 (방장만)", () => {
    it("멤버가 설정을 바꾸려 하면 반영되지 않는다", async () => {
        await B.client.from("groups").update({ fine_unit: 1 }).eq("id", gid);
        expect(ok(await A.client.from("groups").select("fine_unit").eq("id", gid).single()).fine_unit).toBe(500);
    });

    it("방장은 설정을 바꿀 수 있다 (상점 끄기 포함)", async () => {
        ok(await A.client.from("groups").update({ fine_unit: 1000, bonus_enabled: false }).eq("id", gid));
        expect(ok(await B.client.from("groups").select("fine_unit, bonus_enabled").eq("id", gid).single()))
            .toEqual({ fine_unit: 1000, bonus_enabled: false });
    });

    it("초대 코드는 테이블에서 직접 바꿀 수 없다", async () => {
        const { error } = await A.client.from("groups").update({ invite_code: "AAAAAAAA" }).eq("id", gid);
        expect(error).toBeTruthy();
    });

    it("멤버는 디데이를 추가할 수 없다", async () => {
        const { error } = await B.client.from("group_ddays").insert({ group_id: gid, label: "수능", target_date: "2026-11-19" });
        expect(error).toBeTruthy();
    });

    it("디데이는 3개까지", async () => {
        for (const label of ["수능", "모의고사", "기말"]) {
            ok(await A.client.from("group_ddays").insert({ group_id: gid, label, target_date: "2026-11-19" }));
        }
        const { error } = await A.client.from("group_ddays").insert({ group_id: gid, label: "넷째", target_date: "2026-12-01" });
        expect(error.message).toBe("dday_limit");
    });
});

describe("멤버 정보", () => {
    it("본인 닉네임은 바꿀 수 있고 남의 닉네임은 못 바꾼다", async () => {
        ok(await B.client.from("group_members").update({ nickname: "비비" }).match({ group_id: gid, user_id: B.id }));
        await B.client.from("group_members").update({ nickname: "해킹" }).match({ group_id: gid, user_id: A.id });
        const members = ok(await A.client.from("group_members").select("user_id, nickname").eq("group_id", gid));
        expect(members.find(m => m.user_id === B.id).nickname).toBe("비비");
        expect(members.find(m => m.user_id === A.id).nickname).toBe("에이");
    });

    it("본인 역할을 테이블에서 직접 바꿀 수 없다", async () => {
        const { error } = await B.client.from("group_members").update({ role: "admin" }).match({ group_id: gid, user_id: B.id });
        expect(error).toBeTruthy();
    });

    it("멤버는 역할 변경·초대 코드 재발급·내보내기·순서 변경을 할 수 없다", async () => {
        for (const [fn, args] of [
            ["set_member_role", { gid, target: B.id, new_role: "admin" }],
            ["regenerate_invite_code", { gid }],
            ["remove_member", { gid, target: A.id }],
            ["reorder_members", { gid, user_ids: [B.id, A.id] }],
        ]) {
            expect((await rpc(B, fn, args)).error?.message).toBe("not_admin");
        }
    });

    it("방장은 카드 순서를 바꿀 수 있다", async () => {
        ok(await rpc(A, "reorder_members", { gid, user_ids: [B.id, A.id] }));
        const members = ok(await B.client.from("group_members").select("user_id").eq("group_id", gid).order("sort_order"));
        expect(members.map(m => m.user_id)).toEqual([B.id, A.id]);
    });
});

describe("벌금 납부 (방장만)", () => {
    it("멤버는 납부 처리할 수 없다", async () => {
        const { error } = await B.client.from("fine_payments").insert({ group_id: gid, user_id: B.id, settled_through_week: "2026-10-05" });
        expect(error).toBeTruthy();
    });

    it("방장은 납부 처리·취소할 수 있다", async () => {
        ok(await A.client.from("fine_payments").insert({ group_id: gid, user_id: B.id, settled_through_week: "2026-10-05", amount: 1000 }));
        expect(ok(await B.client.from("fine_payments").select("recorded_by").eq("group_id", gid))).toEqual([{ recorded_by: A.id }]);
        ok(await A.client.from("fine_payments").delete().match({ group_id: gid, user_id: B.id }));
    });

    it("정산 주는 월요일이어야 한다", async () => {
        const { error } = await A.client.from("fine_payments").insert({ group_id: gid, user_id: B.id, settled_through_week: "2026-10-07" });
        expect(error).toBeTruthy();
    });
});

describe("방장 지정·양도·탈퇴", () => {
    it("유일한 방장은 스스로 내려가거나 나갈 수 없다", async () => {
        expect((await rpc(A, "set_member_role", { gid, target: A.id, new_role: "member" })).error.message).toBe("last_admin");
        expect((await rpc(A, "leave_group", { gid })).error.message).toBe("last_admin");
    });

    it("방장을 여러 명 둘 수 있다", async () => {
        ok(await rpc(A, "set_member_role", { gid, target: B.id, new_role: "admin" }));
        ok(await B.client.from("groups").update({ fine_unit: 700 }).eq("id", gid));
        expect(ok(await A.client.from("groups").select("fine_unit").eq("id", gid).single()).fine_unit).toBe(700);
        ok(await rpc(A, "set_member_role", { gid, target: B.id, new_role: "member" }));
    });

    it("방장 양도: 대상은 방장, 나는 멤버가 된다", async () => {
        ok(await rpc(A, "transfer_admin", { gid, target: B.id }));
        const roles = Object.fromEntries(ok(await A.client.from("group_members").select("user_id, role").eq("group_id", gid)).map(m => [m.user_id, m.role]));
        expect(roles).toEqual({ [A.id]: "member", [B.id]: "admin" });
        expect((await rpc(A, "regenerate_invite_code", { gid })).error.message).toBe("not_admin");
    });

    it("초대 코드를 재발급하면 옛 코드는 쓸 수 없다", async () => {
        const newCode = ok(await rpc(B, "regenerate_invite_code", { gid }));
        expect(newCode).not.toBe(code);
        expect((await rpc(C, "join_group", { p_code: code, p_nickname: "씨" })).error.message).toBe("invalid_invite_code");
        expect(ok(await rpc(C, "join_group", { p_code: newCode, p_nickname: "씨" }))).toBe(gid);
    });

    it("방장은 멤버를 내보낼 수 있고, 나간 멤버의 기록은 그룹에 남는다", async () => {
        ok(await C.client.from("daily_records").upsert(record(gid, C.id, "2026-10-09")));
        ok(await rpc(B, "remove_member", { gid, target: C.id }));
        expect(ok(await C.client.from("groups").select("id").eq("id", gid))).toEqual([]);
        expect(ok(await B.client.from("daily_records").select("user_id").match({ group_id: gid, user_id: C.id })).length).toBe(1);
    });

    it("마지막 멤버가 나가면 그룹이 삭제된다", async () => {
        ok(await rpc(A, "leave_group", { gid }));
        ok(await rpc(B, "leave_group", { gid }));
        const { data } = await admin.from("groups").select("id").eq("id", gid);
        expect(data).toEqual([]);
    });
});
