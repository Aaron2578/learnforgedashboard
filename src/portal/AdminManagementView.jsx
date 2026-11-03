import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowRight, BookOpen, Check, Clock3, Copy, Database, ExternalLink, Eye,
  FileSpreadsheet, FileText, GraduationCap, HardDrive, KeyRound, Link2, Mail, MapPin,
  Pencil, Plus, RefreshCw, Search, ShieldCheck, Trash2, Upload, Users, X
} from "lucide-react";
import { getFunctionErrorMessage } from "../lib/functionErrors.js";
import EditCourseModal from "../components/EditCourseModal";
import EditRecordModal from "../components/EditRecordModal";
import EditStudentModal from "../components/EditStudentModal";
import AttendanceCalendar from "../components/AttendanceCalendar";
import SecureDocumentViewer from "../components/SecureDocumentViewer";
import StudentAccessModal from "../components/StudentAccessModal";
import { extractDriveUrl, cleanNoteBody, getDriveDocTypeLabel } from "../lib/driveUtils.js";

const headings = {
  Overview: ["Workspace", "Admin overview", "Manage students, course access, and learning records in one place."],
  Students: ["People", "Students", "Approve access, invite students, and manage student accounts."],
  Courses: ["Academic programs", "Courses", "Create courses, manage schedules and instructors, and enroll students."],
  Attendance: ["Academic operations", "Attendance", "Record and review daily student attendance."],
  Notes: ["Academic & Student support", "Notes", "Upload and share lecture notes, study materials, and student notes via Google Drive links or direct text."],
};

function formatCourseDate(value) {
  if (!value) return "Recently added";
  try {
    const d = new Date(value);
    if (isNaN(d.getTime())) return "Recently added";
    return `Added ${new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(d)}`;
  } catch {
    return "Recently added";
  }
}

