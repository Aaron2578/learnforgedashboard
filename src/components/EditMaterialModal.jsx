import { useState } from "react";
import { HardDrive, Link2, Upload, X } from "lucide-react";

export default function EditMaterialModal({
  material,
  courses,
  onClose,
  onSave,
  onDelete,
}) {
  const [title, setTitle] = useState(material.title || "");
  const [description, setDescription] = useState(material.description || "");
  const [category, setCategory] = useState(material.category || material.file_category || "PDF");
  const [courseId, setCourseId] = useState(material.course_id || "");
  const [driveUrl, setDriveUrl] = useState(material.drive_url || "");
  const [replacementFile, setReplacementFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event) {
    event.preventDefault();
    if (!title.trim()) {
      setError("Document title is required.");
      return;
    }
    setSaving(true);
    setError("");

    try {
      await onSave(material.id, {
        title: title.trim(),
        description: description.trim(),
        category,
        courseId,
        driveUrl: driveUrl.trim(),
        replacementFile,
      });
    } catch (err) {
      setError(err.message || "Failed to update material.");
      setSaving(false);
    }
  }

  const fileSize = material.file_size || material.file_size_bytes || 0;

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
              <HardDrive size={18} />
            </span>
            <div>
              <h2>Edit Drive &amp; File Material</h2>
              <p>Update title, course association, category, file attachment, or Google Drive link.</p>
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
            <span>Material Title *</span>
            <input
              type="text"
              required
              maxLength={180}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Lecture 4: Machine Learning Notes"
            />
          </label>

          <label className="form-field" style={{ marginTop: "12px" }}>
            <span>Description / Overview</span>
            <textarea
              rows={3}
              maxLength={2000}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Summary of document contents, reading requirements, or instructions..."
            />
          </label>

          <div className="form-grid-2" style={{ marginTop: "12px" }}>
            <label className="form-field">
              <span>Category</span>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="status-select"
              >
                <option value="PDF">PDF Document</option>
                <option value="Document">General Document</option>
                <option value="Test / Assessment">Test / Assessment</option>
                <option value="Lecture Notes">Lecture Notes</option>
                <option value="Study Guide">Study Guide</option>
                <option value="Other">Other Learning Resource</option>
              </select>
            </label>

            <label className="form-field">
              <span>Linked Course</span>
              <select
                value={courseId}
                onChange={(e) => setCourseId(e.target.value)}
                className="status-select"
              >
                <option value="">Campus-wide (All Students)</option>
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code} · {c.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="form-field" style={{ marginTop: "12px" }}>
            <span>Google Drive / Cloud Document Link</span>
            <input
              type="url"
              value={driveUrl}
              onChange={(e) => setDriveUrl(e.target.value)}
              placeholder="https://drive.google.com/file/d/... or https://docs.google.com/..."
            />
            <small className="muted" style={{ display: "block", marginTop: "4px" }}>
              Link any Google Drive file, Google Doc, Sheet, Slide, or Form test.
            </small>
          </label>

          <div style={{ marginTop: "14px" }}>
            <label className="form-field">
              <span>{material.file_name ? "Replace File Attachment (Optional)" : "Attach File (Optional)"}</span>
              <input
                type="file"
                accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt"
                onChange={(e) => setReplacementFile(e.target.files?.[0] || null)}
              />
            </label>
            {material.file_name && !replacementFile && (
              <div style={{ marginTop: "6px", padding: "8px 12px", background: "#f8fafc", borderRadius: "8px", border: "1px solid var(--line)", fontSize: "12px", color: "var(--muted)" }}>
                Current file: <strong>{material.file_name}</strong> {fileSize > 0 ? `(${(fileSize / (1024 * 1024)).toFixed(2)} MB)` : ""}
              </div>
            )}
            {replacementFile && (
              <div style={{ marginTop: "6px", padding: "8px 12px", background: "#f0fdf4", borderRadius: "8px", border: "1px solid #bbf7d0", fontSize: "12px", color: "#166534" }}>
                ✓ New file selected: <strong>{replacementFile.name}</strong> ({(replacementFile.size / (1024 * 1024)).toFixed(2)} MB)
              </div>
            )}
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
                  if (window.confirm(`Delete material “${material.title}”?`)) {
                    onDelete(material);
                    onClose();
                  }
                }}
              >
                Delete Material
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
