import { supabase } from "../infrastructure/supabase-client.js";

// 메일·구글 로그인 후 돌아올 주소 (예: https://studymate27.github.io/app/#/groups)
export function appUrl(hash) {
    return `${window.location.origin}${import.meta.env.BASE_URL}${hash}`;
}

async function call(promise) {
    const { data, error } = await promise;
    if (error) throw error;
    return data;
}

export const getSession = async () => (await call(supabase.auth.getSession())).session;

export const signIn = (email, password) =>
    call(supabase.auth.signInWithPassword({ email, password }));

export const signUp = (email, password) =>
    call(supabase.auth.signUp({ email, password, options: { emailRedirectTo: appUrl("#/groups") } }));

export const resendSignupEmail = email =>
    call(supabase.auth.resend({ type: "signup", email, options: { emailRedirectTo: appUrl("#/groups") } }));

export const sendPasswordReset = email =>
    call(supabase.auth.resetPasswordForEmail(email, { redirectTo: appUrl("#/reset") }));

export const updatePassword = password => call(supabase.auth.updateUser({ password }));

export const signInWithGoogle = () =>
    call(supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: appUrl("#/groups") } }));

export const signOut = () => call(supabase.auth.signOut());

export async function deleteAccount() {
    await call(supabase.rpc("delete_my_account"));
    // 서버에서 계정이 지워졌으므로 이 기기의 세션만 정리
    await supabase.auth.signOut({ scope: "local" });
}

export const onAuthChange = callback => supabase.auth.onAuthStateChange(callback);

// 이메일+비밀번호로 가입한 계정인지 (구글 전용 계정은 비밀번호 변경 불가)
export const hasPasswordLogin = user =>
    (user?.identities ?? []).some(identity => identity.provider === "email");
