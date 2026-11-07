import { useEffect, useState } from "react";
import { ArrowRight, BookOpen, CheckCircle, Clock3, Database, GraduationCap, RefreshCw, ShieldCheck, Sparkles } from "lucide-react";
import App from "../App.jsx";
import { supabase } from "../lib/supabase.js";
import StudentPortal from "./StudentPortal.jsx";
import TrainerPortal from "./TrainerPortal.jsx";
import ErrorBoundary from "../components/ErrorBoundary.jsx";

function AuthScreen() {
  const [mode, setMode] = useState("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (mode === "sign-in") {
        const { error: authError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (authError) throw authError;
      } else {
        const { data, error: authError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { full_name: fullName.trim() } },
        });
        if (authError) throw authError;
        if (!data.session) {
          setNotice("Your student account was created! An administrator will review and approve your account shortly.");
        }
      }
    } catch (requestError) {
      setError(requestError.message || "Authentication failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-split-page">
      <div className="auth-split-card">
        {/* Left Column: Login Places */}
        <section className="auth-split-form-col">
          <div className="auth-logo">
            <span className="brand-mark"><GraduationCap size={22} /></span>
            <span><strong>LearnForge</strong><small>Learning together</small></span>
          </div>
          <div className="auth-intro">
            <div className="eyebrow">Campus portal</div>
            <h1>{mode === "sign-in" ? "Welcome back" : "Join your campus"}</h1>
            <p>{mode === "sign-in" ? "Sign in to your student or administrator account." : "Create your student account. No email confirmation needed — an administrator will approve your access."}</p>
          </div>
          <form className="auth-form" onSubmit={submit}>
            {mode === "sign-up" && (
              <label className="form-field">
                <span>Full name</span>
                <input autoComplete="name" required maxLength={100} value={fullName} onChange={(event) => setFullName(event.target.value)} placeholder="Your full name" />
              </label>
            )}
            <label className="form-field">
              <span>Email address</span>
              <input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@school.edu" />
            </label>
            <label className="form-field">
              <span>Password</span>
              <input type="password" autoComplete={mode === "sign-in" ? "current-password" : "new-password"} minLength={8} required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 8 characters" />
            </label>
            {error && <div className="form-error" role="alert">{error}</div>}
            {notice && <div className="form-notice" role="status">{notice}</div>}
            <button className="button primary auth-submit" disabled={busy}>
              {busy ? "Please wait…" : mode === "sign-in" ? "Sign in" : "Create student account"}
              <ArrowRight size={15} />
            </button>
          </form>
          <p className="auth-switch">
            {mode === "sign-in" ? "New student?" : "Already have an account?"}{" "}
            <button type="button" onClick={() => { setMode(mode === "sign-in" ? "sign-up" : "sign-in"); setError(""); setNotice(""); }}>
              {mode === "sign-in" ? "Create an account" : "Sign in"}
            </button>
          </p>
          <div className="auth-security"><ShieldCheck size={15} />Instant registration · Admin approval required</div>
        </section>

        {/* Right Column: Visual Showcase related to LearnForge */}
        <section className="auth-split-image-col">
          <img src="/learnforge-showcase.jpg" alt="LearnForge Academic Collaboration" className="auth-split-image-bg" />
          <div className="auth-split-image-overlay" />
          <div className="auth-split-image-content">
            <div className="auth-split-tag"><Sparkles size={14} /> Next-Gen Academic Cloud</div>
            <div className="auth-split-showcase-box">
              <h2>Empowering Education with Real-Time Learning</h2>
              <p>Seamless course management, automated attendance, protected material embeds, and live evaluation analytics unified in one state-of-the-art campus dashboard.</p>
              <div className="auth-split-features">
                <span className="auth-split-feature-chip">✓ Live Supabase Sync</span>
                <span className="auth-split-feature-chip">✓ Secure Drive Files</span>
                <span className="auth-split-feature-chip">✓ Instant Mark Release</span>
                <span className="auth-split-feature-chip">✓ Direct Messaging</span>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function SetupScreen() {
  return (
    <main className="setup-page">
      <section className="setup-card">
        <span className="setup-icon"><Database size={22} /></span>
        <div className="eyebrow">One-time setup</div>
        <h1>Connect your Supabase project</h1>
        <p>Student accounts, messages, assignment submissions, and test results are stored securely in Supabase. Connect a project to enable the portal.</p>
        <ol>
          <li>Create a Supabase project.</li>
          <li>Copy <code>.env.example</code> to <code>.env.local</code> and enter your project URL and publishable anon key.</li>
          <li>Run the migration in <code>supabase/migrations</code> using the Supabase CLI or SQL editor.</li>
          <li>Restart the development server and provision the superuser using the documented server-only script.</li>
        </ol>
        <a className="button primary" href="https://supabase.com/dashboard" target="_blank" rel="noreferrer">Open Supabase dashboard <ArrowRight size={15} /></a>
        <p className="setup-warning"><ShieldCheck size={15} />Never put the Supabase service-role key in a <code>VITE_</code> variable or browser code.</p>
        <div className="setup-brand"><BookOpen size={15} />LearnForge · Student portal</div>
      </section>
    </main>
  );
}

export default function AuthGate() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(Boolean(supabase));
  const [profileError, setProfileError] = useState("");

  useEffect(() => {
    if (!supabase) return undefined;
    let active = true;

    supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      if (error) setProfileError(error.message);
      setSession(data.session);
      if (!data.session) setLoading(false);
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!active) return;
      if (event === "SIGNED_OUT" || !nextSession) {
        setSession(null);
        setProfile(null);
        setProfileError("");
        setLoading(false);
        return;
      }

      setSession((prev) => {
        // Only if the user id actually changed do we reset profile
        if (prev?.user?.id !== nextSession.user?.id) {
          setProfile(null);
        }
        return nextSession;
      });
    });

    return () => {
      active = false;
      authListener.subscription.unsubscribe();
    };
  }, []);

  const userId = session?.user?.id;

  useEffect(() => {
    if (!supabase || !userId) {
      setProfile(null);
      setLoading(false);
      return undefined;
    }

    // If profile is already loaded for this user, avoid flashing loading screen
    if (profile && profile.id === userId) {
      setLoading(false);
      return undefined;
    }

    let active = true;
    setLoading(true);
    supabase
      .from("profiles")
      .select("id, email, full_name, role, is_approved, timing")
      .eq("id", userId)
      .single()
      .then(({ data, error }) => {
        if (!active) return;
        if (error) setProfileError(error.message);
        else setProfile(data);
        setLoading(false);
      });

    return () => { active = false; };
  }, [userId]);

  if (!supabase) return <SetupScreen />;
  if (loading) return <main className="auth-loading" role="status">Loading your secure campus portal…</main>;
  if (!session) return <AuthScreen />;
  if (profileError || !profile) {
    return <main className="auth-page"><section className="auth-card"><div className="eyebrow">Account setup</div><h1>We couldn’t load your campus profile</h1><p className="form-error" role="alert">{profileError || "Your profile is missing. Apply the Supabase database migration and sign in again."}</p><button className="button" onClick={() => supabase.auth.signOut()}>Sign out</button></section></main>;
  }

  async function signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) setProfileError(error.message);
  }

  if (profile.role === "student") {
    if (!profile.is_approved) {
      return (
        <main className="auth-page">
          <section className="auth-card">
            <div className="auth-logo">
              <span className="brand-mark"><GraduationCap size={22} /></span>
              <span><strong>LearnForge</strong><small>Student portal</small></span>
            </div>
            <div className="eyebrow" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <Clock3 size={14} /> Account approval
            </div>
            <h1>Your access is pending</h1>
            <p>Your student account is active! An administrator will review and approve your account shortly. Once approved, all your coursework, assignments, and campus messages will appear here.</p>
            <div style={{ marginTop: "24px", display: "flex", flexWrap: "wrap", gap: "10px" }}>
              <button className="button primary" type="button" onClick={() => window.location.reload()}>
                <RefreshCw size={14} /> Check approval status
              </button>
              <button className="button" type="button" onClick={signOut}>Sign out</button>
            </div>
            <div className="auth-security"><ShieldCheck size={15} />Protected by LearnForge Campus Authentication</div>
          </section>
        </main>
      );
    }
    return (
      <ErrorBoundary fallbackTitle="Student Portal Notice">
        <StudentPortal user={session.user} profile={profile} supabase={supabase} onSignOut={signOut} />
      </ErrorBoundary>
    );
  }
  if (profile.role === "trainer") {
    if (!profile.is_approved) {
      return (
        <main className="auth-page">
          <section className="auth-card">
            <div className="auth-logo">
              <span className="brand-mark"><GraduationCap size={22} /></span>
              <span><strong>LearnForge</strong><small>Trainer portal</small></span>
            </div>
            <div className="eyebrow" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <Clock3 size={14} /> Account status
            </div>
            <h1>Trainer access paused</h1>
            <p>Your trainer account is currently inactive or awaiting administrator approval. Please contact the campus administrator.</p>
            <div style={{ marginTop: "24px", display: "flex", flexWrap: "wrap", gap: "10px" }}>
              <button className="button primary" type="button" onClick={() => window.location.reload()}>
                <RefreshCw size={14} /> Refresh status
              </button>
              <button className="button" type="button" onClick={signOut}>Sign out</button>
            </div>
          </section>
        </main>
      );
    }
    return (
      <ErrorBoundary fallbackTitle="Trainer Portal Notice">
        <TrainerPortal user={session.user} profile={profile} supabase={supabase} onSignOut={signOut} />
      </ErrorBoundary>
    );
  }
  if (profile.role === "superuser" || profile.role === "admin") {
    return (
      <ErrorBoundary fallbackTitle="Admin Portal Notice">
        <App user={session.user} profile={profile} supabase={supabase} onSignOut={signOut} />
      </ErrorBoundary>
    );
  }
  return <main className="auth-page"><section className="auth-card"><h1>Account access is not available</h1><p>Your account has no permitted portal role.</p><button className="button" onClick={signOut}>Sign out</button></section></main>;
}
