import { useState } from "react";
import { BookOpen, CalendarClock, Paperclip, Trash2, X } from "lucide-react";

export default function EditAssignmentModal({
  assignment,
  students,
  currentRecipients = [],
  onClose,
  onSave,
  onDelete,
}) {
  const [title, setTitle] = useState(assignment.title || "");
  const [description, setDescription] = useState(assignment.description || "");
  const [due, setDue] = useState(() => {
    if (!assignment.due_at) return "";
    try {
      const d = new Date(assignment.due_at);
      // Format to YYYY-MM-DDTHH:MM for datetime-local
      const pad = (n) => String(n).padStart(2, "0");
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    } catch {
      return "";
    }
  });
  const [recipientIds, setRecipientIds] = useState(() => currentRecipients || []);
  const [questionFile, setQuestionFile] = useState(null);
  const [existingQuestionFile, setExistingQuestionFile] = useState(() =>
    assignment.question_file_path
      ? {
          filePath: assignment.question_file_path,
          fileName: assignment.question_file_name || "Question document",
          fileType: assignment.question_file_type || "",
        }
      : null
  );
  const [questionUrl, setQuestionUrl] = useState(assignment.question_url || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function toggleRecipient(id) {
    setRecipientIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  }

  function toggleAll() {
    if (recipientIds.length === students.length) {
      setRecipientIds([]);
    } else {
      setRecipientIds(students.map((s) => s.id));
    }
  }

  const allSelected = students.length > 0 && recipientIds.length === students.length;

  async function handleSubmit(event) {
    event.preventDefault();
    if (!title.trim()) {
      setError("Assignment title is required.");
      return;
    }
    if (!recipientIds.length) {
      setError("Please select at least one student recipient.");
      return;
    }
    setSaving(true);
    setError("");

    try {
      await onSave(assignment.id, {
        title: title.trim(),
        description: description.trim(),
        due,
        recipientIds,
        questionFile,
        existingQuestionFile,
        questionUrl: questionUrl.trim(),
      });
    } catch (err) {
      setError(err.message || "Failed to update assignment.");
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
      <div className="modal edit-course-modal" role="dialog" aria-modal="true">
        <div className="modal-heading">
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span className="portal-item-icon assignment" style={{ width: "38px", height: "38px" }}>
              <BookOpen size={18} />
            </span>
            <div>
              <h2>Edit Assignment</h2>
              <p>Update title, instructions, deadline, and assigned student cohort.</p>
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
            <span>Assignment Title *</span>
            <input
              type="text"
              required
              maxLength={150}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Lab report: cell structure"
            />
          </label>

          <label className="form-field" style={{ marginTop: "12px" }}>
            <span>Instructions / Task Details</span>
            <textarea
              rows={4}
              maxLength={10000}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Detail assignment instructions, deliverables, and grading expectations..."
            />
          </label>

          <label className="form-field" style={{ marginTop: "12px" }}>
            <span>Due Date &amp; Time</span>
            <input
              type="datetime-local"
              value={due}
              onChange={(e) => setDue(e.target.value)}
            />
          </label>

          <div className="form-field" style={{ marginTop: "12px" }}>
            <span>Question Paper / Attachment (PDF, DOCX, etc.)</span>
            {existingQuestionFile && !questionFile && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "8px",
                  padding: "8px 10px",
                  marginBottom: "8px",
                  borderRadius: "8px",
                  background: "rgba(99, 102, 241, 0.08)",
                  border: "1px solid rgba(99, 102, 241, 0.25)",
                  fontSize: "13px",
                }}
              >
                <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", overflow: "hidden", textOverflow: "ellipsis" }}>
                  <Paperclip size={14} />
                  Current file: <strong>{existingQuestionFile.fileName}</strong>
                </span>
                <button
                  type="button"
                  className="button compact"
                  onClick={() => setExistingQuestionFile(null)}
                  title="Remove existing file"
                >
                  <Trash2 size={13} /> Remove
                </button>
              </div>
            )}
            <input
              type="file"
              accept=".pdf,.doc,.docx,.txt,.ppt,.pptx,.xls,.xlsx,.csv,.zip,.png,.jpg,.jpeg,.webp"
              onChange={(e) => setQuestionFile(e.target.files?.[0] || null)}
            />
            {questionFile && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", marginTop: "6px", fontSize: "12px", color: "#4f46e5" }}>
                <span>New file selected: <strong>{questionFile.name}</strong></span>
                <button type="button" className="button compact" onClick={() => setQuestionFile(null)}>
                  Clear
                </button>
              </div>
            )}
          </div>

          <label className="form-field" style={{ marginTop: "12px" }}>
            <span>External Question / Reference Link (optional)</span>
            <input
              type="url"
              value={questionUrl}
              onChange={(e) => setQuestionUrl(e.target.value)}
              placeholder="https://drive.google.com/..."
            />
          </label>

          <fieldset className="admin-options" style={{ marginTop: "16px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
              <legend style={{ margin: 0 }}>
                Assigned Students ({recipientIds.length}/{students.length})
              </legend>
              {students.length > 0 && (
                <button
                  type="button"
                  className="button"
                  style={{ minHeight: "26px", padding: "2px 8px", fontSize: "11px" }}
                  onClick={toggleAll}
                >
                  {allSelected ? "Deselect all" : "Select all students"}
                </button>
              )}
            </div>

            <div style={{ maxHeight: "160px", overflowY: "auto", display: "grid", gap: "6px" }}>
              {students.map((student) => (
                <label className="admin-option" key={student.id}>
                  <input
                    type="checkbox"
                    checked={recipientIds.includes(student.id)}
                    onChange={() => toggleRecipient(student.id)}
                  />
                  <span>{student.full_name || student.email}</span>
                  <small>{student.email}</small>
                </label>
              ))}
              {!students.length && <p>No approved student accounts found.</p>}
            </div>
          </fieldset>

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
                  if (window.confirm(`Delete assignment “${assignment.title}”?`)) {
                    onDelete(assignment);
                    onClose();
                  }
                }}
              >
                Delete Assignment
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

