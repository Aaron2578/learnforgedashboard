import { useState } from "react";
import {
  BookOpen, Check, ClipboardList, Clock3, Copy, ExternalLink, Eye,
  FileText, GraduationCap, HardDrive, KeyRound, Link2, Lock, Pencil, Plus,
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
  onEditManualNote,
  onDeleteManualNote,
  onEnrollStudent,
  onUnenrollStudent,
  onPreviewDoc,
}) {
  const [activeTab, setActiveTab] = useState("courses"); // "courses" | "notes"
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

  // Notes linked directly to this student in student_notes
  const currentStudentNotes = studentNotes.filter((n) => n.student_id === student.id);

  // Deduplicated permitted count
  const uniquePermittedCount = new Set([
    ...currentStudentNotes.map((n) => (n.title || "").trim().toLowerCase()),
    ...Array.from(permittedMaterialIds).map((id) => {
      const found = materials.find((m) => m.id === id);
      return (found?.title || id).trim().toLowerCase();
    }),
  ]).size;

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
        setNotice(`Access to "${material.title}" revoked for ${student.full_name || student.email}. Status: Not Assigned.`);
      } else {
        await onPermitNote(material, student.id);
        setNotice(`✓ Assigned to ${student.full_name || student.email}: "${material.title}" status is now Assigned!`);
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

  // Campus-wide or unlinked materials
  const generalMaterials = materials.filter((m) => !m.course_id);

  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal student-access-modal" role="dialog" aria-modal="true">
        {/* Header */}
        <div className="modal-heading" style={{ marginBottom: "16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px", minWidth: 0, flex: 1 }}>
            <span
              style={{
                width: "44px",
                height: "44px",
                fontSize: "17px",
                fontWeight: 700,
                color: "#ffffff",
                background: "linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)",
                borderRadius: "10px",
                display: "grid",
                placeItems: "center",
                flexShrink: 0,
                boxShadow: "0 2px 8px rgba(79, 70, 229, 0.25)",
              }}
            >
              {(student.full_name || student.email).slice(0, 1).toUpperCase()}
            </span>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                <h2 style={{ margin: 0, fontSize: "19px", color: "var(--ink)", fontWeight: 700 }}>
                  {student.full_name || "Student"}
                </h2>
                <span className={`portal-status ${student.is_approved ? "submitted" : "pending"}`} style={{ fontSize: "11px", padding: "2px 8px" }}>
                  {student.is_approved ? "Approved Access" : "Pending"}
                </span>
              </div>
              <p style={{ margin: "3px 0 0", fontSize: "12.5px", color: "var(--muted)", textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>
                {student.email} · Class Timing: <strong style={{ color: "var(--ink)" }}>{student.timing || "10:00 AM - 12:00 PM"}</strong>
              </p>
            </div>
          </div>
          <button
            type="button"
            className="quiet-icon"
            onClick={onClose}
            aria-label="Close modal"
            style={{
              width: "32px",
              height: "32px",
              borderRadius: "8px",
              border: "1px solid #e2e8f0",
              background: "#ffffff",
              display: "grid",
              placeItems: "center",
              cursor: "pointer",
            }}
          >
            <X size={16} />
          </button>
        </div>

        {notice && (
          <div className="portal-alert success" style={{ marginBottom: "16px" }}>
            <Check size={14} /> {notice}
            <button type="button" onClick={() => setNotice("")}>Dismiss</button>
          </div>
        )}

        {/* Quick Stats Summary: 3 Cards (Left, Center, Right) */}
        <div className="modal-stats-grid">
          <div className="modal-stat-card">
            <span className="modal-stat-label">Enrolled Courses</span>
            <strong className="modal-stat-value">{studentCourses.length}</strong>
          </div>
          <div className="modal-stat-card center-stat-card">
            <span className="modal-stat-label green">Permitted Notes &amp; Files</span>
            <strong className="modal-stat-value green">{uniquePermittedCount}</strong>
          </div>
          <div className="modal-stat-card">
            <span className="modal-stat-label blue">Permitted Tests</span>
            <strong className="modal-stat-value blue">{permittedTestIds.size}</strong>
          </div>
        </div>

        {/* Modern Tab Bar + Action Button Row */}
        <div className="modal-tab-action-bar">
          <div className="modal-segmented-tabs" role="group">
            <button
              type="button"
              className={`modal-tab-pill ${activeTab === "courses" ? "active" : ""}`}
              onClick={() => setActiveTab("courses")}
            >
              <div className="modal-tab-pill-content">
                <BookOpen size={16} style={{ flexShrink: 0, marginRight: "8px" }} />
                <span className="modal-tab-text">Course Notes &amp; Tests</span>
              </div>
              <span className="modal-tab-badge" style={{ marginRight: "4px" }}>{studentCourses.length}</span>
            </button>
            <button
              type="button"
              className={`modal-tab-pill ${activeTab === "notes" ? "active" : ""}`}
              onClick={() => setActiveTab("notes")}
            >
              <div className="modal-tab-pill-content">
                <FileText size={16} style={{ flexShrink: 0, marginRight: "8px" }} />
                <span className="modal-tab-text">Student Private Notes</span>
              </div>
              <span className="modal-tab-badge" style={{ marginRight: "4px" }}>{currentStudentNotes.length}</span>
            </button>
          </div>

          <button
            type="button"
            className={`modal-btn-add-note ${showAddNoteForm ? "close-mode" : ""}`}
            onClick={() => {
              setPrefilledCourseId(studentCourses[0]?.id || "");
              setShowAddNoteForm((prev) => !prev);
            }}
          >
            {showAddNoteForm ? <X size={14} /> : <Plus size={14} />}
            <span>{showAddNoteForm ? "Close Form" : "Add Note Manually"}</span>
          </button>
        </div>

        {/* Inline Manual Note Creation Form */}
        {showAddNoteForm && (
          <form
            onSubmit={handleCreateManualNote}
            style={{
              padding: "16px 18px",
              background: "#f0f7ff",
              border: "1px solid #bfdbfe",
              borderRadius: "12px",
              marginBottom: "20px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
              <span className="portal-item-icon" style={{ width: "28px", height: "28px", background: "#dbeafe", color: "#2563eb" }}>
                <HardDrive size={15} />
              </span>
              <strong style={{ fontSize: "14px", color: "var(--ink)" }}>
                Add Note &amp; Permit for {student.full_name || student.email}
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
                  placeholder="e.g. Full Stack Syllabus / Chapter Notes"
                  value={manualTitle}
                  onChange={(e) => setManualTitle(e.target.value)}
                />
              </label>
            </div>

            <label className="form-field" style={{ marginTop: "10px" }}>
              <span style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <HardDrive size={14} style={{ color: "#4f46e5" }} />
                  <span>Google Drive Link (Upload / View in Dashboard)</span>
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
              // 1. Direct course materials matching course.id
              const courseDirectMaterials = materials.filter((m) => m.course_id === course.id);

              // 2. All unique course notes created for this course from studentNotes
              const seenTitles = new Set(courseDirectMaterials.map((m) => m.title.trim().toLowerCase()));
              const courseNotesFromDB = [];

              for (const n of studentNotes) {
                const titleKey = n.title?.trim().toLowerCase();
                const matchesCourse =
                  n.course_id === course.id ||
                  (course.code && n.title?.toUpperCase().includes(course.code.toUpperCase()));

                if (matchesCourse && titleKey && !seenTitles.has(titleKey)) {
                  seenTitles.add(titleKey);
                  courseNotesFromDB.push({
                    id: n.material_id || n.id,
                    title: n.title,
                    description: n.body,
                    drive_url: n.drive_url || extractDriveUrl(n.body),
                    course_id: n.course_id || course.id,
                    category: n.drive_url || extractDriveUrl(n.body) ? "Google Drive Document" : "Lecture Note",
                    isFromStudentNotes: true,
                    sourceNote: n,
                  });
                }
              }

              const courseMaterials = [...courseDirectMaterials, ...courseNotesFromDB];
              const courseTests = assessments.filter((a) => a.course_id === course.id || !a.course_id);

              return (
                <div
                  key={course.id}
                  style={{
                    border: "1px solid #e2e8f0",
                    borderRadius: "12px",
                    padding: "18px",
                    marginBottom: "16px",
                    background: "#ffffff",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.02)",
                  }}
                >
                  {/* Course Header */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "12px", gap: "10px" }}>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                        <span className="course-code-badge">{course.code}</span>
                        <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "var(--ink)" }}>{course.name}</h3>
                        {course.department && <span className="course-dept-badge">{course.department}</span>}
                      </div>
                      <small style={{ color: "var(--muted)", marginTop: "4px", display: "block", fontSize: "12px" }}>
                        Instructor: {course.instructor || "Faculty TBA"} · Venue: {course.room || "TBA"}
                      </small>
                    </div>

                    <button
                      type="button"
                      className="modal-unenroll-btn"
                      onClick={() => onUnenrollStudent(course.id, student.id)}
                      title={`Remove student from ${course.code}`}
                    >
                      <X size={12} /> Unenroll
                    </button>
                  </div>

                  {/* Section: Notes Available for this Course */}
                  <div style={{ marginTop: "14px", borderTop: "1px solid var(--line)", paddingTop: "14px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px", flexWrap: "wrap", gap: "8px" }}>
                      <span style={{ fontSize: "13.5px", fontWeight: 700, color: "var(--ink)", display: "flex", alignItems: "center", gap: "6px" }}>
                        <HardDrive size={15} style={{ color: "#4f46e5" }} />
                        Available Notes &amp; Drive Links ({courseMaterials.length})
                      </span>
                      <button
                        type="button"
                        className="modal-add-sub-btn"
                        onClick={() => {
                          setPrefilledCourseId(course.id);
                          setShowAddNoteForm(true);
                        }}
                      >
                        <Plus size={12} /> Add note for this student
                      </button>
                    </div>
                    <small style={{ color: "var(--muted)", fontSize: "11.5px", display: "block", marginBottom: "10px" }}>
                      🔒 Individual access only: Permitting or revoking here applies strictly to <strong>{student.full_name || student.email}</strong>.
                    </small>

                    {courseMaterials.length > 0 ? (
                      <div style={{ display: "grid", gap: "8px" }}>
                        {courseMaterials.map((mat) => {
                          const isPermitted =
                            permittedMaterialIds.has(mat.id) ||
                            currentStudentNotes.some(
                              (n) =>
                                (mat.id && n.material_id === mat.id) ||
                                (n.course_id === course.id && n.title.trim().toLowerCase() === mat.title.trim().toLowerCase()) ||
                                (mat.drive_url && (n.drive_url === mat.drive_url || (n.body && n.body.includes(mat.drive_url))))
                            );
                          const isBusy = togglingId === `note-${mat.id}`;
                          const docType = mat.drive_url ? getDriveDocTypeLabel(mat.drive_url) : "Lecture Note";

                          return (
                            <div
                              key={mat.id}
                              className="modal-resource-row"
                              style={{
                                background: isPermitted ? "#f0fdf4" : "#f8fafc",
                                border: `1px solid ${isPermitted ? "#bbf7d0" : "#e2e8f0"}`,
                              }}
                            >
                              <div style={{ minWidth: 0, flex: 1 }}>
                                <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                                  <strong style={{ fontSize: "13.5px", color: "var(--ink)" }}>{mat.title}</strong>
                                  <span className="badge-view-only" style={{ fontSize: "10.5px" }}>{mat.category || docType}</span>
                                </div>
                                {mat.drive_url && (
                                  <small style={{ color: "var(--muted)", textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap", display: "block", marginTop: "2px", fontSize: "11.5px" }}>
                                    Drive: {mat.drive_url}
                                  </small>
                                )}
                              </div>

                              <div className="modal-resource-actions">
                                {mat.drive_url && (
                                  <button
                                    type="button"
                                    className="button compact"
                                    onClick={() => onPreviewDoc(mat.title, `${course.code} · ${course.name}`, mat.drive_url)}
                                    title="Preview note document"
                                    style={{ height: "30px", width: "32px", padding: 0, display: "grid", placeItems: "center" }}
                                  >
                                    <Eye size={13} />
                                  </button>
                                )}

                                <span className={`modal-status-pill ${isPermitted ? "permitted" : "locked"}`}>
                                  {isPermitted ? "✓ Status: Assigned" : "Status: Not Assigned"}
                                </span>

                                <button
                                  type="button"
                                  className={isPermitted ? "modal-btn-revoke" : "modal-btn-permit"}
                                  disabled={isBusy}
                                  onClick={() => handleToggleNote(mat, isPermitted)}
                                >
                                  {isBusy ? "Updating…" : isPermitted ? "Revoke Access" : "Assign to Student"}
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p style={{ fontSize: "12px", color: "var(--muted)", fontStyle: "italic", margin: "4px 0" }}>
                        No course notes uploaded yet for this course. Click "+ Add note for this student" above to create one.
                      </p>
                    )}
                  </div>

                  {/* Section: Tests Available for this Course */}
                  <div style={{ marginTop: "14px", borderTop: "1px solid var(--line)", paddingTop: "14px" }}>
                    <span style={{ fontSize: "13.5px", fontWeight: 700, color: "var(--ink)", display: "flex", alignItems: "center", gap: "6px", marginBottom: "8px" }}>
                      <ClipboardList size={15} style={{ color: "#0284c7" }} />
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
                              className="modal-resource-row"
                              style={{
                                background: isPermitted ? "#f0fdf4" : "#f8fafc",
                                border: `1px solid ${isPermitted ? "#bbf7d0" : "#e2e8f0"}`,
                              }}
                            >
                              <div style={{ minWidth: 0, flex: 1 }}>
                                <strong style={{ fontSize: "13.5px", color: "var(--ink)", display: "block" }}>{test.title}</strong>
                                <small style={{ color: "var(--muted)", fontSize: "11.5px" }}>
                                  {test.description ? `${test.description.slice(0, 70)}…` : "Online Test / Assessment"}
                                </small>
                              </div>

                              <div className="modal-resource-actions">
                                <span className={`modal-status-pill ${isPermitted ? "permitted" : "locked"}`}>
                                  {isPermitted ? "✓ Status: Assigned" : "Status: Not Assigned"}
                                </span>

                                <button
                                  type="button"
                                  className={isPermitted ? "modal-btn-revoke" : "modal-btn-permit"}
                                  disabled={isBusy}
                                  onClick={() => handleToggleTest(test, isPermitted)}
                                >
                                  {isBusy ? "Updating…" : isPermitted ? "Revoke Access" : "Assign to Student"}
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

            {/* Campus-wide / General Materials Section if present */}
            {generalMaterials.length > 0 && (
              <div
                style={{
                  border: "1px solid #e2e8f0",
                  borderRadius: "12px",
                  padding: "16px",
                  marginBottom: "16px",
                  background: "#ffffff",
                }}
              >
                <span style={{ fontSize: "13.5px", fontWeight: 700, color: "var(--ink)", display: "flex", alignItems: "center", gap: "6px", marginBottom: "8px" }}>
                  <HardDrive size={15} style={{ color: "#10b981" }} />
                  Campus-wide Study Materials &amp; Guides ({generalMaterials.length})
                </span>
                <div style={{ display: "grid", gap: "8px" }}>
                  {generalMaterials.map((mat) => {
                    const isPermitted = permittedMaterialIds.has(mat.id);
                    const isBusy = togglingId === `note-${mat.id}`;

                    return (
                      <div
                        key={mat.id}
                        className="modal-resource-row"
                        style={{
                          background: isPermitted ? "#f0fdf4" : "#f8fafc",
                          border: `1px solid ${isPermitted ? "#bbf7d0" : "#e2e8f0"}`,
                        }}
                      >
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <strong style={{ fontSize: "13.5px", color: "var(--ink)" }}>{mat.title}</strong>
                          <span className="badge-view-only" style={{ fontSize: "10.5px", marginLeft: "6px" }}>{mat.category || "General"}</span>
                        </div>
                        <div className="modal-resource-actions">
                          <span className={`modal-status-pill ${isPermitted ? "permitted" : "locked"}`}>
                            {isPermitted ? "✓ Permitted" : "Locked (No Access)"}
                          </span>
                          <button
                            type="button"
                            className={isPermitted ? "modal-btn-revoke" : "modal-btn-permit"}
                            disabled={isBusy}
                            onClick={() => handleToggleNote(mat, isPermitted)}
                          >
                            {isBusy ? "Updating…" : isPermitted ? "Revoke Access" : "Permit for Student"}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* If Student is not enrolled in any course */}
            {!studentCourses.length && (
              <div className="card portal-empty" style={{ padding: "24px", background: "#f8fafc" }}>
                <BookOpen size={24} />
                <strong>No courses enrolled yet</strong>
                <span>Enroll this student in a course below to view available notes and tests ready to permit.</span>
              </div>
            )}

            {/* Quick Course Enrollment Section */}
            {availableToEnrollCourses.length > 0 && (
              <div className="modal-enroll-box">
                <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--ink)", display: "flex", alignItems: "center", gap: "6px", marginBottom: "8px" }}>
                  <GraduationCap size={15} style={{ color: "#4f46e5" }} />
                  Enroll {student.full_name || student.email} in a Course:
                </span>
                <div className="modal-enroll-controls">
                  <select
                    value={selectedEnrollCourse}
                    onChange={(e) => setSelectedEnrollCourse(e.target.value)}
                    className="status-select"
                    style={{ flex: 1, height: "40px", borderRadius: "8px" }}
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
                    className="modal-btn-enroll"
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
                    <Plus size={14} /> {enrolling ? "Enrolling…" : "Enroll"}
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
                        padding: "14px 16px",
                        background: "#ffffff",
                        border: "1px solid #e2e8f0",
                        borderRadius: "10px",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "10px" }}>
                        <div>
                          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                            <strong style={{ fontSize: "15px", color: "var(--ink)", fontWeight: 700 }}>{note.title}</strong>
                            {linkedCourse && <span className="course-code-badge">{linkedCourse.code}</span>}
                            {driveUrl && (
                              <span className="badge-view-only" style={{ background: "#eef2ff", color: "#4f46e5", fontSize: "11px" }}>
                                <HardDrive size={11} /> {docType}
                              </span>
                            )}
                          </div>
                          <small style={{ color: "var(--muted)", display: "block", marginTop: "3px", fontSize: "12px" }}>
                            Added {new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(note.created_at))}
                          </small>
                        </div>

                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          {onEditManualNote && (
                            <button
                              type="button"
                              className="button compact"
                              onClick={() => onEditManualNote(note)}
                              title="Edit note"
                              style={{ height: "30px", fontSize: "12px", padding: "0 8px" }}
                            >
                              <Pencil size={12} /> Edit
                            </button>
                          )}
                          <button
                            type="button"
                            className="modal-unenroll-btn"
                            onClick={() => onDeleteManualNote(note.id)}
                            title="Delete note"
                          >
                            <Trash2 size={13} /> Delete
                          </button>
                        </div>
                      </div>

                      {cleanBody && (
                        <p style={{ margin: "10px 0 0", fontSize: "13px", color: "var(--ink)", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
                          {cleanBody}
                        </p>
                      )}

                      {driveUrl && (
                        <div style={{ marginTop: "12px", display: "flex", gap: "8px", flexWrap: "wrap" }}>
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
              <div className="card portal-empty" style={{ padding: "24px", background: "#f8fafc" }}>
                <FileText size={24} />
                <strong>No private notes added yet</strong>
                <span>Click "Add Note Manually" above to write or upload a Google Drive note specifically for this student.</span>
              </div>
            )}
          </div>
        )}

        {/* Modal Footer */}
        <div className="modal-footer-bar">
          <button type="button" className="modal-btn-close" onClick={onClose}>
            <X size={14} /> Close
          </button>
        </div>
      </div>
    </div>
  );
}
