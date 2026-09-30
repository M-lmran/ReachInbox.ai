import { apiClient, TOKEN_KEY } from "@/lib/apiClient";
import { supabase } from "@/lib/supabaseClient";

export const authService = {
  async getConfig() {
    const { data } = await apiClient.get("/auth/config");
    return data.data;
  },

  /**
   * Start Google sign-in through Supabase. This is a full-page redirect: the
   * browser leaves for Google and returns to /dashboard with a session in the URL,
   * which `syncSupabaseSession` then exchanges.
   */
  async signInWithGoogle() {
    if (!supabase) throw new Error("Supabase is not configured");
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/dashboard` },
    });
    if (error) throw error;
  },

  /**
   * If Supabase left a session in the URL (OAuth return), exchange its access
   * token for our own API token. Returns the user, or null when there is nothing
   * to exchange. Safe to call on every load.
   */
  async syncSupabaseSession() {
    if (!supabase) return null;
    const { data, error } = await supabase.auth.getSession();
    const accessToken = data?.session?.access_token;
    if (error || !accessToken) return null;

    const user = await this.loginWithSupabase(accessToken);
    // Drop the OAuth params (?code=… / #access_token=…) so a refresh or reload
    // does not replay the exchange.
    if (window.location.hash || /[?&]code=/.test(window.location.search)) {
      window.history.replaceState({}, "", window.location.pathname);
    }
    return user;
  },

  /**
   * Email + password sign-in.
   *
   * There is no password store in the backend (the User model has no password
   * column), so credentials are verified by Supabase Auth and the resulting
   * access token is exchanged through the same endpoint Google sign-in uses.
   * Passwords are never sent to our API and never stored client-side.
   */
  async signInWithPassword(email, password) {
    if (!supabase) {
      throw new Error("Email sign-in is unavailable — Supabase is not configured");
    }
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    const accessToken = data?.session?.access_token;
    if (!accessToken) throw new Error("Supabase returned no session");
    return this.loginWithSupabase(accessToken);
  },

  /**
   * Create an account with email + password.
   *
   * Supabase has email confirmation enabled, so signUp usually returns a user
   * with NO session — the account cannot sign in until the address is confirmed.
   * Callers must not treat this as a completed login.
   */
  async signUpWithPassword(email, password) {
    if (!supabase) {
      throw new Error("Account creation is unavailable — Supabase is not configured");
    }
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${window.location.origin}/dashboard` },
    });
    if (error) throw error;

    const accessToken = data?.session?.access_token;
    if (accessToken) {
      // Confirmation disabled on this project — the account is usable now.
      const user = await this.loginWithSupabase(accessToken);
      return { needsConfirmation: false, user };
    }

    // Supabase returns an empty identities array when the address is already
    // registered, instead of an error (deliberate, to prevent enumeration).
    const alreadyRegistered =
      Array.isArray(data?.user?.identities) && data.user.identities.length === 0;

    return { needsConfirmation: true, alreadyRegistered, user: data?.user ?? null };
  },

  async devLogin(payload = {}) {
    const { data } = await apiClient.post("/auth/dev-login", payload);
    localStorage.setItem(TOKEN_KEY, data.data.token);
    return data.data.user;
  },

  async loginWithSupabase(accessToken) {
    const { data } = await apiClient.post("/auth/supabase", { accessToken });
    localStorage.setItem(TOKEN_KEY, data.data.token);
    return data.data.user;
  },

  async me() {
    const { data } = await apiClient.get("/auth/me");
    return data.data;
  },

  async logout() {
    try {
      await apiClient.post("/auth/logout");
    } catch (_e) {
      /* stateless token; ignore */
    }
    localStorage.removeItem(TOKEN_KEY);
  },

  isAuthenticated() {
    return Boolean(localStorage.getItem(TOKEN_KEY));
  },
};
