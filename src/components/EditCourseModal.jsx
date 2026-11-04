import { useState } from "react";
import { BookOpen, Check, Clock3, GraduationCap, MapPin, Trash2, Users, X } from "lucide-react";

export default function EditCourseModal({
  course,
  students,
  enrollments,
  onClose,
  onSave,
  onEnroll,
  onUnenroll,
  onDelete,
}) {
  const [formData, setFormData] = useState({
    name: course.name || "",
    code: course.code || "",
    department: course.department || "",
    instructor: course.instructor || "",
    schedule: course.schedule || "",
    room: course.room || "",
    description: course.description || "",
  });
  const [selectedStudentToEnroll, setSelectedStudentToEnroll] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const courseEnrollments = enrollments.filter((r) => r.course_id === course.id);
  const enrolledStudentIds = new Set(courseEnrollments.map((r) => r.student_id));
  const studentsById = Object.fromEntries(students.map((s) => [s.id, s]));
  const eligibleStudents = students.filter((s) => s.is_approved && !enrolledStudentIds.has(s.id));

  function handleChange(event) {
    const { name, value } = event.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!formData.name.trim() || !formData.code.trim()) {
      setError("Course name and course code are required.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onSave(course.id, formData);
    } catch (err) {
      setError(err.message || "Failed to save course changes.");
      setSaving(false);
    }
  }

  async function handleEnrollStudent() {
    if (!selectedStudentToEnroll) return;
    setError("");
    try {
      await onEnroll(course.id, selectedStudentToEnroll);
      setSelectedStudentToEnroll("");
    } catch (err) {
      setError(err.message || "Could not enroll student.");
    }
  }

  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal edit-course-modal" role="dialog" aria-modal="true" aria-labelledby="edit-course-title">
        <div className="modal-heading">
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span className="portal-item-icon assignment" style={{ width: "38px", height: "38px" }}>
              <BookOpen size={18} />
            </span>
            <div>
              <h2 id="edit-course-title">Edit Course</h2>
              <p>Update curriculum, department, instructor schedule, and student rosters.</p>
            </div>
          </div>
          <button type="button" className="quiet-icon" onClick={onClose} aria-label="Close edit course modal">
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
          <div className="form-grid-2">
            <label className="form-field">
              <span>Course Name *</span>
              <input
                type="text"
                name="name"
                required
                maxLength={150}
                value={formData.name}
                onChange={handleChange}
                placeholder="e.g. Data Structures & Algorithms"
              />
            </label>

            <label className="form-field">
              <span>Course Code *</span>
              <input
                type="text"
                name="code"
                required
                maxLength={40}
                value={formData.code}
                onChange={handleChange}
                placeholder="e.g. CS-201"
              />
            </label>
          </div>

          <div className="form-grid-2" style={{ marginTop: "12px" }}>
            <label className="form-field">
              <span>Department (e.g. IT or SAP)</span>
              <input
                type="text"
                name="department"
                maxLength={100}
                value={formData.department}
                onChange={handleChange}
                placeholder="e.g. IT or SAP"
              />
            </label>

            <label className="form-field">
              <span>Instructor / Faculty</span>
              <input
                type="text"
                name="instructor"
                maxLength={100}
                value={formData.instructor}
                onChange={handleChange}
                placeholder="e.g. Lead Trainer"
              />
            </label>
          </div>

          <label className="form-field" style={{ marginTop: "12px" }}>
            <span>Room / Lab Venue</span>
            <input
              type="text"
              name="room"
              maxLength={80}
              value={formData.room}
              onChange={handleChange}
              placeholder="e.g. Lab 4 / Virtual Classroom"
            />
          </label>

          <label className="form-field" style={{ marginTop: "12px" }}>
            <span>Description / Syllabus Summary</span>
            <textarea
              name="description"
              rows={3}
              maxLength={3000}
              value={formData.description}
              onChange={handleChange}
              placeholder="Outline course objectives, prerequisites, topics, and expectations..."
            />
          </label>

          {/* Enrolled Students Management Section */}
          <div className="modal-roster-section" style={{ marginTop: "20px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
              <strong style={{ fontSize: "13px", display: "flex", alignItems: "center", gap: "6px" }}>
                <Users size={14} /> Enrolled Students ({courseEnrollments.length})
              </strong>
            </div>

            <div className="enrolled-chips-list">
              {courseEnrollments.map((item) => {
                const student = studentsById[item.student_id];
                const displayName = student?.full_name || student?.email || "Student";
                return (
                  <span key={item.student_id} className="enrolled-student-chip">
                    <span className="chip-avatar">{displayName.slice(0, 1).toUpperCase()}</span>
                    <span className="chip-label" title={student?.email}>{displayName}</span>
                    <button
                      type="button"
                      className="chip-remove-btn"
                      title={`Remove ${displayName} from course`}
                      onClick={() => onUnenroll(course.id, item.student_id)}
                    >
                      <X size={12} />
                    </button>
                  </span>
                );
              })}
              {!courseEnrollments.length && (
                <span style={{ fontSize: "12.5px", color: "var(--muted)", fontStyle: "italic" }}>
                  No students currently enrolled.
                </span>
              )}
            </div>

            {eligibleStudents.length > 0 && (
              <div style={{ display: "flex", gap: "8px", marginTop: "10px", alignItems: "center" }}>
                <select
                  value={selectedStudentToEnroll}
                  onChange={(e) => setSelectedStudentToEnroll(e.target.value)}
                  className="status-select"
                  style={{
                    height: "36px",
                    flex: "1",
                    padding: "0 10px",
                    borderRadius: "8px",
                    border: "1px solid var(--line)",
                    background: "#ffffff",
                    fontSize: "12.5px",
                  }}
                >
                  <option value="">Select approved student to enroll…</option>
                  {eligibleStudents.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.full_name || s.email} ({s.email})
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="button"
                  style={{ height: "36px", fontSize: "12.5px" }}
                  disabled={!selectedStudentToEnroll}
                  onClick={handleEnrollStudent}
                >
                  Add Student
                </button>
              </div>
            )}
          </div>

          <div
            className="modal-actions edit-course-modal-actions"
            style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "24px", flexWrap: "wrap", gap: "12px" }}
          >
            <button
              type="button"
              className="button danger-icon edit-course-delete-btn"
              style={{ color: "var(--red)", borderColor: "rgba(239, 68, 68, 0.3)" }}
              onClick={() => {
                if (window.confirm(`Delete course “${course.name}”? This cannot be undone.`)) {
                  onDelete(course);
                  onClose();
                }
              }}
            >
              <Trash2 size={14} /> Delete Course
            </button>

            <div className="edit-course-btn-group" style={{ display: "flex", gap: "10px" }}>
              <button type="button" className="button" onClick={onClose} disabled={saving}>
                Cancel
              </button>
              <button type="submit" className="button primary" disabled={saving}>
                <Check size={14} /> {saving ? "Saving…" : "Save Changes"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

