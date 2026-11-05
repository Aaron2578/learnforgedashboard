import React, { useState, useMemo } from "react";
import {
  BookOpen,
  Check,
  ExternalLink,
  FileText,
  HardDrive,
  Link2,
  Lock,
  Search,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";
import { getDriveDocTypeLabel } from "../lib/driveUtils.js";

export default function CreateNoteModal({
  isOpen,
  initialCourseId = "",
  initialStudentId = "",
  courses = [],
  students = [],
  enrollments = [],
  supabase,
  user,
  onClose,
  onCreated,
  onToast,
}) {
  const [title, setTitle] = useState("");
  const [courseId, setCourseId] = useState(initialCourseId || "");
  const [category, setCategory] = useState("Lecture Notes");
  const [driveUrl, setDriveUrl] = useState("");
  const [body, setBody] = useState("");
  const [search, setSearch] = useState("");
  const [filterMode, setFilterMode] = useState("all"); // 'all' | 'enrolled' | 'selected'
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Only approved students can receive notes
  const approvedStudents = useMemo(() => {
    return students.filter((s) => s.role === "student" && s.is_approved !== false);
  }, [students]);

  // Enrolled student ID set for currently selected course
  const enrolledStudentIdSet = useMemo(() => {
    if (!courseId) return new Set();
    return new Set(
      enrollments
        .filter((e) => e.course_id === courseId)
        .map((e) => e.student_id)
    );
  }, [enrollments, courseId]);

  const enrolledCount = useMemo(() => {
    if (!courseId) return 0;
    return approvedStudents.filter((s) => enrolledStudentIdSet.has(s.id)).length;
  }, [approvedStudents, enrolledStudentIdSet, courseId]);

  // Selected student IDs (who will receive the note)
  const [selectedStudentIds, setSelectedStudentIds] = useState(() => {
    if (initialStudentId) return [initialStudentId];
    if (initialCourseId) {
      const enrolled = enrollments
        .filter((e) => e.course_id === initialCourseId)
        .map((e) => e.student_id);
      return approvedStudents.filter((s) => enrolled.includes(s.id)).map((s) => s.id);
    }
    return [];
  });

  const selectedSet = useMemo(() => new Set(selectedStudentIds), [selectedStudentIds]);

  const selectedCourse = useMemo(() => {
    return courses.find((c) => c.id === courseId) || null;
  }, [courses, courseId]);

  // When admin changes course, if they want to auto-select enrolled students
  function handleCourseChange(newCourseId) {
    setCourseId(newCourseId);
    if (newCourseId) {
      const enrolled = enrollments
        .filter((e) => e.course_id === newCourseId)
        .map((e) => e.student_id);
      const approvedEnrolled = approvedStudents.filter((s) => enrolled.includes(s.id)).map((s) => s.id);
      if (approvedEnrolled.length > 0 && selectedStudentIds.length === 0) {
        setSelectedStudentIds(approvedEnrolled);
      }
    }
  }

  function toggleStudent(studentId) {
    setSelectedStudentIds((prev) => {
      if (prev.includes(studentId)) {
        return prev.filter((id) => id !== studentId);
      } else {
        return [...prev, studentId];
      }
    });
  }

  function handleSelectAll() {
    setSelectedStudentIds(approvedStudents.map((s) => s.id));
  }

  function handleSelectEnrolled() {
    if (!courseId) return;
    const enrolled = approvedStudents
      .filter((s) => enrolledStudentIdSet.has(s.id))
      .map((s) => s.id);
    setSelectedStudentIds(enrolled);
  }

  function handleClearSelection() {
    setSelectedStudentIds([]);
  }

  // Filter students based on active filter tab and search query
  const displayedStudents = useMemo(() => {
    const q = search.trim().toLowerCase();
    return approvedStudents.filter((s) => {
      if (filterMode === "enrolled" && courseId && !enrolledStudentIdSet.has(s.id)) {
        return false;
      }
      if (filterMode === "selected" && !selectedSet.has(s.id)) {
        return false;
      }
      if (q) {
        const hay = `${s.full_name || ""} ${s.email || ""} ${s.timing || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [approvedStudents, filterMode, courseId, enrolledStudentIdSet, selectedSet, search]);

  const docType = driveUrl ? getDriveDocTypeLabel(driveUrl) : null;

  async function handleSubmit(e) {
    e.preventDefault();
    const cleanTitle = title.trim();
    if (!cleanTitle) {
      setError("Please enter a title for the note.");
      return;
    }

    if (selectedStudentIds.length === 0) {
      setError("Please select at least one student to assign this note to.");
      return;
    }

    setSaving(true);
    setError("");

    try {
      let rawDriveUrl = driveUrl.trim();
      let cleanDriveUrl = null;
      if (rawDriveUrl) {
        if (!/^https?:\/\//i.test(rawDriveUrl)) {
          rawDriveUrl = `https://${rawDriveUrl}`;
        }
        try {
          new URL(rawDriveUrl);
          cleanDriveUrl = rawDriveUrl;
        } catch {
          setError("Please provide a valid Google Drive or web link.");
          setSaving(false);
          return;
        }
      }

      let noteBody = body.trim();
      if (!noteBody) {
        noteBody = cleanDriveUrl
          ? `Lecture notes and study materials via Google Drive.\n\nDrive Link: ${cleanDriveUrl}`
          : "Class study note.";
      }

      let createdMaterialId = null;

      // If a Drive link is provided, create a course_materials record so it appears in Drive & Files
      if (cleanDriveUrl) {
        try {
          const { data: matData, error: matErr } = await supabase
            .from("course_materials")
            .insert({
              title: cleanTitle,
              description: noteBody,
              category: category || "Lecture Notes",
              course_id: courseId || null,
              drive_url: cleanDriveUrl,
              file_type: "application/vnd.google-apps",
              file_size: 0,
              created_by: user?.id || null,
            })
            .select("id")
            .single();

          if (!matErr && matData?.id) {
            createdMaterialId = matData.id;
            // Also assign to material_recipients table
            const recipientInserts = selectedStudentIds.map((sid) => ({
              material_id: matData.id,
              student_id: sid,
            }));
            await supabase
              .from("material_recipients")
              .upsert(recipientInserts, { onConflict: "material_id,student_id" });
          }
        } catch (matEx) {
          console.warn("Could not register in course_materials:", matEx);
        }
      }

      // Now insert student_notes for each selected student
      const notePayloads = selectedStudentIds.map((sid) => ({
        student_id: sid,
        course_id: courseId || null,
        title: cleanTitle,
        body: noteBody,
        drive_url: cleanDriveUrl || null,
        material_id: createdMaterialId || null,
        created_by: user?.id || null,
      }));

      let { error: insertErr } = await supabase.from("student_notes").insert(notePayloads);

      // Fallback if drive_url or material_id column fails
      if (
        insertErr &&
        (insertErr.message?.includes("drive_url") ||
          insertErr.message?.includes("material_id") ||
          insertErr.code === "PGRST204" ||
          insertErr.code === "42703")
      ) {
        const bodyWithDrive =
          cleanDriveUrl && !noteBody.includes(cleanDriveUrl)
            ? `${noteBody}\n\nDrive Link: ${cleanDriveUrl}`
            : noteBody;
        const fallbackPayloads = selectedStudentIds.map((sid) => ({
          student_id: sid,
          course_id: courseId || null,
          title: cleanTitle,
          body: bodyWithDrive,
          created_by: user?.id || null,
        }));
        const retryResult = await supabase.from("student_notes").insert(fallbackPayloads);
        insertErr = retryResult.error;
      }

      if (insertErr) throw insertErr;

      const count = selectedStudentIds.length;
      if (onToast) {
        onToast(`✓ Note "${cleanTitle}" created and assigned to ${count} student${count === 1 ? "" : "s"}!`);
      }
      if (onCreated) onCreated();
      onClose();
    } catch (err) {
      console.error("Failed to create note:", err);
      setError(err.message || "Failed to create note.");
    } finally {
      setSaving(false);
    }
  }

  if (!isOpen) return null;

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="card modal-card assign-material-modal create-note-modal"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: "800px",
          width: "95vw",
          maxHeight: "92vh",
          overflowY: "auto",
        }}
      >
        {/* Header */}
        <div className="assign-modal-header" style={{ marginBottom: "16px" }}>
          <div style={{ display: "flex", gap: "12px", alignItems: "center", minWidth: 0, flex: 1 }}>
            <span
              style={{
                width: "44px",
                height: "44px",
                borderRadius: "10px",
                background: "#eef2ff",
                color: "#4f46e5",
                display: "grid",
                placeItems: "center",
                flexShrink: 0,
              }}
            >
              <FileText size={22} />
            </span>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                {selectedCourse ? (
                  <span className="course-code-badge" style={{ fontSize: "11.5px", fontWeight: 700 }}>
                    {selectedCourse.code}
                  </span>
                ) : (
                  <span className="badge green" style={{ fontSize: "11px" }}>
                    Campus-wide / General
                  </span>
                )}
                <span className="badge-view-only" style={{ background: "#eef2ff", color: "#4f46e5", fontSize: "11px" }}>
                  {category}
                </span>
              </div>
              <h2 style={{ fontSize: "18px", margin: "4px 0 0", color: "var(--ink)", fontWeight: 700 }}>
                Create Note &amp; Assign to Students
              </h2>
              <small style={{ color: "var(--muted)", display: "block", marginTop: "2px" }}>
                Write study notes or link a Google Drive file, and select which students will receive access.
              </small>
            </div>
          </div>

          <button type="button" className="quiet-icon" onClick={onClose} aria-label="Close modal">
            <X size={18} />
          </button>
        </div>

        {error && (
          <div className="portal-alert error" style={{ marginBottom: "14px" }}>
            {error}
            <button type="button" onClick={() => setError("")}>Dismiss</button>
          </div>
        )}

        {/* Workflow Info Callout */}
        <div
          style={{
            padding: "10px 14px",
            background: "#f0fdf4",
            border: "1px solid #bbf7d0",
            borderRadius: "8px",
            display: "flex",
            alignItems: "center",
            gap: "10px",
            marginBottom: "16px",
          }}
        >
          <ShieldCheck size={18} style={{ color: "#166534", flexShrink: 0 }} />
          <div style={{ fontSize: "12.5px", color: "#166534", lineHeight: 1.4 }}>
            <strong>Separate Student Access:</strong> This note will be assigned <strong>individually</strong> to each student you select below. Other students in the same class will not have access unless permitted.
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Note Title */}
          <label className="form-field" style={{ marginBottom: "12px" }}>
            <span>Note Title *</span>
            <input
              type="text"
              required
              maxLength={180}
              placeholder="e.g. Chapter 4 Lecture Summary &amp; Practice Questions"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>

          {/* Course and Category 2-Column Grid */}
          <div className="form-grid-2 form-row-2" style={{ marginBottom: "12px" }}>
            <label className="form-field">
              <span>Subject Code / Course</span>
              <select
                value={courseId}
                onChange={(e) => handleCourseChange(e.target.value)}
              >
                <option value="">General / Campus-wide (All Students)</option>
                {courses.map((course) => (
                  <option key={course.id} value={course.id}>
                    [{course.code}] {course.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="form-field">
              <span>Category</span>
              <select value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="Lecture Notes">Lecture Notes</option>
                <option value="Study Guide">Study Guide</option>
                <option value="Assignment Guidance">Assignment Guidance</option>
                <option value="Revision Sheet">Revision Sheet</option>
                <option value="Exam Prep">Exam Prep</option>
                <option value="Other">Other</option>
              </select>
            </label>
          </div>

          {/* Google Drive Link (Optional) */}
          <div style={{ padding: "12px 14px", background: "#f8fafc", borderRadius: "10px", border: "1px solid #e2e8f0", marginBottom: "14px" }}>
            <label className="form-field" style={{ margin: 0 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                <span style={{ display: "flex", alignItems: "center", gap: "6px", fontWeight: 700, color: "var(--ink)", fontSize: "13px" }}>
                  <HardDrive size={15} style={{ color: "#4f46e5" }} />
                  Google Drive Link (Optional)
                </span>
                {docType && (
                  <span className="badge-view-only" style={{ background: "#eef2ff", color: "#4f46e5", fontSize: "10.5px" }}>
                    {docType} Attached
                  </span>
                )}
              </div>
              <input
                type="url"
                placeholder="https://drive.google.com/file/d/... or https://docs.google.com/..."
                value={driveUrl}
                onChange={(e) => setDriveUrl(e.target.value)}
              />
              <small className="muted" style={{ display: "block", marginTop: "4px", fontSize: "11.5px" }}>
                Attach any Google Doc, Sheet, Slide, or Drive folder. Students can view it in the protected viewer.
              </small>
            </label>
          </div>

          {/* Note Body */}
          <label className="form-field" style={{ marginBottom: "16px" }}>
            <span>Note Instructions &amp; Text Content</span>
            <textarea
              rows={3}
              maxLength={5000}
              placeholder="Write detailed lecture notes, study instructions, formulas, or homework advice for the students..."
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </label>

          {/* ========================================================
              STUDENT ASSIGNMENT SECTION (RESPONSIVE VIEW)
              ======================================================== */}
          <div style={{ borderTop: "2px solid #e2e8f0", paddingTop: "14px", marginBottom: "16px" }}>
            {/* Header with Assigned Counter Badge */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "8px", marginBottom: "10px" }}>
              <span style={{ fontWeight: 750, color: "var(--ink)", display: "flex", alignItems: "center", gap: "6px", fontSize: "14px" }}>
                <Users size={16} style={{ color: "#4f46e5" }} />
                <span>Assign to Each Student *</span>
              </span>
              <span
                style={{
                  fontSize: "11.5px",
                  fontWeight: 700,
                  padding: "3px 10px",
                  borderRadius: "14px",
                  background: selectedStudentIds.length > 0 ? "#dcfce7" : "#f1f5f9",
                  color: selectedStudentIds.length > 0 ? "#15803d" : "#64748b",
                  border: selectedStudentIds.length > 0 ? "1px solid #86efac" : "1px solid #e2e8f0",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                }}
              >
                <Check size={12} strokeWidth={3} />
                {selectedStudentIds.length} Student{selectedStudentIds.length === 1 ? "" : "s"} Assigned
              </span>
            </div>

            {/* Quick Actions & Tabs Bar */}
            <div className="assign-filter-toolbar" style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: "10px", marginBottom: "10px" }}>
              {/* Audience Filter Tabs */}
              <div className="source-toggle-tabs" style={{ margin: 0 }} role="group" aria-label="Student Selection Filter">
                <button
                  type="button"
                  className={`source-toggle-btn ${filterMode === "all" ? "active" : ""}`}
                  onClick={() => setFilterMode("all")}
                >
                  <Users size={13} />
                  <span>All ({approvedStudents.length})</span>
                </button>
                {courseId && (
                  <button
                    type="button"
                    className={`source-toggle-btn ${filterMode === "enrolled" ? "active" : ""}`}
                    onClick={() => setFilterMode("enrolled")}
                  >
                    <BookOpen size={13} />
                    <span>Enrolled ({enrolledCount})</span>
                  </button>
                )}
                <button
                  type="button"
                  className={`source-toggle-btn ${filterMode === "selected" ? "active" : ""}`}
                  onClick={() => setFilterMode("selected")}
                >
                  <Check size={13} />
                  <span>Selected ({selectedStudentIds.length})</span>
                </button>
              </div>

              {/* Quick Select Buttons */}
              <div style={{ display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap" }}>
                <button
                  type="button"
                  className="button compact"
                  style={{ fontSize: "11.5px", minHeight: "32px", padding: "0 8px" }}
                  onClick={handleSelectAll}
                >
                  Select All
                </button>
                {courseId && (
                  <button
                    type="button"
                    className="button compact"
                    style={{ fontSize: "11.5px", minHeight: "32px", padding: "0 8px" }}
                    onClick={handleSelectEnrolled}
                  >
                    Select Enrolled
                  </button>
                )}
                {selectedStudentIds.length > 0 && (
                  <button
                    type="button"
                    className="button compact"
                    style={{ fontSize: "11.5px", minHeight: "32px", padding: "0 8px", color: "var(--danger)" }}
                    onClick={handleClearSelection}
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>

            {/* Search Input */}
            <div style={{ position: "relative", marginBottom: "10px", width: "100%" }}>
              <Search size={14} style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", color: "var(--muted)" }} />
              <input
                type="text"
                placeholder="Search students by name or email…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{
                  width: "100%",
                  padding: "7px 10px 7px 32px",
                  borderRadius: "8px",
                  border: "1px solid var(--line)",
                  fontSize: "12.5px",
                }}
              />
            </div>

            {/* Students List with Checkbox Toggle Cards */}
            <div
              style={{
                maxHeight: "260px",
                overflowY: "auto",
                border: "1px solid var(--line)",
                borderRadius: "10px",
                background: "#ffffff",
              }}
            >
              {displayedStudents.length > 0 ? (
                displayedStudents.map((student, idx) => {
                  const isChecked = selectedSet.has(student.id);
                  const isEnrolled = courseId ? enrolledStudentIdSet.has(student.id) : false;

                  return (
                    <div
                      key={student.id}
                      className="assign-student-row"
                      onClick={() => toggleStudent(student.id)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "10px 14px",
                        borderBottom: idx === displayedStudents.length - 1 ? "none" : "1px solid var(--line)",
                        background: isChecked ? "#f0fdf4" : idx % 2 === 0 ? "#ffffff" : "#fcfcfd",
                        cursor: "pointer",
                        transition: "background 0.15s ease",
                      }}
                    >
                      {/* Left: Checkbox + Avatar + Info */}
                      <div className="assign-student-info" style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: 0, flex: 1 }}>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {}} // Handled by parent click
                          style={{
                            width: "17px",
                            height: "17px",
                            accentColor: "#15803d",
                            cursor: "pointer",
                            flexShrink: 0,
                          }}
                        />
                        <span
                          className="student-avatar"
                          style={{
                            width: "32px",
                            height: "32px",
                            fontSize: "12.5px",
                            background: isChecked ? "#dcfce7" : "#e2e8f0",
                            color: isChecked ? "#15803d" : "#475569",
                            flexShrink: 0,
                          }}
                        >
                          {(student.full_name || student.email || "S").slice(0, 1).toUpperCase()}
                        </span>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                            <strong style={{ fontSize: "13px", color: "var(--ink)" }}>
                              {student.full_name || student.email}
                            </strong>
                            {isEnrolled && (
                              <span
                                className="course-code-badge"
                                style={{ fontSize: "10px", padding: "1px 6px" }}
                                title={`Enrolled in ${selectedCourse?.name || "Course"}`}
                              >
                                {selectedCourse?.code} Enrolled
                              </span>
                            )}
                            {student.timing && (
                              <span style={{ fontSize: "11px", color: "var(--muted)" }}>
                                · {student.timing}
                              </span>
                            )}
                          </div>
                          <small style={{ color: "var(--muted)", fontSize: "11.5px", display: "block" }}>
                            {student.email}
                          </small>
                        </div>
                      </div>

                      {/* Right: Assigned Status Badge & Toggle Pill */}
                      <div className="assign-student-actions" style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
                        <span
                          className="assign-status-badge"
                          style={{
                            fontSize: "11px",
                            fontWeight: 700,
                            padding: "3px 8px",
                            borderRadius: "12px",
                            background: isChecked ? "#dcfce7" : "#f1f5f9",
                            color: isChecked ? "#15803d" : "#64748b",
                            border: isChecked ? "1px solid #86efac" : "1px solid #e2e8f0",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "3px",
                          }}
                        >
                          {isChecked ? (
                            <>
                              <Check size={11} strokeWidth={3} /> Will be Assigned
                            </>
                          ) : (
                            <>
                              <Lock size={11} /> Not Assigned
                            </>
                          )}
                        </span>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div style={{ padding: "28px 16px", textAlign: "center", color: "var(--muted)" }}>
                  <Users size={22} style={{ margin: "0 auto 6px", opacity: 0.5 }} />
                  <p style={{ margin: 0, fontSize: "12.5px" }}>
                    {search ? "No students match your search filter." : "No approved students available."}
                  </p>
                </div>
              )}
            </div>
            <small className="muted" style={{ display: "block", marginTop: "6px", fontSize: "11.5px" }}>
              💡 Click any student row to assign or unassign them from this note.
            </small>
          </div>

          {/* Modal Actions Footer */}
          <div
            className="modal-actions"
            style={{
              display: "flex",
              justifyContent: "flex-end",
              alignItems: "center",
              gap: "10px",
              marginTop: "20px",
              borderTop: "1px solid var(--line)",
              paddingTop: "14px",
            }}
          >
            <button
              type="button"
              className="button"
              onClick={onClose}
              disabled={saving}
              style={{ minHeight: "40px", padding: "0 16px" }}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="button primary"
              disabled={saving || !title.trim() || selectedStudentIds.length === 0}
              style={{
                minHeight: "40px",
                padding: "0 20px",
                fontWeight: 650,
                background: "#4f46e5",
                borderColor: "#4338ca",
              }}
            >
              {saving ? (
                "Saving & Assigning…"
              ) : (
                <>
                  <Check size={14} strokeWidth={2.5} />
                  <span>
                    Save &amp; Assign Note ({selectedStudentIds.length} Student{selectedStudentIds.length === 1 ? "" : "s"})
                  </span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

