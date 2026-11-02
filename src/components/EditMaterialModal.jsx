import { useState } from "react";
import { HardDrive, X } from "lucide-react";

export default function EditMaterialModal({
  material,
  courses,
  onClose,
  onSave,
  onDelete,
}) {
  const [title, setTitle] = useState(material.title || "");
  const [description, setDescription] = useState(material.description || "");
  const [category, setCategory] = useState(material.file_category || "PDF");
  const [courseId, setCourseId] = useState(material.course_id || "");
  const [driveUrl, setDriveUrl] = useState(material.drive_url || "");
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
      });
    } catch (err) {
      setError(err.message || "Failed to update material.");
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
              <HardDrive size={18} />
            </span>
            <div>
              <h2>Edit Drive &amp; File Material</h2>
              <p>Update title, course association, category, or Google Drive link.</p>
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
              maxLength={150}
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
                <option value="DOC">Word Document (.docx)</option>
                <option value="SLIDES">Presentation Slides</option>
                <option value="DRIVE_LINK">Google Drive Document / Sheet</option>
                <option value="OTHER">Other Learning Resource</option>
              </select>
            </label>

            <label className="form-field">
              <span>Linked Course</span>
              <select
                value={courseId}
                onChange={(e) => setCourseId(e.target.value)}
                className="status-select"
              >
                <option value="">General campus material</option>
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code} · {c.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {(material.drive_url || category === "DRIVE_LINK") && (
            <label className="form-field" style={{ marginTop: "12px" }}>
              <span>Google Drive Link / External Access URL</span>
              <input
                type="url"
                value={driveUrl}
                onChange={(e) => setDriveUrl(e.target.value)}
                placeholder="https://drive.google.com/file/d/..."
              />
            </label>
          )}

          {material.file_name && (
            <div style={{ marginTop: "14px", padding: "10px 14px", background: "#f8fafc", borderRadius: "8px", border: "1px solid var(--line)", fontSize: "12px", color: "var(--muted)" }}>
              Attached file: <strong>{material.file_name}</strong> {material.file_size_bytes ? `(${(material.file_size_bytes / (1024 * 1024)).toFixed(2)} MB)` : ""}
            </div>
          )}

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

