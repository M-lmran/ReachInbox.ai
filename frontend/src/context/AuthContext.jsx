import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { authService } from "@/services/authService";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // const loadUser = useCallback(async () => {
  //   try {
  //     // No local token yet? A Supabase OAuth return leaves a session in the URL —
  //     // exchange it for our own token before deciding the user is signed out.
  //     // if (!authService.isAuthenticated()) {
  //     //   const viaSupabase = await authService.syncSupabaseSession().catch(() => null);
  //     //   if (viaSupabase) {
  //     //     setUser(viaSupabase);
  //     //     return;
  //     //   }
  //     // }
  //     if (!authService.isAuthenticated()) {
  //       let viaSupabase = null;

  //         try {
  //             viaSupabase = await authService.syncSupabaseSession();
  //             console.log("Supabase session sync result:", viaSupabase);
  //           } catch (error) {
  //             console.error("Supabase session sync failed:", error);
  //           }

  //           if (viaSupabase) {
  //             setUser(viaSupabase);
  //             return;
  //           }
  //         }
  //     if (!authService.isAuthenticated()) {
  //       setUser(null);
  //       return;
  //     }
  //     setUser(await authService.me());
  //   } catch (_e) {
  //     setUser(null);
  //   } finally {
  //     setLoading(false);
  //   }
  // }, []);
  const loadUser = useCallback(async () => {
  try {
    if (!authService.isAuthenticated()) {
      let viaSupabase = null;

      try {
        viaSupabase = await authService.syncSupabaseSession();
        console.log("Supabase session sync result:", viaSupabase);
      } catch (error) {
        console.error("Supabase session sync failed:", error);
      }

      if (viaSupabase) {
        setUser(viaSupabase);
        return;
      }
    }

    if (!authService.isAuthenticated()) {
      setUser(null);
      return;
    }

    setUser(await authService.me());
  } catch (error) {
    console.error("loadUser failed:", error);
    setUser(null);
  } finally {
    setLoading(false);
  }
}, []);

  useEffect(() => {
    loadUser();
  }, [loadUser]);

  const loginDev = useCallback(async (payload) => {
    const u = await authService.devLogin(payload);
    setUser(u);
    return u;
  }, []);

  const loginWithPassword = useCallback(async (email, password) => {
    const u = await authService.signInWithPassword(email, password);
    setUser(u);
    return u;
  }, []);

  const logout = useCallback(async () => {
    await authService.logout();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, loginDev, loginWithPassword, logout, reload: loadUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
