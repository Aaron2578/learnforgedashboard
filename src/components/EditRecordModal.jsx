import { useState } from "react";
import { Clock3, ExternalLink, FileText, GraduationCap, HardDrive, Link2, X } from "lucide-react";
import { extractDriveUrl, cleanNoteBody, getDriveDocTypeLabel } from "../lib/driveUtils.js";
import { isHolidayRecord, normalizeAttendanceStatus, cleanAttendanceNote } from "../lib/attendanceUtils.js";

export default function EditRecordModal({
  view, // "Attendance" | "Notes"
  record,
  students,
  courses,
  onClose,
  onSave,
  onDelete,
}) {
  const isAttendance = view === "Attendance";
  const [studentId, setStudentId] = useState(record.student_id || "");
  const [courseId, setCourseId] = useState(record.course_id || "");
  const [attendanceDate, setAttendanceDate] = useState(record.attendance_date || "");
  const [status, setStatus] = useState(() => (isAttendance ? normalizeAttendanceStatus(record) : (record.status || "present")));
  const [note, setNote] = useState(() => (isAttendance ? cleanAttendanceNote(record.note) : (record.note || "")));
  const [title, setTitle] = useState(record.title || "");

  const existingDriveUrl = record.drive_url || extractDriveUrl(record.body || "");
  const [driveUrl, setDriveUrl] = useState(existingDriveUrl);
  const initialCleanBody = cleanNoteBody(record.body || "", existingDriveUrl);
  const [body, setBody] = useState(initialCleanBody);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event) {
    event.preventDefault();
    if (!studentId) {
      setError("Please select a student.");
      return;
    }
    if (!isAttendance && !title.trim()) {
      setError("Note title is required.");
      return;
    }
    setSaving(true);
    setError("");

    const payload = isAttendance
      ? {
          student_id: studentId,
          course_id: courseId || null,
          attendance_date: attendanceDate,
          status,
          note: note.trim(),
        }
      : {
          student_id: studentId,
          course_id: courseId || null,
          title: title.trim(),
          body: body.trim() || (driveUrl.trim() ? `Study notes and learning material via Google Drive.\n\nDrive Link: ${driveUrl.trim()}` : "Class note"),
          drive_url: driveUrl.trim() || null,
        };

    try {
      await onSave(record.id, payload);
    } catch (err) {
      setError(err.message || "Failed to update record.");
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
              {isAttendance ? <Clock3 size={18} /> : <FileText size={18} />}
            </span>
            <div>
              <h2>{isAttendance ? "Edit Attendance" : "Edit Student Note"}</h2>
              <p>{isAttendance ? "Update date, status, or notes for this student." : "Update note details, course association, or Google Drive link."}</p>
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
            <span>Student *</span>
            <select
              required
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
              className="status-select"
            >
              <option value="" disabled>Select a student</option>
              {students
                .filter((s) => s.is_approved)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.full_name || s.email} · {s.email}
                  </option>
                ))}
            </select>
          </label>

          <label className="form-field" style={{ marginTop: "12px" }}>
            <span>Course (optional)</span>
            <select
              value={courseId}
              onChange={(e) => setCourseId(e.target.value)}
              className="status-select"
            >
              <option value="">No linked course</option>
              {courses.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.code} · {course.name}
                </option>
              ))}
            </select>
          </label>

          {isAttendance ? (
            <>
              <div className="form-grid-2" style={{ marginTop: "12px" }}>
                <label className="form-field">
                  <span>Attendance Date *</span>
                  <input
                    type="date"
                    required
                    value={attendanceDate}
                    onChange={(e) => setAttendanceDate(e.target.value)}
                  />
                </label>
                <label className="form-field">
                  <span>Status *</span>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                    className="status-select"
                  >
                    <option value="present">Present</option>
                    <option value="late">Late</option>
                    <option value="absent">Absent</option>
                    <option value="holiday">Holiday</option>
                  </select>
                </label>
              </div>

              <label className="form-field" style={{ marginTop: "12px" }}>
                <span>Note / Reason (optional)</span>
                <input
                  type="text"
                  maxLength={1000}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="e.g. Excused medical leave"
                />
              </label>
            </>
          ) : (
            <>
              <label className="form-field" style={{ marginTop: "12px" }}>
                <span>Note Title *</span>
                <input
                  type="text"
                  required
                  maxLength={150}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Midterm Progress Review, Lecture 4 Notes"
                />
              </label>

              <label className="form-field" style={{ marginTop: "12px" }}>
                <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <HardDrive size={14} style={{ color: "#4f46e5" }} />
                  <span>Google Drive Link (optional)</span>
                  {driveUrl.trim() && (
                    <span className="badge-view-only" style={{ marginLeft: "auto", fontSize: "11px" }}>
                      {getDriveDocTypeLabel(driveUrl)}
                    </span>
                  )}
                </span>
                <div style={{ display: "flex", gap: "8px", marginTop: "4px" }}>
                  <input
                    type="url"
                    value={driveUrl}
                    onChange={(e) => setDriveUrl(e.target.value)}
                    placeholder="https://drive.google.com/file/d/... or https://docs.google.com/..."
                    style={{ flex: 1 }}
                  />
                  {driveUrl.trim() && (
                    <button
                      type="button"
                      className="button compact"
                      onClick={() => window.open(driveUrl.trim(), "_blank")}
                      title="Open link in a new tab"
                      style={{ whiteSpace: "nowrap" }}
                    >
                      <ExternalLink size={13} /> Test
                    </button>
                  )}
                </div>
                <small className="muted" style={{ display: "block", marginTop: "4px" }}>
                  Paste any Google Drive, Docs, Sheets, Slides, or PDF document link.
                </small>
              </label>

              <label className="form-field" style={{ marginTop: "12px" }}>
                <span>Note Details / Description (optional if Drive link provided)</span>
                <textarea
                  rows={4}
                  maxLength={10000}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="Enter study observations, instructions, or reading guide..."
                />
              </label>
            </>
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
                  if (window.confirm(`Delete this ${isAttendance ? "attendance record" : "note"}?`)) {
                    onDelete(record);
                    onClose();
                  }
                }}
              >
                Delete
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
