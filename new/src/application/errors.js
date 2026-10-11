// Supabase Auth·DB 오류를 사용자에게 보여줄 한글 문장으로 바꾼다.

const FALLBACK = "문제가 생겼어요. 잠시 후 다시 시도해 주세요.";

const EXACT = {
    "Invalid login credentials": "이메일 또는 비밀번호가 맞지 않아요.",
    "Email not confirmed": "이메일 인증이 아직 안 됐어요. 받은 편지함의 인증 메일을 확인해 주세요.",
    "User already registered": "이미 가입된 이메일이에요. 로그인하거나 비밀번호 찾기를 이용해 주세요.",
    "New password should be different from the old password.": "이전과 다른 비밀번호를 입력해 주세요.",
    "Email rate limit exceeded": "메일을 너무 자주 요청했어요. 잠시 후 다시 시도해 주세요.",
    // DB(RPC·트리거)에서 던지는 키 – supabase/migrations 참고
    not_authenticated: "다시 로그인해 주세요.",
    not_member: "이 그룹의 멤버가 아니에요.",
    not_admin: "방장만 할 수 있어요.",
    last_admin: "그룹에 방장이 최소 1명은 있어야 해요. 먼저 다른 멤버를 방장으로 지정해 주세요.",
    dday_limit: "디데이는 3개까지 등록할 수 있어요.",
    invalid_invite_code: "초대 코드가 올바르지 않아요. 방장에게 새 링크를 받아 주세요.",
    invalid_nickname: "닉네임은 1~20자로 입력해 주세요.",
    invalid_target: "대상 멤버를 찾을 수 없어요.",
};

const PATTERNS = [
    [/^Password should be at least (\d+) characters/, m => `비밀번호는 ${m[1]}자 이상이어야 해요.`],
    [/only request this after (\d+) seconds/, m => `잠시 후 다시 시도해 주세요. (${m[1]}초 후 가능)`],
    [/invalid format|Unable to validate email/i, () => "이메일 형식이 올바르지 않아요."],
    [/row-level security|permission denied/i, () => "수정 권한이 없어요."],
    [/Failed to fetch|NetworkError|Load failed/i, () => "인터넷 연결을 확인해 주세요."],
];

export function errorMessage(error) {
    if (!error) return FALLBACK;
    if (error.userMessage) return error.userMessage;
    const message = String(error.message ?? "");
    if (error.code === "42501") return "수정 권한이 없어요.";
    if (EXACT[message]) return EXACT[message];
    for (const [pattern, toText] of PATTERNS) {
        const match = message.match(pattern);
        if (match) return toText(match);
    }
    return message ? `${FALLBACK} (${message})` : FALLBACK;
}
