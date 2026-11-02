import { useState } from "react";
import { Users, X } from "lucide-react";

export default function EditStudentModal({ student, onClose, onSave, onDelete }) {
  const [fullName, setFullName] = useState(student.full_name || "");
  const [timing, setTiming] = useState(student.timing || "");
  const [isApproved, setIsApproved] = useState(Boolean(student.is_approved));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event) {
    event.preventDefault();
    if (!fullName.trim()) {
      setError("Full name is required.");
      return;
    }
    setSaving(true);
    setError("");

    try {
      await onSave(student.id, {
        full_name: fullName.trim(),
        timing: timing.trim(),
        is_approved: isApproved,
      });
    } catch (err) {
      setError(err.message || "Failed to update student profile.");
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
      <div className="modal" role="dialog" aria-modal="true">
        <div className="modal-heading">
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span className="portal-item-icon assignment" style={{ width: "38px", height: "38px" }}>
              <Users size={18} />
            </span>
            <div>
              <h2>Edit Student Profile</h2>
              <p>Update student name, access status, and account settings.</p>
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
              value={student.email}
              style={{ background: "#f8fafc", color: "var(--muted)" }}
            />
          </label>

          <label className="form-field" style={{ marginTop: "14px" }}>
            <span>Full Name *</span>
            <input
              type="text"
              required
              maxLength={100}
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="e.g. Alex Johnson"
            />
          </label>

          <label className="form-field" style={{ marginTop: "14px" }}>
            <span>Class / Batch Timing</span>
            <input
              type="text"
              maxLength={100}
              value={timing}
              onChange={(e) => setTiming(e.target.value)}
              placeholder="e.g. 10:00 AM - 12:00 PM (or Morning / Evening batch)"
            />
            <small style={{ display: "block", marginTop: "3px", color: "var(--muted)", fontSize: "11.5px" }}>
              Set this student's individual lecture or batch time. Appears on their dashboard.
            </small>
          </label>

          <div style={{ marginTop: "18px", padding: "12px 14px", background: "#f8fafc", borderRadius: "8px", border: "1px solid var(--line)" }}>
            <label style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer", fontWeight: 600, fontSize: "13px" }}>
              <input
                type="checkbox"
                checked={isApproved}
                onChange={(e) => setIsApproved(e.target.checked)}
                style={{ width: "16px", height: "16px", cursor: "pointer" }}
              />
              <span>Account Approved for Portal Access</span>
            </label>
            <small style={{ display: "block", marginTop: "4px", color: "var(--muted)", fontSize: "12px", marginLeft: "26px" }}>
              When approved, the student can sign in to view courses, assignments, and test scores.
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
                  onDelete(student);
                  onClose();
                }}
              >
                Delete Account
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

