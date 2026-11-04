import React, { useState, useMemo } from "react";
import { Check, Search, Users, X, BookOpen } from "lucide-react";

export default function ManageNoteAccessModal({
  noteGroup,
  students,
  courses,
  enrollments,
  onClose,
  onSave,
  busy,
}) {
  const approvedStudents = useMemo(() => students.filter((s) => s.is_approved), [students]);
  const initialStudentIds = useMemo(() => {
    return noteGroup?.records ? noteGroup.records.map((r) => r.student_id) : (noteGroup?.student_id ? [noteGroup.student_id] : []);
  }, [noteGroup]);

  const [selectedIds, setSelectedIds] = useState(initialStudentIds);
  const [search, setSearch] = useState("");

  const coursesById = useMemo(() => Object.fromEntries(courses.map((c) => [c.id, c])), [courses]);

  const filteredStudents = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return approvedStudents;
    return approvedStudents.filter(
      (s) =>
        s.full_name?.toLowerCase().includes(term) ||
        s.email?.toLowerCase().includes(term)
    );
  }, [approvedStudents, search]);

  const linkedCourse = coursesById[noteGroup?.course_id];

  function toggleStudent(id) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  }

  function selectAll() {
    setSelectedIds(approvedStudents.map((s) => s.id));
  }

  function clearAll() {
    setSelectedIds([]);
  }

  function selectEnrolledInCourse() {
    if (!noteGroup?.course_id) return;
    const enrolledIds = enrollments
      .filter((e) => e.course_id === noteGroup.course_id)
      .map((e) => e.student_id);
    setSelectedIds((prev) => Array.from(new Set([...prev, ...enrolledIds])));
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (selectedIds.length === 0) {
      if (!window.confirm("No students are selected. This will remove access for all students. Continue?")) {
        return;
      }
    }
    onSave(noteGroup, selectedIds);
  }

  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal" role="dialog" aria-modal="true" style={{ maxWidth: "560px" }}>
        <div className="modal-heading">
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <span className="portal-item-icon assignment" style={{ width: "38px", height: "38px" }}>
              <Users size={18} />
            </span>
            <div>
              <h2>Manage Student Access</h2>
              <p>Check the boxes of all students who should have access to this note.</p>
            </div>
          </div>
          <button type="button" className="quiet-icon" onClick={onClose} aria-label="Close dialog">
            <X size={18} />
          </button>
        </div>

        <div style={{ padding: "12px 14px", background: "var(--canvas, #f8fafc)", border: "1px solid var(--line, #e2e8f0)", borderRadius: "10px", marginBottom: "16px" }}>
          <strong style={{ fontSize: "14px", color: "var(--ink)" }}>{noteGroup?.title}</strong>
          {linkedCourse && (
            <div style={{ marginTop: "4px" }}>
              <span className="badge blue" style={{ fontSize: "11px" }}>
                {linkedCourse.code} · {linkedCourse.name}
              </span>
            </div>
          )}
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", flexWrap: "wrap", marginBottom: "10px" }}>
            <div style={{ display: "flex", gap: "6px" }}>
              <button
                type="button"
                className="button compact"
                onClick={selectAll}
                style={{ fontSize: "12px", height: "30px" }}
              >
                Select All ({approvedStudents.length})
              </button>
              <button
                type="button"
                className="button compact"
                onClick={clearAll}
                style={{ fontSize: "12px", height: "30px" }}
              >
                Clear
              </button>
              {noteGroup?.course_id && (
                <button
                  type="button"
                  className="button compact primary"
                  onClick={selectEnrolledInCourse}
                  style={{ fontSize: "12px", height: "30px" }}
                  title="Select all students enrolled in this course"
                >
                  <BookOpen size={12} /> Enrolled Students
                </button>
              )}
            </div>

            <span style={{ fontSize: "12px", fontWeight: "650", color: selectedIds.length > 0 ? "var(--blue)" : "var(--muted)" }}>
              {selectedIds.length} student{selectedIds.length === 1 ? "" : "s"} selected
            </span>
          </div>

          <div style={{ marginBottom: "10px" }}>
            <div style={{ position: "relative" }}>
              <input
                type="search"
                placeholder="Search students by name or email..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ width: "100%", height: "36px", paddingLeft: "32px", fontSize: "13px" }}
              />
              <Search
                size={14}
                style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", color: "var(--muted)" }}
              />
            </div>
          </div>

          <div
            style={{
              maxHeight: "260px",
              overflowY: "auto",
              display: "grid",
              gap: "6px",
              padding: "4px",
              border: "1px solid var(--line, #e2e8f0)",
              borderRadius: "10px",
              background: "#ffffff",
            }}
          >
            {filteredStudents.map((student) => {
              const isChecked = selectedIds.includes(student.id);
              const isCurrentlyGranted = initialStudentIds.includes(student.id);
              const enrolledCourses = enrollments
                .filter((e) => e.student_id === student.id)
                .map((e) => coursesById[e.course_id]?.code)
                .filter(Boolean);

              return (
                <label
                  key={student.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    padding: "8px 12px",
                    borderRadius: "8px",
                    border: "1px solid",
                    borderColor: isChecked ? "var(--blue, #4f46e5)" : "var(--line, #e2e8f0)",
                    background: isChecked ? "var(--blue-soft, #eef2ff)" : "#ffffff",
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => toggleStudent(student.id)}
                    style={{ width: "16px", height: "16px", accentColor: "var(--blue, #4f46e5)" }}
                  />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <strong style={{ fontSize: "13px", color: "var(--ink)" }}>
                        {student.full_name || student.email}
                      </strong>
                      {isCurrentlyGranted && (
                        <span className="badge green" style={{ fontSize: "10px", padding: "1px 6px" }}>
                          Has Access
                        </span>
                      )}
                    </div>
                    <small style={{ color: "var(--muted)", fontSize: "11.5px" }}>
                      {student.email}
                    </small>
                  </div>
                  {enrolledCourses.length > 0 && (
                    <div style={{ display: "flex", gap: "4px", flexShrink: 0 }}>
                      {enrolledCourses.slice(0, 2).map((code) => (
                        <span key={code} className="badge blue" style={{ fontSize: "10px", padding: "1px 5px" }}>
                          {code}
                        </span>
                      ))}
                    </div>
                  )}
                </label>
              );
            })}
            {!filteredStudents.length && (
              <p style={{ textAlign: "center", color: "var(--muted)", fontStyle: "italic", padding: "16px 0" }}>
                No approved students found matching "{search}".
              </p>
            )}
          </div>

          <div
            className="modal-actions"
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginTop: "20px",
              paddingTop: "14px",
              borderTop: "1px solid var(--line, #e2e8f0)",
            }}
          >
            <button type="button" className="button" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button type="submit" className="button primary" disabled={busy}>
              <Check size={14} />
              {busy ? "Saving…" : `Save Access (${selectedIds.length} Students)`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

