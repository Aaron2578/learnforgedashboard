import { useState } from "react";
import {
  BookOpen, Check, ClipboardList, Clock3, Copy, ExternalLink, Eye,
  FileText, GraduationCap, HardDrive, KeyRound, Link2, Lock, Plus,
  ShieldCheck, Trash2, Unlock, Upload, Users, X
} from "lucide-react";
import { extractDriveUrl, cleanNoteBody, getDriveDocTypeLabel } from "../lib/driveUtils.js";

export default function StudentAccessModal({
  student,
  courses,
  enrollments,
  materials,
  assessments,
  studentNotes,
  assessmentRecipients,
  materialRecipients,
  onClose,
  onPermitNote,
  onRevokeNote,
  onPermitTest,
  onRevokeTest,
  onAddManualNote,
  onDeleteManualNote,
  onEnrollStudent,
  onUnenrollStudent,
  onPreviewDoc,
}) {
  const [activeTab, setActiveTab] = useState("courses"); // "courses" | "notes" | "tests"
  const [showAddNoteForm, setShowAddNoteForm] = useState(false);
  const [prefilledCourseId, setPrefilledCourseId] = useState("");
  const [manualTitle, setManualTitle] = useState("");
  const [manualDriveUrl, setManualDriveUrl] = useState("");
  const [manualBody, setManualBody] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [selectedEnrollCourse, setSelectedEnrollCourse] = useState("");
  const [enrolling, setEnrolling] = useState(false);
  const [togglingId, setTogglingId] = useState(null);
  const [notice, setNotice] = useState("");

  const enrolledCourseIds = new Set(
    enrollments.filter((e) => e.student_id === student.id).map((e) => e.course_id)
  );
  const studentCourses = courses.filter((c) => enrolledCourseIds.has(c.id));
  const availableToEnrollCourses = courses.filter((c) => !enrolledCourseIds.has(c.id));

  // Permitted set for tests
  const permittedTestIds = new Set(
    assessmentRecipients
      .filter((r) => r.student_id === student.id)
      .map((r) => r.assessment_id)
  );

  // Permitted set for course materials
  const permittedMaterialIds = new Set(
    materialRecipients
      .filter((r) => r.student_id === student.id)
      .map((r) => r.material_id)
  );

  // Notes linked directly to student in student_notes
  const currentStudentNotes = studentNotes.filter((n) => n.student_id === student.id);

  async function handleCreateManualNote(e) {
    e.preventDefault();
    if (!manualTitle.trim()) return;
    setSavingNote(true);
    try {
      await onAddManualNote({
        student_id: student.id,
        course_id: prefilledCourseId || null,
        title: manualTitle.trim(),
        drive_url: manualDriveUrl.trim() || null,
        body: manualBody.trim() || (manualDriveUrl.trim() ? `Study material via Google Drive:\n\n${manualDriveUrl.trim()}` : "Student notes"),
      });
      setManualTitle("");
      setManualDriveUrl("");
      setManualBody("");
      setShowAddNoteForm(false);
      setNotice(`Note added and permitted for ${student.full_name || student.email}.`);
      setTimeout(() => setNotice(""), 4000);
    } catch (err) {
      console.error(err);
    } finally {
      setSavingNote(false);
    }
  }

  async function handleToggleNote(material, isPermitted) {
    setTogglingId(`note-${material.id}`);
    try {
      if (isPermitted) {
        await onRevokeNote(material, student.id);
        setNotice(`Access to "${material.title}" revoked.`);
      } else {
        await onPermitNote(material, student.id);
        setNotice(`"${material.title}" permitted! Now visible in student portal.`);
      }
      setTimeout(() => setNotice(""), 3500);
    } catch (err) {
      console.error(err);
    } finally {
      setTogglingId(null);
    }
  }

  async function handleToggleTest(test, isPermitted) {
    setTogglingId(`test-${test.id}`);
    try {
      if (isPermitted) {
        await onRevokeTest(test, student.id);
        setNotice(`Test access for "${test.title}" revoked.`);
      } else {
        await onPermitTest(test, student.id);
        setNotice(`Test "${test.title}" permitted! Now visible in student portal.`);
      }
      setTimeout(() => setNotice(""), 3500);
    } catch (err) {
      console.error(err);
    } finally {
      setTogglingId(null);
    }
  }

  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal" style={{ maxWidth: "880px", width: "95vw", maxHeight: "90vh", overflowY: "auto" }} role="dialog" aria-modal="true">
        {/* Header */}
        <div className="modal-heading">
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <span className="student-avatar" style={{ width: "44px", height: "44px", fontSize: "16px", flexShrink: 0 }}>
              {(student.full_name || student.email).slice(0, 1).toUpperCase()}
            </span>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <h2 style={{ margin: 0 }}>{student.full_name || "Student"}</h2>
                <span className={`portal-status ${student.is_approved ? "submitted" : "pending"}`} style={{ fontSize: "11px" }}>
                  {student.is_approved ? "Approved Access" : "Pending"}
                </span>
              </div>
              <p style={{ margin: "2px 0 0", fontSize: "13px", color: "var(--muted)" }}>
                {student.email} · Class Timing: <strong>{student.timing || "10:00 AM - 12:00 PM"}</strong>
              </p>
            </div>
          </div>
          <button type="button" className="quiet-icon" onClick={onClose} aria-label="Close modal">
            <X size={18} />
          </button>
        </div>

        {notice && (
          <div className="portal-alert success" style={{ marginBottom: "16px" }}>
            <Check size={14} /> {notice}
            <button type="button" onClick={() => setNotice("")}>Dismiss</button>
          </div>
        )}

        {/* Quick Stats Summary */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "10px", margin: "16px 0" }}>
          <div style={{ padding: "12px 14px", background: "#f8fafc", borderRadius: "8px", border: "1px solid var(--line)" }}>
            <span style={{ fontSize: "12px", color: "var(--muted)", display: "block" }}>Enrolled Courses</span>
            <strong style={{ fontSize: "18px", color: "var(--ink)" }}>{studentCourses.length}</strong>
          </div>
          <div style={{ padding: "12px 14px", background: "#f0fdf4", borderRadius: "8px", border: "1px solid #bbf7d0" }}>
            <span style={{ fontSize: "12px", color: "#166534", display: "block" }}>Permitted Notes &amp; Files</span>
            <strong style={{ fontSize: "18px", color: "#15803d" }}>
              {currentStudentNotes.length + permittedMaterialIds.size}
            </strong>
          </div>
          <div style={{ padding: "12px 14px", background: "#eff6ff", borderRadius: "8px", border: "1px solid #bfdbfe" }}>
            <span style={{ fontSize: "12px", color: "#1e40af", display: "block" }}>Permitted Tests</span>
            <strong style={{ fontSize: "18px", color: "#2563eb" }}>{permittedTestIds.size}</strong>
          </div>
        </div>

        {/* Action Button: Add Note Manually */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
          <div className="source-toggle-tabs" style={{ margin: 0 }} role="group">
            <button
              type="button"
              className={`source-toggle-btn ${activeTab === "courses" ? "active" : ""}`}
              onClick={() => setActiveTab("courses")}
            >
              <BookOpen size={14} /> Course Notes &amp; Tests ({studentCourses.length} Courses)
            </button>
            <button
              type="button"
              className={`source-toggle-btn ${activeTab === "notes" ? "active" : ""}`}
              onClick={() => setActiveTab("notes")}
            >
              <FileText size={14} /> Student Private Notes ({currentStudentNotes.length})
            </button>
          </div>

          <button
            type="button"
            className="button primary compact"
            onClick={() => {
              setPrefilledCourseId(studentCourses[0]?.id || "");
              setShowAddNoteForm((prev) => !prev);
            }}
          >
            <Plus size={13} /> {showAddNoteForm ? "Close Form" : "Add Note Manually"}
          </button>
        </div>

        {/* Inline Manual Note Creation Form */}
        {showAddNoteForm && (
          <form
            onSubmit={handleCreateManualNote}
            style={{
              padding: "16px",
              background: "#f0f7ff",
              border: "1px solid #bfdbfe",
              borderRadius: "10px",
              marginBottom: "20px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
              <span className="portal-item-icon" style={{ width: "28px", height: "28px", background: "#dbeafe", color: "#2563eb" }}>
                <HardDrive size={15} />
              </span>
              <strong style={{ fontSize: "14px", color: "var(--ink)" }}>
                Add Note Manually for {student.full_name || student.email}
              </strong>
            </div>

            <div className="form-grid-2">
              <label className="form-field">
                <span>Linked Course (optional)</span>
                <select
                  value={prefilledCourseId}
                  onChange={(e) => setPrefilledCourseId(e.target.value)}
                  className="status-select"
                >
                  <option value="">No Course (General Note)</option>
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.code} · {c.name} {enrolledCourseIds.has(c.id) ? "(Enrolled)" : ""}
                    </option>
                  ))}
                </select>
              </label>

              <label className="form-field">
                <span>Note Title *</span>
                <input
                  type="text"
                  required
                  placeholder="e.g. Chapter 4 Data Structures Notes"
                  value={manualTitle}
                  onChange={(e) => setManualTitle(e.target.value)}
                />
              </label>
            </div>

            <label className="form-field" style={{ marginTop: "10px" }}>
              <span style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <HardDrive size={14} style={{ color: "#4f46e5" }} />
                  <span>Google Drive Link (Upload via Drive Link)</span>
                </span>
                {manualDriveUrl.trim() && (
                  <span className="badge-view-only" style={{ background: "#eef2ff", color: "#4f46e5", fontSize: "10.5px" }}>
                    {getDriveDocTypeLabel(manualDriveUrl)}
                  </span>
                )}
              </span>
              <div style={{ display: "flex", gap: "8px", marginTop: "4px" }}>
                <input
                  type="url"
                  placeholder="https://drive.google.com/file/d/... or https://docs.google.com/..."
                  value={manualDriveUrl}
                  onChange={(e) => setManualDriveUrl(e.target.value)}
                  style={{ flex: 1 }}
                />
                <button
                  type="button"
                  className="button compact"
                  onClick={async () => {
                    try {
                      const clip = await navigator.clipboard.readText();
                      if (clip) setManualDriveUrl(clip.trim());
                    } catch {}
                  }}
                  title="Paste from clipboard"
                >
                  <Copy size={13} /> Paste
                </button>
                {manualDriveUrl.trim() && (
                  <button
                    type="button"
                    className="button compact"
                    onClick={() => onPreviewDoc(manualTitle || "Drive Preview", "Note Document", manualDriveUrl)}
                    title="Preview document"
                  >
                    <Eye size={13} /> Preview
                  </button>
                )}
              </div>
            </label>

            <label className="form-field" style={{ marginTop: "10px" }}>
              <span>Note Details / Summary (optional)</span>
              <textarea
                rows={3}
                placeholder="Key takeaways, instructions, or reading requirements..."
                value={manualBody}
                onChange={(e) => setManualBody(e.target.value)}
              />
            </label>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "12px" }}>
              <button type="button" className="button" onClick={() => setShowAddNoteForm(false)}>
                Cancel
              </button>
              <button type="submit" className="button primary" disabled={savingNote}>
                <Upload size={13} /> {savingNote ? "Saving…" : "Save & Permit for Student"}
              </button>
            </div>
          </form>
        )}

        {/* Tab 1: Courses view with Notes & Test options */}
        {activeTab === "courses" && (
          <div>
            {studentCourses.map((course) => {
              const courseMaterials = materials.filter((m) => m.course_id === course.id);
              const courseTests = assessments.filter((a) => a.course_id === course.id || !a.course_id);

              return (
                <div
                  key={course.id}
                  style={{
                    border: "1px solid var(--line)",
                    borderRadius: "10px",
                    padding: "16px",
                    marginBottom: "16px",
                    background: "#ffffff",
                  }}
                >
                  {/* Course Header */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "12px" }}>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <span className="course-code-badge">{course.code}</span>
                        <h3 style={{ margin: 0, fontSize: "16px" }}>{course.name}</h3>
                        {course.department && <span className="course-dept-badge">{course.department}</span>}
                      </div>
                      <small style={{ color: "var(--muted)", marginTop: "4px", display: "block" }}>
                        Instructor: {course.instructor || "Faculty TBA"} · Venue: {course.room || "TBA"}
                      </small>
                    </div>

                    <button
                      type="button"
                      className="quiet-icon danger-icon"
                      style={{ fontSize: "12px", display: "flex", alignItems: "center", gap: "4px" }}
                      onClick={() => onUnenrollStudent(course.id, student.id)}
                      title={`Remove student from ${course.code}`}
                    >
                      <X size={13} /> Unenroll
                    </button>
                  </div>

                  {/* Section: Notes Available for this Course */}
                  <div style={{ marginTop: "14px", borderTop: "1px solid var(--line)", paddingTop: "12px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                      <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--ink)", display: "flex", alignItems: "center", gap: "6px" }}>
                        <HardDrive size={14} style={{ color: "#4f46e5" }} />
                        Available Notes &amp; Drive Links ({courseMaterials.length})
                      </span>
                      <button
                        type="button"
                        className="text-link"
                        style={{ fontSize: "12px" }}
                        onClick={() => {
                          setPrefilledCourseId(course.id);
                          setShowAddNoteForm(true);
                        }}
                      >
                        + Add note for this student
                      </button>
                    </div>
                    <small style={{ color: "var(--muted)", fontSize: "11.5px", display: "block", marginBottom: "10px" }}>
                      🔒 Individual access only: Permitting or revoking here applies strictly to <strong>{student.full_name || student.email}</strong>. Other students in this course remain unaffected.
                    </small>

                    {courseMaterials.length > 0 ? (
                      <div style={{ display: "grid", gap: "8px" }}>
                        {courseMaterials.map((mat) => {
                          const isPermitted =
                            permittedMaterialIds.has(mat.id) ||
                            currentStudentNotes.some(
                              (n) => n.material_id === mat.id || (n.course_id === course.id && n.title === mat.title)
                            );
                          const isBusy = togglingId === `note-${mat.id}`;
                          const docType = mat.drive_url ? getDriveDocTypeLabel(mat.drive_url) : "PDF";

                          return (
                            <div
                              key={mat.id}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                padding: "10px 12px",
                                background: isPermitted ? "#f0fdf4" : "#f8fafc",
                                border: `1px solid ${isPermitted ? "#bbf7d0" : "#e2e8f0"}`,
                                borderRadius: "8px",
                                gap: "10px",
                              }}
                            >
                              <div style={{ minWidth: 0, flex: 1 }}>
                                <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                                  <strong style={{ fontSize: "13.5px", color: "var(--ink)" }}>{mat.title}</strong>
                                  <span className="badge-view-only" style={{ fontSize: "10.5px" }}>{mat.category || docType}</span>
                                </div>
                                {mat.drive_url && (
                                  <small style={{ color: "var(--muted)", textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap", display: "block" }}>
                                    Drive: {mat.drive_url}
                                  </small>
                                )}
                              </div>

                              <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
                                {mat.drive_url && (
                                  <button
                                    type="button"
                                    className="button compact"
                                    onClick={() => onPreviewDoc(mat.title, `${course.code} · ${course.name}`, mat.drive_url)}
                                    title="Preview note document"
                                  >
                                    <Eye size={12} />
                                  </button>
                                )}

                                <span
                                  style={{
                                    fontSize: "11px",
                                    fontWeight: 700,
                                    padding: "3px 8px",
                                    borderRadius: "12px",
                                    background: isPermitted ? "#dcfce7" : "#f1f5f9",
                                    color: isPermitted ? "#15803d" : "#64748b",
                                  }}
                                >
                                  {isPermitted ? "✓ Permitted to Student" : "Locked (No Access)"}
                                </span>

                                <button
                                  type="button"
                                  className={`button compact ${isPermitted ? "danger-outline" : "primary"}`}
                                  disabled={isBusy}
                                  onClick={() => handleToggleNote(mat, isPermitted)}
                                  style={{ minWidth: "125px", justifyContent: "center" }}
                                >
                                  {isBusy ? "Updating…" : isPermitted ? "Revoke Access" : "Permit for Student"}
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p style={{ fontSize: "12px", color: "var(--muted)", fontStyle: "italic", margin: "4px 0" }}>
                        No course notes uploaded yet for this course. Click "+ Add note for this course" to create one.
                      </p>
                    )}
                  </div>

                  {/* Section: Tests Available for this Course */}
                  <div style={{ marginTop: "14px", borderTop: "1px solid var(--line)", paddingTop: "12px" }}>
                    <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--ink)", display: "flex", alignItems: "center", gap: "6px", marginBottom: "8px" }}>
                      <ClipboardList size={14} style={{ color: "#0284c7" }} />
                      Available Tests for this Course ({courseTests.length})
                    </span>

                    {courseTests.length > 0 ? (
                      <div style={{ display: "grid", gap: "8px" }}>
                        {courseTests.map((test) => {
                          const isPermitted = permittedTestIds.has(test.id);
                          const isBusy = togglingId === `test-${test.id}`;

                          return (
                            <div
                              key={test.id}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                padding: "10px 12px",
                                background: isPermitted ? "#f0fdf4" : "#f8fafc",
                                border: `1px solid ${isPermitted ? "#bbf7d0" : "#e2e8f0"}`,
                                borderRadius: "8px",
                                gap: "10px",
                              }}
                            >
                              <div style={{ minWidth: 0, flex: 1 }}>
                                <strong style={{ fontSize: "13.5px", color: "var(--ink)", display: "block" }}>{test.title}</strong>
                                <small style={{ color: "var(--muted)" }}>
                                  {test.description ? `${test.description.slice(0, 70)}…` : "Online Test / Assessment"}
                                </small>
                              </div>

                              <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
                                <span
                                  style={{
                                    fontSize: "11px",
                                    fontWeight: 700,
                                    padding: "3px 8px",
                                    borderRadius: "12px",
                                    background: isPermitted ? "#dcfce7" : "#f1f5f9",
                                    color: isPermitted ? "#15803d" : "#64748b",
                                  }}
                                >
                                  {isPermitted ? "✓ Permitted to Student" : "Locked (No Access)"}
                                </span>

                                <button
                                  type="button"
                                  className={`button compact ${isPermitted ? "danger-outline" : "primary"}`}
                                  disabled={isBusy}
                                  onClick={() => handleToggleTest(test, isPermitted)}
                                  style={{ minWidth: "125px", justifyContent: "center" }}
                                >
                                  {isBusy ? "Updating…" : isPermitted ? "Revoke Access" : "Permit for Student"}
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p style={{ fontSize: "12px", color: "var(--muted)", fontStyle: "italic", margin: "4px 0" }}>
                        No tests assigned to this course.
                      </p>
                    )}
                  </div>
                </div>
              );
            })}

            {/* If Student is not enrolled in any course */}
            {!studentCourses.length && (
              <div className="card portal-empty" style={{ padding: "24px", background: "#f8fafc" }}>
                <BookOpen size={24} />
                <strong>No courses enrolled yet</strong>
                <span>When you enroll this student in a course, the course's available notes and tests will appear here ready to permit.</span>
              </div>
            )}

            {/* Quick Course Enrollment Section */}
            {availableToEnrollCourses.length > 0 && (
              <div style={{ marginTop: "16px", padding: "14px", background: "#f8fafc", borderRadius: "10px", border: "1px solid var(--line)" }}>
                <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--ink)", display: "block", marginBottom: "8px" }}>
                  Enroll {student.full_name || student.email} in a Course:
                </span>
                <div style={{ display: "flex", gap: "8px" }}>
                  <select
                    value={selectedEnrollCourse}
                    onChange={(e) => setSelectedEnrollCourse(e.target.value)}
                    className="status-select"
                    style={{ flex: 1 }}
                  >
                    <option value="">Select a course to enroll…</option>
                    {availableToEnrollCourses.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.code} · {c.name} ({c.department || "General"})
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="button primary"
                    disabled={!selectedEnrollCourse || enrolling}
                    onClick={async () => {
                      if (!selectedEnrollCourse) return;
                      setEnrolling(true);
                      await onEnrollStudent(selectedEnrollCourse, student.id);
                      setSelectedEnrollCourse("");
                      setEnrolling(false);
                      setNotice("Student enrolled in course! Available course notes and tests are ready.");
                    }}
                  >
                    <Plus size={14} /> Enroll
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Private / Manual Notes list */}
        {activeTab === "notes" && (
          <div>
            {currentStudentNotes.length > 0 ? (
              <div style={{ display: "grid", gap: "10px" }}>
                {currentStudentNotes.map((note) => {
                  const linkedCourse = courses.find((c) => c.id === note.course_id);
                  const driveUrl = note.drive_url || extractDriveUrl(note.body);
                  const cleanBody = cleanNoteBody(note.body, driveUrl);
                  const docType = getDriveDocTypeLabel(driveUrl);

                  return (
                    <div
                      key={note.id}
                      style={{
                        padding: "14px",
                        background: "#ffffff",
                        border: "1px solid var(--line)",
                        borderRadius: "10px",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                        <div>
                          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                            <strong style={{ fontSize: "15px", color: "var(--ink)" }}>{note.title}</strong>
                            {linkedCourse && <span className="course-code-badge">{linkedCourse.code}</span>}
                            {driveUrl && (
                              <span className="badge-view-only" style={{ background: "#eef2ff", color: "#4f46e5", fontSize: "11px" }}>
                                <HardDrive size={11} /> {docType}
                              </span>
                            )}
                          </div>
                          <small style={{ color: "var(--muted)", display: "block", marginTop: "2px" }}>
                            Added {new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(note.created_at))}
                          </small>
                        </div>

                        <button
                          type="button"
                          className="quiet-icon danger-icon"
                          onClick={() => onDeleteManualNote(note.id)}
                          title="Delete note"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>

                      {cleanBody && (
                        <p style={{ margin: "10px 0 0", fontSize: "13px", color: "var(--ink)", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
                          {cleanBody}
                        </p>
                      )}

                      {driveUrl && (
                        <div style={{ marginTop: "10px", display: "flex", gap: "8px", flexWrap: "wrap" }}>
                          <button
                            type="button"
                            className="button primary compact"
                            onClick={() => onPreviewDoc(note.title, linkedCourse?.name || "Private Note", driveUrl)}
                          >
                            <Eye size={12} /> View Document
                          </button>
                          <button
                            type="button"
                            className="button compact"
                            onClick={() => window.open(driveUrl, "_blank")}
                          >
                            <ExternalLink size={12} /> Open Drive
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="card portal-empty" style={{ padding: "24px" }}>
                <FileText size={24} />
                <strong>No private notes added yet</strong>
                <span>Click "Add Note Manually" above to write or upload a Google Drive note specifically for this student.</span>
              </div>
            )}
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "20px" }}>
          <button type="button" className="button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

