import { useState } from "react";
import { Clock3, FileText, GraduationCap, X } from "lucide-react";

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
  const [status, setStatus] = useState(record.status || "present");
  const [note, setNote] = useState(record.note || "");
  const [title, setTitle] = useState(record.title || "");
  const [body, setBody] = useState(record.body || "");
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
          body: body.trim(),
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
              <p>{isAttendance ? "Update date, status, or notes for this student." : "Update confidential student feedback or notes."}</p>
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
                  placeholder="e.g. Midterm Progress Review"
                />
              </label>

              <label className="form-field" style={{ marginTop: "12px" }}>
                <span>Note Body *</span>
                <textarea
                  required
                  rows={5}
                  maxLength={10000}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="Enter private observations, feedback, or support action items..."
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