function AdminManagementView({ view, supabase, user, query, onToast, onNavigate }) {
  const [students, setStudents] = useState([]);
  const [courses, setCourses] = useState([]);
  const [enrollments, setEnrollments] = useState([]);
  const [records, setRecords] = useState([]);
  const [storageStats, setStorageStats] = useState(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingCourse, setEditingCourse] = useState(null);
  const [editingRecord, setEditingRecord] = useState(null);
  const [editingStudent, setEditingStudent] = useState(null);
  const [inviteMode, setInviteMode] = useState("single");
  const [studentStatus, setStudentStatus] = useState("all");
  const [studentSearch, setStudentSearch] = useState("");
  const [courseSessionFilter, setCourseSessionFilter] = useState("all");
  const [attendancePrefillDate, setAttendancePrefillDate] = useState("");
  const [recentInvites, setRecentInvites] = useState([]);

  // Notes & Access state
  const [viewingNoteDoc, setViewingNoteDoc] = useState(null);
  const [noteRecipientType, setNoteRecipientType] = useState("single"); // individual student
  const [noteDriveUrl, setNoteDriveUrl] = useState("");
  const [noteFilter, setNoteFilter] = useState("all"); // "all" | "drive"
  const [notePrefillStudentId, setNotePrefillStudentId] = useState("");
  const [selectedStudentFilter, setSelectedStudentFilter] = useState("all");
  const [notesSummary, setNotesSummary] = useState([]);
  const [managingStudentAccess, setManagingStudentAccess] = useState(null);
  const [materials, setMaterials] = useState([]);
  const [assessments, setAssessments] = useState([]);
  const [assessmentRecipients, setAssessmentRecipients] = useState([]);
  const [materialRecipients, setMaterialRecipients] = useState([]);
  const [allStudentNotes, setAllStudentNotes] = useState([]);
  const [sharingNoteRecord, setSharingNoteRecord] = useState(null);
  const [shareTargetStudentId, setShareTargetStudentId] = useState("");
  const [sharingBusy, setSharingBusy] = useState(false);

  const notesCountByStudent = useMemo(() => {
    const map = {};
    for (const item of notesSummary) {
      if (item.student_id) {
        map[item.student_id] = (map[item.student_id] || 0) + 1;
      }
    }
    return map;
  }, [notesSummary]);

  const loadData = useCallback(async (forceLoading = false) => {
    if (forceLoading) setLoading(true);
    setError("");
    try {
      const [
        studentResult,
        courseResult,
        enrollmentResult,
        storageResult,
        notesSummaryResult,
        materialsResult,
        assessmentsResult,
        assessmentRecipientsResult,
        materialRecipientsResult,
        allNotesResult,
      ] = await Promise.all([
        supabase.from("profiles").select("id, email, full_name, is_approved, timing, created_at").eq("role", "student").order("created_at", { ascending: false }),
        supabase.from("courses").select("id, name, code, description, department, instructor, schedule, room, created_at").order("created_at", { ascending: false }),
        supabase.from("course_enrollments").select("course_id, student_id"),
        supabase.rpc("get_database_storage_stats"),
        supabase.from("student_notes").select("id, student_id"),
        supabase.from("course_materials").select("*").order("created_at", { ascending: false }),
        supabase.from("assessments").select("id, title, description, course_id, due_at, published, created_at").order("created_at", { ascending: false }),
        supabase.from("assessment_recipients").select("assessment_id, student_id"),
        supabase.from("material_recipients").select("material_id, student_id").then((r) => r.error ? { data: [] } : r),
        supabase.from("student_notes").select("id, student_id, course_id, title, body, drive_url, material_id, created_at").order("created_at", { ascending: false }).then(async (r) => {
          if (r.error && (r.error.message?.includes("drive_url") || r.error.message?.includes("material_id") || r.error.code === "PGRST204" || r.error.code === "42703")) {
            return supabase.from("student_notes").select("id, student_id, course_id, title, body, created_at").order("created_at", { ascending: false });
          }
          return r;
        }),
      ]);
      const failure = [studentResult, courseResult, enrollmentResult].find((result) => result.error);
      if (failure) {
        setError(failure.error.message);
        setLoading(false);
        return;
      }
      setStudents(studentResult.data ?? []);
      setCourses(courseResult.data ?? []);
      setEnrollments(enrollmentResult.data ?? []);
      setMaterials(materialsResult.data ?? []);
      setAssessments(assessmentsResult.data ?? []);
      setAssessmentRecipients(assessmentRecipientsResult.data ?? []);
      setMaterialRecipients(materialRecipientsResult.data ?? []);
      const loadedAllNotes = allNotesResult.data ?? [];
      setAllStudentNotes(loadedAllNotes);

      if (notesSummaryResult?.data) {
        setNotesSummary(notesSummaryResult.data);
      }
      if (storageResult && !storageResult.error && storageResult.data) {
        setStorageStats(storageResult.data);
      }

      if (view === "Attendance") {
        const { data, error: resultError } = await supabase.from("attendance_records")
          .select("id, student_id, course_id, attendance_date, status, note, created_at")
          .order("attendance_date", { ascending: false });
        if (resultError) setError(resultError.message);
        else setRecords(data ?? []);
      } else if (view === "Notes") {
        setRecords(loadedAllNotes);
      }
    } catch (err) {
      setError(err.message || "Failed to load management records.");
    } finally {
      setLoading(false);
    }
  }, [supabase, view]);

  useEffect(() => { loadData(true); }, [loadData]);

  useEffect(() => {
    if (!supabase) return;
    const channel = supabase
      .channel(`admin-management-realtime-${view}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, () => loadData())
      .on("postgres_changes", { event: "*", schema: "public", table: "courses" }, () => loadData())
      .on("postgres_changes", { event: "*", schema: "public", table: "course_enrollments" }, () => loadData())
      .on("postgres_changes", { event: "*", schema: "public", table: "attendance_records" }, () => loadData())
      .on("postgres_changes", { event: "*", schema: "public", table: "student_notes" }, () => loadData())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, view, loadData]);

  async function approveStudent(student, isApproved) {
    setBusy(true);
    setError("");
    const { error: updateError } = await supabase.from("profiles").update({ is_approved: isApproved }).eq("id", student.id);
    if (updateError) setError(updateError.message);
    else {
      if (isApproved) {
        const { data: assignResult } = await supabase.from("assignments").select("id").eq("published", true);
        if (assignResult?.length) {
          await supabase.from("assignment_recipients").upsert(assignResult.map((a) => ({ assignment_id: a.id, student_id: student.id })), { onConflict: "assignment_id,student_id" });
        }
      }
      onToast(isApproved ? `${student.full_name || student.email} approved.` : "Student access suspended.");
      await loadData();
    }
    setBusy(false);
  }

  async function deleteStudent(student) {
    if (!window.confirm(`Permanently delete ${student.full_name || student.email} and their portal data? This cannot be undone.`)) return;
    setBusy(true);
    setError("");
    const { data, error: deleteError } = await supabase.functions.invoke("admin-actions", {
      body: { action: "delete_student", studentId: student.id },
    });
    if (deleteError || data?.error) setError(deleteError ? await getFunctionErrorMessage(deleteError) : data.error);
    else {
      onToast("Student account and associated records deleted.");
      await loadData();
    }
    setBusy(false);
  }

  async function copyInviteLink(student) {
    setBusy(true);
    setError("");
    try {
      const { data, error: linkError } = await supabase.functions.invoke("admin-actions", {
        body: { action: "get_invite_link", email: student.email, appUrl: window.location.origin },
      });
      if (linkError || data?.error) {
        setError(linkError ? await getFunctionErrorMessage(linkError) : data.error);
      } else if (data?.actionLink) {
        await navigator.clipboard.writeText(data.actionLink);
        onToast(`Sign-in link for ${student.email} copied to clipboard!`);
      }
    } catch (err) {
      setError(`Could not generate invite link: ${err.message}`);
    } finally {
      setBusy(false);
    }
  }

  async function inviteStudent(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(event.currentTarget);
    const invitees = inviteMode === "single"
      ? [{ fullName: String(values.get("full_name")).trim(), email: String(values.get("email")).trim().toLowerCase() }]
      : String(values.get("invite_list"))
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
          const separator = line.indexOf(",");
          return separator === -1
            ? { fullName: "", email: line.trim().toLowerCase() }
            : { fullName: line.slice(0, separator).trim(), email: line.slice(separator + 1).trim().toLowerCase() };
        });
    if (!invitees.length || invitees.length > 25) {
      setError("Enter between 1 and 25 student email addresses.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const { data, error: inviteError } = await supabase.functions.invoke("admin-actions", {
        body: { action: "invite_students", students: invitees, appUrl: window.location.origin },
      });
      if (inviteError || data?.error) {
        setError(inviteError ? await getFunctionErrorMessage(inviteError) : data.error);
      } else {
        form.reset();
        setShowForm(false);
        setInviteMode("single");
        if (data.sent > 0) {
          if (data.emailSent) {
            onToast(`${data.sent} student ${data.sent === 1 ? "invitation" : "invitations"} emailed.`);
          } else {
            onToast(`${data.sent} student account${data.sent === 1 ? "" : "s"} added successfully.`);
          }
        }
        if (data.failed?.length) setError(`${data.sent} invitation(s) sent. ${data.failed.map((item) => `${item.email}: ${item.error}`).join(" ")}`);
        if (data.inviteLinks?.length) {
          setRecentInvites(data.inviteLinks);
        }
        await loadData();
      }
    } catch (inviteError) {
      setError(`Could not send student invitation: ${inviteError.message || "Unexpected error."}`);
    } finally {
      setBusy(false);
    }
  }

  async function createCourse(event) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const studentIds = values.getAll("student_ids");
    setBusy(true);
    setError("");
    const { data: course, error: createError } = await supabase.from("courses").insert({
      name: String(values.get("name")).trim(),
      code: String(values.get("code")).trim().toUpperCase(),
      department: String(values.get("department") || "").trim(),
      instructor: String(values.get("instructor") || "").trim(),
      schedule: null,
      room: String(values.get("room") || "").trim(),
      description: String(values.get("description") || "").trim(),
      created_by: user.id,
    }).select("id").single();
    if (createError) {
      setError(createError.message);
      setBusy(false);
      return;
    }
    if (studentIds.length > 0) {
      const { error: enrollError } = await supabase.from("course_enrollments").insert(studentIds.map((studentId) => ({ course_id: course.id, student_id: studentId })));
      if (enrollError) {
        setError(`Course created, but some students could not be enrolled: ${enrollError.message}`);
      }
    }
    setShowForm(false);
    onToast(studentIds.length > 0 ? "Course created and students enrolled." : "Course created successfully.");
    await loadData();
    setBusy(false);
  }

  async function updateCourse(courseId, formData) {
    setBusy(true);
    setError("");
    try {
      const { error: updateError } = await supabase
        .from("courses")
        .update({
          name: formData.name.trim(),
          code: formData.code.trim().toUpperCase(),
          department: (formData.department || "").trim(),
          instructor: (formData.instructor || "").trim(),
          schedule: (formData.schedule || "").trim(),
          room: (formData.room || "").trim(),
          description: (formData.description || "").trim(),
        })
        .eq("id", courseId);

      if (updateError) throw updateError;

      onToast(`Course “${formData.name}” updated successfully.`);
      setEditingCourse(null);
      await loadData();
    } catch (err) {
      setError(`Could not update course: ${err.message}`);
    } finally {
      setBusy(false);
    }
  }

  async function enrollStudentInCourse(courseId, studentId) {
    if (!studentId) return;
    setBusy(true);
    setError("");
    const { error: enrollError } = await supabase.from("course_enrollments").insert({
      course_id: courseId,
      student_id: studentId,
    });
    if (enrollError) {
      setError(`Could not enroll student: ${enrollError.message}`);
    } else {
      onToast("Student enrolled in course.");
      await loadData();
    }
    setBusy(false);
  }

  async function unenrollStudentFromCourse(courseId, studentId) {
    setBusy(true);
    setError("");
    const { error: unenrollError } = await supabase.from("course_enrollments")
      .delete()
      .eq("course_id", courseId)
      .eq("student_id", studentId);
    if (unenrollError) {
      setError(`Could not remove student: ${unenrollError.message}`);
    } else {
      onToast("Student removed from course.");
      await loadData();
    }
    setBusy(false);
  }

  async function deleteCourse(course) {
    if (!window.confirm(`Delete course “${course.name}”? Course attendance will be deleted and linked student notes will remain without a course.`)) return;
    const { error: deleteError } = await supabase.from("courses").delete().eq("id", course.id);
    if (deleteError) setError(deleteError.message);
    else {
      onToast("Course deleted.");
      await loadData();
    }
  }

  async function createRecord(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(event.currentTarget);
    setBusy(true);
    setError("");

    if (view === "Attendance") {
      const payload = {
        student_id: values.get("student_id"),
        course_id: values.get("course_id") || null,
        attendance_date: values.get("attendance_date"),
        status: values.get("status"),
        note: String(values.get("note") || "").trim(),
        created_by: user.id,
      };
      const { error: insertError } = await supabase.from("attendance_records").insert(payload);
      if (insertError) {
        setError(insertError.message);
      } else {
        setShowForm(false);
        form.reset();
        onToast("Attendance recorded.");
        await loadData();
      }
      setBusy(false);
      return;
    }

    // view === "Notes" - strictly per-student individual note access
    const selectedStudentId = values.get("student_id") || notePrefillStudentId;
    const courseId = values.get("course_id") || null;
    const title = String(values.get("title") || "").trim();
    const driveUrl = String(values.get("drive_url") || noteDriveUrl || "").trim();
    let body = String(values.get("body") || "").trim();

    if (!title) {
      setError("Note title is required.");
      setBusy(false);
      return;
    }

    if (!selectedStudentId) {
      setError("Please select the student who will receive this note. Each note must be assigned to an individual student.");
      setBusy(false);
      return;
    }

    if (!body) {
      body = driveUrl
        ? `Study notes and learning materials via Google Drive.\n\nDrive Link: ${driveUrl}`
        : "Class note";
    }

    const payloadWithDrive = {
      student_id: selectedStudentId,
      course_id: courseId,
      title,
      body,
      drive_url: driveUrl || null,
      created_by: user.id,
    };

    let { error: insertError } = await supabase.from("student_notes").insert(payloadWithDrive);

    // Fallback if drive_url column not in DB yet
    if (insertError && (insertError.message?.includes("drive_url") || insertError.code === "PGRST204" || insertError.code === "42703")) {
      const bodyWithDrive = driveUrl && !body.includes(driveUrl) ? `${body}\n\nDrive Link: ${driveUrl}` : body;
      const payloadFallback = {
        student_id: selectedStudentId,
        course_id: courseId,
        title,
        body: bodyWithDrive,
        created_by: user.id,
      };
      const retryResult = await supabase.from("student_notes").insert(payloadFallback);
      insertError = retryResult.error;
    }

    if (insertError) {
      setError(insertError.message);
    } else {
      setShowForm(false);
      form.reset();
      setNoteDriveUrl("");
      setNotePrefillStudentId("");
      const studentName = studentsById[selectedStudentId]?.full_name || studentsById[selectedStudentId]?.email || "Student";
      onToast(`Note and Drive link saved and permitted for ${studentName}.`);
      await loadData();
    }
    setBusy(false);
  }

  async function deleteRecord(record) {
    const table = view === "Attendance" ? "attendance_records" : "student_notes";
    const { error: deleteError } = await supabase.from(table).delete().eq("id", record.id);
    if (deleteError) setError(deleteError.message);
    else {
      onToast(view === "Attendance" ? "Attendance record deleted." : "Note deleted.");
      await loadData();
    }
  }

  async function updateRecord(recordId, payload) {
    setBusy(true);
    setError("");
    const isAttendance = view === "Attendance";
    const table = isAttendance ? "attendance_records" : "student_notes";
    let { error: updateError } = await supabase.from(table).update(payload).eq("id", recordId);
    if (updateError && !isAttendance && (updateError.message?.includes("drive_url") || updateError.code === "PGRST204" || updateError.code === "42703")) {
      const { drive_url, ...fallbackPayload } = payload;
      if (drive_url && !fallbackPayload.body?.includes(drive_url)) {
        fallbackPayload.body = `${fallbackPayload.body || ""}\n\nDrive Link: ${drive_url}`.trim();
      }
      const retryResult = await supabase.from(table).update(fallbackPayload).eq("id", recordId);
      updateError = retryResult.error;
    }
    if (updateError) {
      setError(updateError.message);
    } else {
      setEditingRecord(null);
      onToast(isAttendance ? "Attendance updated." : "Note updated successfully.");
      await loadData();
    }
    setBusy(false);
  }

  async function updateStudentProfile(studentId, updates) {
    setBusy(true);
    setError("");
    const { error: updateError } = await supabase.from("profiles").update(updates).eq("id", studentId);
    if (updateError) {
      setError(updateError.message);
    } else {
      setEditingStudent(null);
      onToast("Student profile updated.");
      await loadData();
    }
    setBusy(false);
  }

  async function handlePermitNoteForStudent(material, studentId) {
    try {
      await supabase.from("material_recipients").upsert({ material_id: material.id, student_id: studentId }, { onConflict: "material_id,student_id" });
      const existing = allStudentNotes.find((n) => n.student_id === studentId && (n.material_id === material.id || n.title === material.title));
      if (!existing) {
        let { error: insertErr } = await supabase.from("student_notes").insert({
          student_id: studentId,
          course_id: material.course_id,
          title: material.title,
          body: material.description || `Course study material: ${material.title}`,
          drive_url: material.drive_url || null,
          material_id: material.id,
          created_by: user.id,
        });
        if (insertErr && (insertErr.message?.includes("drive_url") || insertErr.message?.includes("material_id") || insertErr.code === "PGRST204" || insertErr.code === "42703")) {
          const bodyWithDrive = material.drive_url ? `${material.description || ""}\n\nDrive Link: ${material.drive_url}`.trim() : (material.description || "Course note");
          await supabase.from("student_notes").insert({
            student_id: studentId,
            course_id: material.course_id,
            title: material.title,
            body: bodyWithDrive,
            created_by: user.id,
          });
        }
      }
      onToast(`Note "${material.title}" permitted for student.`);
      await loadData();
    } catch (err) {
      setError(`Could not permit note: ${err.message}`);
    }
  }

  async function handleRevokeNoteForStudent(material, studentId) {
    try {
      await supabase.from("material_recipients").delete().eq("material_id", material.id).eq("student_id", studentId);
      await supabase.from("student_notes").delete().eq("student_id", studentId).eq("title", material.title);
      onToast(`Access to "${material.title}" revoked.`);
      await loadData();
    } catch (err) {
      setError(`Could not revoke note: ${err.message}`);
    }
  }

  async function handlePermitTestForStudent(test, studentId) {
    try {
      const { error: insErr } = await supabase.from("assessment_recipients").upsert({ assessment_id: test.id, student_id: studentId }, { onConflict: "assessment_id,student_id" });
      if (insErr) throw insErr;
      onToast(`Test "${test.title}" permitted for student.`);
      await loadData();
    } catch (err) {
      setError(`Could not permit test: ${err.message}`);
    }
  }

  async function handleRevokeTestForStudent(test, studentId) {
    try {
      const { error: delErr } = await supabase.from("assessment_recipients").delete().eq("assessment_id", test.id).eq("student_id", studentId);
      if (delErr) throw delErr;
      onToast(`Test access for "${test.title}" revoked.`);
      await loadData();
    } catch (err) {
      setError(`Could not revoke test: ${err.message}`);
    }
  }

  async function handleAddManualNoteForStudent(payload) {
    let { error: insertErr } = await supabase.from("student_notes").insert({
      student_id: payload.student_id,
      course_id: payload.course_id || null,
      title: payload.title,
      body: payload.body,
      drive_url: payload.drive_url || null,
      created_by: user.id,
    });
    if (insertErr && (insertErr.message?.includes("drive_url") || insertErr.code === "PGRST204" || insertErr.code === "42703")) {
      const bodyWithDrive = payload.drive_url && !payload.body?.includes(payload.drive_url)
        ? `${payload.body}\n\nDrive Link: ${payload.drive_url}`
        : payload.body;
      const retry = await supabase.from("student_notes").insert({
        student_id: payload.student_id,
        course_id: payload.course_id || null,
        title: payload.title,
        body: bodyWithDrive,
        created_by: user.id,
      });
      insertErr = retry.error;
    }
    if (insertErr) throw insertErr;
    onToast("Note added and permitted for student.");
    await loadData();
  }

  async function handleDeleteManualNoteForStudent(noteId) {
    const { error: delErr } = await supabase.from("student_notes").delete().eq("id", noteId);
    if (delErr) {
      setError(delErr.message);
    } else {
      onToast("Note deleted.");
      await loadData();
    }
  }

  async function handleShareNoteWithAnotherStudent(noteRecord, targetStudentId) {
    if (!targetStudentId) return;
    setSharingBusy(true);
    try {
      const existing = allStudentNotes.find((n) => n.student_id === targetStudentId && n.title === noteRecord.title);
      if (existing) {
        setError(`${studentsById[targetStudentId]?.full_name || "This student"} already has this note permitted.`);
        setSharingBusy(false);
        return;
      }
      let { error: insErr } = await supabase.from("student_notes").insert({
        student_id: targetStudentId,
        course_id: noteRecord.course_id || null,
        title: noteRecord.title,
        body: noteRecord.body,
        drive_url: noteRecord.drive_url || null,
        material_id: noteRecord.material_id || null,
        created_by: user.id,
      });
      if (insErr && (insErr.message?.includes("drive_url") || insErr.message?.includes("material_id") || insErr.code === "PGRST204" || insErr.code === "42703")) {
        await supabase.from("student_notes").insert({
          student_id: targetStudentId,
          course_id: noteRecord.course_id || null,
          title: noteRecord.title,
          body: noteRecord.body,
          created_by: user.id,
        });
      }
      if (noteRecord.material_id) {
        await supabase.from("material_recipients").upsert({
          material_id: noteRecord.material_id,
          student_id: targetStudentId,
        }, { onConflict: "material_id,student_id" });
      }
      onToast(`Note and Drive link granted to ${studentsById[targetStudentId]?.full_name || studentsById[targetStudentId]?.email}.`);
      setSharingNoteRecord(null);
      setShareTargetStudentId("");
      await loadData();
    } catch (err) {
      setError(`Could not grant note: ${err.message}`);
    } finally {
      setSharingBusy(false);
    }
  }

  const filteredStudents = students.filter((student) => {
    const matchesQuery = `${student.full_name} ${student.email}`.toLowerCase().includes(`${query} ${studentSearch}`.trim().toLowerCase());
    const matchesStatus = studentStatus === "all" || (studentStatus === "pending" ? !student.is_approved : student.is_approved);
    return matchesQuery && matchesStatus;
  });
  const filteredCourses = courses.filter((course) => {
    const hay = `${course.name} ${course.code} ${course.department || ""} ${course.instructor || ""} ${course.room || ""} ${course.description || ""}`.toLowerCase();
    return hay.includes(query.trim().toLowerCase());
  });

  const itCourses = useMemo(() => {
    return filteredCourses.filter(
      (c) => (c.department || "").toUpperCase() === "IT" ||
             (c.code || "").toUpperCase().startsWith("TMIT") ||
             /JAVA|PYTHON|REACT|WEB|SQL|CLOUD|NODE|FULL STACK/i.test(c.name || "")
    );
  }, [filteredCourses]);

  const sapCourses = useMemo(() => {
    return filteredCourses.filter(
      (c) => (c.department || "").toUpperCase() === "SAP" ||
             (c.code || "").toUpperCase().startsWith("TMSAP") ||
             /SAP|FICO|MM|SD|ABAP|HANA/i.test(c.name || "")
    );
  }, [filteredCourses]);

  const otherCourses = useMemo(() => {
    const itIds = new Set(itCourses.map((c) => c.id));
    const sapIds = new Set(sapCourses.map((c) => c.id));
    return filteredCourses.filter((c) => !itIds.has(c.id) && !sapIds.has(c.id));
  }, [filteredCourses, itCourses, sapCourses]);

  const studentsById = Object.fromEntries(students.map((student) => [student.id, student]));
  const coursesById = Object.fromEntries(courses.map((course) => [course.id, course]));

  function renderCourseCard(course) {
    const enrolled = enrollments.filter((row) => row.course_id === course.id);
    const enrolledIds = new Set(enrolled.map((r) => r.student_id));
    const eligibleStudents = students.filter((s) => s.is_approved && !enrolledIds.has(s.id));
    return (
      <article
        className="card interactive-course-card"
        key={course.id}
        onClick={() => setEditingCourse(course)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setEditingCourse(course);
          }
        }}
        title="Click anywhere to edit this course"
      >
        <div className="course-card-top">
          <div className="course-badges-group">
            <span className="course-code-badge">{course.code}</span>
            {course.department && <span className="course-dept-badge">{course.department}</span>}
          </div>
          <div className="course-card-actions" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="button compact course-edit-btn"
              onClick={() => setEditingCourse(course)}
              title="Edit course details"
            >
              <Pencil size={12} /> Edit
            </button>
            <button
              type="button"
              className="quiet-icon danger-icon"
              onClick={() => deleteCourse(course)}
              title={`Delete course ${course.name}`}
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>

        <div className="course-card-body">
          <h3 className="course-card-title">{course.name}</h3>
          {course.description ? (
            <p className="course-card-description">{course.description}</p>
          ) : (
            <p className="course-card-description placeholder">No description or syllabus added yet.</p>
          )}
        </div>

        <div className="course-meta-chips">
          {course.instructor && (
            <span className="course-meta-chip" title="Instructor / Faculty">
              <GraduationCap size={13} /> {course.instructor}
            </span>
          )}
          {course.room && (
            <span className="course-meta-chip" title="Classroom / Lab">
              <MapPin size={13} /> {course.room}
            </span>
          )}
          {!course.instructor && !course.room && (
            <span className="course-meta-chip muted">
              <GraduationCap size={13} /> Faculty TBA
            </span>
          )}
        </div>

        <div className="course-card-roster" onClick={(e) => e.stopPropagation()}>
          <div className="roster-header">
            <strong><Users size={13} /> Enrolled students ({enrolled.length})</strong>
          </div>

          <div className="enrolled-chips-list mini">
            {enrolled.map((row) => {
              const student = studentsById[row.student_id];
              const name = student?.full_name || student?.email || "Student";
              return (
                <span key={row.student_id} className="enrolled-student-chip">
                  <span className="chip-avatar">{name.slice(0, 1).toUpperCase()}</span>
                  <span className="chip-label" title={student?.email}>{name}</span>
                  <button
                    type="button"
                    className="chip-remove-btn"
                    title={`Remove ${name} from course`}
                    onClick={() => unenrollStudentFromCourse(course.id, row.student_id)}
                  >
                    <X size={11} />
                  </button>
                </span>
              );
            })}
            {!enrolled.length && (
              <span style={{ fontSize: "12px", color: "var(--muted)", fontStyle: "italic" }}>
                No students enrolled yet
              </span>
            )}
          </div>

          {eligibleStudents.length > 0 && (
            <div className="course-quick-enroll">
              <select
                id={`enroll-${course.id}`}
                defaultValue=""
                className="status-select"
                style={{
                  height: "32px",
                  flex: "1",
                  padding: "0 8px",
                  borderRadius: "6px",
                  border: "1px solid var(--line)",
                  background: "#ffffff",
                  fontSize: "12px",
                }}
              >
                <option value="" disabled>Enroll student…</option>
                {eligibleStudents.map((s) => (
                  <option key={s.id} value={s.id}>{s.full_name || s.email}</option>
                ))}
              </select>
              <button
                className="button compact primary"
                style={{ height: "32px", fontSize: "12px" }}
                type="button"
                onClick={() => {
                  const el = document.getElementById(`enroll-${course.id}`);
                  if (el?.value) {
                    enrollStudentInCourse(course.id, el.value);
                    el.value = "";
                  }
                }}
              >
                <Plus size={12} /> Enroll
              </button>
            </div>
          )}
        </div>

        <div className="course-card-foot">
          <span className="click-to-edit-hint">
            <Pencil size={11} /> Click card to edit
          </span>
          <span className="course-card-date">
            {formatCourseDate(course.created_at)}
          </span>
        </div>
      </article>
    );
  }
  const [eyebrow, title, description] = headings[view];

  return <div className="admin-workspace">
    <div className="page-heading"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{description}</p></div><div className="heading-actions">
      {["Students", "Courses", "Attendance", "Notes"].includes(view) && <button className="button primary" onClick={() => { setShowForm((current) => !current); setError(""); }}><Plus size={15} />{view === "Students" ? "Add student" : view === "Courses" ? "Add course" : view === "Attendance" ? "Record attendance" : "Add note"}</button>}
      <button className="button" onClick={loadData}>Refresh</button>
    </div></div>
    {error && <div className="portal-alert error" role="alert">{error}<button type="button" onClick={() => setError("")}>Dismiss</button></div>}

    {recentInvites.length > 0 && <div className="card invite-links-box">
      <div className="invite-links-header">
        <strong>Student account{recentInvites.length === 1 ? "" : "s"} ready! Direct sign-in link{recentInvites.length === 1 ? "" : "s"}:</strong>
        <button type="button" className="button" onClick={() => setRecentInvites([])}>Dismiss</button>
      </div>
      <div className="invite-links-list">
        {recentInvites.map((item) => <div key={item.email} className="invite-link-row">
          <span><strong>{item.email}</strong></span>
          <button className="button primary" type="button" onClick={() => { navigator.clipboard.writeText(item.actionLink); onToast(`Invite link copied for ${item.email}`); }}>
            <Copy size={13} /> Copy sign-in link
          </button>
        </div>)}
      </div>
    </div>}

    {showForm && view === "Students" && <form className="card admin-create-form" onSubmit={inviteStudent}>
      <div className="panel-heading"><div><h2>Add students by email</h2><p>We create pending student accounts and generate secure sign-in invitations. Students can enter the portal after you approve them.</p></div></div>
      <div className="form-actions invite-mode-switch" role="group" aria-label="Invitation size">
        <button className={`button ${inviteMode === "single" ? "primary" : ""}`} type="button" onClick={() => setInviteMode("single")}>One student</button>
        <button className={`button ${inviteMode === "bulk" ? "primary" : ""}`} type="button" onClick={() => setInviteMode("bulk")}>Multiple students</button>
      </div>
      {inviteMode === "single" ? <>
        <label className="form-field"><span>Full name</span><input name="full_name" required maxLength="100" autoComplete="name" placeholder="Student name" /></label>
        <label className="form-field"><span>Email address</span><input name="email" type="email" required maxLength="254" autoComplete="email" placeholder="student@example.com" /></label>
      </> : <label className="form-field"><span>Student list</span><textarea name="invite_list" required rows="7" placeholder={"One student per line:\nstudent@example.com\nFull Name, another@example.com"} /><small>Enter up to 25 students, one per line. Use “Full Name, email” or just an email address.</small></label>}
      <div className="form-actions"><button className="button" type="button" onClick={() => setShowForm(false)}>Cancel</button><button className="button primary" disabled={busy}><Mail size={14} />{busy ? "Adding students…" : inviteMode === "single" ? "Add student & generate invite" : "Add students & generate invites"}</button></div>
    </form>}
    {showForm && view === "Courses" && <form className="card admin-create-form" onSubmit={createCourse}>
      <div className="panel-heading"><div><h2>Create a course</h2><p>Configure course curriculum, faculty schedule, classroom, and enroll approved students.</p></div></div>
      <div className="form-grid-2">
        <label className="form-field"><span>Course name *</span><input name="name" required maxLength="150" placeholder="e.g. Data Structures & Algorithms" /></label>
        <label className="form-field"><span>Course code *</span><input name="code" required maxLength="40" placeholder="e.g. CS-201" /></label>
      </div>
      <div className="form-grid-2" style={{ marginTop: "10px" }}>
        <label className="form-field"><span>Department (e.g. IT or SAP)</span><input name="department" maxLength="100" placeholder="e.g. IT or SAP" /></label>
        <label className="form-field"><span>Instructor / Faculty</span><input name="instructor" maxLength="100" placeholder="e.g. Faculty Name" /></label>
      </div>
      <label className="form-field" style={{ marginTop: "10px" }}><span>Classroom / Lab Venue</span><input name="room" maxLength="80" placeholder="e.g. Lab 4 / Virtual Hall" /></label>
      <label className="form-field" style={{ marginTop: "10px" }}><span>Description &amp; Syllabus</span><textarea name="description" rows="3" maxLength="3000" placeholder="Outline course syllabus, prerequisites, and learning objectives..." /></label>
      <fieldset className="admin-options" style={{ marginTop: "12px" }}><legend>Enroll approved students</legend>{students.filter((student) => student.is_approved).map((student) => <label className="admin-option" key={student.id}><input type="checkbox" name="student_ids" value={student.id} /><span>{student.full_name || student.email}</span><small>{student.email}</small></label>)}{!students.some((student) => student.is_approved) && <p>Approve a student before creating an enrollment.</p>}</fieldset>
      <div className="form-actions"><button className="button" type="button" onClick={() => setShowForm(false)}>Cancel</button><button className="button primary" disabled={busy}>{busy ? "Creating…" : "Create course"}</button></div>
    </form>}
    {showForm && view === "Attendance" && (
      <form className="card admin-create-form" onSubmit={createRecord}>
        <div className="panel-heading">
          <div>
            <h2>Record attendance</h2>
            <p>Attendance is private to the student and administrators.</p>
          </div>
        </div>
        <label className="form-field">
          <span>Student</span>
          <select name="student_id" required defaultValue="">
            <option value="" disabled>Select a student</option>
            {students.filter((student) => student.is_approved).map((student) => (
              <option key={student.id} value={student.id}>{student.full_name || student.email} · {student.email}</option>
            ))}
          </select>
        </label>
        <label className="form-field">
          <span>Course (optional)</span>
          <select name="course_id" defaultValue="">
            <option value="">No course</option>
            {courses.map((course) => (
              <option key={course.id} value={course.id}>{course.code} · {course.name}</option>
            ))}
          </select>
        </label>
        <label className="form-field">
          <span>Date</span>
          <input name="attendance_date" type="date" required defaultValue={attendancePrefillDate || new Date().toISOString().slice(0, 10)} />
        </label>
        <label className="form-field">
          <span>Status</span>
          <select name="status" defaultValue="present">
            <option value="present">Present</option>
            <option value="late">Late</option>
            <option value="absent">Absent</option>
          </select>
        </label>
        <label className="form-field">
          <span>Note (optional)</span>
          <input name="note" maxLength="1000" />
        </label>
        <div className="form-actions">
          <button className="button" type="button" onClick={() => setShowForm(false)}>Cancel</button>
          <button className="button primary" disabled={busy}>{busy ? "Saving…" : "Save attendance"}</button>
        </div>
      </form>
    )}

    {showForm && view === "Notes" && (
      <form className="card admin-create-form" onSubmit={createRecord}>
        <div className="panel-heading">
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span className="portal-item-icon assignment" style={{ width: "34px", height: "34px", background: "#eef2ff", color: "#4f46e5" }}>
                <HardDrive size={18} />
              </span>
              <div>
                <h2>Upload &amp; Share Notes</h2>
                <p>Upload lecture notes, study materials, or feedback via Google Drive link or direct text.</p>
              </div>
            </div>
          </div>
        </div>

        {/* Individual Student Access Notice */}
        <div style={{ marginTop: "12px", padding: "10px 14px", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "8px", display: "flex", alignItems: "center", gap: "10px" }}>
          <ShieldCheck size={18} style={{ color: "#166534", flexShrink: 0 }} />
          <div style={{ fontSize: "12.5px", color: "#166534", lineHeight: 1.4 }}>
            <strong>Individual Student Permission:</strong> Each note or Drive link is granted to each student separately. Even if other students are enrolled in the same course, they will <strong>not</strong> receive access unless you explicitly permit it for them.
          </div>
        </div>

        {notePrefillStudentId && (
          <div style={{ marginTop: "12px", padding: "8px 12px", background: "#eef2ff", borderRadius: "8px", border: "1px solid #c7d2fe", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: "12.5px", color: "#3730a3" }}>
              Target Student: <strong>{studentsById[notePrefillStudentId]?.full_name || studentsById[notePrefillStudentId]?.email}</strong>
            </span>
            <button
              type="button"
              className="text-link"
              style={{ fontSize: "12px", color: "#4f46e5" }}
              onClick={() => setNotePrefillStudentId("")}
            >
              Change Student
            </button>
          </div>
        )}

        <div className="form-grid-2" style={{ marginTop: "12px" }}>
          <label className="form-field">
            <span>Assign Note To Student *</span>
            <select
              name="student_id"
              required
              key={notePrefillStudentId || "empty"}
              defaultValue={notePrefillStudentId || ""}
            >
              <option value="" disabled>Choose individual student...</option>
              {students.filter((student) => student.is_approved).map((student) => (
                <option key={student.id} value={student.id}>
                  {student.full_name || student.email} · {student.email}
                </option>
              ))}
            </select>
          </label>

          <label className="form-field">
            <span>Linked Course (optional)</span>
            <select name="course_id" defaultValue="">
              <option value="">No specific course (General / Campus-wide)</option>
              {courses.map((course) => (
                <option key={course.id} value={course.id}>{course.code} · {course.name}</option>
              ))}
            </select>
          </label>
        </div>

        <label className="form-field" style={{ marginTop: "12px" }}>
          <span>Note Title *</span>
          <input name="title" required maxLength={150} placeholder="e.g. Chapter 4 Lecture Notes: Data Structures" />
        </label>

        {/* Dedicated Google Drive Link Input Box */}
        <div style={{ marginTop: "14px", padding: "14px", background: "#f8fafc", borderRadius: "10px", border: "1px solid #e2e8f0" }}>
          <label className="form-field" style={{ margin: 0 }}>
            <span style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", marginBottom: "6px" }}>
              <span style={{ display: "flex", alignItems: "center", gap: "6px", fontWeight: 700, color: "var(--ink)" }}>
                <HardDrive size={16} style={{ color: "#4f46e5" }} />
                <span>Google Drive Link (Upload Notes via Drive Link)</span>
              </span>
              {noteDriveUrl.trim() && (
                <span className="badge-view-only" style={{ background: "#eef2ff", color: "#4f46e5", fontSize: "11px" }}>
                  {getDriveDocTypeLabel(noteDriveUrl)}
                </span>
              )}
            </span>
            <div style={{ display: "flex", gap: "8px" }}>
              <input
                name="drive_url"
                type="url"
                value={noteDriveUrl}
                onChange={(e) => setNoteDriveUrl(e.target.value)}
                placeholder="https://drive.google.com/file/d/... or https://docs.google.com/..."
                style={{ flex: 1 }}
              />
              <button
                type="button"
                className="button compact"
                onClick={async () => {
                  try {
                    const clip = await navigator.clipboard.readText();
                    if (clip) setNoteDriveUrl(clip.trim());
                  } catch {
                    // clipboard fallback
                  }
                }}
                title="Paste from clipboard"
              >
                <Copy size={13} /> Paste
              </button>
              {noteDriveUrl.trim() && (
                <button
                  type="button"
                  className="button compact"
                  onClick={() => setViewingNoteDoc({ title: "Google Drive Preview", subtitle: "Note Attachment", url: noteDriveUrl.trim() })}
                  title="Preview document in secure viewer"
                >
                  <Eye size={13} /> Preview
                </button>
              )}
            </div>
            <small className="muted" style={{ display: "block", marginTop: "6px" }}>
              Paste any Google Drive, Docs, Sheets, Slides, or PDF file link. Students will be able to securely preview or open it directly in their portal.
            </small>
          </label>
        </div>

        <label className="form-field" style={{ marginTop: "14px" }}>
          <span>Note Details / Instructions / Summary (optional if Drive link is provided)</span>
          <textarea
            name="body"
            rows={4}
            maxLength={10000}
            placeholder="Add lecture summary, reading assignments, key takeaways, or leave empty if sharing the document directly..."
          />
        </label>

        <div className="form-actions" style={{ marginTop: "18px" }}>
          <button className="button" type="button" onClick={() => { setShowForm(false); setNoteDriveUrl(""); setNotePrefillStudentId(""); }}>Cancel</button>
          <button className="button primary" disabled={busy}>
            <Upload size={14} />
            {busy ? "Publishing note…" : noteDriveUrl.trim() ? "Upload Note with Drive Link" : "Save Note"}
          </button>
        </div>
      </form>
    )}
    {loading ? <div className="card portal-loading">Loading secure student records…</div> : view === "Overview" ? <>
      <section className="metrics student-metrics">
        <article className="card metric-card">
          <div className="metric-top"><span>Total students</span><span className="metric-icon blue"><Users size={17} /></span></div>
          <div className="metric-value">{students.length}</div>
          <div className="metric-foot">Registered student accounts</div>
        </article>
        <article className="card metric-card">
          <div className="metric-top"><span>Approved access</span><span className="metric-icon green"><Check size={17} /></span></div>
          <div className="metric-value">{students.filter((s) => s.is_approved).length}</div>
          <div className="metric-foot">Active in student portal</div>
        </article>
        <article className="card metric-card">
          <div className="metric-top"><span>Active courses</span><span className="metric-icon amber"><GraduationCap size={17} /></span></div>
          <div className="metric-value">{courses.length}</div>
          <div className="metric-foot">{enrollments.length} total enrollments</div>
        </article>
        <article className="card metric-card">
          <div className="metric-top"><span>Available DB space</span><span className="metric-icon blue"><Database size={17} /></span></div>
          <div className="metric-value" style={{ color: "var(--green)" }}>{storageStats?.db_available_pretty || "488 MB"}</div>
          <div className="metric-foot">{storageStats ? `${storageStats.db_used_pretty} used of ${storageStats.db_quota_pretty}` : "12 MB used of 500 MB"}</div>
        </article>
      </section>
      <section className="overview-grid">
        <article className="card panel">
          <div className="panel-heading">
            <div><h2>Recent students</h2><p>Latest registered student accounts</p></div>
            <button className="text-link" type="button" onClick={() => onNavigate("Students")}>Manage all students <ArrowRight size={13} /></button>
          </div>
          {students.slice(0, 5).map((student) => <div className="attempt-row" key={student.id}>
            <span className="admin-student">
              <span className="student-avatar">{(student.full_name || student.email).slice(0, 1).toUpperCase()}</span>
              <span><strong>{student.full_name || "Student"}</strong><small>{student.email}</small></span>
            </span>
            <span className={`portal-status ${student.is_approved ? "submitted" : "pending"}`}>{student.is_approved ? "Approved" : "Pending"}</span>
          </div>)}
          {!students.length && <div className="portal-empty compact">No student accounts yet.</div>}
        </article>
        <article className="card panel">
          <div className="panel-heading">
            <div><h2>Quick actions</h2><p>Common campus administrative tasks</p></div>
          </div>
          <div style={{ display: "grid", gap: "10px", marginTop: "14px" }}>
            <button className="button" style={{ justifyContent: "flex-start" }} type="button" onClick={() => { onNavigate("Students"); setShowForm(true); }}>
              <Plus size={14} /> Add new student
            </button>
            <button className="button" style={{ justifyContent: "flex-start" }} type="button" onClick={() => { onNavigate("Courses"); setShowForm(true); }}>
              <BookOpen size={14} /> Create a new course
            </button>
            <button className="button" style={{ justifyContent: "flex-start" }} type="button" onClick={() => { onNavigate("Attendance"); setShowForm(true); }}>
              <Clock3 size={14} /> Record daily attendance
            </button>
            <button className="button" style={{ justifyContent: "flex-start" }} type="button" onClick={() => { onNavigate("Notes"); setShowForm(true); }}>
              <GraduationCap size={14} /> Add private student note
            </button>
          </div>
        </article>
      </section>
      <section className="card storage-overview-card">
        <div className="panel-heading">
          <div>
            <div className="eyebrow" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <Database size={13} /> Cloud Database Telemetry
            </div>
            <h2>Database &amp; Storage Space</h2>
            <p>Real-time capacity, current usage, and remaining available quota.</p>
          </div>
          <div className="heading-actions">
            <span className="badge green"><i />{storageStats ? `${(100 - (storageStats.db_used_percent || 0)).toFixed(1)}% Available` : "Healthy"}</span>
            <button className="button" type="button" onClick={loadData} title="Refresh live storage metrics">
              <RefreshCw size={13} /> Refresh
            </button>
          </div>
        </div>

        <div className="storage-meter-large">
          <div className="storage-meter-fill" style={{ width: `${Math.max(2, storageStats?.db_used_percent || 2.4)}%` }} />
        </div>

        <div className="storage-stats-grid">
          <div className="storage-stat-pill">
            <span>Available DB Space</span>
            <strong style={{ color: "var(--green)" }}>{storageStats?.db_available_pretty || "488 MB"}</strong>
            <small>Free space ready for data</small>
          </div>
          <div className="storage-stat-pill">
            <span>Database Used</span>
            <strong>{storageStats?.db_used_pretty || "12 MB"}</strong>
            <small>{storageStats?.db_used_percent || "2.4"}% of total quota</small>
          </div>
          <div className="storage-stat-pill">
            <span>Total DB Quota</span>
            <strong>{storageStats?.db_quota_pretty || "500 MB"}</strong>
            <small>Supabase database capacity</small>
          </div>
          <div className="storage-stat-pill">
            <span>File Attachment Storage</span>
            <strong>{storageStats?.file_used_pretty || "0 bytes"}</strong>
            <small>Student uploads &amp; attachments</small>
          </div>
        </div>
      </section>
    </> : view === "Students" ? <>
      <section className="student-admin-summary">
        <article className="card summary-card"><span>Total students</span><strong>{students.length}</strong><i className="summary-indicator blue" /></article>
        <article className="card summary-card"><span>Awaiting approval</span><strong>{students.filter((student) => !student.is_approved).length}</strong><i className="summary-indicator amber" /></article>
        <article className="card summary-card"><span>Approved access</span><strong>{students.filter((student) => student.is_approved).length}</strong><i className="summary-indicator green" /></article>
      </section>
      <section className="card student-admin-directory">
        <div className="student-admin-toolbar">
          <label className="search-box"><Search size={15} /><input type="search" aria-label="Search student accounts" placeholder="Search students by name or email" value={studentSearch} onChange={(event) => setStudentSearch(event.target.value)} /></label>
          <div className="form-actions" role="group" aria-label="Filter students by approval status">
            {[["all", "All"], ["pending", "Pending"], ["approved", "Approved"]].map(([value, label]) => <button key={value} type="button" className={`button ${studentStatus === value ? "primary" : ""}`} onClick={() => setStudentStatus(value)}>{label}{value === "pending" ? ` (${students.filter((student) => !student.is_approved).length})` : ""}</button>)}
          </div>
        </div>
        <section className="admin-work-list">
          {filteredStudents.map((student) => (
            <article className="card admin-assignment-card" key={student.id}>
              <div className="panel-heading">
                <div className="admin-student">
                  <span className="student-avatar">{(student.full_name || student.email).slice(0, 1).toUpperCase()}</span>
                  <span>
                    <strong>{student.full_name || "Student"}</strong>
                    <small>{student.email}</small>
                    <small>Added {new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(student.created_at))}</small>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "4px" }}>
                      <span className="student-timing-chip">
                        <Clock3 size={12} /> Class Timing: <strong>{student.timing || "10:00 AM - 12:00 PM"}</strong>
                      </span>
                      <span
                        className="student-timing-chip"
                        style={{
                          background: (notesCountByStudent[student.id] || 0) > 0 ? "#eef2ff" : undefined,
                          color: (notesCountByStudent[student.id] || 0) > 0 ? "#4f46e5" : undefined,
                          borderColor: (notesCountByStudent[student.id] || 0) > 0 ? "#c7d2fe" : undefined,
                          cursor: "pointer",
                        }}
                        onClick={() => {
                          setSelectedStudentFilter(student.id);
                          onNavigate("Notes");
                        }}
                        title={`Click to view notes specifically for ${student.full_name || student.email}`}
                      >
                        <FileText size={12} /> Notes: <strong>{notesCountByStudent[student.id] || 0}</strong>
                      </span>
                    </div>

                    {/* Enrolled Courses Badges */}
                    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "6px", marginTop: "6px" }}>
                      <span style={{ fontSize: "11px", color: "var(--muted)" }}>Enrolled Courses:</span>
                      {enrollments.filter((e) => e.student_id === student.id).map((e) => {
                        const c = coursesById[e.course_id];
                        return c ? (
                          <span key={c.id} className="course-code-badge" style={{ fontSize: "10.5px" }} title={c.name}>
                            {c.code}
                          </span>
                        ) : null;
                      })}
                      {!enrollments.some((e) => e.student_id === student.id) && (
                        <span style={{ fontSize: "11px", color: "var(--muted)", fontStyle: "italic" }}>
                          None enrolled
                        </span>
                      )}
                    </div>
                  </span>
                </div>
                <span className={`portal-status ${student.is_approved ? "submitted" : "pending"}`}>
                  {student.is_approved ? "Approved" : "Pending approval"}
                </span>
              </div>
              <div className="form-actions">
                <button
                  className="button primary"
                  type="button"
                  disabled={busy}
                  onClick={() => setManagingStudentAccess(student)}
                  title={`Manage course notes, tests, and permissions specifically for ${student.full_name || student.email}`}
                >
                  <ShieldCheck size={13} /> Notes &amp; Tests Permissions
                </button>
                <button
                  className="button"
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setNotePrefillStudentId(student.id);
                    setNoteRecipientType("single");
                    onNavigate("Notes");
                    setShowForm(true);
                  }}
                  title={`Add a note or Google Drive link specifically for ${student.full_name || student.email}`}
                >
                  <FileText size={13} /> Add Note
                </button>
                <button className="button" type="button" disabled={busy} onClick={() => setEditingStudent(student)}>
                  <Pencil size={13} /> Edit Profile &amp; Timing
                </button>
                <button className="button" disabled={busy} onClick={() => approveStudent(student, !student.is_approved)}>
                  {student.is_approved ? "Suspend access" : <><Check size={14} />Approve access</>}
                </button>
                <button className="button" disabled={busy} type="button" onClick={() => copyInviteLink(student)} title="Copy sign-in / invite link for student">
                  <Link2 size={14} />Copy invite link
                </button>
                <button className="button danger-icon" disabled={busy} onClick={() => deleteStudent(student)}>
                  <Trash2 size={14} />Delete account
                </button>
              </div>
            </article>
          ))}
          {!filteredStudents.length && <div className="card portal-empty"><Users size={22} /><strong>{students.length ? "No students match this filter" : "No student accounts yet"}</strong><span>{students.length ? "Change the search or approval filter." : "Add a student to send a secure sign-in invitation."}</span></div>}
        </section>
      </section>
    </> : view === "Courses" ? <>
      <section className="student-admin-summary">
        <article className="card summary-card">
          <span>Total courses</span>
          <strong>{courses.length}</strong>
          <i className="summary-indicator blue" />
        </article>
        <article className="card summary-card">
          <span>Active enrollments</span>
          <strong>{enrollments.length}</strong>
          <i className="summary-indicator green" />
        </article>
        <article className="card summary-card">
          <span>Avg class size</span>
          <strong>{courses.length ? (enrollments.length / courses.length).toFixed(1) : 0}</strong>
          <i className="summary-indicator purple" />
        </article>
        <article className="card summary-card">
          <span>Departments</span>
          <strong>{new Set(courses.map((c) => c.department).filter(Boolean)).size || (courses.length > 0 ? 1 : 0)}</strong>
          <i className="summary-indicator amber" />
        </article>
      </section>

      {/* Course Session Tabs */}
      <div className="course-session-tabs">
        <button
          type="button"
          className={`course-session-tab ${courseSessionFilter === "all" ? "active" : ""}`}
          onClick={() => setCourseSessionFilter("all")}
        >
          All Programs ({filteredCourses.length})
        </button>
        <button
          type="button"
          className={`course-session-tab ${courseSessionFilter === "it" ? "active" : ""}`}
          onClick={() => setCourseSessionFilter("it")}
        >
          🖥️ IT Courses Session ({itCourses.length})
        </button>
        <button
          type="button"
          className={`course-session-tab ${courseSessionFilter === "sap" ? "active" : ""}`}
          onClick={() => setCourseSessionFilter("sap")}
        >
          💼 SAP Courses Session ({sapCourses.length})
        </button>
      </div>

      <div className="course-sessions-container">
        {/* IT Courses Session */}
        {(courseSessionFilter === "all" || courseSessionFilter === "it") && (
          <div className="course-session-block">
            <div className="course-session-heading">
              <div className="course-session-title">
                <span>🖥️ IT &amp; Software Engineering Programs</span>
                <span className="course-session-pill">{itCourses.length} Courses</span>
              </div>
            </div>
            {itCourses.length > 0 ? (
              <section className="courses-grid">
                {itCourses.map(renderCourseCard)}
              </section>
            ) : (
              <p style={{ color: "var(--muted)", fontStyle: "italic", padding: "8px 0" }}>
                No IT courses currently in this list.
              </p>
            )}
          </div>
        )}

        {/* SAP Courses Session */}
        {(courseSessionFilter === "all" || courseSessionFilter === "sap") && (
          <div className="course-session-block">
            <div className="course-session-heading">
              <div className="course-session-title">
                <span>💼 SAP Enterprise Modules &amp; ERP Programs</span>
                <span className="course-session-pill sap">{sapCourses.length} Courses</span>
              </div>
            </div>
            {sapCourses.length > 0 ? (
              <section className="courses-grid">
                {sapCourses.map(renderCourseCard)}
              </section>
            ) : (
              <p style={{ color: "var(--muted)", fontStyle: "italic", padding: "8px 0" }}>
                No SAP courses currently in this list.
              </p>
            )}
          </div>
        )}

        {/* Other Courses if any */}
        {otherCourses.length > 0 && courseSessionFilter === "all" && (
          <div className="course-session-block">
            <div className="course-session-heading">
              <div className="course-session-title">
                <span>General &amp; Additional Courses</span>
                <span className="course-session-pill">{otherCourses.length} Courses</span>
              </div>
            </div>
            <section className="courses-grid">
              {otherCourses.map(renderCourseCard)}
            </section>
          </div>
        )}

        {!filteredCourses.length && (
          <div className="card portal-empty">
            <BookOpen size={22} />
            <strong>No courses found</strong>
            <span>Create a course using the button above or clear search filters.</span>
          </div>
        )}
      </div>
    </> : view === "Attendance" ? (
      <AttendanceCalendar
        records={records}
        students={students}
        courses={courses}
        isAdmin={true}
        onEditRecord={(record) => setEditingRecord(record)}
        onDeleteRecord={(record) => deleteRecord(record)}
        onAddRecord={(selectedDate) => {
          setAttendancePrefillDate(selectedDate);
          setShowForm(true);
        }}
      />
    ) : (
      <div className="admin-notes-section">
        <div className="student-admin-toolbar" style={{ marginBottom: "16px", display: "flex", flexWrap: "wrap", gap: "10px", alignItems: "center", justifyContent: "space-between" }}>
          <div className="form-actions" role="group" aria-label="Filter notes">
            <button
              type="button"
              className={`button ${noteFilter === "all" ? "primary" : ""}`}
              onClick={() => setNoteFilter("all")}
            >
              All Notes ({records.length})
            </button>
            <button
              type="button"
              className={`button ${noteFilter === "drive" ? "primary" : ""}`}
              onClick={() => setNoteFilter("drive")}
            >
              <HardDrive size={13} /> Drive Links ({records.filter((r) => r.drive_url || extractDriveUrl(r.body)).length})
            </button>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: "12px", color: "var(--muted)", fontWeight: 600 }}>Filter by Student:</span>
            <select
              className="status-select"
              value={selectedStudentFilter}
              onChange={(e) => setSelectedStudentFilter(e.target.value)}
              style={{ height: "34px", padding: "0 10px", borderRadius: "8px", border: "1px solid var(--line)", background: "#ffffff", fontSize: "12.5px" }}
            >
              <option value="all">👥 All Students ({records.length} notes)</option>
              {students
                .filter((s) => s.is_approved)
                .map((s) => {
                  const count = records.filter((r) => r.student_id === s.id).length;
                  return (
                    <option key={s.id} value={s.id}>
                      {s.full_name || s.email} ({count} note{count === 1 ? "" : "s"})
                    </option>
                  );
                })}
            </select>
          </div>
        </div>

        {selectedStudentFilter !== "all" && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "8px", marginBottom: "16px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span className="student-avatar" style={{ width: "28px", height: "28px", fontSize: "12px" }}>
                {(studentsById[selectedStudentFilter]?.full_name || "S").slice(0, 1).toUpperCase()}
              </span>
              <span style={{ fontSize: "13px", color: "#166534" }}>
                Viewing notes specifically for <strong>{studentsById[selectedStudentFilter]?.full_name || studentsById[selectedStudentFilter]?.email}</strong>
              </span>
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
              <button
                type="button"
                className="button primary compact"
                onClick={() => {
                  setNotePrefillStudentId(selectedStudentFilter);
                  setNoteRecipientType("single");
                  setShowForm(true);
                }}
              >
                <Plus size={12} /> Add Note for this Student
              </button>
              <button
                type="button"
                className="button compact"
                onClick={() => setSelectedStudentFilter("all")}
              >
                Show All Students
              </button>
            </div>
          </div>
        )}

        <section className="admin-work-list">
          {records
            .filter((record) => {
              if (selectedStudentFilter !== "all" && record.student_id !== selectedStudentFilter) {
                return false;
              }
              const driveUrl = record.drive_url || extractDriveUrl(record.body);
              if (noteFilter === "drive" && !driveUrl) return false;
              const student = studentsById[record.student_id];
              const course = coursesById[record.course_id];
              const haystack = `${record.title} ${record.body} ${student?.full_name || ""} ${student?.email || ""} ${course?.name || ""} ${course?.code || ""}`.toLowerCase();
              return haystack.includes(query.trim().toLowerCase());
            })
            .map((record) => {
              const student = studentsById[record.student_id];
              const course = coursesById[record.course_id];
              const driveUrl = record.drive_url || extractDriveUrl(record.body);
              const cleanBody = cleanNoteBody(record.body, driveUrl);
              const docType = getDriveDocTypeLabel(driveUrl);

              return (
                <article className="card admin-assignment-card note-card" key={record.id}>
                  <div className="panel-heading" style={{ alignItems: "flex-start" }}>
                    <div className="admin-assignment-title" style={{ flex: 1 }}>
                      <span className="portal-item-icon assignment" style={{ width: "42px", height: "42px", flexShrink: 0, background: driveUrl ? "#eef2ff" : "#f1f5f9", color: driveUrl ? "#4f46e5" : "#475569" }}>
                        {driveUrl ? <HardDrive size={18} /> : <FileText size={18} />}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px" }}>
                          <h2 style={{ fontSize: "16px", fontWeight: 700, margin: 0, color: "var(--ink)" }}>{record.title}</h2>
                          {course && (
                            <span className="course-code-badge" style={{ fontSize: "11px" }}>
                              {course.code}
                            </span>
                          )}
                          {driveUrl && (
                            <span className="badge-view-only" style={{ background: "#eef2ff", color: "#4f46e5", fontSize: "11px" }}>
                              <HardDrive size={11} /> {docType}
                            </span>
                          )}
                        </div>

                        <p style={{ margin: "4px 0 0", fontSize: "13px", color: "var(--muted)" }}>
                          Student: <strong>{student?.full_name || student?.email || "Student"}</strong>
                          {course ? ` · ${course.name}` : ""}
                          <span style={{ marginLeft: "10px", fontSize: "12px", opacity: 0.8 }}>
                            {formatCourseDate(record.created_at)}
                          </span>
                        </p>
                      </div>
                    </div>

                    <div className="heading-actions" style={{ flexShrink: 0 }}>
                      <button
                        className="button compact"
                        type="button"
                        onClick={() => {
                          setSharingNoteRecord(sharingNoteRecord?.id === record.id ? null : record);
                          setShareTargetStudentId("");
                        }}
                        title="Give this note and Drive link to another student separately"
                      >
                        <Users size={12} /> Give to another student
                      </button>
                      <button
                        className="button compact"
                        type="button"
                        onClick={() => {
                          setNotePrefillStudentId(record.student_id);
                          setNoteRecipientType("single");
                          setShowForm(true);
                        }}
                        title={`Add another note specifically for ${student?.full_name || "this student"}`}
                      >
                        <Plus size={12} /> Add for this student
                      </button>
                      <button className="button compact" type="button" onClick={() => setEditingRecord(record)} title="Edit note or Drive link">
                        <Pencil size={13} /> Edit
                      </button>
                      <button className="quiet-icon danger-icon" type="button" onClick={() => deleteRecord(record)} aria-label="Delete note">
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>

                  {sharingNoteRecord?.id === record.id && (
                    <div
                      style={{
                        margin: "12px 0 6px",
                        padding: "12px 14px",
                        background: "#f0fdf4",
                        border: "1px solid #bbf7d0",
                        borderRadius: "8px",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "8px" }}>
                        <Users size={14} style={{ color: "#166534" }} />
                        <strong style={{ fontSize: "13px", color: "#166534" }}>
                          Give this note link to another student (individual access):
                        </strong>
                      </div>
                      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
                        <select
                          value={shareTargetStudentId}
                          onChange={(e) => setShareTargetStudentId(e.target.value)}
                          style={{
                            flex: 1,
                            minWidth: "220px",
                            padding: "6px 10px",
                            borderRadius: "6px",
                            border: "1px solid #86efac",
                            background: "#fff",
                            fontSize: "12.5px",
                          }}
                        >
                          <option value="">Select a student to grant this note link...</option>
                          {students
                            .filter((s) => s.is_approved && s.id !== record.student_id)
                            .map((s) => {
                              const isEnrolledInCourse = record.course_id
                                ? enrollments.some((e) => e.course_id === record.course_id && e.student_id === s.id)
                                : false;
                              return (
                                <option key={s.id} value={s.id}>
                                  {s.full_name || s.email} {isEnrolledInCourse ? `(Enrolled in ${course?.code || "Course"})` : ""}
                                </option>
                              );
                            })}
                        </select>
                        <button
                          type="button"
                          className="button primary compact"
                          disabled={!shareTargetStudentId || sharingBusy}
                          onClick={() => handleShareNoteWithAnotherStudent(record, shareTargetStudentId)}
                        >
                          <Check size={12} /> {sharingBusy ? "Granting…" : "Grant Access"}
                        </button>
                        <button
                          type="button"
                          className="button compact"
                          onClick={() => {
                            setSharingNoteRecord(null);
                            setShareTargetStudentId("");
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                      <small style={{ color: "#15803d", display: "block", marginTop: "6px", fontSize: "11.5px" }}>
                        Access is strictly given to the chosen student. Other students in the same course will remain without access.
                      </small>
                    </div>
                  )}

                  {cleanBody && (
                    <p style={{ margin: "12px 0 0", fontSize: "13.5px", color: "var(--ink)", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
                      {cleanBody}
                    </p>
                  )}

                  {driveUrl && (
                    <div className="note-drive-box" style={{ marginTop: "14px", padding: "12px 14px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "10px", display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: 0, flex: 1 }}>
                        <div style={{ width: "34px", height: "34px", borderRadius: "8px", background: "#eef2ff", color: "#4f46e5", display: "grid", placeItems: "center", flexShrink: 0 }}>
                          <HardDrive size={16} />
                        </div>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <strong style={{ fontSize: "13px", color: "var(--ink)", display: "block" }}>{docType} Attached</strong>
                          <span style={{ fontSize: "12px", color: "var(--muted)", textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap", display: "block" }}>
                            {driveUrl}
                          </span>
                        </div>
                      </div>

                      <div style={{ display: "flex", gap: "8px", flexShrink: 0 }}>
                        <button
                          type="button"
                          className="button primary compact"
                          onClick={() => setViewingNoteDoc({ title: record.title, subtitle: course ? `${course.code} · ${course.name}` : student?.full_name || "Note Document", url: driveUrl })}
                          title="Open document in secure viewer"
                        >
                          <Eye size={13} /> View Document
                        </button>
                        <button
                          type="button"
                          className="button compact"
                          onClick={() => window.open(driveUrl, "_blank")}
                          title="Open directly in Google Drive"
                        >
                          <ExternalLink size={13} /> Open Drive
                        </button>
                        <button
                          type="button"
                          className="button compact"
                          onClick={() => {
                            navigator.clipboard.writeText(driveUrl);
                            onToast("Drive link copied to clipboard.");
                          }}
                          title="Copy Drive link"
                        >
                          <Copy size={13} />
                        </button>
                      </div>
                    </div>
                  )}
                </article>
              );
            })}

          {!records.length && (
            <div className="card portal-empty">
              <HardDrive size={24} />
              <strong>No notes records yet</strong>
              <span>Use the "Add note" button above to upload notes with a Google Drive link.</span>
            </div>
          )}
        </section>

        {viewingNoteDoc && (
          <SecureDocumentViewer
            title={viewingNoteDoc.title}
            subtitle={viewingNoteDoc.subtitle}
            url={viewingNoteDoc.url}
            userEmail={user.email}
            isSuperuser={true}
            onClose={() => setViewingNoteDoc(null)}
          />
        )}
      </div>
    )}

    {editingCourse && (
      <EditCourseModal
        course={editingCourse}
        students={students}
        enrollments={enrollments}
        onClose={() => setEditingCourse(null)}
        onSave={updateCourse}
        onEnroll={enrollStudentInCourse}
        onUnenroll={unenrollStudentFromCourse}
        onDelete={deleteCourse}
      />
    )}

    {editingRecord && (
      <EditRecordModal
        view={view}
        record={editingRecord}
        students={students}
        courses={courses}
        onClose={() => setEditingRecord(null)}
        onSave={updateRecord}
        onDelete={deleteRecord}
      />
    )}

    {editingStudent && (
      <EditStudentModal
        student={editingStudent}
        onClose={() => setEditingStudent(null)}
        onSave={updateStudentProfile}
        onDelete={deleteStudent}
      />
    )}

    {managingStudentAccess && (
      <StudentAccessModal
        student={managingStudentAccess}
        courses={courses}
        enrollments={enrollments}
        materials={materials}
        assessments={assessments}
        studentNotes={allStudentNotes}
        assessmentRecipients={assessmentRecipients}
        materialRecipients={materialRecipients}
        onClose={() => setManagingStudentAccess(null)}
        onPermitNote={handlePermitNoteForStudent}
        onRevokeNote={handleRevokeNoteForStudent}
        onPermitTest={handlePermitTestForStudent}
        onRevokeTest={handleRevokeTestForStudent}
        onAddManualNote={handleAddManualNoteForStudent}
        onDeleteManualNote={handleDeleteManualNoteForStudent}
        onEnrollStudent={enrollStudentInCourse}
        onUnenrollStudent={unenrollStudentFromCourse}
        onPreviewDoc={(title, subtitle, url) => setViewingNoteDoc({ title, subtitle, url })}
      />
    )}
  </div>;
}

export default AdminManagementView;
