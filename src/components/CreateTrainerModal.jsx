import { useState } from "react";
import { Check, Copy, Eye, EyeOff, GraduationCap, KeyRound, RefreshCw, Sparkles, X } from "lucide-react";

function generateStrongPassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%";
  let pass = "Trainer@";
  for (let i = 0; i < 6; i++) {
    pass += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return pass;
}

export default function CreateTrainerModal({ onClose, onCreated, supabase, onToast }) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("Trainer@LearnForge2026!");
  const [showPassword, setShowPassword] = useState(true);
  const [timing, setTiming] = useState("10:00 AM - 12:00 PM");
  const [customTiming, setCustomTiming] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [createdInfo, setCreatedInfo] = useState(null);
  const [copied, setCopied] = useState(false);

  function handleRandomPassword() {
    setPassword(generateStrongPassword());
    setShowPassword(true);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const finalTiming = timing === "Custom" ? customTiming.trim() : timing;

    if (!fullName.trim()) {
      setError("Please provide the trainer's full name.");
      return;
    }
    if (!email.trim() || !email.includes("@")) {
      setError("Please provide a valid email address.");
      return;
    }
    if (!password || password.length < 8) {
      setError("Password must be at least 8 characters long.");
      return;
    }

    setSaving(true);
    setError("");

    try {
      const { data, error: invokeError } = await supabase.functions.invoke("admin-actions", {
        body: {
          action: "create_trainer",
          email: email.trim().toLowerCase(),
          password,
          fullName: fullName.trim(),
          timing: finalTiming,
        },
      });

      if (invokeError || data?.error) {
        throw new Error(invokeError?.message || data?.error || "Could not create trainer account.");
      }

      const creds = {
        fullName: fullName.trim(),
        email: email.trim().toLowerCase(),
        password,
        timing: finalTiming,
        loginUrl: window.location.origin,
      };

      setCreatedInfo(creds);
      if (onCreated) onCreated(creds);
      if (onToast) onToast(`Trainer account created for ${email.trim().toLowerCase()}!`);
    } catch (err) {
      setError(err.message || "Failed to create trainer account.");
    } finally {
      setSaving(false);
    }
  }

  function copyCredentials() {
    if (!createdInfo) return;
    const text = [
      "========================================",
      " LearnForge - Trainer Login Credentials ",
      "========================================",
      `Portal URL: ${createdInfo.loginUrl}`,
      `Email:      ${createdInfo.email}`,
      `Password:   ${createdInfo.password}`,
      `Name:       ${createdInfo.fullName}`,
      `Timing:     ${createdInfo.timing || "General"}`,
      `Role:       Trainer / Instructor`,
      "========================================",
      "Log in at the portal URL to access your",
      "attendance, tasks, syllabus, and materials.",
    ].join("\n");

    navigator.clipboard.writeText(text);
    setCopied(true);
    if (onToast) onToast("Trainer login credentials copied to clipboard!");
    setTimeout(() => setCopied(false), 3000);
  }

  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget && !saving) onClose();
      }}
    >
      <div className="modal" role="dialog" aria-modal="true" style={{ maxWidth: "560px" }}>
        <div className="modal-heading">
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <span
              className="portal-item-icon assignment"
              style={{
                width: "42px",
                height: "42px",
                background: "rgba(37, 99, 235, 0.1)",
                color: "var(--accent)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: "10px",
              }}
            >
              <GraduationCap size={22} />
            </span>
            <div>
              <h2 style={{ margin: 0, fontSize: "19px" }}>
                {createdInfo ? "Trainer Account Created" : "Create Trainer Account"}
              </h2>
              <p style={{ margin: "3px 0 0", fontSize: "13px", color: "var(--muted)" }}>
                {createdInfo
                  ? "Account credentials have been saved. Share these with the instructor."
                  : "Set up login email and password for a new instructor or trainer."}
              </p>
            </div>
          </div>
          <button
            type="button"
            className="quiet-icon"
            onClick={onClose}
            aria-label="Close modal"
            disabled={saving}
          >
            <X size={18} />
          </button>
        </div>

        {error && (
          <div className="portal-alert error" style={{ marginBottom: "16px" }}>
            {error}
            <button type="button" onClick={() => setError("")}>Dismiss</button>
          </div>
        )}

        {createdInfo ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "16px", marginTop: "12px" }}>
            <div
              style={{
                background: "#f0fdf4",
                border: "1px solid #bbf7d0",
                borderRadius: "12px",
                padding: "16px",
                display: "flex",
                flexDirection: "column",
                gap: "12px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "#166534", fontWeight: 600 }}>
                <Check size={18} />
                <span>Trainer account is ready for sign in!</span>
              </div>

              <div
                style={{
                  background: "#ffffff",
                  border: "1px solid #dcfce7",
                  borderRadius: "8px",
                  padding: "14px",
                  fontFamily: "monospace",
                  fontSize: "13px",
                  display: "grid",
                  gap: "8px",
                }}
              >
                <div>
                  <span style={{ color: "var(--muted)" }}>Email: </span>
                  <strong>{createdInfo.email}</strong>
                </div>
                <div>
                  <span style={{ color: "var(--muted)" }}>Password: </span>
                  <strong style={{ color: "#2563eb", background: "#eff6ff", padding: "2px 6px", borderRadius: "4px" }}>
                    {createdInfo.password}
                  </strong>
                </div>
                <div>
                  <span style={{ color: "var(--muted)" }}>Full Name: </span>
                  <span>{createdInfo.fullName}</span>
                </div>
                <div>
                  <span style={{ color: "var(--muted)" }}>Timing: </span>
                  <span>{createdInfo.timing}</span>
                </div>
                <div>
                  <span style={{ color: "var(--muted)" }}>Role: </span>
                  <span style={{ color: "#16a34a", fontWeight: 700 }}>Trainer (Full Trainer Portal)</span>
                </div>
              </div>
            </div>

            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
              <button
                type="button"
                className="button primary"
                onClick={copyCredentials}
                style={{ display: "flex", alignItems: "center", gap: "6px" }}
              >
                {copied ? <Check size={15} /> : <Copy size={15} />}
                <span>{copied ? "Copied!" : "Copy Login Credentials"}</span>
              </button>
              <button type="button" className="button" onClick={onClose}>
                Done
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ marginTop: "12px" }}>
            <div className="form-grid" style={{ display: "grid", gap: "14px" }}>
              <label className="form-field">
                <span>Trainer Full Name *</span>
                <input
                  type="text"
                  required
                  placeholder="e.g. Alex Morgan, Sarah Connor"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  disabled={saving}
                />
              </label>

              <label className="form-field">
                <span>Trainer Login Email *</span>
                <input
                  type="email"
                  required
                  placeholder="e.g. trainer.alex@learnforge.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={saving}
                />
              </label>

              <label className="form-field">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                  <span>Login Password *</span>
                  <button
                    type="button"
                    onClick={handleRandomPassword}
                    className="text-link"
                    style={{ fontSize: "12px", display: "flex", alignItems: "center", gap: "4px" }}
                  >
                    <Sparkles size={12} /> Generate random
                  </button>
                </div>
                <div style={{ position: "relative" }}>
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    minLength={8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={saving}
                    style={{ paddingRight: "42px" }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="quiet-icon"
                    style={{
                      position: "absolute",
                      right: "8px",
                      top: "50%",
                      transform: "translateY(-50%)",
                      color: "var(--muted)",
                    }}
                    title={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
                <small style={{ color: "var(--muted)", fontSize: "11.5px", marginTop: "3px", display: "block" }}>
                  Trainer will use this password to sign into the Trainer Dashboard.
                </small>
              </label>

              <label className="form-field">
                <span>Assigned Shift / Timing</span>
                <select
                  value={timing}
                  onChange={(e) => setTiming(e.target.value)}
                  disabled={saving}
                >
                  <option value="10:00 AM - 12:00 PM">Morning Batch (10:00 AM - 12:00 PM)</option>
                  <option value="09:00 AM - 01:00 PM">Morning Full (09:00 AM - 01:00 PM)</option>
                  <option value="02:00 PM - 04:00 PM">Afternoon Batch (02:00 PM - 04:00 PM)</option>
                  <option value="05:00 PM - 07:00 PM">Evening Batch (05:00 PM - 07:00 PM)</option>
                  <option value="Full Day (09:00 AM - 05:00 PM)">Full Day (09:00 AM - 05:00 PM)</option>
                  <option value="Custom">Custom Shift / Timing...</option>
                </select>
              </label>

              {timing === "Custom" && (
                <label className="form-field">
                  <span>Custom Timing Description</span>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 11:30 AM - 01:30 PM (Weekend)"
                    value={customTiming}
                    onChange={(e) => setCustomTiming(e.target.value)}
                    disabled={saving}
                  />
                </label>
              )}
            </div>

            <div
              style={{
                marginTop: "20px",
                display: "flex",
                justifyContent: "flex-end",
                gap: "10px",
                borderTop: "1px solid var(--line)",
                paddingTop: "16px",
              }}
            >
              <button
                type="button"
                className="button"
                onClick={onClose}
                disabled={saving}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="button primary"
                disabled={saving}
                style={{ display: "flex", alignItems: "center", gap: "6px" }}
              >
                <KeyRound size={15} />
                <span>{saving ? "Creating Account…" : "Create Trainer Account"}</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

