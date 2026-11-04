import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowRight, BookOpen, Check, Clock3, Copy, Database, Download, ExternalLink, Eye, FileText, GraduationCap,
  HardDrive, Link2, Mail, MapPin, Pencil, Plus, RefreshCw, Search, Trash2, Upload, Users, X
} from "lucide-react";
import { getFunctionErrorMessage } from "../lib/functionErrors.js";
import EditCourseModal from "../components/EditCourseModal";
import EditRecordModal from "../components/EditRecordModal";
import EditStudentModal from "../components/EditStudentModal";
import AttendanceCalendar from "../components/AttendanceCalendar";
<<<<<<< HEAD
import SecureDocumentViewer from "../components/SecureDocumentViewer";
import ManageNoteAccessModal from "../components/ManageNoteAccessModal";
import { parseNoteAttachment, formatNoteBodyWithAttachment, uploadNotePdfToStorage } from "../lib/noteAttachments.js";
=======
import WeatherMoodBanner from "../components/WeatherMoodBanner.jsx";
>>>>>>> 568f72a81c15e9e0a6b0918695bec09612ad2baa

const headings = {
  Overview: ["Workspace", "Admin overview", "Manage students, course access, and learning records in one place."],
  Students: ["People", "Students", "Approve access, invite students, and manage student accounts."],
  Courses: ["Academic programs", "Courses", "Create courses, manage schedules and instructors, and enroll students."],
  Attendance: ["Academic operations", "Attendance", "Record and review daily student attendance."],
  Notes: ["Student support", "Notes", "Write private notes for an individual student, optionally linked to a course."],
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
  const [noteAttachmentType, setNoteAttachmentType] = useState("none");
  const [notePdfFile, setNotePdfFile] = useState(null);
  const [noteDriveLink, setNoteDriveLink] = useState("");
  const [viewingAttachment, setViewingAttachment] = useState(null);
  const [copiedNoteId, setCopiedNoteId] = useState(null);

  // Notes student checkboxes & access management
  const [selectedNoteStudentIds, setSelectedNoteStudentIds] = useState([]);
  const [selectedNoteCourseId, setSelectedNoteCourseId] = useState("");
  const [noteStudentSearch, setNoteStudentSearch] = useState("");
  const [managingAccessNote, setManagingAccessNote] = useState(null);
  const [noteFilterTab, setNoteFilterTab] = useState("all"); // 'all' | 'drive'
  const [noteStudentFilter, setNoteStudentFilter] = useState("all");
  const [notesViewMode, setNotesViewMode] = useState("grouped"); // 'grouped' | 'individual'

  function copyNoteLink(id, url) {
    if (!url) return;
    navigator.clipboard?.writeText(url).then(() => {
      setCopiedNoteId(id);
      onToast?.("Note link copied to clipboard.");
      setTimeout(() => setCopiedNoteId(null), 2500);
    });
  }

  async function saveManagedAccess(noteGroup, newStudentIds) {
    setBusy(true);
    setError("");
    try {
      const existingRecords = noteGroup.records || [noteGroup];
      const existingStudentIds = existingRecords.map((r) => r.student_id);
      const toAdd = newStudentIds.filter((id) => !existingStudentIds.includes(id));
      const toRemove = existingStudentIds.filter((id) => !newStudentIds.includes(id));

      if (toAdd.length > 0) {
        const newRecords = toAdd.map((studentId) => ({
          student_id: studentId,
          course_id: noteGroup.course_id || null,
          title: noteGroup.title,
          body: noteGroup.body,
          created_by: user.id,
        }));
        const { error: insertError } = await supabase.from("student_notes").insert(newRecords);
        if (insertError) throw insertError;
      }

      if (toRemove.length > 0) {
        const idsToDelete = existingRecords
          .filter((r) => toRemove.includes(r.student_id))
          .map((r) => r.id);
        const { error: deleteError } = await supabase.from("student_notes").delete().in("id", idsToDelete);
        if (deleteError) throw deleteError;
      }

      onToast(`Student access updated for “${noteGroup.title}”.`);
      setManagingAccessNote(null);
      await loadData();
    } catch (err) {
      setError(`Could not update note access: ${err.message}`);
    } finally {
      setBusy(false);
    }
  }

  const loadData = useCallback(async (forceLoading = false) => {
    if (forceLoading) setLoading(true);
    setError("");
    try {
      const [studentResult, courseResult, enrollmentResult, storageResult] = await Promise.all([
        supabase.from("profiles").select("id, email, full_name, is_approved, timing, created_at").eq("role", "student").order("created_at", { ascending: false }),
        supabase.from("courses").select("id, name, code, description, department, instructor, schedule, room, created_at").order("created_at", { ascending: false }),
        supabase.from("course_enrollments").select("course_id, student_id"),
        supabase.rpc("get_database_storage_stats"),
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
      if (storageResult && !storageResult.error && storageResult.data) {
        setStorageStats(storageResult.data);
      }

      if (view === "Attendance" || view === "Notes") {
        const table = view === "Attendance" ? "attendance_records" : "student_notes";
        const { data, error: resultError } = await supabase.from(table)
          .select(view === "Attendance"
            ? "id, student_id, course_id, attendance_date, status, note, created_at"
            : "id, student_id, course_id, title, body, created_at")
          .order(view === "Attendance" ? "attendance_date" : "created_at", { ascending: false });
        if (resultError) setError(resultError.message);
        else setRecords(data ?? []);
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
        const [assignResult, testResult] = await Promise.all([
          supabase.from("assignments").select("id").eq("published", true),
          supabase.from("assessments").select("id").eq("published", true),
        ]);
        if (assignResult.data?.length) {
          await supabase.from("assignment_recipients").upsert(assignResult.data.map((a) => ({ assignment_id: a.id, student_id: student.id })), { onConflict: "assignment_id,student_id" });
        }
        if (testResult.data?.length) {
          await supabase.from("assessment_recipients").upsert(testResult.data.map((t) => ({ assessment_id: t.id, student_id: student.id })), { onConflict: "assessment_id,student_id" });
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
    const isAttendance = view === "Attendance";
    const table = isAttendance ? "attendance_records" : "student_notes";
    let finalBody = String(values.get("body") || "").trim();
    if (!isAttendance) {
      if (noteAttachmentType === "upload") {
        if (!notePdfFile) {
          setError("Please select a PDF file to upload.");
          setBusy(false);
          return;
        }
        try {
          const uploadRes = await uploadNotePdfToStorage(supabase, notePdfFile);
          finalBody = formatNoteBodyWithAttachment(finalBody, uploadRes.url, notePdfFile.name);

          // Also register in course_materials under 'Lecture Notes'
          try {
            await supabase.from("course_materials").insert({
              title: `${String(values.get("title")).trim()} (Notes PDF)`,
              description: `Notes attached for ${studentsById[values.get("student_id")]?.full_name || "student"}`,
              category: "Lecture Notes",
              course_id: values.get("course_id") || null,
              file_path: uploadRes.storagePath,
              file_name: notePdfFile.name,
              file_size: uploadRes.fileSize,
              file_type: "application/pdf",
              created_by: user.id,
            });
          } catch (cmErr) {
            console.warn("Could not register in course_materials:", cmErr);
          }
        } catch (uploadErr) {
          setError(uploadErr.message || "Failed to upload note PDF.");
          setBusy(false);
          return;
        }
      } else if (noteAttachmentType === "drive") {
        let cleanUrl = (noteDriveLink || "").trim();
        if (!cleanUrl) {
          setError("Please provide a Google Drive or document link.");
          setBusy(false);
          return;
        }
        if (!/^https?:\/\//i.test(cleanUrl)) {
          cleanUrl = `https://${cleanUrl}`;
        }
        try {
          new URL(cleanUrl);
        } catch {
          setError("Please provide a valid web link or Google Drive URL.");
          setBusy(false);
          return;
        }
        finalBody = formatNoteBodyWithAttachment(finalBody, cleanUrl, "Google Drive Notes");

        // Also register in course_materials under 'Lecture Notes'
        try {
          await supabase.from("course_materials").insert({
            title: `${String(values.get("title")).trim()} (Drive Notes)`,
            description: `Drive notes for ${studentsById[values.get("student_id")]?.full_name || "student"}`,
            category: "Lecture Notes",
            course_id: values.get("course_id") || null,
            drive_url: cleanUrl,
            file_type: "application/pdf",
            created_by: user.id,
          });
        } catch (cmErr) {
          console.warn("Could not register in course_materials:", cmErr);
        }
      }
    }

    if (!isAttendance) {
      if (selectedNoteStudentIds.length === 0) {
        setError("Please check at least one student in the checkbox list to grant access.");
        setBusy(false);
        return;
      }
      const payloads = selectedNoteStudentIds.map((studentId) => ({
        student_id: studentId,
        course_id: values.get("course_id") || null,
        title: String(values.get("title")).trim(),
        body: finalBody,
        created_by: user.id,
      }));
      const { error: insertError } = await supabase.from(table).insert(payloads);
      if (insertError) {
        setError(insertError.message);
      } else {
        setShowForm(false);
        form.reset();
        setSelectedNoteStudentIds([]);
        setSelectedNoteCourseId("");
        setNoteAttachmentType("none");
        setNotePdfFile(null);
        setNoteDriveLink("");
        onToast(`Private note granted to ${payloads.length} student${payloads.length > 1 ? "s" : ""} without duplicate creation.`);
        await loadData();
      }
    } else {
      const payload = {
        student_id: values.get("student_id"),
        course_id: values.get("course_id") || null,
        attendance_date: values.get("attendance_date"),
        status: values.get("status"),
        note: String(values.get("note")).trim(),
        created_by: user.id,
      };
      const { error: insertError } = await supabase.from(table).insert(payload);
      if (insertError) {
        setError(insertError.message);
      } else {
        setShowForm(false);
        form.reset();
        onToast("Attendance recorded.");
        await loadData();
      }
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
    const { error: updateError } = await supabase.from(table).update(payload).eq("id", recordId);
    if (updateError) {
      setError(updateError.message);
    } else {
      setEditingRecord(null);
      onToast(isAttendance ? "Attendance updated." : "Note updated.");
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
    {view === "Overview" && <WeatherMoodBanner userName={user?.email} />}
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
    {showForm && (view === "Attendance" || view === "Notes") && <form className="card admin-create-form" onSubmit={createRecord}>
      <div className="panel-heading"><div><h2>{view === "Attendance" ? "Record attendance" : "Write a student note"}</h2><p>{view === "Attendance" ? "Attendance is private to the student and administrators." : "Only this student and administrators can view the note."}</p></div></div>
      {view === "Attendance" ? (
        <label className="form-field">
          <span>Student *</span>
          <select name="student_id" required defaultValue="">
            <option value="" disabled>Select a student</option>
            {students.filter((student) => student.is_approved).map((student) => (
              <option key={student.id} value={student.id}>
                {student.full_name || student.email} · {student.email}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <fieldset className="admin-options" style={{ marginTop: "8px", marginBottom: "14px" }}>
          <legend style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
            <span>Grant Note Access to Students *</span>
            <small style={{ fontWeight: "700", color: selectedNoteStudentIds.length ? "var(--blue)" : "var(--muted)" }}>
              ✓ {selectedNoteStudentIds.length} of {students.filter(s => s.is_approved).length} students selected
            </small>
          </legend>

          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center", marginBottom: "10px" }}>
            <button
              type="button"
              className="button compact"
              onClick={() => setSelectedNoteStudentIds(students.filter(s => s.is_approved).map(s => s.id))}
              style={{ fontSize: "12px", height: "30px" }}
            >
              Select All ({students.filter(s => s.is_approved).length})
            </button>
            <button
              type="button"
              className="button compact"
              onClick={() => setSelectedNoteStudentIds([])}
              style={{ fontSize: "12px", height: "30px" }}
            >
              Clear All
            </button>
            {selectedNoteCourseId && (
              <button
                type="button"
                className="button compact primary"
                onClick={() => {
                  const enrolledIds = enrollments
                    .filter((e) => e.course_id === selectedNoteCourseId)
                    .map((e) => e.student_id);
                  setSelectedNoteStudentIds((prev) => Array.from(new Set([...prev, ...enrolledIds])));
                }}
                style={{ fontSize: "12px", height: "30px" }}
              >
                Select Students Enrolled in this Course
              </button>
            )}
            <input
              type="search"
              placeholder="Search students..."
              value={noteStudentSearch}
              onChange={(e) => setNoteStudentSearch(e.target.value)}
              style={{ marginLeft: "auto", maxWidth: "200px", height: "30px", fontSize: "12px" }}
            />
          </div>

          <div style={{ maxHeight: "200px", overflowY: "auto", display: "grid", gap: "6px", paddingRight: "4px" }}>
            {students
              .filter((s) => s.is_approved)
              .filter((s) => !noteStudentSearch.trim() || `${s.full_name} ${s.email}`.toLowerCase().includes(noteStudentSearch.trim().toLowerCase()))
              .map((student) => {
                const isChecked = selectedNoteStudentIds.includes(student.id);
                const studentCourses = enrollments
                  .filter((e) => e.student_id === student.id)
                  .map((e) => coursesById[e.course_id]?.code)
                  .filter(Boolean);

                return (
                  <label
                    className="admin-option"
                    key={student.id}
                    style={{
                      cursor: "pointer",
                      background: isChecked ? "var(--blue-soft, #eef2ff)" : "#ffffff",
                      borderColor: isChecked ? "var(--blue, #4f46e5)" : "var(--line, #e2e8f0)",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedNoteStudentIds((prev) => [...prev, student.id]);
                        } else {
                          setSelectedNoteStudentIds((prev) => prev.filter((id) => id !== student.id));
                        }
                      }}
                    />
                    <span style={{ fontWeight: isChecked ? "700" : "500" }}>
                      {student.full_name || student.email}
                    </span>
                    <small>{student.email}</small>
                    {studentCourses.length > 0 && (
                      <span style={{ marginLeft: "auto", display: "flex", gap: "4px" }}>
                        {studentCourses.slice(0, 2).map((c) => (
                          <span key={c} className="badge blue" style={{ fontSize: "10px", padding: "1px 6px" }}>{c}</span>
                        ))}
                      </span>
                    )}
                  </label>
                );
              })}
            {!students.some((student) => student.is_approved) && (
              <p style={{ color: "var(--muted)", fontStyle: "italic", padding: "8px" }}>
                No approved students available. Approve students in Students tab first.
              </p>
            )}
          </div>
        </fieldset>
      )}

      <label className="form-field">
        <span>Course (optional)</span>
        <select
          name="course_id"
          defaultValue=""
          onChange={(e) => setSelectedNoteCourseId(e.target.value)}
        >
          <option value="">No course</option>
          {courses.map((course) => (
            <option key={course.id} value={course.id}>
              {course.code} · {course.name}
            </option>
          ))}
        </select>
      </label>
      {view === "Attendance" ? <>
        <label className="form-field"><span>Date</span><input name="attendance_date" type="date" required defaultValue={attendancePrefillDate || new Date().toISOString().slice(0, 10)} /></label>
        <label className="form-field"><span>Status</span><select name="status" defaultValue="present"><option value="present">Present</option><option value="late">Late</option><option value="absent">Absent</option></select></label>
        <label className="form-field"><span>Note (optional)</span><input name="note" maxLength="1000" /></label>
      </> : <>
        <label className="form-field"><span>Title</span><input name="title" required maxLength="150" placeholder="e.g. Lecture 4 Study Notes & Feedback" /></label>
        <label className="form-field"><span>Note Body / Instructions</span><textarea name="body" required rows="4" maxLength="10000" placeholder="Write private feedback or study notes for this student..." /></label>

        <div className="form-field" style={{ marginTop: "12px" }}>
          <span style={{ display: "block", marginBottom: "8px", fontWeight: "650", fontSize: "13px" }}>
            Attach PDF Notes or Google Drive Link (Optional)
          </span>
          <div className="source-toggle-tabs" style={{ marginBottom: "12px" }}>
            <button
              type="button"
              className={`source-toggle-btn ${noteAttachmentType === "none" ? "active" : ""}`}
              onClick={() => setNoteAttachmentType("none")}
            >
              No Attachment
            </button>
            <button
              type="button"
              className={`source-toggle-btn ${noteAttachmentType === "upload" ? "active" : ""}`}
              onClick={() => setNoteAttachmentType("upload")}
            >
              <Upload size={14} /> Upload PDF to Drive
            </button>
            <button
              type="button"
              className={`source-toggle-btn ${noteAttachmentType === "drive" ? "active" : ""}`}
              onClick={() => setNoteAttachmentType("drive")}
            >
              <Link2 size={14} /> Google Drive / Web Link
            </button>
          </div>

          {noteAttachmentType === "upload" && (
            <div>
              <label
                className="file-drop"
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "20px 16px",
                  textAlign: "center",
                  border: notePdfFile ? "2px solid #6366f1" : "2px dashed #cbd5e1",
                  background: notePdfFile ? "#f5f3ff" : "#f8fafc",
                  borderRadius: "12px",
                  cursor: "pointer",
                  transition: "all 0.2s ease",
                }}
              >
                <Upload size={26} style={{ color: notePdfFile ? "#6366f1" : "#94a3b8", marginBottom: "8px" }} />
                {notePdfFile ? (
                  <div>
                    <strong style={{ display: "block", color: "#1e1b4b", fontSize: "13.5px" }}>
                      ✓ {notePdfFile.name}
                    </strong>
                    <span style={{ fontSize: "12px", color: "#6366f1", marginTop: "4px", display: "inline-block" }}>
                      {(notePdfFile.size / (1024 * 1024)).toFixed(2)} MB · Click to choose a different PDF
                    </span>
                  </div>
                ) : (
                  <div>
                    <strong style={{ display: "block", color: "#334155", fontSize: "13.5px" }}>
                      Click to choose or drag &amp; drop a PDF notes file here
                    </strong>
                    <span style={{ fontSize: "12px", color: "#64748b", marginTop: "4px", display: "inline-block" }}>
                      Supports PDF documents (up to 50 MB). Automatically stored in Drive and linked to this note.
                    </span>
                  </div>
                )}
                <input
                  type="file"
                  accept=".pdf,application/pdf"
                  style={{ display: "none" }}
                  onChange={(e) => {
                    const file = e.target.files?.[0] || null;
                    setNotePdfFile(file);
                  }}
                />
              </label>
              {notePdfFile && (
                <button
                  type="button"
                  style={{
                    background: "none",
                    border: "none",
                    color: "#ef4444",
                    fontSize: "12px",
                    cursor: "pointer",
                    padding: "4px 0",
                    marginTop: "4px",
                  }}
                  onClick={() => setNotePdfFile(null)}
                >
                  Clear selected file
                </button>
              )}
            </div>
          )}

          {noteAttachmentType === "drive" && (
            <div>
              <input
                type="url"
                placeholder="https://drive.google.com/file/d/... or document URL"
                value={noteDriveLink}
                onChange={(e) => setNoteDriveLink(e.target.value)}
              />
              <small className="muted" style={{ display: "block", marginTop: "6px" }}>
                Paste any Google Drive, Google Doc, or PDF link to share it with this student.
              </small>
            </div>
          )}
        </div>
      </>}
      <div className="form-actions"><button className="button" type="button" onClick={() => setShowForm(false)}>Cancel</button><button className="button primary" disabled={busy}>{busy ? "Saving…" : view === "Attendance" ? "Save attendance" : "Save note"}</button></div>
    </form>}
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
          {filteredStudents.map((student) => <article className="card admin-assignment-card" key={student.id}><div className="panel-heading"><div className="admin-student"><span className="student-avatar">{(student.full_name || student.email).slice(0, 1).toUpperCase()}</span><span><strong>{student.full_name || "Student"}</strong><small>{student.email}</small><small>Added {new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(student.created_at))}</small><span className="student-timing-chip"><Clock3 size={12} /> Class Timing: <strong>{student.timing || "10:00 AM - 12:00 PM"}</strong></span></span></div><span className={`portal-status ${student.is_approved ? "submitted" : "pending"}`}>{student.is_approved ? "Approved" : "Pending approval"}</span></div><div className="form-actions"><button className="button" type="button" disabled={busy} onClick={() => setEditingStudent(student)}><Pencil size={13} /> Edit Profile &amp; Timing</button><button className="button" disabled={busy} onClick={() => approveStudent(student, !student.is_approved)}>{student.is_approved ? "Suspend access" : <><Check size={14} />Approve access</>}</button><button className="button" disabled={busy} type="button" onClick={() => copyInviteLink(student)} title="Copy sign-in / invite link for student"><Link2 size={14} />Copy invite link</button><button className="button danger-icon" disabled={busy} onClick={() => deleteStudent(student)}><Trash2 size={14} />Delete account</button></div></article>)}
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
    ) : (() => {
      // Group records by title + body + course_id so identical notes don't duplicate
      const groupsMap = new Map();
      records.forEach((record) => {
        const { isDrive } = parseNoteAttachment(record.body);
        const groupKey = `${record.title.trim().toLowerCase()}:::${record.course_id || ""}:::${record.body.trim()}`;
        if (!groupsMap.has(groupKey)) {
          groupsMap.set(groupKey, {
            id: record.id,
            key: groupKey,
            title: record.title,
            body: record.body,
            course_id: record.course_id,
            created_at: record.created_at,
            isDrive,
            records: [record],
            studentIds: [record.student_id],
          });
        } else {
          const g = groupsMap.get(groupKey);
          g.records.push(record);
          if (!g.studentIds.includes(record.student_id)) {
            g.studentIds.push(record.student_id);
          }
        }
      });
      const allGroups = Array.from(groupsMap.values());
      const driveGroupsCount = allGroups.filter((g) => g.isDrive).length;

      // Filter groups
      const filteredGroups = allGroups.filter((g) => {
        if (noteFilterTab === "drive" && !g.isDrive) return false;
        if (noteStudentFilter !== "all" && !g.studentIds.includes(noteStudentFilter)) return false;
        if (!query.trim()) return true;
        const term = query.trim().toLowerCase();
        const course = coursesById[g.course_id];
        return (
          g.title.toLowerCase().includes(term) ||
          g.body.toLowerCase().includes(term) ||
          course?.name?.toLowerCase().includes(term) ||
          course?.code?.toLowerCase().includes(term) ||
          g.studentIds.some((sid) => studentsById[sid]?.full_name?.toLowerCase().includes(term))
        );
      });

      return (
        <section className="admin-notes-container">
          {/* Top Filter Bar (matching user's screenshot) */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px", marginBottom: "18px" }}>
            <div className="portal-tabs" style={{ margin: 0 }}>
              <button
                type="button"
                className={`portal-tab ${noteFilterTab === "all" ? "active" : ""}`}
                onClick={() => setNoteFilterTab("all")}
              >
                <span>All Notes</span>
                <span className="portal-tab-count">{allGroups.length}</span>
              </button>
              <button
                type="button"
                className={`portal-tab ${noteFilterTab === "drive" ? "active" : ""}`}
                onClick={() => setNoteFilterTab("drive")}
              >
                <Link2 size={14} />
                <span>Drive Links</span>
                <span className="portal-tab-count">{driveGroupsCount}</span>
              </button>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", fontWeight: "600", color: "var(--muted)" }}>
                <Users size={14} /> Filter by Student:
                <select
                  value={noteStudentFilter}
                  onChange={(e) => setNoteStudentFilter(e.target.value)}
                  style={{ height: "34px", borderRadius: "8px", fontSize: "13px" }}
                >
                  <option value="all">All Students ({records.length} notes)</option>
                  {students.filter(s => s.is_approved).map((s) => {
                    const count = records.filter(r => r.student_id === s.id).length;
                    return (
                      <option key={s.id} value={s.id}>
                        {s.full_name || s.email} ({count} note{count === 1 ? "" : "s"})
                      </option>
                    );
                  })}
                </select>
              </label>

              <button
                type="button"
                className="button compact"
                style={{ height: "34px" }}
                onClick={() => setNotesViewMode((curr) => curr === "grouped" ? "individual" : "grouped")}
                title={notesViewMode === "grouped" ? "Switch to Individual Card View" : "Switch to Grouped View"}
              >
                {notesViewMode === "grouped" ? "View Individual" : "View Grouped"}
              </button>
            </div>
          </div>

          <div className="admin-work-list">
            {filteredGroups.map((group) => {
              const { text: cleanBody, attachmentUrl, attachmentName, isDrive, isPdf } = parseNoteAttachment(group.body);
              const course = coursesById[group.course_id];
              const assignedStudents = group.studentIds.map((sid) => studentsById[sid]).filter(Boolean);

              return (
                <article className="card admin-assignment-card" key={group.key}>
                  <div className="panel-heading">
                    <div className="admin-assignment-title" style={{ width: "100%" }}>
                      <span className={`portal-item-icon ${isDrive ? "drive" : "assignment"}`}>
                        {isDrive ? <Link2 size={16} /> : <GraduationCap size={16} />}
                      </span>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", flexWrap: "wrap" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                            <h2 style={{ margin: 0 }}>{group.title}</h2>
                            {course && (
                              <span className="badge blue" style={{ fontSize: "11px" }}>
                                {course.code}
                              </span>
                            )}
                            {isDrive && (
                              <span className="badge green" style={{ fontSize: "11px", display: "inline-flex", alignItems: "center", gap: "4px" }}>
                                <Link2 size={11} /> Google Drive Document
                              </span>
                            )}
                          </div>

                          <div className="heading-actions" style={{ margin: 0, display: "flex", gap: "6px", alignItems: "center" }}>
                            <button
                              className="button compact primary"
                              type="button"
                              onClick={() => setManagingAccessNote(group)}
                              title="Give access to another student using checkboxes"
                            >
                              <Users size={13} />
                              <span>Give to another student</span>
                            </button>
                            <button
                              className="button compact"
                              type="button"
                              onClick={() => setEditingRecord(group.records[0])}
                            >
                              <Pencil size={13} /> Edit
                            </button>
                            <button
                              className="quiet-icon danger-icon"
                              type="button"
                              onClick={async () => {
                                if (window.confirm(`Delete note “${group.title}”? This will remove it for all ${group.records.length} student(s).`)) {
                                  const ids = group.records.map((r) => r.id);
                                  await supabase.from("student_notes").delete().in("id", ids);
                                  onToast("Note removed.");
                                  await loadData();
                                }
                              }}
                              aria-label="Delete note"
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </div>

                        {/* Student Access Badges */}
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", marginTop: "8px" }}>
                          <span style={{ fontSize: "12.5px", fontWeight: "600", color: "var(--ink)" }}>
                            Access ({assignedStudents.length} student{assignedStudents.length === 1 ? "" : "s"}):
                          </span>
                          {assignedStudents.map((s) => (
                            <span
                              key={s.id}
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "4px",
                                background: "var(--canvas, #f1f5f9)",
                                padding: "2px 8px",
                                borderRadius: "6px",
                                fontSize: "12px",
                                color: "var(--ink-soft)",
                                border: "1px solid var(--line)",
                              }}
                            >
                              <strong>{s.full_name || s.email}</strong>
                              {course ? <small style={{ color: "var(--muted)" }}>· {course.name}</small> : null}
                            </span>
                          ))}
                        </div>

                        {cleanBody && (
                          <div style={{ marginTop: "10px", fontSize: "13.5px", lineHeight: "1.5", color: "var(--ink-soft)" }}>
                            {cleanBody}
                          </div>
                        )}

                        {attachmentUrl && (
                          <div className="note-attachment-banner">
                            <div className="note-attachment-info">
                              <span className={`note-attachment-icon ${isDrive ? "drive" : "pdf"}`}>
                                {isDrive ? <Link2 size={18} /> : <FileText size={18} />}
                              </span>
                              <div style={{ minWidth: 0, flex: 1 }}>
                                <strong className="note-attachment-title">
                                  {attachmentName || (isDrive ? "Google Drive Document Attached" : "Attached PDF Notes")}
                                </strong>
                                <span className="note-attachment-sub">
                                  {attachmentUrl.length > 60 ? attachmentUrl.slice(0, 60) + "…" : attachmentUrl}
                                </span>
                              </div>
                            </div>
                            <div className="note-attachment-actions">
                              <button
                                type="button"
                                className="button primary compact"
                                onClick={() =>
                                  setViewingAttachment({
                                    title: group.title,
                                    subtitle: `Attached Document · ${assignedStudents.map(s => s.full_name || s.email).join(", ")}`,
                                    url: attachmentUrl,
                                  })
                                }
                              >
                                <Eye size={13} />
                                <span>View Document</span>
                              </button>
                              <a
                                href={attachmentUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="button compact"
                                title="Open Drive or link in new tab"
                              >
                                <ExternalLink size={13} />
                                <span>Open Drive</span>
                              </a>
                              <button
                                type="button"
                                className="button compact"
                                onClick={() => copyNoteLink(group.id, attachmentUrl)}
                                title="Copy attachment link"
                              >
                                {copiedNoteId === group.id ? <Check size={13} color="var(--green)" /> : <Copy size={13} />}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
            {!filteredGroups.length && (
              <div className="card portal-empty">
                <GraduationCap size={22} />
                <strong>No notes found</strong>
                <span>Use the button above to add notes and assign to students with checkboxes.</span>
              </div>
            )}
          </div>
        </section>
      );
    })()}

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
        supabase={supabase}
        onClose={() => setEditingRecord(null)}
        onSave={updateRecord}
        onDelete={deleteRecord}
      />
    )}

    {viewingAttachment && (
      <SecureDocumentViewer
        title={viewingAttachment.title}
        subtitle={viewingAttachment.subtitle}
        url={viewingAttachment.url}
        userEmail={user.email}
        isSuperuser={true}
        onClose={() => setViewingAttachment(null)}
      />
    )}

    {managingAccessNote && (
      <ManageNoteAccessModal
        noteGroup={managingAccessNote}
        students={students}
        courses={courses}
        enrollments={enrollments}
        onClose={() => setManagingAccessNote(null)}
        onSave={saveManagedAccess}
        busy={busy}
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
  </div>;
}

export default AdminManagementView;
