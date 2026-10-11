// 주간 장부 저장 방식(ledger-repo.js)이 실제 DB에서 기대대로 동작하는지 확인
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
const ok = ({ data, error }) => { if (error) throw new Error(error.message); return data; };

let A, gid;

beforeAll(async () => {
    const email = `ledger-${Date.now()}@test.local`;
    const { data } = await admin.auth.admin.createUser({ email, password: "password-1234", email_confirm: true });
    const client = createClient(env.API_URL, env.ANON_KEY, options);
    await client.auth.signInWithPassword({ email, password: "password-1234" });
    A = { id: data.user.id, client };
    gid = ok(await client.rpc("create_group", { p_name: "장부", p_nickname: "에이" }));
});

describe("기록 저장", () => {
    it("한 칸만 upsert해도 같은 날의 다른 칸은 그대로 남는다", async () => {
        const row = { group_id: gid, user_id: A.id, date: "2026-10-05" };
        ok(await A.client.from("daily_records").upsert({ ...row, study_done: false }));
        ok(await A.client.from("daily_records").upsert({ ...row, start_done: true }));
        ok(await A.client.from("daily_records").upsert({ ...row, is_day_off: true }));
        const saved = ok(await A.client.from("daily_records").select("study_done, start_done, bonus_done, is_day_off").match(row).single());
        expect(saved).toEqual({ study_done: false, start_done: true, bonus_done: null, is_day_off: true });
    });

    it("요일별 시작 시간 7개를 한 번에 저장·덮어쓴다", async () => {
        const times = ["09:00", "08:40", "08:40", "08:40", "08:40", "10:00", "10:30"];
        const save = list => A.client.from("member_day_targets").upsert(list.map((start_time, weekday) => ({ group_id: gid, user_id: A.id, weekday, start_time })));
        ok(await save(times));
        ok(await save(times.map(() => "07:00")));
        const rows = ok(await A.client.from("member_day_targets").select("weekday, start_time").eq("group_id", gid).order("weekday"));
        expect(rows.map(r => r.start_time)).toEqual(Array(7).fill("07:00:00"));
    });

    it("1000행이 넘는 기록도 페이지로 나눠 모두 읽는다", async () => {
        const rows = [];
        const start = new Date(2023, 0, 2);
        for (let i = 0; i < 1100; i++) {
            const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
            rows.push({ group_id: gid, user_id: A.id, date: key, study_done: true });
        }
        ok(await A.client.from("daily_records").upsert(rows));

        const one = ok(await A.client.from("daily_records").select("date").eq("group_id", gid));
        expect(one.length).toBe(1000); // 한 번에는 1000행까지만 온다

        const all = [];
        for (let from = 0; ; from += 1000) {
            const page = ok(await A.client.from("daily_records").select("date").eq("group_id", gid)
                .order("date").order("user_id").range(from, from + 999));
            all.push(...page);
            if (page.length < 1000) break;
        }
        expect(all.length).toBe(1101);
    });
});
