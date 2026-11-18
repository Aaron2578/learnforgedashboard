import { useState } from "react";
import { GraduationCap, X, Clock3, Trash2 } from "lucide-react";

const TIMING_PRESETS = [
  "Full Day (09:00 AM - 05:00 PM)",
  "Morning (09:00 AM - 01:00 PM)",
  "Afternoon (01:00 PM - 05:00 PM)",
  "Evening (05:00 PM - 09:00 PM)",
];

export default function EditTrainerModal({ trainer, onClose, onSave, onDelete }) {
  const [fullName, setFullName] = useState(trainer.full_name || "");
  const [timing, setTiming] = useState(trainer.timing || "");
  const [isApproved, setIsApproved] = useState(trainer.is_approved !== false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event) {
    event.preventDefault();
    if (!fullName.trim()) {
      setError("Trainer full name is required.");
      return;
    }
    setSaving(true);
    setError("");

    try {
      await onSave(trainer.id, {
        full_name: fullName.trim(),
        timing: timing.trim(),
        is_approved: isApproved,
      });
    } catch (err) {
      setError(err.message || "Failed to update trainer profile.");
      setSaving(false);
    }
  }

  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal" role="dialog" aria-modal="true" style={{ maxWidth: "540px" }}>
        <div className="modal-heading">
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span
              className="portal-item-icon"
              style={{
                width: "40px",
                height: "40px",
                borderRadius: "10px",
                background: "linear-gradient(135deg, #2563eb, #1d4ed8)",
                color: "#ffffff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <GraduationCap size={20} />
            </span>
            <div>
              <h2>Edit Trainer Profile</h2>
              <p>Update instructor name, shift timing, and account status.</p>
            </div>
          </div>
          <button type="button" className="quiet-icon" onClick={onClose} aria-label="Close modal">
            <X size={18} />
          </button>
        </div>

        {error && (
          <div className="portal-alert error" style={{ marginBottom: "16px" }}>
            {error}
            <button type="button" onClick={() => setError("")}>Dismiss</button>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <label className="form-field">
            <span>Email Address (Account Identifier)</span>
            <input
              type="email"
              disabled
              value={trainer.email || ""}
              style={{ background: "#f8fafc", color: "var(--muted)" }}
            />
          </label>

          <label className="form-field" style={{ marginTop: "14px" }}>
            <span>Trainer Full Name *</span>
            <input
              type="text"
              required
              maxLength={100}
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="e.g. Gayathri Vijay"
            />
          </label>

          <label className="form-field" style={{ marginTop: "14px" }}>
            <span>Shift / Working Hours</span>
            <input
              type="text"
              maxLength={100}
              value={timing}
              onChange={(e) => setTiming(e.target.value)}
              placeholder="e.g. Full Day (09:00 AM - 05:00 PM)"
            />
            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "8px" }}>
              {TIMING_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  className="button compact"
                  style={{
                    fontSize: "11px",
                    padding: "3px 8px",
                    background: timing === preset ? "#eff6ff" : "#f8fafc",
                    borderColor: timing === preset ? "#93c5fd" : "#e2e8f0",
                    color: timing === preset ? "#1d4ed8" : "#475569",
                    fontWeight: timing === preset ? 700 : 500,
                  }}
                  onClick={() => setTiming(preset)}
                >
                  <Clock3 size={11} /> {preset.split(" ")[0]} ({preset.match(/\((.*?)\)/)?.[1] || preset})
                </button>
              ))}
            </div>
          </label>

          <div
            style={{
              marginTop: "18px",
              padding: "12px 14px",
              background: isApproved ? "#f0fdf4" : "#fef2f2",
              borderRadius: "8px",
              border: `1px solid ${isApproved ? "#bbf7d0" : "#fecaca"}`,
            }}
          >
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                cursor: "pointer",
                fontWeight: 600,
                fontSize: "13px",
                color: isApproved ? "#166534" : "#991b1b",
              }}
            >
              <input
                type="checkbox"
                checked={isApproved}
                onChange={(e) => setIsApproved(e.target.checked)}
                style={{ width: "16px", height: "16px", cursor: "pointer", accentColor: "#16a34a" }}
              />
              <span>Account Active (Allowed to sign in &amp; instruct students)</span>
            </label>
            <small
              style={{
                display: "block",
                marginTop: "4px",
                color: isApproved ? "#15803d" : "#b91c1c",
                fontSize: "12px",
                marginLeft: "26px",
              }}
            >
              {isApproved
                ? "Active: Instructor can access their trainer portal, courses, and assigned students."
                : "Suspended: Instructor account is paused and cannot sign in."}
            </small>
          </div>

          <div
            className="modal-actions"
            style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "24px" }}
          >
            {onDelete ? (
              <button
                type="button"
                className="button danger-icon"
                style={{ color: "var(--red)", borderColor: "rgba(239, 68, 68, 0.3)" }}
                onClick={() => {
                  if (window.confirm(`Are you sure you want to delete trainer ${trainer.full_name || trainer.email}?`)) {
                    onDelete(trainer);
                    onClose();
                  }
                }}
              >
                <Trash2 size={13} /> Delete Trainer
              </button>
            ) : <div />}

            <div style={{ display: "flex", gap: "10px" }}>
              <button type="button" className="button" onClick={onClose} disabled={saving}>
                Cancel
              </button>
              <button type="submit" className="button primary" disabled={saving}>
                {saving ? "Saving…" : "Save Changes"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
