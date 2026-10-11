// 화면에서 쓰는 조회 모양(groups-repo.js)이 실제 스키마·권한에서 동작하는지 확인
import { execSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";
import WebSocket from "ws";

globalThis.WebSocket ??= WebSocket;

const env = Object.fromEntries(
    execSync("npx supabase status -o env", { encoding: "utf8" })
        .split("\n").map(l => l.match(/^(\w+)="?(.*?)"?$/)).filter(Boolean).map(([, k, v]) => [k, v]),
);
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(env.API_URL, env.SERVICE_ROLE_KEY, options);

async function makeUser(label) {
    const email = `${label}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@test.local`;
    const { data } = await admin.auth.admin.createUser({ email, password: "password-1234", email_confirm: true });
    const client = createClient(env.API_URL, env.ANON_KEY, options);
    await client.auth.signInWithPassword({ email, password: "password-1234" });
    return { id: data.user.id, client };
}
const ok = ({ data, error }) => { if (error) throw new Error(error.message); return data; };

let A, B, g1, g2;

beforeAll(async () => {
    [A, B] = await Promise.all([makeUser("qa"), makeUser("qb")]);
    g1 = ok(await A.client.rpc("create_group", { p_name: "첫 그룹", p_nickname: "에이" }));
    g2 = ok(await B.client.rpc("create_group", { p_name: "둘째 그룹", p_nickname: "비" }));
    const code = ok(await A.client.from("groups").select("invite_code").eq("id", g1).single()).invite_code;
    ok(await B.client.rpc("join_group", { p_code: code, p_nickname: "비" }));
    ok(await A.client.from("group_ddays").insert({ group_id: g1, label: "수능", target_date: "2026-11-19" }));
});

describe("내 그룹 목록 조회", () => {
    it("내가 속한 그룹만, 역할과 멤버 수를 함께 가져온다", async () => {
        const rows = ok(await B.client.from("group_members")
            .select("role, nickname, joined_at, groups(id, name, group_members(count))")
            .eq("user_id", B.id).order("joined_at", { ascending: true }));
        expect(rows.map(r => [r.groups.name, r.role, r.groups.group_members[0].count])).toEqual([
            ["둘째 그룹", "admin", 1],
            ["첫 그룹", "member", 2],
        ]);
    });

    it("A는 B가 만든 그룹을 목록에서 볼 수 없다", async () => {
        const rows = ok(await A.client.from("group_members").select("groups(id)").eq("user_id", A.id));
        expect(rows.map(r => r.groups.id)).toEqual([g1]);
        expect(ok(await A.client.from("groups").select("id").eq("id", g2).maybeSingle())).toBeNull();
    });
});

describe("그룹 화면 조회", () => {
    it("그룹 정보와 디데이를 함께 가져온다", async () => {
        const group = ok(await B.client.from("groups").select("*, group_ddays(label, target_date, sort_order)").eq("id", g1).maybeSingle());
        expect(group.name).toBe("첫 그룹");
        expect(group.group_ddays).toEqual([{ label: "수능", target_date: "2026-11-19", sort_order: 0 }]);
    });

    it("초대 미리보기 후 이미 멤버인지 판단할 수 있다", async () => {
        const code = ok(await A.client.from("groups").select("invite_code").eq("id", g1).single()).invite_code;
        const [preview] = ok(await B.client.rpc("preview_invite", { p_code: code }));
        expect(ok(await B.client.from("groups").select("id").eq("id", preview.group_id).maybeSingle())).toEqual({ id: g1 });
    });
});

describe("관리 탭 저장", () => {
    it("방장이 아닌 사람이 설정을 저장하면 PGRST116(바뀐 행 없음)으로 실패한다", async () => {
        const { error } = await B.client.from("groups").update({ fine_unit: 1 }).eq("id", g1).select("id").single();
        expect(error.code).toBe("PGRST116");
    });

    it("방장은 설정을 저장하고 결과 행을 받는다", async () => {
        expect(ok(await A.client.from("groups").update({ fine_unit: 900, default_start_time: "07:30" }).eq("id", g1).select("id").single())).toEqual({ id: g1 });
    });

    it("디데이 id로 삭제할 수 있다", async () => {
        const [d] = ok(await A.client.from("group_ddays").select("id").eq("group_id", g1));
        ok(await A.client.from("group_ddays").delete().eq("id", d.id));
        expect(ok(await A.client.from("group_ddays").select("id").eq("group_id", g1))).toEqual([]);
    });
});
