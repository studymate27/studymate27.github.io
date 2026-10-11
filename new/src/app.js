import "./styles.css";
import { createSupabaseClient } from "./infrastructure/supabase-client.js";

const supabase = createSupabaseClient();

const status = document.getElementById("app-status");
status.textContent = supabase ? "서버 연결 준비 완료" : "서버 설정이 없습니다";
