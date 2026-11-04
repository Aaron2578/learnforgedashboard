import React, { useState, useEffect, useMemo } from "react";
import {
  BookOpen, Check, Copy, ExternalLink, Eye, HardDrive,
  Link2, Lock, Plus, Search, Shield, ShieldCheck, Trash2,
  Unlock, Users, X
} from "lucide-react";
import { getDriveDocTypeLabel } from "../lib/driveUtils.js";

export default function AssignMaterialModal({
  material,
  courses,
  students,
  enrollments,
  materialRecipients,
  studentNotes = [],
  onClose,
  onAssignStudent,
  onRevokeStudent,
  onPreviewDoc,
}) {
  const [search, setSearch] = useState("");
  const [togglingStudentId, setTogglingStudentId] = useState(null);
  const [notice, setNotice] = useState("");

  const course = useMemo(() => {
    return courses.find((c) => c.id === material.course_id);
  }, [courses, material.course_id]);

  // Set of student IDs enrolled in this material's course
  const enrolledStudentIdSet = useMemo(() => {
    if (!material.course_id) return new Set();
    return new Set(
      enrollments
        .filter((e) => e.course_id === material.course_id)
        .map((e) => e.student_id)
    );
  }, [enrollments, material.course_id]);

  const enrolledStudentsCount = material.course_id
    ? students.filter((s) => enrolledStudentIdSet.has(s.id)).length
    : students.length;

  // Default to enrolled if any are enrolled, otherwise default to all
  const [filterMode, setFilterMode] = useState(() => {
    if (!material.course_id) return "all";
    const count = enrollments.filter((e) => e.course_id === material.course_id).length;
    return count > 0 ? "enrolled" : "all";
  });

  // Base set of assigned student IDs from both materialRecipients and studentNotes
  const baseAssignedIdSet = useMemo(() => {
    const set = new Set();
    const cleanTitle = (material.title || "").trim().toLowerCase();
    const cleanDrive = (material.drive_url || "").trim().toLowerCase();

    for (const mr of (materialRecipients || [])) {
      if (mr?.material_id === material.id && mr?.student_id) {
        set.add(String(mr.student_id).toLowerCase());
      }
    }
    for (const sn of (studentNotes || [])) {
      if (!sn?.student_id) continue;
      const snTitle = (sn.title || "").trim().toLowerCase();
      const snDrive = (sn.drive_url || "").trim().toLowerCase();
      const snBody = (sn.body || "").toLowerCase();

      const matchesMaterialId = sn.material_id && sn.material_id === material.id;
      const matchesTitle = cleanTitle && snTitle === cleanTitle;
      const matchesDriveUrl = cleanDrive && (snDrive === cleanDrive || snBody.includes(cleanDrive));

      if (matchesMaterialId || matchesTitle || matchesDriveUrl) {
        set.add(String(sn.student_id).toLowerCase());
      }
    }
    return set;
  }, [materialRecipients, studentNotes, material.id, material.title, material.drive_url]);

  // Local state for instant optimistic UI responses
  const [localAssignedSet, setLocalAssignedSet] = useState(() => new Set(baseAssignedIdSet));

  useEffect(() => {
    setLocalAssignedSet((prev) => {
      const next = new Set(prev);
      for (const id of baseAssignedIdSet) {
        next.add(id);
      }
      return next;
    });
  }, [baseAssignedIdSet]);

  const assignedStudentIdSet = localAssignedSet;

  // List of student objects currently assigned
  const assignedStudents = useMemo(() => {
    return students.filter((s) => assignedStudentIdSet.has(String(s.id).toLowerCase()));
  }, [students, assignedStudentIdSet]);

  // Filter students based on active tab and search query
  const displayedStudents = useMemo(() => {
    const term = search.trim().toLowerCase();

    return students.filter((s) => {
      const sId = String(s.id).toLowerCase();
      const isAssigned = assignedStudentIdSet.has(sId);
      const isEnrolled = enrolledStudentIdSet.has(s.id);

      // Filter by tab
      if (filterMode === "enrolled" && material.course_id && !isEnrolled) {
        return false;
      }
      if (filterMode === "assigned" && !isAssigned) {
        return false;
      }
      if (filterMode === "unassigned" && isAssigned) {
        return false;
      }

      // Filter by search query
      if (term) {
        const hay = `${s.full_name || ""} ${s.email || ""} ${s.timing || ""}`.toLowerCase();
        if (!hay.includes(term)) return false;
      }

      return true;
    });
  }, [students, assignedStudentIdSet, enrolledStudentIdSet, filterMode, search, material.course_id]);

  const assignedCount = students.filter((s) => assignedStudentIdSet.has(String(s.id).toLowerCase())).length;
  const unassignedCount = Math.max(0, enrolledStudentsCount - assignedCount);

  const docType = material.drive_url ? getDriveDocTypeLabel(material.drive_url) : "PDF File";

  async function handleToggle(studentId, isCurrentlyAssigned) {
    const student = students.find((s) => s.id === studentId);
    const studentName = student?.full_name || student?.email || "Student";
    const sIdLower = String(studentId).toLowerCase();
    setTogglingStudentId(studentId);

    // Instant local UI state update
    setLocalAssignedSet((prev) => {
      const next = new Set(prev);
      if (isCurrentlyAssigned) {
        next.delete(sIdLower);
      } else {
        next.add(sIdLower);
      }
      return next;
    });

    try {
      if (isCurrentlyAssigned) {
        await onRevokeStudent(material, studentId);
        setNotice(`Access revoked from ${studentName}. Status changed to Not Assigned.`);
      } else {
        await onAssignStudent(material, studentId);
        setNotice(`✓ Assigned: ${studentName} — Status is now Assigned! Note is accessible in their student portal.`);
      }
      setTimeout(() => setNotice(""), 4500);
    } catch (err) {
      console.error("Toggle error:", err);
    } finally {
      setTogglingStudentId(null);
    }
  }

  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="modal"
        style={{
          maxWidth: "860px",
          width: "95vw",
          maxHeight: "92vh",
          overflowY: "auto",
          padding: "24px",
          borderRadius: "14px",
        }}
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px" }}>
          <div style={{ display: "flex", gap: "12px", alignItems: "center", minWidth: 0, flex: 1 }}>
            <span
              style={{
                width: "44px",
                height: "44px",
                borderRadius: "10px",
                background: material.drive_url ? "#eef2ff" : "#f1f5f9",
                color: material.drive_url ? "#4f46e5" : "#475569",
                display: "grid",
                placeItems: "center",
                flexShrink: 0,
              }}
            >
              {material.drive_url ? <HardDrive size={22} /> : <BookOpen size={22} />}
            </span>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                {course ? (
                  <span className="course-code-badge" style={{ fontSize: "11.5px", fontWeight: 700 }}>
                    {course.code}
                  </span>
                ) : (
                  <span className="badge green" style={{ fontSize: "11px" }}>
                    Campus-wide
                  </span>
                )}
                <span className="badge-view-only" style={{ background: "#eef2ff", color: "#4f46e5", fontSize: "11px" }}>
                  {material.category || docType}
                </span>
              </div>
              <h2 style={{ fontSize: "18px", margin: "4px 0 0", color: "var(--ink)", fontWeight: 700, textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>
                {material.title}
              </h2>
              {course && (
                <small style={{ color: "var(--muted)", display: "block", marginTop: "2px" }}>
                  Subject: <strong>{course.name}</strong> ({course.code})
                </small>
              )}
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
            <button
              type="button"
              className="button compact"
              onClick={() => onPreviewDoc(material)}
              title="Preview document in dashboard"
            >
              <Eye size={13} /> Preview
            </button>
            <button
              type="button"
              className="quiet-icon"
              onClick={onClose}
              aria-label="Close modal"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Notice alert */}
        {notice && (
          <div className="portal-alert success" style={{ marginBottom: "14px" }}>
            <Check size={14} /> {notice}
            <button type="button" onClick={() => setNotice("")}>Dismiss</button>
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
            <strong>One-Time Upload, Individual Assignment:</strong> This note was uploaded once for Subject Code{" "}
            <strong>{course?.code || "Campus-wide"}</strong>. You can now grant or revoke access for each student separately below.
          </div>
        </div>

        {/* Stats Summary */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "10px", marginBottom: "16px" }}>
          <div style={{ padding: "10px 14px", background: "#f8fafc", borderRadius: "8px", border: "1px solid var(--line)" }}>
            <span style={{ fontSize: "11.5px", color: "var(--muted)", display: "block" }}>
              {material.course_id ? `Enrolled in ${course?.code || "Subject"}` : "Approved Students"}
            </span>
            <strong style={{ fontSize: "18px", color: "var(--ink)" }}>{enrolledStudentsCount}</strong>
          </div>
          <div style={{ padding: "10px 14px", background: "#f0fdf4", borderRadius: "8px", border: "1px solid #bbf7d0" }}>
            <span style={{ fontSize: "11.5px", color: "#166534", display: "block" }}>Assigned Access</span>
            <strong style={{ fontSize: "18px", color: "#15803d" }}>
              {assignedCount} of {enrolledStudentsCount}
            </strong>
          </div>
          <div style={{ padding: "10px 14px", background: "#eff6ff", borderRadius: "8px", border: "1px solid #bfdbfe" }}>
            <span style={{ fontSize: "11.5px", color: "#1e40af", display: "block" }}>Unassigned (Locked)</span>
            <strong style={{ fontSize: "18px", color: "#2563eb" }}>{unassignedCount}</strong>
          </div>
        </div>

        {/* Currently Assigned Students Quick Tray */}
        {assignedStudents.length > 0 && (
          <div
            style={{
              padding: "12px 14px",
              background: "#f0fdf4",
              border: "1px solid #86efac",
              borderRadius: "10px",
              marginBottom: "16px",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: "8px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <Users size={15} style={{ color: "#15803d" }} />
                <strong style={{ fontSize: "13px", color: "#166534" }}>
                  Assigned Students ({assignedStudents.length}):
                </strong>
              </div>
              <span
                style={{
                  fontSize: "10.5px",
                  fontWeight: 700,
                  color: "#166534",
                  background: "#dcfce7",
                  padding: "2px 8px",
                  borderRadius: "12px",
                  border: "1px solid #86efac",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                }}
              >
                <Check size={11} strokeWidth={3} /> Status: Assigned
              </span>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
                gap: "8px",
                maxHeight: "140px",
                overflowY: "auto",
              }}
            >
              {assignedStudents.map((s) => (
                <div
                  key={s.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "6px 8px",
                    background: "#ffffff",
                    borderRadius: "6px",
                    border: "1px solid #bbf7d0",
                    gap: "6px",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", minWidth: 0, flex: 1 }}>
                    <span
                      style={{
                        width: "22px",
                        height: "22px",
                        borderRadius: "50%",
                        background: "#dcfce7",
                        color: "#15803d",
                        fontSize: "10.5px",
                        fontWeight: 700,
                        display: "grid",
                        placeItems: "center",
                        flexShrink: 0,
                      }}
                    >
                      {(s.full_name || s.email).slice(0, 1).toUpperCase()}
                    </span>
                    <strong
                      style={{
                        fontSize: "12px",
                        color: "var(--ink)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                      title={s.full_name || s.email}
                    >
                      {s.full_name || s.email}
                    </strong>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "4px", flexShrink: 0 }}>
                    <span
                      style={{
                        fontSize: "10px",
                        fontWeight: 700,
                        padding: "1px 5px",
                        borderRadius: "4px",
                        background: "#dcfce7",
                        color: "#166534",
                      }}
                    >
                      ✓ Assigned
                    </span>
                    <button
                      type="button"
                      className="quiet-icon danger-icon"
                      style={{ padding: "3px", borderRadius: "4px" }}
                      title={`Revoke access for ${s.full_name || s.email}`}
                      disabled={togglingStudentId === s.id}
                      onClick={() => handleToggle(s.id, true)}
                    >
                      <X size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Controls: Search and Filter Tabs */}
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: "10px", marginBottom: "14px" }}>
          {/* Filter Tabs */}
          <div className="source-toggle-tabs" style={{ margin: 0 }} role="group" aria-label="Student Audience Filter">
            {material.course_id && (
              <button
                type="button"
                className={`source-toggle-btn ${filterMode === "enrolled" ? "active" : ""}`}
                onClick={() => setFilterMode("enrolled")}
              >
                <BookOpen size={13} />
                <span>Enrolled in {course?.code || "Course"} ({enrolledStudentsCount})</span>
              </button>
            )}
            <button
              type="button"
              className={`source-toggle-btn ${filterMode === "all" ? "active" : ""}`}
              onClick={() => setFilterMode("all")}
            >
              <Users size={13} />
              <span>All Students ({students.length})</span>
            </button>
            <button
              type="button"
              className={`source-toggle-btn ${filterMode === "assigned" ? "active" : ""}`}
              onClick={() => setFilterMode("assigned")}
            >
              <Check size={13} />
              <span>Assigned ({assignedCount})</span>
            </button>
            <button
              type="button"
              className={`source-toggle-btn ${filterMode === "unassigned" ? "active" : ""}`}
              onClick={() => setFilterMode("unassigned")}
            >
              <Lock size={13} />
              <span>Unassigned ({unassignedCount})</span>
            </button>
          </div>

          {/* Search box */}
          <div style={{ position: "relative", minWidth: "220px", flex: 1, maxWidth: "340px" }}>
            <Search size={14} style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", color: "var(--muted)" }} />
            <input
              type="text"
              placeholder="Search students by name or email…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: "100%",
                padding: "6px 10px 6px 30px",
                borderRadius: "6px",
                border: "1px solid var(--line)",
                fontSize: "12.5px",
              }}
            />
          </div>
        </div>

        {/* Students List */}
        <div style={{ border: "1px solid var(--line)", borderRadius: "10px", overflow: "hidden" }}>
          {displayedStudents.length > 0 ? (
            <div style={{ maxHeight: "380px", overflowY: "auto" }}>
              {displayedStudents.map((student, idx) => {
                const isAssigned = assignedStudentIdSet.has(String(student.id).toLowerCase());
                const isEnrolled = enrolledStudentIdSet.has(student.id);
                const isToggling = togglingStudentId === student.id;

                return (
                  <div
                    key={student.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "10px 14px",
                      borderBottom: idx === displayedStudents.length - 1 ? "none" : "1px solid var(--line)",
                      background: isAssigned ? "#f0fdf4" : idx % 2 === 0 ? "#ffffff" : "#fcfcfd",
                      gap: "12px",
                      transition: "background 0.15s ease",
                    }}
                  >
                    {/* Student Info */}
                    <div style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: 0, flex: 1 }}>
                      <span
                        className="student-avatar"
                        style={{
                          width: "34px",
                          height: "34px",
                          fontSize: "13px",
                          flexShrink: 0,
                          background: isAssigned ? "#dcfce7" : "#e2e8f0",
                          color: isAssigned ? "#15803d" : "#475569",
                        }}
                      >
                        {(student.full_name || student.email).slice(0, 1).toUpperCase()}
                      </span>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                          <strong style={{ fontSize: "13.5px", color: "var(--ink)" }}>
                            {student.full_name || "Student"}
                          </strong>
                          {isEnrolled && (
                            <span
                              className="course-code-badge"
                              style={{ fontSize: "10px", padding: "1px 6px" }}
                              title={`Enrolled in ${course?.name || "Subject"}`}
                            >
                              {course?.code} Enrolled
                            </span>
                          )}
                          {student.timing && (
                            <span style={{ fontSize: "11px", color: "var(--muted)" }}>
                              · {student.timing}
                            </span>
                          )}
                        </div>
                        <small style={{ color: "var(--muted)", fontSize: "12px", display: "block" }}>
                          {student.email}
                        </small>
                      </div>
                    </div>

                    {/* Access Status & Action Button */}
                    <div style={{ display: "flex", alignItems: "center", gap: "10px", flexShrink: 0 }}>
                      <span
                        style={{
                          fontSize: "11.5px",
                          fontWeight: 700,
                          padding: "4px 10px",
                          borderRadius: "14px",
                          background: isAssigned ? "#dcfce7" : "#f1f5f9",
                          color: isAssigned ? "#166534" : "#64748b",
                          border: isAssigned ? "1px solid #86efac" : "1px solid #e2e8f0",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "4px",
                        }}
                      >
                        {isAssigned ? (
                          <>
                            <Check size={12} strokeWidth={3} /> Status: Assigned
                          </>
                        ) : (
                          <>
                            <Lock size={12} /> Status: Not Assigned
                          </>
                        )}
                      </span>

                      <button
                        type="button"
                        className={`button compact ${isAssigned ? "danger-outline" : "primary"}`}
                        disabled={isToggling}
                        onClick={() => handleToggle(student.id, isAssigned)}
                        style={{ minWidth: "125px", justifyContent: "center" }}
                      >
                        {isToggling ? (
                          "Updating…"
                        ) : isAssigned ? (
                          <>
                            <Lock size={12} /> Revoke Access
                          </>
                        ) : (
                          <>
                            <Plus size={12} /> Assign to Student
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ padding: "32px 16px", textAlign: "center", color: "var(--muted)" }}>
              <Users size={24} style={{ margin: "0 auto 8px", opacity: 0.5 }} />
              <p style={{ margin: 0, fontSize: "13px" }}>
                {search ? "No students match your search filter." : "No students found in this view."}
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "16px" }}>
          <button type="button" className="button" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

