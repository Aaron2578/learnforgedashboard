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
import CreateTrainerModal from "../components/CreateTrainerModal";
import AssignTrainerStudentsModal from "../components/AssignTrainerStudentsModal";
import { extractDriveUrl, cleanNoteBody, getDriveDocTypeLabel } from "../lib/driveUtils.js";

const headings = {
  Overview: ["Workspace", "Admin overview", "Manage students, course access, and learning records in one place."],
  Students: ["People", "Students", "Approve access, invite students, and manage student accounts."],
  Trainers: ["Faculty & Staff", "Trainers & Instructors", "Create trainer accounts, manage credentials, and assign timing."],
  Courses: ["Academic programs", "Courses", "Create courses, manage schedules and instructors, and enroll students."],
  Attendance: ["Academic operations", "Attendance", "Record and review daily student attendance."],
  Tasks: ["Academic & Student support", "Tasks", "Assign tasks, homework, and practice milestones to students separately or in batches."],
  Notes: ["Academic & Student support", "Tasks", "Assign tasks, homework, and practice milestones to students separately or in batches."],
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
  const [trainers, setTrainers] = useState([]);
  const [trainerStudents, setTrainerStudents] = useState([]);
  const [assigningTrainer, setAssigningTrainer] = useState(null);
  const [showTrainerModal, setShowTrainerModal] = useState(false);
  const [trainerSearch, setTrainerSearch] = useState("");
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
  const [noteSelectedStudentIds, setNoteSelectedStudentIds] = useState([]);
  const [noteStudentSearch, setNoteStudentSearch] = useState("");
  const [noteFormCourseId, setNoteFormCourseId] = useState("");
  const [shareSelectedStudentIds, setShareSelectedStudentIds] = useState([]);
  const [shareStudentSearch, setShareStudentSearch] = useState("");

  useEffect(() => {
    if (notePrefillStudentId) {
      setNoteSelectedStudentIds((prev) => Array.from(new Set([...prev, notePrefillStudentId])));
    }
  }, [notePrefillStudentId]);

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
        trainerResult,
        trainerStudentsResult,
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
        supabase.from("profiles").select("id, email, full_name, is_approved, timing, trainer_id, created_at").eq("role", "student").order("created_at", { ascending: false }),
        supabase.from("profiles").select("id, email, full_name, is_approved, timing, created_at").eq("role", "trainer").order("created_at", { ascending: false }),
        supabase.from("trainer_students").select("trainer_id, student_id").then((r) => r.error ? { data: [] } : r),
        supabase.from("courses").select("id, name, code, description, department, instructor, schedule, room, created_at").order("created_at", { ascending: false }),
        supabase.from("course_enrollments").select("course_id, student_id"),
        supabase.rpc("get_database_storage_stats"),
        supabase.from("student_notes").select("id, student_id"),
        supabase.from("course_materials").select("*").order("created_at", { ascending: false }),
        supabase.from("assessments").select("id, title, description, course_id, due_at, published, created_at").order("created_at", { ascending: false }),
        supabase.from("assessment_recipients").select("assessment_id, student_id"),
        supabase.from("material_recipients").select("material_id, student_id").then((r) => r.error ? { data: [] } : r),
        supabase.from("student_notes").select("id, student_id, course_id, title, body, status, category, due_at, drive_url, material_id, created_at").order("created_at", { ascending: false }).then(async (r) => {
          if (r.error) {
            return supabase.from("student_notes").select("id, student_id, course_id, title, body, drive_url, material_id, created_at").order("created_at", { ascending: false }).then(async (fallbackR) => {
              if (fallbackR.error) {
                return supabase.from("student_notes").select("id, student_id, course_id, title, body, created_at").order("created_at", { ascending: false });
              }
              return fallbackR;
            });
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
      setTrainers(trainerResult.data ?? []);
      setTrainerStudents(trainerStudentsResult.data ?? []);
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
      } else if (view === "Notes" || view === "Tasks") {
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

  async function promoteToTrainer(student) {
    if (!window.confirm(`Promote ${student.full_name || student.email} to Trainer? They will have full access to the Trainer Dashboard.`)) return;
    setBusy(true);
    setError("");
    try {
      const { data, error: updateErr } = await supabase.functions.invoke("admin-actions", {
        body: { action: "update_user_role", userId: student.id, role: "trainer" },
      });
      if (updateErr || data?.error) {
        throw new Error(updateErr ? await getFunctionErrorMessage(updateErr) : data.error);
      }
      onToast(`${student.full_name || student.email} has been promoted to Trainer!`);
      await loadData();
    } catch (err) {
      setError(`Could not promote user: ${err.message}`);
    } finally {
      setBusy(false);
    }
  }

  async function demoteToStudent(trainer) {
    if (!window.confirm(`Change ${trainer.full_name || trainer.email}'s role back to Student?`)) return;
    setBusy(true);
    setError("");
    try {
      const { data, error: updateErr } = await supabase.functions.invoke("admin-actions", {
        body: { action: "update_user_role", userId: trainer.id, role: "student" },
      });
      if (updateErr || data?.error) {
        throw new Error(updateErr ? await getFunctionErrorMessage(updateErr) : data.error);
      }
      onToast(`${trainer.full_name || trainer.email} role changed to Student.`);
      await loadData();
    } catch (err) {
      setError(`Could not demote user: ${err.message}`);
    } finally {
      setBusy(false);
    }
  }

  async function toggleTrainerStatus(trainer) {
    setBusy(true);
    setError("");
    const nextStatus = !trainer.is_approved;
    const { error: updateError } = await supabase.from("profiles").update({ is_approved: nextStatus }).eq("id", trainer.id);
    if (updateError) setError(updateError.message);
    else {
      onToast(nextStatus ? `${trainer.full_name || trainer.email} activated.` : `${trainer.full_name || trainer.email} suspended.`);
      await loadData();
    }
    setBusy(false);
  }

  async function deleteTrainer(trainer) {
    if (!window.confirm(`Permanently delete trainer ${trainer.full_name || trainer.email}? This cannot be undone.`)) return;
    setBusy(true);
    setError("");
    const { data, error: deleteError } = await supabase.functions.invoke("admin-actions", {
      body: { action: "delete_student", studentId: trainer.id },
    });
    if (deleteError || data?.error) setError(deleteError ? await getFunctionErrorMessage(deleteError) : data.error);
    else {
      onToast("Trainer account deleted.");
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

    // view === "Tasks" || view === "Notes" - multi-student checkbox task assignment
    const targetStudentIds = noteSelectedStudentIds.length > 0
      ? noteSelectedStudentIds
      : (values.get("student_id") || notePrefillStudentId ? [values.get("student_id") || notePrefillStudentId] : []);
    const courseId = noteFormCourseId || values.get("course_id") || null;
    const title = String(values.get("title") || "").trim();
    const taskCategory = String(values.get("category") || "Task").trim();
    const dueAt = values.get("due_at") ? new Date(values.get("due_at")).toISOString() : null;
    let body = String(values.get("body") || "").trim();

    if (!title) {
      setError("Task title is required.");
      setBusy(false);
      return;
    }

    if (targetStudentIds.length === 0) {
      setError("Please select at least one student using the checkboxes.");
      setBusy(false);
      return;
    }

    if (!body) {
      body = "Task assigned by instructor.";
    }

    const payloads = targetStudentIds.map((sid) => ({
      student_id: sid,
      course_id: courseId,
      title,
      body,
      status: "assigned",
      category: taskCategory,
      due_at: dueAt,
      created_by: user.id,
    }));

    let { error: insertError } = await supabase.from("student_notes").insert(payloads);

    // Fallback if status, category, or due_at column not in DB yet
    if (insertError) {
      const payloadsFallback = targetStudentIds.map((sid) => ({
        student_id: sid,
        course_id: courseId,
        title,
        body,
        created_by: user.id,
      }));
      const retryResult = await supabase.from("student_notes").insert(payloadsFallback);
      insertError = retryResult.error;
    }

    if (insertError) {
      setError(insertError.message);
    } else {
      setShowForm(false);
      form.reset();
      setNoteDriveUrl("");
      setNotePrefillStudentId("");
      const count = targetStudentIds.length;
      setNoteSelectedStudentIds([]);
      setNoteFormCourseId("");
      onToast(`Task assigned to ${count} student${count === 1 ? "" : "s"}!`);
      await loadData();
    }
    setBusy(false);
  }

  async function deleteRecord(record) {
    const table = view === "Attendance" ? "attendance_records" : "student_notes";
    const { error: deleteError } = await supabase.from(table).delete().eq("id", record.id);
    if (deleteError) setError(deleteError.message);
    else {
      onToast(view === "Attendance" ? "Attendance record deleted." : "Task deleted.");
      await loadData();
    }
  }

  async function toggleAdminTaskStatus(record) {
    const nextStatus = record.status === "completed" ? "assigned" : "completed";
    setBusy(true);
    try {
      const { error: updateErr } = await supabase
        .from("student_notes")
        .update({ status: nextStatus })
        .eq("id", record.id);
      if (updateErr) {
        console.warn("Could not update task status:", updateErr.message);
      }
      setRecords((prev) =>
        prev.map((r) => (r.id === record.id ? { ...r, status: nextStatus } : r))
      );
      onToast(nextStatus === "completed" ? "Task marked as completed!" : "Task marked as assigned.");
    } catch (err) {
      setError(err.message || "Failed to update task status.");
    } finally {
      setBusy(false);
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
      if (updates.trainer_id) {
        await supabase.from("trainer_students").upsert({
          trainer_id: updates.trainer_id,
          student_id: studentId,
        }, { onConflict: "trainer_id,student_id" });
      } else if (updates.trainer_id === null) {
        await supabase.from("trainer_students").delete().eq("student_id", studentId);
      }
      setEditingStudent(null);
      onToast("Student profile updated.");
      await loadData();
    }
    setBusy(false);
  }

  async function handleSaveTrainerStudents(trainerId, selectedStudentIds) {
    setBusy(true);
    setError("");
    try {
      await supabase.from("trainer_students").delete().eq("trainer_id", trainerId);

      if (selectedStudentIds.length > 0) {
        const rows = selectedStudentIds.map((studentId) => ({
          trainer_id: trainerId,
          student_id: studentId,
        }));
        const { error: insertErr } = await supabase.from("trainer_students").insert(rows);
        if (insertErr) throw insertErr;

        await supabase.from("profiles").update({ trainer_id: trainerId }).in("id", selectedStudentIds);
      }

      const removedStudentIds = trainerStudents
        .filter((ts) => ts.trainer_id === trainerId && !selectedStudentIds.includes(ts.student_id))
        .map((ts) => ts.student_id);
      if (removedStudentIds.length > 0) {
        await supabase.from("profiles").update({ trainer_id: null }).in("id", removedStudentIds);
      }

      onToast("Student assignments saved for trainer.");
      setAssigningTrainer(null);
      await loadData();
    } catch (err) {
      setError(`Failed to save trainer student assignments: ${err.message}`);
    } finally {
      setBusy(false);
    }
  }

  async function handlePermitNoteForStudent(material, studentId) {
    try {
      if (material.isFromStudentNotes && material.sourceNote) {
        const existing = allStudentNotes.find((n) => n.student_id === studentId && n.title.trim().toLowerCase() === material.title.trim().toLowerCase());
        if (!existing) {
          let { error: insertErr } = await supabase.from("student_notes").insert({
            student_id: studentId,
            course_id: material.course_id || null,
            title: material.title,
            body: material.sourceNote.body || material.description || `Course study material: ${material.title}`,
            drive_url: material.drive_url || null,
            material_id: material.sourceNote.material_id || null,
            created_by: user.id,
          });
          if (insertErr && (insertErr.message?.includes("drive_url") || insertErr.code === "PGRST204" || insertErr.code === "42703")) {
            await supabase.from("student_notes").insert({
              student_id: studentId,
              course_id: material.course_id || null,
              title: material.title,
              body: material.sourceNote.body || material.description || `Course study material: ${material.title}`,
              created_by: user.id,
            });
          }
        }
      } else {
        try {
          await supabase.from("material_recipients").upsert({ material_id: material.id, student_id: studentId }, { onConflict: "material_id,student_id" });
        } catch (mrErr) {
          console.warn("material_recipients upsert note:", mrErr);
        }
        const existing = allStudentNotes.find((n) => n.student_id === studentId && (n.material_id === material.id || n.title.trim().toLowerCase() === material.title.trim().toLowerCase()));
        if (!existing) {
          let { error: insertErr } = await supabase.from("student_notes").insert({
            student_id: studentId,
            course_id: material.course_id || null,
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
              course_id: material.course_id || null,
              title: material.title,
              body: bodyWithDrive,
              created_by: user.id,
            });
          }
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
      if (material.id && !material.isFromStudentNotes) {
        await supabase.from("material_recipients").delete().eq("material_id", material.id).eq("student_id", studentId);
      }
      try {
        if (material.id) {
          await supabase.from("student_notes").delete().eq("student_id", studentId).eq("material_id", material.id);
        }
      } catch (e) {
        console.warn(e);
      }
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

  async function handleShareNoteWithStudents(noteRecord, targetStudentIds) {
    const ids = Array.isArray(targetStudentIds) ? targetStudentIds : (targetStudentIds ? [targetStudentIds] : []);
    if (!ids.length) return;
    setSharingBusy(true);
    try {
      const inserts = ids.map((sid) => ({
        student_id: sid,
        course_id: noteRecord.course_id || null,
        title: noteRecord.title,
        body: noteRecord.body,
        drive_url: noteRecord.drive_url || null,
        material_id: noteRecord.material_id || null,
        created_by: user.id,
      }));
      let { error: insErr } = await supabase.from("student_notes").insert(inserts);
      if (insErr && (insErr.message?.includes("drive_url") || insErr.message?.includes("material_id") || insErr.code === "PGRST204" || insErr.code === "42703")) {
        const fallbackInserts = ids.map((sid) => ({
          student_id: sid,
          course_id: noteRecord.course_id || null,
          title: noteRecord.title,
          body: noteRecord.body,
          created_by: user.id,
        }));
        await supabase.from("student_notes").insert(fallbackInserts);
      }
      if (noteRecord.material_id) {
        const recipientInserts = ids.map((sid) => ({
          material_id: noteRecord.material_id,
          student_id: sid,
        }));
        await supabase.from("material_recipients").upsert(recipientInserts, { onConflict: "material_id,student_id" });
      }
      onToast(`Note and Drive link granted to ${ids.length} student${ids.length === 1 ? "" : "s"}.`);
      setSharingNoteRecord(null);
      setShareTargetStudentId("");
      setShareSelectedStudentIds([]);
      await loadData();
    } catch (err) {
      setError(`Could not grant note: ${err.message}`);
    } finally {
      setSharingBusy(false);
    }
  }

  async function handleShareNoteWithAnotherStudent(noteRecord, targetStudentId) {
    return handleShareNoteWithStudents(noteRecord, [targetStudentId]);
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
              <span className="course-quick-enroll-label">Enroll an approved student:</span>
              <div className="course-quick-enroll-inputs">
                <select
                  id={`enroll-${course.id}`}
                  defaultValue=""
                  className="status-select course-enroll-select"
                  aria-label="Select student to enroll"
                >
                  <option value="" disabled>Select approved student…</option>
                  {eligibleStudents.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.full_name || s.email} {s.full_name && s.email ? `(${s.email})` : ""}
                    </option>
                  ))}
                </select>
                <button
                  className="button primary course-enroll-btn"
                  type="button"
                  onClick={() => {
                    const el = document.getElementById(`enroll-${course.id}`);
                    if (el?.value) {
                      enrollStudentInCourse(course.id, el.value);
                      el.value = "";
                    } else {
                      onToast?.("Please select a student to enroll.");
                    }
                  }}
                >
                  <Plus size={14} /> Enroll
                </button>
              </div>
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
      {["Students", "Trainers", "Courses", "Attendance", "Notes", "Tasks"].includes(view) && (
        <button
          className="button primary"
          onClick={() => {
            if (view === "Trainers") {
              setShowTrainerModal(true);
            } else {
              setShowForm((current) => !current);
            }
            setError("");
          }}
        >
          <Plus size={15} />
          {view === "Students"
            ? "Add student"
            : view === "Trainers"
            ? "Create trainer account"
            : view === "Courses"
            ? "Add course"
            : view === "Attendance"
            ? "Record attendance"
            : "Assign task"}
        </button>
      )}
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

    {showForm && (view === "Tasks" || view === "Notes") && (
      <form className="card admin-create-form" onSubmit={createRecord}>
        <div className="panel-heading">
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span className="portal-item-icon assignment" style={{ width: "34px", height: "34px", background: "#eef2ff", color: "#4f46e5" }}>
                <CheckCircle2 size={18} />
              </span>
              <div>
                <h2>Assign Task to Students</h2>
                <p>Assign practical tasks, coding challenges, project milestones, and homework to students separately.</p>
              </div>
            </div>
          </div>
        </div>

        {/* Individual Student Assignment Notice */}
        <div style={{ marginTop: "12px", padding: "10px 14px", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "8px", display: "flex", alignItems: "center", gap: "10px" }}>
          <ShieldCheck size={18} style={{ color: "#166534", flexShrink: 0 }} />
          <div style={{ fontSize: "12.5px", color: "#166534", lineHeight: 1.4 }}>
            <strong>Individual Student Assignment:</strong> Each task is assigned to each selected student separately. Students can view task instructions and mark their task as completed in their portal.
          </div>
        </div>

        <div style={{ marginTop: "12px" }}>
          <label className="form-field">
            <span>Linked Course (Optional)</span>
            <select
              name="course_id"
              value={noteFormCourseId}
              onChange={(e) => {
                const cid = e.target.value;
                setNoteFormCourseId(cid);
                if (cid) {
                  const enrolled = enrollments.filter((en) => en.course_id === cid).map((en) => en.student_id);
                  const approvedEnrolled = students.filter((s) => s.is_approved && enrolled.includes(s.id)).map((s) => s.id);
                  if (approvedEnrolled.length > 0) {
                    setNoteSelectedStudentIds(approvedEnrolled);
                  }
                }
              }}
            >
              <option value="">General / Campus-wide (All Courses)</option>
              {courses.map((course) => (
                <option key={course.id} value={course.id}>{course.code} · {course.name}</option>
              ))}
            </select>
          </label>
        </div>

        {/* Multi-Student Checkbox Selection */}
        <div style={{ marginTop: "14px", padding: "14px", background: "#f8fafc", borderRadius: "10px", border: "1px solid #e2e8f0" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px", flexWrap: "wrap", gap: "8px" }}>
            <span style={{ fontWeight: 750, color: "var(--ink)", display: "flex", alignItems: "center", gap: "6px", fontSize: "13.5px" }}>
              <Users size={16} style={{ color: "#4f46e5" }} />
              <span>Select Students to Assign Task To *</span>
            </span>
            <span className="badge blue" style={{ fontSize: "11.5px", padding: "3px 8px" }}>
              {noteSelectedStudentIds.length} student{noteSelectedStudentIds.length === 1 ? "" : "s"} selected
            </span>
          </div>

          {/* Quick Actions & Search Filter */}
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "10px", alignItems: "center" }}>
            <input
              type="search"
              placeholder="Search student by name or email…"
              value={noteStudentSearch}
              onChange={(e) => setNoteStudentSearch(e.target.value)}
              style={{ flex: 1, minWidth: "180px", height: "32px", fontSize: "12px", padding: "0 10px", borderRadius: "6px", border: "1px solid var(--line)", background: "#fff" }}
            />
            <button
              type="button"
              className="button compact"
              style={{ fontSize: "11.5px", height: "32px" }}
              onClick={() => {
                const allApproved = students.filter((s) => s.is_approved).map((s) => s.id);
                setNoteSelectedStudentIds(allApproved);
              }}
            >
              <Check size={12} /> Select All ({students.filter((s) => s.is_approved).length})
            </button>
            {noteFormCourseId && (
              <button
                type="button"
                className="button compact"
                style={{ fontSize: "11.5px", height: "32px" }}
                onClick={() => {
                  const enrolled = enrollments.filter((en) => en.course_id === noteFormCourseId).map((en) => en.student_id);
                  const approvedEnrolled = students.filter((s) => s.is_approved && enrolled.includes(s.id)).map((s) => s.id);
                  setNoteSelectedStudentIds(approvedEnrolled);
                }}
              >
                <BookOpen size={12} /> Select Enrolled ({coursesById[noteFormCourseId]?.code})
              </button>
            )}
            {noteSelectedStudentIds.length > 0 && (
              <button
                type="button"
                className="button compact"
                style={{ fontSize: "11.5px", height: "32px", color: "var(--danger)" }}
                onClick={() => setNoteSelectedStudentIds([])}
              >
                Clear Selection
              </button>
            )}
          </div>

          {/* Checkbox List Box */}
          <div
            style={{
              maxHeight: "220px",
              overflowY: "auto",
              border: "1px solid var(--line)",
              borderRadius: "8px",
              background: "#ffffff",
              padding: "6px",
              display: "flex",
              flexDirection: "column",
              gap: "4px",
            }}
          >
            {students
              .filter((s) => s.is_approved)
              .filter((s) => {
                if (!noteStudentSearch.trim()) return true;
                const q = noteStudentSearch.trim().toLowerCase();
                return (s.full_name || "").toLowerCase().includes(q) || (s.email || "").toLowerCase().includes(q);
              })
              .map((student) => {
                const isChecked = noteSelectedStudentIds.includes(student.id);
                const isEnrolled = noteFormCourseId
                  ? enrollments.some((en) => en.course_id === noteFormCourseId && en.student_id === student.id)
                  : false;

                return (
                  <label
                    key={student.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                      padding: "7px 10px",
                      borderRadius: "6px",
                      background: isChecked ? "#eef2ff" : "#ffffff",
                      border: isChecked ? "1px solid #c7d2fe" : "1px solid transparent",
                      cursor: "pointer",
                      userSelect: "none",
                      transition: "all 0.15s ease",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setNoteSelectedStudentIds((prev) => [...prev, student.id]);
                        } else {
                          setNoteSelectedStudentIds((prev) => prev.filter((id) => id !== student.id));
                        }
                      }}
                      style={{ width: "16px", height: "16px", accentColor: "#4f46e5", cursor: "pointer" }}
                    />
                    <span className="student-avatar" style={{ width: "26px", height: "26px", fontSize: "11px" }}>
                      {(student.full_name || student.email || "S").slice(0, 1).toUpperCase()}
                    </span>
                    <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
                      <div style={{ minWidth: 0 }}>
                        <strong style={{ fontSize: "13px", color: "var(--ink)", display: "block" }}>
                          {student.full_name || student.email}
                        </strong>
                        <small style={{ fontSize: "11px", color: "var(--muted)" }}>{student.email}</small>
                      </div>
                      {isEnrolled && (
                        <span className="badge blue" style={{ fontSize: "10px", padding: "1px 6px" }}>
                          Enrolled
                        </span>
                      )}
                    </div>
                  </label>
                );
              })}
            {students.filter((s) => s.is_approved).length === 0 && (
              <div style={{ padding: "16px", textAlign: "center", color: "var(--muted)", fontSize: "12px" }}>
                No approved students found.
              </div>
            )}
          </div>
          <small className="muted" style={{ display: "block", marginTop: "6px", fontSize: "11.5px" }}>
            Check each student who should receive this task assignment.
          </small>
        </div>

        <div className="form-grid-2" style={{ marginTop: "14px" }}>
          <label className="form-field">
            <span>Task Title *</span>
            <input name="title" required maxLength={150} placeholder="e.g. Implement Binary Search Tree, Week 4 Homework" />
          </label>

          <label className="form-field">
            <span>Task Category</span>
            <select name="category" defaultValue="Task">
              <option value="Task">Task</option>
              <option value="Practice Data Sets">Practice Data Sets</option>
              <option value="Projects">Projects</option>
              <option value="Homework">Homework</option>
              <option value="Class Notes">Class Notes Review</option>
              <option value="Lab Exercise">Lab Exercise</option>
              <option value="Other">Other</option>
            </select>
          </label>
        </div>

        <label className="form-field" style={{ marginTop: "12px" }}>
          <span>Due Date / Deadline (Optional)</span>
          <input name="due_at" type="datetime-local" />
        </label>

        <label className="form-field" style={{ marginTop: "14px" }}>
          <span>Task Instructions &amp; Requirements *</span>
          <textarea
            name="body"
            rows={4}
            maxLength={10000}
            required
            placeholder="Explain the task objectives, requirements, submission format, or practice problem details..."
          />
        </label>

        <div className="form-actions" style={{ marginTop: "18px" }}>
          <button className="button" type="button" onClick={() => { setShowForm(false); setNotePrefillStudentId(""); setNoteSelectedStudentIds([]); }}>Cancel</button>
          <button className="button primary" disabled={busy}>
            <Plus size={14} />
            {busy ? "Assigning task…" : "Assign Task to Selected Students"}
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
        <article className="card metric-card" style={{ cursor: "pointer" }} onClick={() => onNavigate("Trainers")}>
          <div className="metric-top"><span>Trainers &amp; Faculty</span><span className="metric-icon blue"><GraduationCap size={17} /></span></div>
          <div className="metric-value">{trainers.length}</div>
          <div className="metric-foot">{trainers.filter((t) => t.is_approved).length} active instructors</div>
        </article>
        <article className="card metric-card">
          <div className="metric-top"><span>Active courses</span><span className="metric-icon amber"><BookOpen size={17} /></span></div>
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
            <button className="button" style={{ justifyContent: "flex-start" }} type="button" onClick={() => { onNavigate("Trainers"); setShowTrainerModal(true); }}>
              <GraduationCap size={14} /> Create trainer account
            </button>
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
        <article className="card summary-card summary-card-total"><span>Total students</span><strong>{students.length}</strong></article>
        <article className="card summary-card summary-card-pending"><span>Awaiting approval</span><strong>{students.filter((student) => !student.is_approved).length}</strong></article>
        <article className="card summary-card summary-card-approved"><span>Approved access</span><strong>{students.filter((student) => student.is_approved).length}</strong></article>
      </section>
      <section className="card student-admin-directory">
        <div className="student-admin-toolbar">
          <label className="search-box"><Search size={15} /><input type="search" aria-label="Search student accounts" placeholder="Search students by name or email" value={studentSearch} onChange={(event) => setStudentSearch(event.target.value)} /></label>
          <div className="form-actions" role="group" aria-label="Filter students by approval status">
            {[["all", "All"], ["pending", "Pending"], ["approved", "Approved"]].map(([value, label]) => <button key={value} type="button" className={`button ${studentStatus === value ? "primary" : ""}`} onClick={() => setStudentStatus(value)}>{label}{value === "pending" ? ` (${students.filter((student) => !student.is_approved).length})` : ""}</button>)}
          </div>
        </div>
        <section className="admin-work-list student-cards-grid">
          {filteredStudents.map((student) => {
            const studentEnrollments = enrollments.filter((e) => e.student_id === student.id);
            const notesCount = notesCountByStudent[student.id] || 0;

            return (
              <article className="card student-card-item" key={student.id}>
                {/* Top Profile Header */}
                <div className="student-item-top">
                  <div className="student-item-profile">
                    <span className="student-avatar" style={{ width: "42px", height: "42px", fontSize: "16px", flexShrink: 0 }}>
                      {(student.full_name || student.email).slice(0, 1).toUpperCase()}
                    </span>
                    <div className="student-item-details">
                      <div className="student-item-name-row">
                        <strong className="student-item-name">{student.full_name || "Student"}</strong>
                        <span className={`portal-status ${student.is_approved ? "submitted" : "pending"}`}>
                          {student.is_approved ? "Approved" : "Pending Approval"}
                        </span>
                      </div>
                      <span className="student-item-email">{student.email}</span>
                      <small className="student-item-date">
                        Joined {new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(student.created_at))}
                      </small>
                    </div>
                  </div>
                </div>

                {/* Meta Information Container (Timing, Notes & Courses) */}
                <div className="student-item-meta">
                  <span className="student-timing-chip">
                    <Clock3 size={12} /> Class Timing: <strong>{student.timing || "10:00 AM - 12:00 PM"}</strong>
                  </span>

                  {(() => {
                    const assignedTrainerId = student.trainer_id || trainerStudents.find((ts) => ts.student_id === student.id)?.trainer_id;
                    const assignedTrainer = trainers.find((t) => t.id === assignedTrainerId);
                    return assignedTrainer ? (
                      <span
                        className="student-timing-chip"
                        style={{ background: "#f0fdf4", color: "#166534", borderColor: "#bbf7d0", cursor: "pointer" }}
                        onClick={() => setAssigningTrainer(assignedTrainer)}
                        title={`Assigned to trainer ${assignedTrainer.full_name || assignedTrainer.email}. Click to manage.`}
                      >
                        <GraduationCap size={12} /> Trainer: <strong>{assignedTrainer.full_name || assignedTrainer.email}</strong>
                      </span>
                    ) : (
                      <span
                        className="student-timing-chip"
                        style={{ color: "#94a3b8", borderStyle: "dashed", cursor: "pointer" }}
                        onClick={() => setEditingStudent(student)}
                        title="Click Edit Profile to assign a trainer"
                      >
                        <GraduationCap size={12} /> Trainer: <em>Unassigned</em>
                      </span>
                    );
                  })()}

                  <span
                    className="student-timing-chip"
                    style={{
                      background: notesCount > 0 ? "#eef2ff" : undefined,
                      color: notesCount > 0 ? "#4f46e5" : undefined,
                      borderColor: notesCount > 0 ? "#c7d2fe" : undefined,
                      cursor: "pointer",
                    }}
                    onClick={() => {
                      setSelectedStudentFilter(student.id);
                      onNavigate("Notes");
                    }}
                    title={`Click to view ${notesCount} note(s) specifically for ${student.full_name || student.email}`}
                  >
                    <FileText size={12} /> Notes: <strong>{notesCount}</strong>
                  </span>

                  {/* Enrolled Courses Badges */}
                  <div className="student-item-courses">
                    <span style={{ fontSize: "11px", color: "var(--muted)", fontWeight: 600 }}>Courses:</span>
                    {studentEnrollments.length > 0 ? (
                      studentEnrollments.map((e) => {
                        const c = coursesById[e.course_id];
                        return c ? (
                          <span key={c.id} className="course-code-badge" style={{ fontSize: "11px" }} title={c.name}>
                            {c.code}
                          </span>
                        ) : null;
                      })
                    ) : (
                      <span style={{ fontSize: "11px", color: "var(--muted)", fontStyle: "italic" }}>
                        None enrolled
                      </span>
                    )}
                  </div>
                </div>

                {/* Structured Responsive Action Bar */}
                <div className="student-item-actions">
                  <div className="student-actions-row-primary">
                    <button
                      className="button primary compact"
                      type="button"
                      disabled={busy}
                      onClick={() => setManagingStudentAccess(student)}
                      title={`Manage course notes, tests, and permissions specifically for ${student.full_name || student.email}`}
                    >
                      <ShieldCheck size={13} />
                      <span>Permissions &amp; Notes</span>
                    </button>

                    <button
                      className="button compact"
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
                      <FileText size={13} />
                      <span>Add Note</span>
                    </button>

                    <button
                      className="button compact"
                      type="button"
                      disabled={busy}
                      onClick={() => setEditingStudent(student)}
                      title="Edit student profile and timing"
                    >
                      <Pencil size={13} />
                      <span>Edit Profile</span>
                    </button>
                  </div>

                  <div className="student-actions-row-secondary">
                    <button
                      className={`button compact ${student.is_approved ? "" : "button-approve-accent"}`}
                      type="button"
                      disabled={busy}
                      onClick={() => approveStudent(student, !student.is_approved)}
                      title={student.is_approved ? "Suspend student portal access" : "Approve student portal access"}
                    >
                      {student.is_approved ? "Suspend Access" : <><Check size={13} /> Approve Access</>}
                    </button>

                    <button
                      className="button compact"
                      type="button"
                      disabled={busy}
                      onClick={() => copyInviteLink(student)}
                      title="Copy sign-in invite link"
                    >
                      <Link2 size={13} />
                      <span>Copy Invite</span>
                    </button>

                    <button
                      className="button compact"
                      type="button"
                      disabled={busy}
                      onClick={() => promoteToTrainer(student)}
                      title={`Promote ${student.full_name || student.email} to Trainer`}
                    >
                      <GraduationCap size={13} />
                      <span>Make Trainer</span>
                    </button>

                    <button
                      className="button compact danger-icon"
                      type="button"
                      disabled={busy}
                      onClick={() => deleteStudent(student)}
                      title="Delete student account"
                      aria-label="Delete student account"
                    >
                      <Trash2 size={13} />
                      <span>Delete</span>
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
          {!filteredStudents.length && <div className="card portal-empty"><Users size={22} /><strong>{students.length ? "No students match this filter" : "No student accounts yet"}</strong><span>{students.length ? "Change the search or approval filter." : "Add a student to send a secure sign-in invitation."}</span></div>}
        </section>
      </section>
    </> : view === "Trainers" ? <>
      <section className="student-admin-summary">
        <article className="card summary-card summary-card-total">
          <span>Total trainers</span>
          <strong>{trainers.length}</strong>
        </article>
        <article className="card summary-card summary-card-approved">
          <span>Active &amp; Approved</span>
          <strong>{trainers.filter((t) => t.is_approved).length}</strong>
        </article>
        <article className="card summary-card summary-card-pending">
          <span>Assigned Shifts</span>
          <strong>{new Set(trainers.map((t) => t.timing).filter(Boolean)).size || (trainers.length > 0 ? 1 : 0)}</strong>
        </article>
      </section>

      {/* Pre-configured Trainer Account Callout */}
      <div
        className="card"
        style={{
          background: "linear-gradient(135deg, #eff6ff 0%, #f0fdf4 100%)",
          border: "1px solid #bfdbfe",
          borderRadius: "12px",
          padding: "16px 20px",
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "14px",
          marginBottom: "16px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div
            style={{
              width: "42px",
              height: "42px",
              borderRadius: "10px",
              background: "#2563eb",
              color: "#ffffff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <GraduationCap size={22} />
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <strong style={{ fontSize: "15px", color: "#1e3a8a" }}>Lead Trainer Account Ready</strong>
              <span className="badge green"><i />Pre-configured</span>
            </div>
            <div style={{ fontSize: "13px", color: "#3b82f6", marginTop: "2px" }}>
              Email: <strong>trainer@learnforge.com</strong> | Password: <strong>Trainer@LearnForge2026!</strong>
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          <button
            type="button"
            className="button compact"
            onClick={() => {
              navigator.clipboard.writeText("Email: trainer@learnforge.com\nPassword: Trainer@LearnForge2026!\nURL: " + window.location.origin);
              onToast("Lead trainer credentials copied to clipboard!");
            }}
          >
            <Copy size={13} /> Copy Credentials
          </button>
          <button
            type="button"
            className="button primary compact"
            onClick={() => setShowTrainerModal(true)}
          >
            <Plus size={13} /> Create New Trainer
          </button>
        </div>
      </div>

      <section className="card student-admin-directory">
        <div className="student-admin-toolbar" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
          <div className="search-box" style={{ maxWidth: "340px", flex: 1 }}>
            <Search size={15} />
            <input
              type="search"
              placeholder="Search trainers by name, email, or timing..."
              value={trainerSearch}
              onChange={(e) => setTrainerSearch(e.target.value)}
            />
          </div>
          <button
            type="button"
            className="button primary"
            onClick={() => setShowTrainerModal(true)}
          >
            <Plus size={14} /> Add Trainer Account
          </button>
        </div>

        <section className="student-card-grid">
          {trainers
            .filter((t) => {
              const q = trainerSearch.trim().toLowerCase();
              if (!q) return true;
              return [t.full_name, t.email, t.timing].some((v) => v && v.toLowerCase().includes(q));
            })
            .map((trainer) => (
              <article className="card student-manage-card" key={trainer.id}>
                <div className="student-card-top">
                  <div className="student-card-profile">
                    <span className="student-avatar" style={{ background: "linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)", color: "#ffffff" }}>
                      {(trainer.full_name || trainer.email).slice(0, 1).toUpperCase()}
                    </span>
                    <div className="student-card-identity">
                      <strong>{trainer.full_name || "Trainer"}</strong>
                      <span className="student-card-email">{trainer.email}</span>
                      <div style={{ marginTop: "4px", display: "flex", gap: "6px", flexWrap: "wrap" }}>
                        <span className="badge blue" style={{ fontSize: "11px" }}>
                          <GraduationCap size={11} style={{ marginRight: "3px" }} /> Trainer
                        </span>
                        {trainer.timing && (
                          <span className="badge" style={{ fontSize: "11px", background: "#f1f5f9", color: "#475569" }}>
                            <Clock3 size={11} style={{ marginRight: "3px" }} /> {trainer.timing}
                          </span>
                        )}
                        <span
                          className="badge green"
                          style={{ fontSize: "11px", cursor: "pointer" }}
                          onClick={() => setAssigningTrainer(trainer)}
                          title="Click to manage assigned students"
                        >
                          <Users size={11} style={{ marginRight: "3px" }} />
                          {trainerStudents.filter((ts) => ts.trainer_id === trainer.id).length} Assigned Students
                        </span>
                      </div>
                    </div>
                  </div>
                  <span className={`portal-status ${trainer.is_approved ? "submitted" : "pending"}`}>
                    {trainer.is_approved ? "Active" : "Suspended"}
                  </span>
                </div>

                <div className="student-card-bottom" style={{ borderTop: "1px solid var(--line)", paddingTop: "12px", marginTop: "12px" }}>
                  <div className="student-actions-row-secondary" style={{ width: "100%", display: "flex", gap: "8px", justifyContent: "flex-end", flexWrap: "wrap" }}>
                    <button
                      className="button compact"
                      type="button"
                      disabled={busy}
                      onClick={() => setAssigningTrainer(trainer)}
                      style={{ background: "#eff6ff", color: "#2563eb", borderColor: "#bfdbfe", fontWeight: 600 }}
                      title={`Assign students to ${trainer.full_name || trainer.email}`}
                    >
                      <Users size={13} />
                      <span>Assign Students ({trainerStudents.filter((ts) => ts.trainer_id === trainer.id).length})</span>
                    </button>

                    <button
                      className="button compact"
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        navigator.clipboard.writeText(`Trainer Account: ${trainer.email}\nPortal URL: ${window.location.origin}`);
                        onToast(`Login details copied for ${trainer.email}`);
                      }}
                      title="Copy login info"
                    >
                      <Copy size={13} />
                      <span>Copy Info</span>
                    </button>

                    <button
                      className="button compact"
                      type="button"
                      disabled={busy}
                      onClick={() => toggleTrainerStatus(trainer)}
                      title={trainer.is_approved ? "Suspend trainer account" : "Activate trainer account"}
                    >
                      {trainer.is_approved ? "Suspend" : <><Check size={13} /> Activate</>}
                    </button>

                    <button
                      className="button compact"
                      type="button"
                      disabled={busy}
                      onClick={() => demoteToStudent(trainer)}
                      title="Switch role from Trainer to Student"
                    >
                      <Users size={13} />
                      <span>Make Student</span>
                    </button>

                    <button
                      className="button compact danger-icon"
                      type="button"
                      disabled={busy}
                      onClick={() => deleteTrainer(trainer)}
                      title="Delete trainer account"
                      aria-label="Delete trainer account"
                    >
                      <Trash2 size={13} />
                      <span>Delete</span>
                    </button>
                  </div>
                </div>
              </article>
            ))}

          {trainers.length === 0 && (
            <div className="card portal-empty">
              <GraduationCap size={24} />
              <strong>No trainer accounts yet</strong>
              <span>Click "Add Trainer Account" to provision a login account for an instructor.</span>
            </div>
          )}
        </section>
      </section>
    </> : view === "Courses" ? <>
      <section className="student-admin-summary course-admin-summary">
        <article className="card summary-card summary-card-courses">
          <span>Total courses</span>
          <strong>{courses.length}</strong>
        </article>
        <article className="card summary-card summary-card-enrollments">
          <span>Active enrollments</span>
          <strong>{enrollments.length}</strong>
        </article>
        <article className="card summary-card summary-card-size">
          <span>Avg class size</span>
          <strong>{courses.length ? (enrollments.length / courses.length).toFixed(1) : 0}</strong>
        </article>
        <article className="card summary-card summary-card-depts">
          <span>Departments</span>
          <strong>{new Set(courses.map((c) => c.department).filter(Boolean)).size || (courses.length > 0 ? 1 : 0)}</strong>
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
              All Tasks ({records.length})
            </button>
            <button
              type="button"
              className={`button ${noteFilter === "assigned" ? "primary" : ""}`}
              onClick={() => setNoteFilter("assigned")}
            >
              <Clock3 size={13} /> Assigned ({records.filter((r) => r.status !== "completed").length})
            </button>
            <button
              type="button"
              className={`button ${noteFilter === "completed" ? "primary" : ""}`}
              onClick={() => setNoteFilter("completed")}
            >
              <Check size={13} /> Completed ({records.filter((r) => r.status === "completed").length})
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
              <option value="all">👥 All Students ({records.length} tasks)</option>
              {students
                .filter((s) => s.is_approved)
                .map((s) => {
                  const count = records.filter((r) => r.student_id === s.id).length;
                  return (
                    <option key={s.id} value={s.id}>
                      {s.full_name || s.email} ({count} task{count === 1 ? "" : "s"})
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
                Viewing tasks specifically for <strong>{studentsById[selectedStudentFilter]?.full_name || studentsById[selectedStudentFilter]?.email}</strong>
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
                <Plus size={12} /> Assign Task for this Student
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
              if (noteFilter === "assigned" && record.status === "completed") return false;
              if (noteFilter === "completed" && record.status !== "completed") return false;
              const student = studentsById[record.student_id];
              const course = coursesById[record.course_id];
              const haystack = `${record.title} ${record.body} ${record.category || ""} ${student?.full_name || ""} ${student?.email || ""} ${course?.name || ""} ${course?.code || ""}`.toLowerCase();
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
                      <span className="portal-item-icon assignment" style={{ width: "42px", height: "42px", flexShrink: 0, background: record.status === "completed" ? "#ecfdf5" : "#eef2ff", color: record.status === "completed" ? "#059669" : "#4f46e5" }}>
                        <CheckCircle2 size={18} />
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px" }}>
                          <h2 style={{ fontSize: "16px", fontWeight: 700, margin: 0, color: "var(--ink)", textDecoration: record.status === "completed" ? "line-through" : "none" }}>{record.title}</h2>
                          {course && (
                            <span className="course-code-badge" style={{ fontSize: "11px" }}>
                              {course.code}
                            </span>
                          )}
                          <span className="badge blue" style={{ fontSize: "11px", fontWeight: 650 }}>
                            {record.category || "Task"}
                          </span>
                          {record.status === "completed" ? (
                            <span
                              className="badge green"
                              style={{
                                fontSize: "11px",
                                fontWeight: 700,
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "3px",
                              }}
                            >
                              <Check size={11} strokeWidth={3} /> Status: Completed
                            </span>
                          ) : (
                            <span
                              className="badge amber"
                              style={{
                                fontSize: "11px",
                                fontWeight: 700,
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "3px",
                              }}
                            >
                              <Clock3 size={11} /> Status: Assigned
                            </span>
                          )}
                        </div>

                        <p style={{ margin: "4px 0 0", fontSize: "13px", color: "var(--muted)" }}>
                          Student: <strong>{student?.full_name || student?.email || "Student"}</strong>
                          {course ? ` · ${course.name}` : ""}
                          <span style={{ marginLeft: "10px", fontSize: "12px", opacity: 0.8 }}>
                            {formatCourseDate(record.created_at)}
                          </span>
                          {record.due_at && (
                            <span style={{ marginLeft: "10px", fontSize: "12px", color: "#d97706", fontWeight: 600 }}>
                              Due: {new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(record.due_at))}
                            </span>
                          )}
                        </p>
                      </div>
                    </div>

                    <div className="heading-actions" style={{ flexShrink: 0 }}>
                      <button
                        className="button compact"
                        type="button"
                        onClick={() => toggleAdminTaskStatus(record)}
                        title="Toggle task completion status for this student"
                      >
                        <CheckCircle2 size={12} /> {record.status === "completed" ? "Mark Assigned" : "Mark Completed"}
                      </button>
                      <button
                        className="button compact"
                        type="button"
                        onClick={() => {
                          setSharingNoteRecord(sharingNoteRecord?.id === record.id ? null : record);
                          setShareTargetStudentId("");
                        }}
                        title="Assign this task to another student separately"
                      >
                        <Users size={12} /> Assign to another student
                      </button>
                      <button
                        className="button compact"
                        type="button"
                        onClick={() => {
                          setNotePrefillStudentId(record.student_id);
                          setNoteRecipientType("single");
                          setShowForm(true);
                        }}
                        title={`Assign another task specifically for ${student?.full_name || "this student"}`}
                      >
                        <Plus size={12} /> Add for this student
                      </button>
                      <button className="button compact" type="button" onClick={() => setEditingRecord(record)} title="Edit task details">
                        <Pencil size={13} /> Edit
                      </button>
                      <button className="quiet-icon danger-icon" type="button" onClick={() => deleteRecord(record)} aria-label="Delete task">
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
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px", flexWrap: "wrap", gap: "8px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          <Users size={14} style={{ color: "#166534" }} />
                          <strong style={{ fontSize: "13px", color: "#166534" }}>
                            Give this note to additional students (check students):
                          </strong>
                        </div>
                        <span className="badge green" style={{ fontSize: "11px" }}>
                          {shareSelectedStudentIds.length} selected
                        </span>
                      </div>

                      {/* Quick Select Buttons */}
                      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "8px", alignItems: "center" }}>
                        <input
                          type="search"
                          placeholder="Filter students…"
                          value={shareStudentSearch}
                          onChange={(e) => setShareStudentSearch(e.target.value)}
                          style={{ flex: 1, minWidth: "150px", height: "30px", fontSize: "12px", padding: "0 8px", borderRadius: "6px", border: "1px solid #86efac", background: "#fff" }}
                        />
                        <button
                          type="button"
                          className="button compact"
                          style={{ height: "30px", fontSize: "11.5px" }}
                          onClick={() => {
                            const eligibleIds = students
                              .filter((s) => s.is_approved && s.id !== record.student_id)
                              .map((s) => s.id);
                            setShareSelectedStudentIds(eligibleIds);
                          }}
                        >
                          Select All
                        </button>
                        {record.course_id && (
                          <button
                            type="button"
                            className="button compact"
                            style={{ height: "30px", fontSize: "11.5px" }}
                            onClick={() => {
                              const enrolled = enrollments
                                .filter((e) => e.course_id === record.course_id && e.student_id !== record.student_id)
                                .map((e) => e.student_id);
                              setShareSelectedStudentIds(enrolled);
                            }}
                          >
                            Select Enrolled
                          </button>
                        )}
                        {shareSelectedStudentIds.length > 0 && (
                          <button
                            type="button"
                            className="button compact"
                            style={{ height: "30px", fontSize: "11.5px" }}
                            onClick={() => setShareSelectedStudentIds([])}
                          >
                            Clear
                          </button>
                        )}
                      </div>

                      {/* Scrollable Checkbox List */}
                      <div
                        style={{
                          maxHeight: "150px",
                          overflowY: "auto",
                          border: "1px solid #bbf7d0",
                          borderRadius: "6px",
                          background: "#fff",
                          padding: "4px",
                          display: "flex",
                          flexDirection: "column",
                          gap: "3px",
                          marginBottom: "10px",
                        }}
                      >
                        {students
                          .filter((s) => s.is_approved && s.id !== record.student_id)
                          .filter((s) => {
                            if (!shareStudentSearch.trim()) return true;
                            const q = shareStudentSearch.trim().toLowerCase();
                            return (s.full_name || "").toLowerCase().includes(q) || (s.email || "").toLowerCase().includes(q);
                          })
                          .map((s) => {
                            const isChecked = shareSelectedStudentIds.includes(s.id);
                            const isEnrolled = record.course_id
                              ? enrollments.some((e) => e.course_id === record.course_id && e.student_id === s.id)
                              : false;
                            return (
                              <label
                                key={s.id}
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "8px",
                                  padding: "5px 8px",
                                  borderRadius: "4px",
                                  background: isChecked ? "#f0fdf4" : "#ffffff",
                                  border: isChecked ? "1px solid #86efac" : "1px solid transparent",
                                  cursor: "pointer",
                                  fontSize: "12px",
                                }}
                              >
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setShareSelectedStudentIds((prev) => [...prev, s.id]);
                                    } else {
                                      setShareSelectedStudentIds((prev) => prev.filter((id) => id !== s.id));
                                    }
                                  }}
                                  style={{ accentColor: "#16a34a" }}
                                />
                                <span style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", justifyContent: "space-between", gap: "6px" }}>
                                  <span style={{ fontWeight: 600, color: "#166534" }}>{s.full_name || s.email}</span>
                                  {isEnrolled && <span className="badge blue" style={{ fontSize: "9.5px", padding: "1px 5px" }}>Enrolled</span>}
                                </span>
                              </label>
                            );
                          })}
                      </div>

                      <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                        <button
                          type="button"
                          className="button primary compact"
                          disabled={shareSelectedStudentIds.length === 0 || sharingBusy}
                          onClick={() => handleShareNoteWithStudents(record, shareSelectedStudentIds)}
                        >
                          <Check size={12} /> {sharingBusy ? "Granting…" : `Grant Access to (${shareSelectedStudentIds.length}) Student${shareSelectedStudentIds.length === 1 ? "" : "s"}`}
                        </button>
                        <button
                          type="button"
                          className="button compact"
                          onClick={() => {
                            setSharingNoteRecord(null);
                            setShareSelectedStudentIds([]);
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                      <small style={{ color: "#15803d", display: "block", marginTop: "6px", fontSize: "11.5px" }}>
                        Checked students will immediately receive access to this note in their student portal.
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
              <CheckCircle2 size={24} />
              <strong>No tasks assigned yet</strong>
              <span>Use the "Assign task" button above to assign tasks, homework, or milestones to students.</span>
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
        trainers={trainers}
        onClose={() => setEditingStudent(null)}
        onSave={updateStudentProfile}
        onDelete={deleteStudent}
      />
    )}

    {assigningTrainer && (
      <AssignTrainerStudentsModal
        trainer={assigningTrainer}
        students={students}
        assignedStudentIds={trainerStudents.filter((ts) => ts.trainer_id === assigningTrainer.id).map((ts) => ts.student_id)}
        onSave={handleSaveTrainerStudents}
        onClose={() => setAssigningTrainer(null)}
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
    {showTrainerModal && (
      <CreateTrainerModal
        supabase={supabase}
        onClose={() => setShowTrainerModal(false)}
        onCreated={() => loadData()}
        onToast={onToast}
      />
    )}
  </div>;
}

export default AdminManagementView;
