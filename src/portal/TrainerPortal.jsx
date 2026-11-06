import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CalendarCheck,
  CalendarClock,
  Check,
  CheckCircle2,
  ClipboardList,
  Clock3,
  Copy,
  Download,
  ExternalLink,
  Eye,
  FileSpreadsheet,
  FileText,
  Filter,
  GraduationCap,
  HardDrive,
  LayoutDashboard,
  Link2,
  Lock,
  LogOut,
  Mail,
  MapPin,
  Menu,
  MessageSquare,
  Paperclip,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Send,
  Shield,
  ShieldCheck,
  Sparkles,
  Trash2,
  Unlock,
  Upload,
  Users,
  X,
} from "lucide-react";
import SecureDocumentViewer from "../components/SecureDocumentViewer";
import { extractDriveUrl, cleanNoteBody, getDriveDocTypeLabel, getDriveDownloadExportUrl } from "../lib/driveUtils.js";

const TRAINER_NAV = [
  { label: "Overview", icon: LayoutDashboard },
  { label: "Tasks", icon: CheckCircle2 },
  { label: "Syllabus", icon: BookOpen },
  { label: "Materials & Drive", icon: HardDrive },
  { label: "Attendance", icon: CalendarCheck },
  { label: "Tests", icon: ClipboardList },
  { label: "Messages", icon: MessageSquare },
  { label: "Students", icon: Users },
];

const MATERIAL_CATEGORIES = [
  "Class Notes",
  "Materials",
  "Practice Data Sets",
  "Projects",
  "Task",
  "Syllabus",
  "Study Guide",
  "Other",
];

function localDate(d = new Date()) {
  const offset = d.getTimezoneOffset();
  return new Date(d.getTime() - offset * 60_000).toISOString().slice(0, 10);
}

export default function TrainerPortal({ user, profile, supabase, onSignOut, onExitToAdmin, isAdminPreview }) {
  const [activeTab, setActiveTab] = useState("Overview");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [toast, setToast] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Core Data
  const [courses, setCourses] = useState([]);
  const [students, setStudents] = useState([]);
  const [trainerStudents, setTrainerStudents] = useState([]);
  const [trainersList, setTrainersList] = useState([]);
  const [selectedTrainerId, setSelectedTrainerId] = useState("");
  const [studentScopeFilter, setStudentScopeFilter] = useState("assigned"); // Defaults to assigned students
  const [enrollments, setEnrollments] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [materialRecipients, setMaterialRecipients] = useState([]);
  const [downloadRequests, setDownloadRequests] = useState([]);
  const [attendanceRecords, setAttendanceRecords] = useState([]);

  // Tests & Assessments State
  const [assessments, setAssessments] = useState([]);
  const [assessmentRecipients, setAssessmentRecipients] = useState([]);
  const [assessmentAttempts, setAssessmentAttempts] = useState([]);
  const [showAssignTestModal, setShowAssignTestModal] = useState(false);
  const [selectedTestToAssign, setSelectedTestToAssign] = useState(null);
  const [testTargetStudentIds, setTestTargetStudentIds] = useState([]);

  // Attendance Tab State
  const [attendanceDate, setAttendanceDate] = useState(() => localDate());
  const [attendanceCourseId, setAttendanceCourseId] = useState("all");
  const [attendanceScopeFilter, setAttendanceScopeFilter] = useState("assigned"); // "assigned" | "all"
  const [attendanceState, setAttendanceState] = useState({}); // { [studentId]: { status: 'Present'|'Late'|'Absent', note: '' } }
  const [savingAttendance, setSavingAttendance] = useState(false);

  // Tasks Tab State
  const [taskScopeFilter, setTaskScopeFilter] = useState("assigned"); // "assigned" | "all"
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [taskCourseId, setTaskCourseId] = useState("");
  const [taskCategory, setTaskCategory] = useState("Task");
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDueAt, setTaskDueAt] = useState("");
  const [taskInstructions, setTaskInstructions] = useState("");
  const [taskSelectedStudents, setTaskSelectedStudents] = useState([]);
  const [taskStudentSearch, setTaskStudentSearch] = useState("");
  const [taskStatusFilter, setTaskStatusFilter] = useState("all");
  const [taskStudentFilter, setTaskStudentFilter] = useState("all");
  const [taskCategoryFilter, setTaskCategoryFilter] = useState("all");

  // Syllabus Tab State
  const [showSyllabusModal, setShowSyllabusModal] = useState(false);
  const [syllabusCourseId, setSyllabusCourseId] = useState("");
  const [syllabusTitle, setSyllabusTitle] = useState("");
  const [syllabusDriveUrl, setSyllabusDriveUrl] = useState("");
  const [syllabusDescription, setSyllabusDescription] = useState("");
  const [syllabusFile, setSyllabusFile] = useState(null);
  const [syllabusTargetMode, setSyllabusTargetMode] = useState("course"); // "course" | "assigned" | "custom"
  const [syllabusSelectedStudents, setSyllabusSelectedStudents] = useState([]);

  // Materials & Drive Tab State
  const [showMaterialModal, setShowMaterialModal] = useState(false);
  const [matSource, setMatSource] = useState("upload"); // 'upload' | 'drive'
  const [matTitle, setMatTitle] = useState("");
  const [matDescription, setMatDescription] = useState("");
  const [matCategory, setMatCategory] = useState("Class Notes");
  const [matCourseId, setMatCourseId] = useState("");
  const [matDriveUrl, setMatDriveUrl] = useState("");
  const [matFile, setMatFile] = useState(null);
  const [matSelectedStudentIds, setMatSelectedStudentIds] = useState([]);
  const [materialActiveSubTab, setMaterialActiveSubTab] = useState("files"); // 'files' | 'requests'
  const [selectedMaterialCategoryFilter, setSelectedMaterialCategoryFilter] = useState("all");

  // Student Detail Modal
  const [selectedStudentDetail, setSelectedStudentDetail] = useState(null);
  const [enrollingCourseId, setEnrollingCourseId] = useState("");
  const [enrollBusy, setEnrollBusy] = useState(false);

  // Messages Tab State
  const [conversations, setConversations] = useState([]);
  const [selectedConversationId, setSelectedConversationId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [chatMessageText, setChatMessageText] = useState("");
  const [sendingMessage, setSendingMessage] = useState(false);
  const [newMsgStudentId, setNewMsgStudentId] = useState("");
  const [newMsgSubject, setNewMsgSubject] = useState("");
  const [showNewMsgModal, setShowNewMsgModal] = useState(false);
  const chatScrollRef = useRef(null);

  // Secure Viewer
  const [viewingDoc, setViewingDoc] = useState(null);

  // 1. Initial Data Fetch
  const loadTrainerData = useCallback(async (showSpinner = false) => {
    if (showSpinner) setLoading(true);
    setError("");

    try {
      const [
        coursesRes,
        studentsRes,
        trainerStudentsRes,
        trainersRes,
        enrollmentsRes,
        tasksRes,
        materialsRes,
        requestsRes,
        attendanceRes,
        convsRes,
        assessmentsRes,
        assessmentRecipientsRes,
        materialRecipientsRes,
        assessmentAttemptsRes,
      ] = await Promise.all([
        supabase.from("courses").select("*").order("created_at", { ascending: false }).then((r) => r.error ? { data: [] } : r),
        supabase.from("profiles").select("*").eq("role", "student").eq("is_approved", true).order("full_name", { ascending: true }).then((r) => r.error ? { data: [] } : r),
        supabase.from("trainer_students").select("trainer_id, student_id").then((r) => r.error ? { data: [] } : r),
        supabase.from("profiles").select("id, email, full_name, timing").eq("role", "trainer").order("full_name", { ascending: true }).then((r) => r.error ? { data: [] } : r),
        supabase.from("course_enrollments").select("course_id, student_id").then((r) => r.error ? { data: [] } : r),
        supabase.from("student_notes").select("*").order("created_at", { ascending: false }).then((r) => r.error ? { data: [] } : r),
        supabase.from("course_materials").select("*").order("created_at", { ascending: false }).then((r) => r.error ? { data: [] } : r),
        supabase.from("download_requests").select("*").order("requested_at", { ascending: false }).then((r) => r.error ? { data: [] } : r),
        supabase.from("attendance_records").select("*").order("attendance_date", { ascending: false }).then((r) => r.error ? { data: [] } : r),
        supabase.from("conversations").select("*").order("created_at", { ascending: false }).then((r) => r.error ? { data: [] } : r),
        supabase.from("assessments").select("*").order("created_at", { ascending: false }).then((r) => r.error ? { data: [] } : r),
        supabase.from("assessment_recipients").select("assessment_id, student_id").then((r) => r.error ? { data: [] } : r),
        supabase.from("material_recipients").select("material_id, student_id").then((r) => r.error ? { data: [] } : r),
        supabase.from("assessment_attempts").select("id, assessment_id, student_id, score, max_score, submitted_at").then((r) => r.error ? { data: [] } : r),
      ]);

      if (coursesRes.error) console.warn("TrainerPortal courses query warning:", coursesRes.error);
      setCourses(coursesRes.data || []);
      setStudents(studentsRes.data || []);
      setTrainerStudents(trainerStudentsRes.data || []);
      const loadedTrainers = trainersRes.data || [];
      setTrainersList(loadedTrainers);
      if (loadedTrainers.length > 0) {
        setSelectedTrainerId((prev) => prev || loadedTrainers[0].id);
      }
      setEnrollments(enrollmentsRes.data || []);
      setTasks(tasksRes.data || []);
      setMaterials(materialsRes.data || []);
      setDownloadRequests(requestsRes.data || []);
      setAttendanceRecords(attendanceRes.data || []);
      setConversations(convsRes.data || []);
      setAssessments(assessmentsRes.data || []);
      setAssessmentRecipients(assessmentRecipientsRes.data || []);
      setMaterialRecipients(materialRecipientsRes.data || []);
      setAssessmentAttempts(assessmentAttemptsRes.data || []);
    } catch (err) {
      console.error("TrainerPortal load error:", err);
      setError(err.message || "Failed to load trainer records.");
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    loadTrainerData(true);
  }, [loadTrainerData]);

  // Debounced quiet reload to eliminate UI stutter and prevent server load spikes
  const debounceTrainerTimerRef = useRef(null);
  const debouncedTrainerReload = useCallback(() => {
    if (debounceTrainerTimerRef.current) clearTimeout(debounceTrainerTimerRef.current);
    debounceTrainerTimerRef.current = setTimeout(() => {
      loadTrainerData(false);
    }, 120);
  }, [loadTrainerData]);

  // Real-time updates with instantaneous debounced syncing
  useEffect(() => {
    if (!supabase) return;
    const channel = supabase
      .channel("trainer-portal-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "attendance_records" }, debouncedTrainerReload)
      .on("postgres_changes", { event: "*", schema: "public", table: "student_notes" }, debouncedTrainerReload)
      .on("postgres_changes", { event: "*", schema: "public", table: "course_materials" }, debouncedTrainerReload)
      .on("postgres_changes", { event: "*", schema: "public", table: "material_recipients" }, debouncedTrainerReload)
      .on("postgres_changes", { event: "*", schema: "public", table: "assessments" }, debouncedTrainerReload)
      .on("postgres_changes", { event: "*", schema: "public", table: "assessment_recipients" }, debouncedTrainerReload)
      .on("postgres_changes", { event: "*", schema: "public", table: "assessment_attempts" }, debouncedTrainerReload)
      .on("postgres_changes", { event: "*", schema: "public", table: "trainer_students" }, debouncedTrainerReload)
      .on("postgres_changes", { event: "*", schema: "public", table: "course_enrollments" }, debouncedTrainerReload)
      .on("postgres_changes", { event: "*", schema: "public", table: "courses" }, debouncedTrainerReload)
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, debouncedTrainerReload)
      .on("postgres_changes", { event: "*", schema: "public", table: "download_requests" }, debouncedTrainerReload)
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, debouncedTrainerReload)
      .subscribe();

    return () => {
      if (debounceTrainerTimerRef.current) clearTimeout(debounceTrainerTimerRef.current);
      supabase.removeChannel(channel);
    };
  }, [supabase, debouncedTrainerReload]);

  // Trainer 1-click enroll & unenroll handlers with instant optimistic UI update
  async function handleTrainerEnrollCourse(studentId, courseId) {
    if (!studentId || !courseId) return;
    setEnrollBusy(true);
    // Optimistic update
    setEnrollments((prev) => [...prev, { course_id: courseId, student_id: studentId }]);
    const { error: enrollErr } = await supabase.from("course_enrollments").insert({
      course_id: courseId,
      student_id: studentId,
    });
    if (enrollErr) {
      console.error("Trainer enroll error:", enrollErr);
      setToast("Could not enroll student: " + enrollErr.message);
      setEnrollments((prev) => prev.filter((e) => !(e.course_id === courseId && e.student_id === studentId)));
    } else {
      setToast("Student enrolled in course!");
      setEnrollingCourseId("");
    }
    setEnrollBusy(false);
  }

  async function handleTrainerUnenrollCourse(studentId, courseId) {
    if (!studentId || !courseId) return;
    setEnrollBusy(true);
    const removed = enrollments.find((e) => e.course_id === courseId && e.student_id === studentId);
    // Optimistic update
    setEnrollments((prev) => prev.filter((e) => !(e.course_id === courseId && e.student_id === studentId)));
    const { error: unenrollErr } = await supabase
      .from("course_enrollments")
      .delete()
      .eq("course_id", courseId)
      .eq("student_id", studentId);
    if (unenrollErr) {
      console.error("Trainer unenroll error:", unenrollErr);
      setToast("Could not remove enrollment: " + unenrollErr.message);
      if (removed) setEnrollments((prev) => [...prev, removed]);
    } else {
      setToast("Course removed from student.");
    }
    setEnrollBusy(false);
  }

  const activeTrainerId = isAdminPreview ? (selectedTrainerId || trainersList[0]?.id || user?.id) : user?.id;

  const myAssignedStudentIds = useMemo(() => {
    const ids = new Set();
    const targetId = isAdminPreview ? (selectedTrainerId || trainersList[0]?.id || user?.id) : user?.id;
    for (const ts of trainerStudents) {
      if (ts.trainer_id === targetId) ids.add(ts.student_id);
    }
    for (const s of students) {
      if (s.trainer_id === targetId) ids.add(s.id);
    }
    return ids;
  }, [trainerStudents, students, user?.id, isAdminPreview, selectedTrainerId, trainersList]);

  // Load chat messages when a conversation is selected
  useEffect(() => {
    if (!selectedConversationId || !supabase) return;
    let active = true;

    async function fetchMessages() {
      const { data, error: msgError } = await supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", selectedConversationId)
        .order("created_at", { ascending: true });

      if (active && !msgError) {
        setMessages(data || []);
        // Auto scroll
        setTimeout(() => {
          if (chatScrollRef.current) {
            chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
          }
        }, 80);
      }
    }

    fetchMessages();

    const msgChannel = supabase
      .channel(`chat-conversation-${selectedConversationId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${selectedConversationId}` },
        (payload) => {
          setMessages((prev) => [...prev, payload.new]);
          setTimeout(() => {
            if (chatScrollRef.current) {
              chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
            }
          }, 80);
        }
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(msgChannel);
    };
  }, [selectedConversationId, supabase]);

  // Quick Mappings
  const coursesById = useMemo(() => Object.fromEntries(courses.map((c) => [c.id, c])), [courses]);
  const studentsById = useMemo(() => Object.fromEntries(students.map((s) => [s.id, s])), [students]);

  const myAssignedStudents = useMemo(() => {
    return students.filter((s) => myAssignedStudentIds.has(s.id));
  }, [students, myAssignedStudentIds]);

  // Filtered Students for Attendance (strictly trainer's assigned students)
  const attendanceStudents = useMemo(() => {
    let pool = myAssignedStudents;
    if (attendanceCourseId !== "all") {
      const enrolledIds = new Set(enrollments.filter((e) => e.course_id === attendanceCourseId).map((e) => e.student_id));
      pool = pool.filter((s) => enrolledIds.has(s.id));
    }
    return pool;
  }, [myAssignedStudents, attendanceCourseId, enrollments]);

  // Sync attendance state when date or course changes
  useEffect(() => {
    const existing = attendanceRecords.filter((r) => r.attendance_date === attendanceDate);
    const stateMap = {};
    existing.forEach((r) => {
      stateMap[r.student_id] = { status: r.status, note: r.note || "" };
    });
    setAttendanceState(stateMap);
  }, [attendanceDate, attendanceRecords]);

  // ----------------------------------------------------
  // Actions: Attendance
  // ----------------------------------------------------
  function setStudentAttendance(studentId, status) {
    setAttendanceState((prev) => ({
      ...prev,
      [studentId]: {
        ...(prev[studentId] || {}),
        status,
      },
    }));
  }

  function markAllAttendance(status) {
    const nextState = { ...attendanceState };
    attendanceStudents.forEach((s) => {
      nextState[s.id] = {
        ...(nextState[s.id] || {}),
        status,
      };
    });
    setAttendanceState(nextState);
  }

  async function handleSaveAttendance() {
    setSavingAttendance(true);
    setError("");

    try {
      const recordsToUpsert = [];
      attendanceStudents.forEach((student) => {
        const entry = attendanceState[student.id];
        if (entry && entry.status) {
          recordsToUpsert.push({
            student_id: student.id,
            course_id: attendanceCourseId === "all" ? null : attendanceCourseId,
            attendance_date: attendanceDate,
            status: entry.status,
            note: entry.note || null,
          });
        }
      });

      if (recordsToUpsert.length === 0) {
        setToast("No attendance marks to save.");
        setSavingAttendance(false);
        return;
      }

      // Optimistic local update for instantaneous zero-latency feedback
      const studentIdSet = new Set(recordsToUpsert.map((r) => r.student_id));
      setAttendanceRecords((prev) => {
        const remaining = prev.filter(
          (r) => !(r.attendance_date === attendanceDate && studentIdSet.has(r.student_id))
        );
        return [
          ...recordsToUpsert.map((r, i) => ({ id: `temp-${Date.now()}-${i}`, ...r })),
          ...remaining,
        ];
      });

      // Lightning-fast batch delete + batch insert in just 2 quick calls
      const studentIds = recordsToUpsert.map((r) => r.student_id);
      await supabase
        .from("attendance_records")
        .delete()
        .in("student_id", studentIds)
        .eq("attendance_date", attendanceDate);

      const { error: insertErr } = await supabase
        .from("attendance_records")
        .insert(recordsToUpsert);

      if (insertErr) throw insertErr;

      setToast(`Attendance saved successfully for ${recordsToUpsert.length} student(s)!`);
      loadTrainerData(false);
    } catch (err) {
      console.error(err);
      setError("Failed to save attendance: " + err.message);
    } finally {
      setSavingAttendance(false);
    }
  }

  // ----------------------------------------------------
  // Actions: Tasks
  // ----------------------------------------------------
  async function handleCreateTask(e) {
    e.preventDefault();
    if (!taskTitle.trim()) {
      setError("Task title is required.");
      return;
    }
    if (taskSelectedStudents.length === 0) {
      setError("Select at least one student to assign this task.");
      return;
    }

    setBusy(true);
    setError("");

    try {
      const dueIso = taskDueAt ? new Date(taskDueAt).toISOString() : null;
      const payloads = taskSelectedStudents.map((sid) => ({
        student_id: sid,
        course_id: taskCourseId || null,
        title: taskTitle.trim(),
        body: taskInstructions.trim() || "Complete the assigned task.",
        status: "assigned",
        category: taskCategory || "Task",
        due_at: dueIso,
        created_by: user.id,
      }));

      // Optimistic update
      const tempTasks = payloads.map((p, idx) => ({
        id: `temp-task-${Date.now()}-${idx}`,
        ...p,
        created_at: new Date().toISOString(),
      }));
      setTasks((prev) => [...tempTasks, ...prev]);

      let { data: insertedData, error: insertErr } = await supabase
        .from("student_notes")
        .insert(payloads)
        .select();

      if (insertErr) {
        // Fallback for older database schemas
        const fallback = taskSelectedStudents.map((sid) => ({
          student_id: sid,
          course_id: taskCourseId || null,
          title: taskTitle.trim(),
          body: taskInstructions.trim() || "Complete the assigned task.",
          created_by: user.id,
        }));
        const retry = await supabase.from("student_notes").insert(fallback).select();
        insertErr = retry.error;
        insertedData = retry.data;
      }

      if (insertErr) throw insertErr;

      if (insertedData) {
        setTasks((prev) => [
          ...insertedData,
          ...prev.filter((t) => !String(t.id).startsWith("temp-task-")),
        ]);
      }

      const targetName = taskSelectedStudents.length === 1 
        ? (studentsById[taskSelectedStudents[0]]?.full_name || "student") 
        : `${taskSelectedStudents.length} students`;
      setToast(`Note / task successfully assigned separately to ${targetName}!`);
      setShowTaskForm(false);
      setTaskTitle("");
      setTaskInstructions("");
      setTaskDueAt("");
      setTaskSelectedStudents([]);
      loadTrainerData(false);
    } catch (err) {
      setError(err.message || "Failed to assign task.");
    } finally {
      setBusy(false);
    }
  }

  async function handleToggleTaskStatus(task) {
    const nextStatus = task.status === "completed" ? "assigned" : "completed";
    try {
      await supabase.from("student_notes").update({ status: nextStatus }).eq("id", task.id);
      setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, status: nextStatus } : t)));
      setToast(nextStatus === "completed" ? "Task marked as completed!" : "Task marked as assigned.");
    } catch (err) {
      setError("Could not update task status: " + err.message);
    }
  }

  async function handleDeleteTask(taskId) {
    if (!window.confirm("Delete this assigned task?")) return;
    try {
      await supabase.from("student_notes").delete().eq("id", taskId);
      setTasks((prev) => prev.filter((t) => t.id !== taskId));
      setToast("Task removed.");
    } catch (err) {
      setError(err.message);
    }
  }

  // ----------------------------------------------------
  // Actions: Syllabus Upload / Share
  // ----------------------------------------------------
  async function handleSaveSyllabus(e) {
    e.preventDefault();
    if (!syllabusTitle.trim()) {
      setError("Syllabus title is required.");
      return;
    }
    setBusy(true);
    setError("");

    try {
      let uploadedFilePath = null;
      let originalFileName = null;
      let fileSize = 0;

      if (syllabusFile) {
        const safeName = syllabusFile.name.replace(/[^a-zA-Z0-9.-]/g, "_");
        const uniquePath = `syllabus_${Date.now()}_${safeName}`;

        const { error: uploadError } = await supabase.storage
          .from("course-materials")
          .upload(uniquePath, syllabusFile);

        if (uploadError) throw uploadError;
        uploadedFilePath = uniquePath;
        originalFileName = syllabusFile.name;
        fileSize = syllabusFile.size;
      }

      const { data: insertedMat, error: insertError } = await supabase.from("course_materials").insert({
        title: syllabusTitle.trim(),
        description: syllabusDescription.trim(),
        category: "Syllabus",
        course_id: syllabusCourseId || null,
        file_path: uploadedFilePath,
        file_name: originalFileName,
        file_size: fileSize,
        file_type: syllabusFile?.type || "application/pdf",
        drive_url: syllabusDriveUrl.trim() || null,
        created_by: user.id,
      }).select().single();

      if (insertError) throw insertError;

      // Determine recipient students based on target mode
      let targetStudentIds = [];
      if (syllabusTargetMode === "course" && syllabusCourseId) {
        targetStudentIds = enrollments.filter((e) => e.course_id === syllabusCourseId).map((e) => e.student_id);
      } else if (syllabusTargetMode === "assigned") {
        targetStudentIds = Array.from(myAssignedStudentIds);
      } else if (syllabusTargetMode === "custom") {
        targetStudentIds = syllabusSelectedStudents;
      } else {
        if (syllabusCourseId) {
          targetStudentIds = enrollments.filter((e) => e.course_id === syllabusCourseId).map((e) => e.student_id);
        } else {
          targetStudentIds = Array.from(myAssignedStudentIds);
        }
      }

      if (targetStudentIds.length === 0 && myAssignedStudentIds.size > 0) {
        targetStudentIds = Array.from(myAssignedStudentIds);
      }

      if (insertedMat && targetStudentIds.length > 0) {
        const perms = targetStudentIds.map((sid) => ({ material_id: insertedMat.id, student_id: sid }));
        await supabase.from("material_recipients").insert(perms);
        setMaterialRecipients((prev) => [...prev, ...perms]);
      }

      // Optimistic local state update
      if (insertedMat) {
        setMaterials((prev) => [insertedMat, ...prev]);
      }

      setToast(`Syllabus added and shared with ${targetStudentIds.length} student(s)!`);
      setShowSyllabusModal(false);
      setSyllabusTitle("");
      setSyllabusDescription("");
      setSyllabusDriveUrl("");
      setSyllabusFile(null);
      setSyllabusSelectedStudents([]);
      loadTrainerData(false);
    } catch (err) {
      setError("Failed to save syllabus: " + err.message);
    } finally {
      setBusy(false);
    }
  }

  // ----------------------------------------------------
  // Actions: Tests & Assessments
  // ----------------------------------------------------
  async function handleAssignTest(assessmentId, targetStudentIds) {
    if (!targetStudentIds || targetStudentIds.length === 0) {
      setError("Please select at least one student to assign the test to.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const records = targetStudentIds.map((sid) => ({ assessment_id: assessmentId, student_id: sid }));

      // Optimistic update
      setAssessmentRecipients((prev) => {
        const existingSet = new Set(prev.map((r) => `${r.assessment_id}:${r.student_id}`));
        const toAdd = records.filter((r) => !existingSet.has(`${r.assessment_id}:${r.student_id}`));
        return [...prev, ...toAdd];
      });

      for (const rec of records) {
        await supabase.from("assessment_recipients").insert(rec).then(() => {});
      }

      setToast(`Test successfully assigned to ${targetStudentIds.length} student(s)!`);
      setShowAssignTestModal(false);
      setSelectedTestToAssign(null);
      setTestTargetStudentIds([]);
      loadTrainerData(false);
    } catch (err) {
      setError("Failed to assign test: " + err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleRevokeTest(assessmentId, studentId) {
    try {
      setAssessmentRecipients((prev) =>
        prev.filter((r) => !(r.assessment_id === assessmentId && r.student_id === studentId))
      );
      await supabase
        .from("assessment_recipients")
        .delete()
        .eq("assessment_id", assessmentId)
        .eq("student_id", studentId);
      setToast("Test assignment revoked.");
      loadTrainerData(false);
    } catch (err) {
      setError("Could not revoke test: " + err.message);
    }
  }

  // ----------------------------------------------------
  // Actions: Materials & Drive
  // ----------------------------------------------------
  async function handleUploadMaterial(e) {
    e.preventDefault();
    if (!matTitle.trim()) {
      setError("Material title is required.");
      return;
    }
    setBusy(true);
    setError("");

    try {
      let uploadedFilePath = null;
      let originalFileName = null;
      let fileSize = 0;

      if (matSource === "upload") {
        if (!matFile) {
          setError("Please select a file to upload.");
          setBusy(false);
          return;
        }
        const safeName = matFile.name.replace(/[^a-zA-Z0-9.-]/g, "_");
        const uniquePath = `mat_${Date.now()}_${safeName}`;

        const { error: uploadError } = await supabase.storage
          .from("course-materials")
          .upload(uniquePath, matFile);

        if (uploadError) throw uploadError;
        uploadedFilePath = uniquePath;
        originalFileName = matFile.name;
        fileSize = matFile.size;
      } else {
        if (!matDriveUrl.trim()) {
          setError("Please enter a valid Google Drive link.");
          setBusy(false);
          return;
        }
      }

      const { data: insertedMat, error: insertError } = await supabase.from("course_materials").insert({
        title: matTitle.trim(),
        description: matDescription.trim(),
        category: matCategory,
        course_id: matCourseId || null,
        file_path: uploadedFilePath,
        file_name: originalFileName,
        file_size: fileSize,
        file_type: matFile?.type || "application/pdf",
        drive_url: matDriveUrl.trim() || null,
        created_by: user.id,
      }).select().single();

      if (insertError) throw insertError;

      // Assign to selected students if any
      if (insertedMat && matSelectedStudentIds.length > 0) {
        const perms = matSelectedStudentIds.map((sid) => ({ material_id: insertedMat.id, student_id: sid }));
        await supabase.from("material_recipients").insert(perms);
      }

      setToast(`Material "${matTitle}" added and assigned!`);
      setShowMaterialModal(false);
      setMatTitle("");
      setMatDescription("");
      setMatCategory("Class Notes");
      setMatDriveUrl("");
      setMatFile(null);
      setMatSelectedStudentIds([]);
      await loadTrainerData(false);
    } catch (err) {
      setError(err.message || "Failed to add material.");
    } finally {
      setBusy(false);
    }
  }

  async function handleReviewDownloadRequest(requestId, status, studentName) {
    try {
      await supabase
        .from("download_requests")
        .update({
          status,
          reviewed_at: new Date().toISOString(),
          reviewed_by: user.id,
        })
        .eq("id", requestId);

      setToast(status === "approved" ? `Download approved for ${studentName}!` : `Request declined for ${studentName}.`);
      await loadTrainerData(false);
    } catch (err) {
      setError("Failed to update request: " + err.message);
    }
  }

  // ----------------------------------------------------
  // Actions: Messages
  // ----------------------------------------------------
  async function handleSendMessage(e) {
    e.preventDefault();
    if (!chatMessageText.trim() || !selectedConversationId) return;

    setSendingMessage(true);
    try {
      const { error: sendError } = await supabase.from("messages").insert({
        conversation_id: selectedConversationId,
        sender_id: user.id,
        body: chatMessageText.trim(),
      });

      if (sendError) throw sendError;
      setChatMessageText("");
    } catch (err) {
      setError("Failed to send message: " + err.message);
    } finally {
      setSendingMessage(false);
    }
  }

  async function handleStartNewConversation(e) {
    e.preventDefault();
    if (!newMsgStudentId || !newMsgSubject.trim()) {
      setError("Please select a student and enter a subject.");
      return;
    }

    setBusy(true);
    try {
      const { data: conv, error: convErr } = await supabase
        .from("conversations")
        .insert({
          student_id: newMsgStudentId,
          subject: newMsgSubject.trim(),
        })
        .select()
        .single();

      if (convErr) throw convErr;

      setConversations((prev) => [conv, ...prev]);
      setSelectedConversationId(conv.id);
      setShowNewMsgModal(false);
      setNewMsgSubject("");
      setNewMsgStudentId("");
      setActiveTab("Messages");
      setToast("Conversation thread started.");
    } catch (err) {
      setError("Failed to create conversation: " + err.message);
    } finally {
      setBusy(false);
    }
  }

  // ----------------------------------------------------
  // Render Tabs
  // ----------------------------------------------------

  function renderOverview() {
    const todayStr = localDate();
    const todayAttendanceCount = attendanceRecords.filter((r) => r.attendance_date === todayStr).length;
    const pendingRequestsCount = downloadRequests.filter((r) => r.status === "pending").length;

    return (
      <div className="trainer-overview-view">
        {/* Welcome Banner */}
        <section
          className="card"
          style={{
            background: "linear-gradient(135deg, #1e1b4b 0%, #312e81 50%, #4338ca 100%)",
            color: "#ffffff",
            padding: "24px 28px",
            borderRadius: "14px",
            marginBottom: "24px",
            boxShadow: "0 10px 25px -5px rgba(49, 46, 129, 0.25)",
          }}
        >
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "16px" }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "#a5b4fc", fontSize: "13px", fontWeight: 600, marginBottom: "6px" }}>
                <Sparkles size={16} /> LearnForge Trainer Workspace
              </div>
              <h1 style={{ fontSize: "24px", fontWeight: 800, margin: "0 0 6px", color: "#ffffff" }}>
                Welcome back, {profile?.full_name || "Trainer"}!
              </h1>
              <p style={{ margin: 0, color: "#c7d2fe", fontSize: "14px", maxWidth: "600px" }}>
                Manage attendance check-ins, assign tasks, distribute course syllabus and practice sets, and communicate with students seamlessly.
              </p>
            </div>

            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              <button
                className="button primary"
                style={{ background: "#ffffff", color: "#312e81", fontWeight: 700 }}
                type="button"
                onClick={() => setActiveTab("Attendance")}
              >
                <CalendarCheck size={15} /> Take Attendance
              </button>
              <button
                className="button"
                style={{ background: "rgba(255, 255, 255, 0.15)", color: "#ffffff", border: "1px solid rgba(255, 255, 255, 0.25)" }}
                type="button"
                onClick={() => {
                  setShowTaskForm(true);
                  setActiveTab("Tasks");
                }}
              >
                <Plus size={15} /> Assign Task
              </button>
            </div>
          </div>
        </section>

        {/* Metric Cards */}
        <section className="metrics student-metrics" style={{ marginBottom: "24px" }}>
          <article className="card metric-card">
            <div className="metric-top">
              <span>Courses Taught</span>
              <span className="metric-icon blue"><BookOpen size={17} /></span>
            </div>
            <strong>{courses.length}</strong>
            <small>Active curriculums</small>
          </article>

          <article className="card metric-card" style={{ cursor: "pointer" }} onClick={() => { setActiveTab("Students"); }}>
            <div className="metric-top">
              <span>My Assigned Students</span>
              <span className="metric-icon green"><Users size={17} /></span>
            </div>
            <strong>{myAssignedStudents.length}</strong>
            <small>{myAssignedStudents.length === 1 ? "1 active assigned student" : `${myAssignedStudents.length} active assigned students`}</small>
          </article>

          <article className="card metric-card">
            <div className="metric-top">
              <span>Assigned Tasks</span>
              <span className="metric-icon amber"><CheckCircle2 size={17} /></span>
            </div>
            <strong>{tasks.length}</strong>
            <small>{tasks.filter((t) => t.status === "completed").length} completed</small>
          </article>

          <article className="card metric-card">
            <div className="metric-top">
              <span>Today's Attendance</span>
              <span className="metric-icon purple"><CalendarClock size={17} /></span>
            </div>
            <strong>{todayAttendanceCount}</strong>
            <small>Check-ins for {todayStr}</small>
          </article>

          <article className="card metric-card">
            <div className="metric-top">
              <span>Download Requests</span>
              <span className="metric-icon rose"><Download size={17} /></span>
            </div>
            <strong>{pendingRequestsCount}</strong>
            <small>{pendingRequestsCount > 0 ? "Awaiting review" : "All reviewed"}</small>
          </article>
        </section>

        {/* Courses & Today's Schedule Grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "20px" }}>
          <article className="card panel">
            <div className="panel-heading">
              <div>
                <h2>Active Courses &amp; Subjects</h2>
                <p>Curriculums and student enrollment counts</p>
              </div>
              <button className="button compact" type="button" onClick={() => setActiveTab("Syllabus")}>
                View Syllabi
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {courses.slice(0, 5).map((course) => {
                const enrolledCount = enrollments.filter((e) => e.course_id === course.id).length;
                return (
                  <div
                    key={course.id}
                    style={{
                      padding: "12px 14px",
                      background: "#f8fafc",
                      borderRadius: "8px",
                      border: "1px solid var(--line)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                    }}
                  >
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <span className="course-code-badge" style={{ fontSize: "11px" }}>{course.code}</span>
                        <strong style={{ fontSize: "14px", color: "var(--ink)" }}>{course.name}</strong>
                      </div>
                      <small style={{ color: "var(--muted)", display: "block", marginTop: "3px" }}>
                        {course.schedule || "Regular schedule"} · Room {course.room || "TBD"}
                      </small>
                    </div>
                    <span className="badge blue">{enrolledCount} Students</span>
                  </div>
                );
              })}
              {!courses.length && <div className="portal-empty compact"><span>No courses assigned yet.</span></div>}
            </div>
          </article>

          <article className="card panel">
            <div className="panel-heading">
              <div>
                <h2>Quick Trainer Actions</h2>
                <p>Common actions at a single tap</p>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              <button
                className="card"
                type="button"
                onClick={() => setActiveTab("Attendance")}
                style={{
                  padding: "16px",
                  textAlign: "left",
                  cursor: "pointer",
                  border: "1px solid var(--line)",
                  transition: "all 0.15s ease",
                  display: "flex",
                  flexDirection: "column",
                  gap: "8px",
                }}
              >
                <div style={{ width: "36px", height: "36px", borderRadius: "8px", background: "#eef2ff", color: "#4f46e5", display: "grid", placeItems: "center" }}>
                  <CalendarCheck size={18} />
                </div>
                <strong style={{ fontSize: "14px", color: "var(--ink)" }}>Take Attendance</strong>
                <span style={{ fontSize: "12px", color: "var(--muted)" }}>Mark Present, Late, or Absent for today.</span>
              </button>

              <button
                className="card"
                type="button"
                onClick={() => {
                  setShowTaskForm(true);
                  setActiveTab("Tasks");
                }}
                style={{
                  padding: "16px",
                  textAlign: "left",
                  cursor: "pointer",
                  border: "1px solid var(--line)",
                  transition: "all 0.15s ease",
                  display: "flex",
                  flexDirection: "column",
                  gap: "8px",
                }}
              >
                <div style={{ width: "36px", height: "36px", borderRadius: "8px", background: "#f0fdf4", color: "#16a34a", display: "grid", placeItems: "center" }}>
                  <CheckCircle2 size={18} />
                </div>
                <strong style={{ fontSize: "14px", color: "var(--ink)" }}>Assign Task</strong>
                <span style={{ fontSize: "12px", color: "var(--muted)" }}>Give exercises or project tasks to students.</span>
              </button>

              <button
                className="card"
                type="button"
                onClick={() => {
                  setShowSyllabusModal(true);
                  setActiveTab("Syllabus");
                }}
                style={{
                  padding: "16px",
                  textAlign: "left",
                  cursor: "pointer",
                  border: "1px solid var(--line)",
                  transition: "all 0.15s ease",
                  display: "flex",
                  flexDirection: "column",
                  gap: "8px",
                }}
              >
                <div style={{ width: "36px", height: "36px", borderRadius: "8px", background: "#fffbeb", color: "#d97706", display: "grid", placeItems: "center" }}>
                  <BookOpen size={18} />
                </div>
                <strong style={{ fontSize: "14px", color: "var(--ink)" }}>Upload Syllabus</strong>
                <span style={{ fontSize: "12px", color: "var(--muted)" }}>Distribute curriculum and learning outlines.</span>
              </button>

              <button
                className="card"
                type="button"
                onClick={() => {
                  setShowNewMsgModal(true);
                  setActiveTab("Messages");
                }}
                style={{
                  padding: "16px",
                  textAlign: "left",
                  cursor: "pointer",
                  border: "1px solid var(--line)",
                  transition: "all 0.15s ease",
                  display: "flex",
                  flexDirection: "column",
                  gap: "8px",
                }}
              >
                <div style={{ width: "36px", height: "36px", borderRadius: "8px", background: "#fdf2f8", color: "#db2777", display: "grid", placeItems: "center" }}>
                  <MessageSquare size={18} />
                </div>
                <strong style={{ fontSize: "14px", color: "var(--ink)" }}>Message Student</strong>
                <span style={{ fontSize: "12px", color: "var(--muted)" }}>Direct communication with any student.</span>
              </button>
            </div>
          </article>
        </div>

        {/* My Assigned Students Section with Enrolled Courses */}
        <section className="card panel" style={{ marginTop: "24px" }}>
          <div className="panel-heading">
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <h2>My Assigned Students</h2>
                <span className="badge green" style={{ fontWeight: 700 }}>
                  {myAssignedStudents.length} Active
                </span>
              </div>
              <p>Students specifically assigned to your mentorship and training programs with live course enrollments.</p>
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
              <button
                className="button compact"
                type="button"
                onClick={() => {
                  setStudentScopeFilter("assigned");
                  setActiveTab("Students");
                }}
              >
                <Users size={14} /> Full Student Directory
              </button>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "14px" }}>
            {myAssignedStudents.map((student) => {
              const studentCourses = enrollments
                .filter((e) => e.student_id === student.id)
                .map((e) => coursesById[e.course_id] || { id: e.course_id, code: "COURSE", name: "Enrolled Course" });

              const todayAtt = attendanceRecords.find(
                (r) => r.student_id === student.id && r.attendance_date === todayStr
              );

              return (
                <div
                  key={student.id}
                  className="card"
                  style={{
                    padding: "16px",
                    background: "#ffffff",
                    border: "1px solid var(--line)",
                    borderRadius: "10px",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                    gap: "12px",
                  }}
                >
                  <div>
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "10px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        <span
                          className="student-avatar"
                          style={{ width: "36px", height: "36px", background: "#16a34a", color: "#fff", fontSize: "14px", fontWeight: 700 }}
                        >
                          {(student.full_name || student.email || "S").slice(0, 1).toUpperCase()}
                        </span>
                        <div>
                          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                            <strong style={{ fontSize: "14px", color: "var(--ink)" }}>{student.full_name || "Student"}</strong>
                            <span className="badge green" style={{ fontSize: "10px", padding: "1px 5px" }}>Assigned</span>
                          </div>
                          <small style={{ color: "var(--muted)", fontSize: "12px" }}>{student.email}</small>
                        </div>
                      </div>

                      {todayAtt ? (
                        <span
                          className={`badge ${todayAtt.status === "Present" ? "green" : todayAtt.status === "Late" ? "amber" : "rose"}`}
                          style={{ fontSize: "11px", fontWeight: 700 }}
                        >
                          Today: {todayAtt.status}
                        </span>
                      ) : (
                        <span className="badge" style={{ fontSize: "11px", color: "var(--muted)" }}>
                          Unmarked
                        </span>
                      )}
                    </div>

                    {/* Student ID & Timing */}
                    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px", marginTop: "10px", fontSize: "12px" }}>
                      <div style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                        <span style={{ color: "var(--muted)" }}>ID:</span>
                        <code style={{ fontSize: "11px", background: "#f1f5f9", padding: "2px 5px", borderRadius: "4px" }}>
                          {student.id.slice(0, 8)}...
                        </code>
                        <button
                          type="button"
                          className="quiet-icon"
                          style={{ padding: "2px" }}
                          title={`Copy Student ID: ${student.id}`}
                          onClick={() => {
                            navigator.clipboard.writeText(student.id);
                            setToast(`Copied Student ID: ${student.id}`);
                          }}
                        >
                          <Copy size={11} />
                        </button>
                      </div>
                      <span style={{ color: "var(--line)" }}>•</span>
                      <span style={{ color: "var(--ink)", fontWeight: 500 }}>
                        {student.timing || "Standard timing"}
                      </span>
                    </div>

                    {/* Enrolled Courses */}
                    <div style={{ marginTop: "10px" }}>
                      <span style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--muted)", display: "block", marginBottom: "4px" }}>
                        Enrolled Courses ({studentCourses.length})
                      </span>
                      <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                        {studentCourses.map((c) => (
                          <span
                            key={c.id}
                            className="badge blue"
                            style={{ fontSize: "11.5px", padding: "2px 7px" }}
                            title={`${c.code} · ${c.name}`}
                          >
                            <strong>{c.code}</strong> · {c.name}
                          </span>
                        ))}
                        {!studentCourses.length && (
                          <span style={{ fontSize: "12px", color: "var(--muted)" }}>No enrolled courses</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Quick Student Actions */}
                  <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", borderTop: "1px solid var(--line)", paddingTop: "10px" }}>
                    <button
                      className="button compact"
                      type="button"
                      style={{ flex: 1, fontSize: "11.5px" }}
                      onClick={() => {
                        setTaskSelectedStudents([student.id]);
                        setShowTaskForm(true);
                        setActiveTab("Tasks");
                      }}
                      title={`Add note or task individually to ${student.full_name || "student"}`}
                    >
                      <CheckCircle2 size={12} /> Add Note / Task
                    </button>
                    <button
                      className="button compact"
                      type="button"
                      style={{ flex: 1, fontSize: "11.5px" }}
                      onClick={() => {
                        setTestTargetStudentIds([student.id]);
                        setShowAssignTestModal(true);
                        setActiveTab("Tests");
                      }}
                    >
                      <ClipboardList size={12} /> Assign Test
                    </button>
                    <button
                      className="button compact"
                      type="button"
                      style={{ fontSize: "11.5px" }}
                      onClick={() => {
                        setNewMsgStudentId(student.id);
                        setShowNewMsgModal(true);
                        setActiveTab("Messages");
                      }}
                    >
                      <Mail size={12} />
                    </button>
                    <button
                      className="button compact"
                      type="button"
                      style={{ fontSize: "11.5px" }}
                      onClick={() => setSelectedStudentDetail(student)}
                      title="View Student Profile"
                    >
                      <Eye size={12} />
                    </button>
                  </div>
                </div>
              );
            })}

            {!myAssignedStudents.length && (
              <div className="card portal-empty" style={{ gridColumn: "1 / -1" }}>
                <Users size={24} />
                <strong>No students currently assigned to you</strong>
                <span>Contact your LearnForge administrator to assign students to your trainer profile.</span>
              </div>
            )}
          </div>
        </section>
      </div>
    );
  }

  // ----------------------------------------------------
  // Tab 2: Attendance Marking
  // ----------------------------------------------------
  function renderAttendance() {
    const presentCount = attendanceStudents.filter((s) => attendanceState[s.id]?.status === "Present").length;
    const lateCount = attendanceStudents.filter((s) => attendanceState[s.id]?.status === "Late").length;
    const absentCount = attendanceStudents.filter((s) => attendanceState[s.id]?.status === "Absent").length;
    const unmarkedCount = attendanceStudents.length - (presentCount + lateCount + absentCount);

    return (
      <div className="trainer-attendance-view">
        <div className="page-heading">
          <div>
            <div className="eyebrow">Class Operations</div>
            <h1>Student Attendance</h1>
            <p>Mark daily attendance check-ins. Updates are recorded and synced directly to student records.</p>
          </div>
          <div className="heading-actions">
            <button
              className="button primary"
              type="button"
              disabled={savingAttendance}
              onClick={handleSaveAttendance}
            >
              <Check size={15} /> {savingAttendance ? "Saving..." : "Save Attendance"}
            </button>
          </div>
        </div>

        {/* Toolbar & Filter Bar */}
        <div className="card" style={{ padding: "16px", marginBottom: "20px" }}>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "14px" }}>
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "12px" }}>
              {/* Scope Badge: Strictly Assigned Students */}
              <div style={{ display: "inline-flex", alignItems: "center", gap: "6px", background: "rgba(22, 163, 74, 0.1)", color: "#15803d", padding: "6px 14px", borderRadius: "8px", fontWeight: 700, fontSize: "12.5px" }}>
                <Users size={14} /> My Assigned Students ({myAssignedStudents.length})
              </div>

              <label className="form-field" style={{ margin: 0, minWidth: "160px" }}>
                <span style={{ fontSize: "12px", fontWeight: 700 }}>Attendance Date</span>
                <input
                  type="date"
                  value={attendanceDate}
                  onChange={(e) => setAttendanceDate(e.target.value)}
                  style={{ height: "36px" }}
                />
              </label>

              <label className="form-field" style={{ margin: 0, minWidth: "220px" }}>
                <span style={{ fontSize: "12px", fontWeight: 700 }}>Course / Subject</span>
                <select
                  value={attendanceCourseId}
                  onChange={(e) => setAttendanceCourseId(e.target.value)}
                  style={{ height: "36px" }}
                >
                  <option value="all">
                    All My Assigned Students ({myAssignedStudents.length})
                  </option>
                  {courses.map((c) => {
                    const inCourse = myAssignedStudents.filter((s) => enrollments.some((e) => e.student_id === s.id && e.course_id === c.id)).length;
                    return (
                      <option key={c.id} value={c.id}>
                        [{c.code}] {c.name} ({inCourse} assigned)
                      </option>
                    );
                  })}
                </select>
              </label>
            </div>

            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              <button
                className="button compact"
                type="button"
                onClick={() => markAllAttendance("Present")}
                title="Mark all students present"
              >
                <Check size={13} style={{ color: "#16a34a" }} /> Mark All Present
              </button>
              <button
                className="button compact"
                type="button"
                onClick={() => markAllAttendance(null)}
                title="Clear all marks"
              >
                Clear All
              </button>
            </div>
          </div>

          {/* Counts */}
          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginTop: "16px", paddingTop: "14px", borderTop: "1px solid var(--line)" }}>
            <span className="badge green" style={{ padding: "4px 10px", fontSize: "12px" }}>Present: {presentCount}</span>
            <span className="badge amber" style={{ padding: "4px 10px", fontSize: "12px" }}>Late: {lateCount}</span>
            <span className="badge rose" style={{ padding: "4px 10px", fontSize: "12px" }}>Absent: {absentCount}</span>
            {unmarkedCount > 0 && (
              <span className="badge blue" style={{ padding: "4px 10px", fontSize: "12px" }}>Unmarked: {unmarkedCount}</span>
            )}
          </div>
        </div>

        {/* Student Attendance List */}
        <div className="card" style={{ padding: "6px" }}>
          <div className="attendance-student-table-wrap" style={{ overflowX: "auto" }}>
            <table className="admin-table" style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", padding: "12px 16px" }}>Student</th>
                  <th style={{ textAlign: "left", padding: "12px 16px" }}>Timing / Enrolled Courses</th>
                  <th style={{ textAlign: "center", padding: "12px 16px" }}>Attendance Status</th>
                  <th style={{ textAlign: "left", padding: "12px 16px" }}>Note (Optional)</th>
                </tr>
              </thead>
              <tbody>
                {attendanceStudents.map((student) => {
                  const status = attendanceState[student.id]?.status || null;
                  const note = attendanceState[student.id]?.note || "";
                  const studentCourses = enrollments
                    .filter((e) => e.student_id === student.id)
                    .map((e) => coursesById[e.course_id] || { id: e.course_id, code: "COURSE", name: "Enrolled Course" });

                  return (
                    <tr key={student.id} style={{ borderBottom: "1px solid var(--line)" }}>
                      <td style={{ padding: "12px 16px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                          <span className="student-avatar" style={{ width: "32px", height: "32px", fontSize: "12px" }}>
                            {(student.full_name || student.email || "S").slice(0, 1).toUpperCase()}
                          </span>
                          <div>
                            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                              <strong style={{ fontSize: "13.5px", color: "var(--ink)" }}>
                                {student.full_name || "Student"}
                              </strong>
                              {myAssignedStudentIds.has(student.id) && (
                                <span className="badge green" style={{ fontSize: "10.5px" }}>
                                  Assigned to You
                                </span>
                              )}
                            </div>
                            <small style={{ color: "var(--muted)", fontSize: "12px" }}>{student.email}</small>
                          </div>
                        </div>
                      </td>

                      <td style={{ padding: "12px 16px", fontSize: "13px", color: "var(--ink)" }}>
                        <div style={{ fontWeight: 500 }}>{student.timing || "Standard timing"}</div>
                        <div style={{ display: "flex", gap: "4px", flexWrap: "wrap", marginTop: "4px" }}>
                          {studentCourses.map((c) => (
                            <span key={c.id} className="badge blue" style={{ fontSize: "10px", padding: "1px 5px" }}>
                              {c.code}
                            </span>
                          ))}
                          {!studentCourses.length && (
                            <span style={{ fontSize: "11px", color: "var(--muted)" }}>No enrolled courses</span>
                          )}
                        </div>
                      </td>

                      <td style={{ padding: "12px 16px", textAlign: "center" }}>
                        <div style={{ display: "inline-flex", gap: "6px", background: "#f1f5f9", padding: "4px", borderRadius: "8px" }}>
                          <button
                            type="button"
                            className={`button compact ${status === "Present" ? "primary" : ""}`}
                            style={{
                              background: status === "Present" ? "#16a34a" : "transparent",
                              color: status === "Present" ? "#fff" : "var(--ink)",
                              border: "none",
                              minHeight: "28px",
                              padding: "2px 10px",
                              fontSize: "12px",
                              fontWeight: status === "Present" ? 700 : 500,
                            }}
                            onClick={() => setStudentAttendance(student.id, "Present")}
                          >
                            Present
                          </button>

                          <button
                            type="button"
                            className={`button compact ${status === "Late" ? "primary" : ""}`}
                            style={{
                              background: status === "Late" ? "#d97706" : "transparent",
                              color: status === "Late" ? "#fff" : "var(--ink)",
                              border: "none",
                              minHeight: "28px",
                              padding: "2px 10px",
                              fontSize: "12px",
                              fontWeight: status === "Late" ? 700 : 500,
                            }}
                            onClick={() => setStudentAttendance(student.id, "Late")}
                          >
                            Late
                          </button>

                          <button
                            type="button"
                            className={`button compact ${status === "Absent" ? "primary" : ""}`}
                            style={{
                              background: status === "Absent" ? "#dc2626" : "transparent",
                              color: status === "Absent" ? "#fff" : "var(--ink)",
                              border: "none",
                              minHeight: "28px",
                              padding: "2px 10px",
                              fontSize: "12px",
                              fontWeight: status === "Absent" ? 700 : 500,
                            }}
                            onClick={() => setStudentAttendance(student.id, "Absent")}
                          >
                            Absent
                          </button>
                        </div>
                      </td>

                      <td style={{ padding: "12px 16px" }}>
                        <input
                          type="text"
                          placeholder="e.g. Left 15m early, medical excuse"
                          value={note}
                          onChange={(e) =>
                            setAttendanceState((prev) => ({
                              ...prev,
                              [student.id]: {
                                ...(prev[student.id] || {}),
                                note: e.target.value,
                              },
                            }))
                          }
                          style={{ height: "30px", fontSize: "12px", width: "100%", maxWidth: "240px", padding: "0 8px", borderRadius: "6px", border: "1px solid var(--line)" }}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!attendanceStudents.length && (
              <div className="card portal-empty">
                <Users size={22} />
                <strong>No assigned students found</strong>
                <span>Only students assigned to your profile appear for attendance tracking.</span>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ----------------------------------------------------
  // Tab 3: Tasks Assignment & Management
  // ----------------------------------------------------
  function renderTasks() {
    const filteredTasks = tasks.filter((t) => {
      // Strictly only tasks for trainer's assigned students or created by trainer
      const isAssigned = myAssignedStudentIds.has(t.student_id) || t.created_by === activeTrainerId;
      if (!isAssigned) return false;

      // Filter by individual student
      if (taskStudentFilter !== "all" && t.student_id !== taskStudentFilter) return false;
      // Filter by category
      if (taskCategoryFilter !== "all" && t.category !== taskCategoryFilter) return false;
      // Filter by completion status
      if (taskStatusFilter === "assigned" && t.status === "completed") return false;
      if (taskStatusFilter === "completed" && t.status !== "completed") return false;

      if (!query.trim()) return true;
      const q = query.trim().toLowerCase();
      const student = studentsById[t.student_id];
      const course = coursesById[t.course_id];
      return (
        t.title?.toLowerCase().includes(q) ||
        t.body?.toLowerCase().includes(q) ||
        t.category?.toLowerCase().includes(q) ||
        student?.full_name?.toLowerCase().includes(q) ||
        student?.email?.toLowerCase().includes(q) ||
        course?.code?.toLowerCase().includes(q)
      );
    });

    const myTasksCount = tasks.filter(
      (t) => myAssignedStudentIds.has(t.student_id) || t.created_by === activeTrainerId
    ).length;

    return (
      <div className="trainer-tasks-view">
        <div className="page-heading">
          <div>
            <div className="eyebrow">Student Coursework &amp; Notes</div>
            <h1>Tasks &amp; Notes</h1>
            <p>Write notes once and assign separately to each student, or assign individual tasks.</p>
          </div>
          <div className="heading-actions">
            <button
              className="button primary"
              type="button"
              onClick={() => setShowTaskForm((prev) => !prev)}
            >
              <Plus size={15} /> {showTaskForm ? "Close Form" : "Assign New Task / Note"}
            </button>
          </div>
        </div>

        {/* Toolbar & Student/Category Filters */}
        <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap", marginBottom: "16px" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: "6px", background: "rgba(22, 163, 74, 0.1)", color: "#15803d", padding: "6px 14px", borderRadius: "8px", fontWeight: 700, fontSize: "12.5px" }}>
            <Users size={14} /> My Assigned Students ({myTasksCount} total tasks)
          </div>

          <label style={{ display: "inline-flex", alignItems: "center", gap: "6px", margin: 0 }}>
            <span style={{ fontSize: "12px", color: "var(--muted)", fontWeight: 600 }}>Student:</span>
            <select
              value={taskStudentFilter}
              onChange={(e) => setTaskStudentFilter(e.target.value)}
              style={{ height: "34px", fontSize: "12px", padding: "0 8px", borderRadius: "6px", border: "1px solid var(--line)", background: "#fff" }}
            >
              <option value="all">All Assigned Students ({myAssignedStudents.length})</option>
              {myAssignedStudents.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.full_name || s.email}
                </option>
              ))}
            </select>
          </label>

          <label style={{ display: "inline-flex", alignItems: "center", gap: "6px", margin: 0 }}>
            <span style={{ fontSize: "12px", color: "var(--muted)", fontWeight: 600 }}>Category:</span>
            <select
              value={taskCategoryFilter}
              onChange={(e) => setTaskCategoryFilter(e.target.value)}
              style={{ height: "34px", fontSize: "12px", padding: "0 8px", borderRadius: "6px", border: "1px solid var(--line)", background: "#fff" }}
            >
              <option value="all">All Categories</option>
              <option value="Task">Task</option>
              <option value="Class Notes">Class Notes</option>
              <option value="Practice Data Sets">Practice Data Sets</option>
              <option value="Projects">Projects</option>
              <option value="Homework">Homework</option>
              <option value="Lab Assignment">Lab Assignment</option>
              <option value="Other">Other</option>
            </select>
          </label>
        </div>

        {/* Create Task Form */}
        {showTaskForm && (
          <form className="card admin-create-form" onSubmit={handleCreateTask} style={{ marginBottom: "24px" }}>
            <div className="panel-heading">
              <div>
                <h2>Assign Task / Add Notes</h2>
                <p>Define note or exercise content once and distribute it separately to each selected student.</p>
              </div>
            </div>

            {/* Individual Student Pre-selection Notice */}
            {taskSelectedStudents.length === 1 && (
              <div style={{ padding: "10px 14px", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <CheckCircle2 size={16} style={{ color: "#16a34a" }} />
                  <span style={{ fontSize: "13px", color: "#166534" }}>
                    Assigning note individually to: <strong>{studentsById[taskSelectedStudents[0]]?.full_name || studentsById[taskSelectedStudents[0]]?.email || "Student"}</strong>
                  </span>
                </div>
                <button
                  type="button"
                  className="button compact"
                  style={{ fontSize: "11.5px", padding: "2px 8px" }}
                  onClick={() => setTaskSelectedStudents([])}
                >
                  Change / Select Multiple
                </button>
              </div>
            )}

            <div className="form-grid-2">
              <label className="form-field">
                <span>Task / Note Title *</span>
                <input
                  required
                  placeholder="e.g. React Props & State Notes, Python Loops Homework"
                  value={taskTitle}
                  onChange={(e) => setTaskTitle(e.target.value)}
                />
              </label>

              <label className="form-field">
                <span>Linked Course (Optional)</span>
                <select
                  value={taskCourseId}
                  onChange={(e) => {
                    const cid = e.target.value;
                    setTaskCourseId(cid);
                    if (cid) {
                      const enrolled = enrollments
                        .filter((en) => en.course_id === cid && myAssignedStudentIds.has(en.student_id))
                        .map((en) => en.student_id);
                      setTaskSelectedStudents(enrolled);
                    }
                  }}
                >
                  <option value="">General / All Subjects</option>
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>
                      [{c.code}] {c.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="form-grid-2" style={{ marginTop: "12px" }}>
              <label className="form-field">
                <span>Category / Type</span>
                <select value={taskCategory} onChange={(e) => setTaskCategory(e.target.value)}>
                  <option value="Task">Task</option>
                  <option value="Class Notes">Class Notes</option>
                  <option value="Practice Data Sets">Practice Data Sets</option>
                  <option value="Projects">Projects</option>
                  <option value="Homework">Homework</option>
                  <option value="Lab Assignment">Lab Assignment</option>
                  <option value="Other">Other</option>
                </select>
              </label>

              <label className="form-field">
                <span>Deadline / Due Date (Optional)</span>
                <input
                  type="datetime-local"
                  value={taskDueAt}
                  onChange={(e) => setTaskDueAt(e.target.value)}
                />
              </label>
            </div>

            {/* Student Selection Checkboxes (Only Assigned Students) */}
            <div style={{ marginTop: "14px", padding: "14px", background: "#f8fafc", borderRadius: "10px", border: "1px solid var(--line)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px", flexWrap: "wrap", gap: "8px" }}>
                <strong style={{ fontSize: "13.5px", color: "var(--ink)", display: "flex", alignItems: "center", gap: "6px" }}>
                  <Users size={16} style={{ color: "#4f46e5" }} />
                  Select Students to Assign ({taskSelectedStudents.length} of {myAssignedStudents.length} selected) *
                </strong>
                <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                  <button
                    type="button"
                    className="button compact"
                    style={{ background: "#e0e7ff", color: "#3730a3", fontWeight: 700 }}
                    onClick={() => setTaskSelectedStudents(Array.from(myAssignedStudentIds))}
                  >
                    Select All My Students ({myAssignedStudents.length})
                  </button>
                  {taskSelectedStudents.length > 0 && (
                    <button
                      type="button"
                      className="button compact"
                      onClick={() => setTaskSelectedStudents([])}
                    >
                      Clear Selection
                    </button>
                  )}
                </div>
              </div>

              <input
                type="search"
                placeholder="Search assigned students by name or email…"
                value={taskStudentSearch}
                onChange={(e) => setTaskStudentSearch(e.target.value)}
                style={{ height: "32px", width: "100%", fontSize: "12px", marginBottom: "8px", padding: "0 10px", borderRadius: "6px", border: "1px solid var(--line)", background: "#fff" }}
              />

              <div style={{ maxHeight: "180px", overflowY: "auto", border: "1px solid var(--line)", borderRadius: "6px", background: "#fff", padding: "4px" }}>
                {myAssignedStudents
                  .filter((s) => {
                    if (!taskStudentSearch.trim()) return true;
                    const q = taskStudentSearch.trim().toLowerCase();
                    return (s.full_name || "").toLowerCase().includes(q) || (s.email || "").toLowerCase().includes(q);
                  })
                  .map((student) => {
                    const isChecked = taskSelectedStudents.includes(student.id);
                    return (
                      <label
                        key={student.id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: "8px",
                          padding: "6px 8px",
                          borderRadius: "4px",
                          background: isChecked ? "#eef2ff" : "#fff",
                          cursor: "pointer",
                          fontSize: "12.5px",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setTaskSelectedStudents((prev) => [...prev, student.id]);
                              } else {
                                setTaskSelectedStudents((prev) => prev.filter((id) => id !== student.id));
                              }
                            }}
                          />
                          <div>
                            <span style={{ fontWeight: 600, color: "var(--ink)" }}>{student.full_name || student.email}</span>
                            <small style={{ color: "var(--muted)", display: "block" }}>{student.email}</small>
                          </div>
                        </div>
                        <span className="badge green" style={{ fontSize: "10px" }}>Assigned to You</span>
                      </label>
                    );
                  })}
                {!myAssignedStudents.length && (
                  <div style={{ padding: "12px", textAlign: "center", color: "var(--muted)", fontSize: "12px" }}>
                    No students assigned to your profile yet.
                  </div>
                )}
              </div>
            </div>

            <label className="form-field" style={{ marginTop: "14px" }}>
              <span>Note / Task Body &amp; Requirements *</span>
              <textarea
                required
                rows={4}
                placeholder="Enter lecture summary, learning notes, task guidelines, or problem steps..."
                value={taskInstructions}
                onChange={(e) => setTaskInstructions(e.target.value)}
              />
            </label>

            <div className="form-actions" style={{ marginTop: "16px" }}>
              <button className="button" type="button" onClick={() => setShowTaskForm(false)}>
                Cancel
              </button>
              <button className="button primary" disabled={busy || taskSelectedStudents.length === 0}>
                <Plus size={14} /> {busy ? "Assigning..." : taskSelectedStudents.length === 1
                  ? `Assign Note to ${studentsById[taskSelectedStudents[0]]?.full_name || "Student"}`
                  : `Assign Separately to ${taskSelectedStudents.length} Students`}
              </button>
            </div>
          </form>
        )}

        {/* Filter Pills */}
        <div style={{ display: "flex", gap: "8px", marginBottom: "16px", flexWrap: "wrap" }}>
          <button
            className={`button compact ${taskStatusFilter === "all" ? "primary" : ""}`}
            type="button"
            onClick={() => setTaskStatusFilter("all")}
          >
            All Tasks ({tasks.length})
          </button>
          <button
            className={`button compact ${taskStatusFilter === "assigned" ? "primary" : ""}`}
            type="button"
            onClick={() => setTaskStatusFilter("assigned")}
          >
            <Clock3 size={12} /> Assigned ({tasks.filter((t) => t.status !== "completed").length})
          </button>
          <button
            className={`button compact ${taskStatusFilter === "completed" ? "primary" : ""}`}
            type="button"
            onClick={() => setTaskStatusFilter("completed")}
          >
            <Check size={12} /> Completed ({tasks.filter((t) => t.status === "completed").length})
          </button>
        </div>

        {/* Task Cards */}
        <div className="admin-work-list" style={{ display: "grid", gap: "12px" }}>
          {filteredTasks.map((task) => {
            const student = studentsById[task.student_id];
            const course = coursesById[task.course_id];
            const isCompleted = task.status === "completed";

            return (
              <article className={`card admin-assignment-card ${isCompleted ? "task-completed-card" : ""}`} key={task.id} style={{ padding: "16px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px", flexWrap: "wrap" }}>
                  <div style={{ display: "flex", gap: "12px", alignItems: "flex-start", flex: 1, minWidth: "260px" }}>
                    <span
                      className="portal-item-icon"
                      style={{
                        width: "38px",
                        height: "38px",
                        flexShrink: 0,
                        background: isCompleted ? "#ecfdf5" : "#eef2ff",
                        color: isCompleted ? "#059669" : "#4f46e5",
                      }}
                    >
                      {isCompleted ? <CheckCircle2 size={18} /> : <FileText size={18} />}
                    </span>

                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                        <strong style={{ fontSize: "15px", color: "var(--ink)", textDecoration: isCompleted ? "line-through" : "none" }}>
                          {task.title}
                        </strong>
                        {course && <span className="course-code-badge" style={{ fontSize: "11px" }}>{course.code}</span>}
                        <span className="badge blue" style={{ fontSize: "11px" }}>{task.category || "Task"}</span>
                        {isCompleted ? (
                          <span className="badge green"><Check size={11} strokeWidth={3} /> Completed</span>
                        ) : (
                          <span className="badge amber"><Clock3 size={11} /> Assigned</span>
                        )}
                      </div>

                      <p style={{ margin: "4px 0 0", fontSize: "12.5px", color: "var(--muted)" }}>
                        Student: <strong>{student?.full_name || student?.email || "Student"}</strong>
                        {course ? ` · ${course.name}` : ""}
                        {task.due_at && (
                          <span style={{ marginLeft: "10px", color: "#d97706", fontWeight: 600 }}>
                            Due: {new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(task.due_at))}
                          </span>
                        )}
                      </p>
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                    <button
                      className="button compact"
                      type="button"
                      onClick={() => handleToggleTaskStatus(task)}
                      title="Toggle completion status"
                    >
                      <CheckCircle2 size={12} /> {isCompleted ? "Mark Assigned" : "Mark Completed"}
                    </button>
                    <button
                      className="quiet-icon danger-icon"
                      type="button"
                      onClick={() => handleDeleteTask(task.id)}
                      aria-label="Delete task"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>

                {task.body && (
                  <p style={{ margin: "12px 0 0", fontSize: "13px", color: "var(--ink)", lineHeight: 1.5, whiteSpace: "pre-wrap", background: "#f8fafc", padding: "10px", borderRadius: "6px" }}>
                    {task.body}
                  </p>
                )}
              </article>
            );
          })}

          {!filteredTasks.length && (
            <div className="card portal-empty">
              <CheckCircle2 size={24} />
              <strong>No tasks found</strong>
              <span>Use the Assign New Task button above to assign practical exercises to your students.</span>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ----------------------------------------------------
  // Tab 4: Syllabus Management
  // ----------------------------------------------------
  function renderSyllabus() {
    const syllabi = materials.filter((m) => m.category === "Syllabus");

    return (
      <div className="trainer-syllabus-view">
        <div className="page-heading">
          <div>
            <div className="eyebrow">Curriculum &amp; Coursework</div>
            <h1>Course Syllabi</h1>
            <p>Upload and distribute course syllabi, outlines, and curriculum learning goals to students.</p>
          </div>
          <div className="heading-actions">
            <button
              className="button primary"
              type="button"
              onClick={() => setShowSyllabusModal(true)}
            >
              <Plus size={15} /> Upload Course Syllabus
            </button>
          </div>
        </div>

        {/* Syllabus Modal */}
        {showSyllabusModal && (
          <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) setShowSyllabusModal(false); }}>
            <div className="modal" style={{ maxWidth: "560px" }}>
              <div className="modal-heading">
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <span className="portal-item-icon assignment" style={{ width: "38px", height: "38px", background: "#eef2ff", color: "#4f46e5" }}>
                    <BookOpen size={18} />
                  </span>
                  <div>
                    <h2>Distribute Course Syllabus</h2>
                    <p>Share syllabus outline or PDF document with course students.</p>
                  </div>
                </div>
                <button type="button" className="quiet-icon" onClick={() => setShowSyllabusModal(false)}><X size={18} /></button>
              </div>

              <form onSubmit={handleSaveSyllabus} style={{ marginTop: "16px" }}>
                <label className="form-field">
                  <span>Linked Course / Subject *</span>
                  <select
                    required
                    value={syllabusCourseId}
                    onChange={(e) => setSyllabusCourseId(e.target.value)}
                  >
                    <option value="">Select Course...</option>
                    {courses.map((c) => (
                      <option key={c.id} value={c.id}>
                        [{c.code}] {c.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="form-field" style={{ marginTop: "12px" }}>
                  <span>Syllabus Title *</span>
                  <input
                    required
                    placeholder="e.g. Full-Stack Web Development - Master Syllabus 2026"
                    value={syllabusTitle}
                    onChange={(e) => setSyllabusTitle(e.target.value)}
                  />
                </label>

                <label className="form-field" style={{ marginTop: "12px" }}>
                  <span>Google Drive / Cloud Document Link</span>
                  <input
                    type="url"
                    placeholder="https://drive.google.com/... or https://docs.google.com/..."
                    value={syllabusDriveUrl}
                    onChange={(e) => setSyllabusDriveUrl(e.target.value)}
                  />
                </label>

                <label className="form-field" style={{ marginTop: "12px" }}>
                  <span>Or Upload Syllabus File (PDF/Doc)</span>
                  <input
                    type="file"
                    accept=".pdf,.doc,.docx"
                    onChange={(e) => setSyllabusFile(e.target.files[0] || null)}
                  />
                </label>

                <label className="form-field" style={{ marginTop: "12px" }}>
                  <span>Curriculum Outline &amp; Learning Goals</span>
                  <textarea
                    rows={4}
                    placeholder="Summary of modules, weekly schedules, evaluation criteria, or prerequisite topics..."
                    value={syllabusDescription}
                    onChange={(e) => setSyllabusDescription(e.target.value)}
                  />
                </label>

                <div className="form-actions" style={{ marginTop: "18px" }}>
                  <button className="button" type="button" onClick={() => setShowSyllabusModal(false)}>Cancel</button>
                  <button className="button primary" disabled={busy}>
                    <Upload size={14} /> {busy ? "Uploading..." : "Save & Share Syllabus"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Syllabi List */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "18px" }}>
          {syllabi.map((item) => {
            const course = coursesById[item.course_id];
            return (
              <article className="card panel" key={item.id} style={{ display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "8px" }}>
                    <span className="badge blue" style={{ fontSize: "11px", fontWeight: 700 }}>
                      {course ? course.code : "General"}
                    </span>
                    <span className="badge-view-only" style={{ background: "#f0fdf4", color: "#166534", fontSize: "11px" }}>
                      Syllabus
                    </span>
                  </div>

                  <h3 style={{ fontSize: "16px", fontWeight: 700, margin: "0 0 6px", color: "var(--ink)" }}>{item.title}</h3>
                  <p style={{ fontSize: "13px", color: "var(--muted)", margin: "0 0 12px", lineHeight: 1.4 }}>
                    {item.description || "No description provided."}
                  </p>
                </div>

                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", borderTop: "1px solid var(--line)", paddingTop: "12px" }}>
                  <button
                    className="button primary compact"
                    type="button"
                    onClick={() =>
                      setViewingDoc({
                        title: item.title,
                        subtitle: course ? `${course.code} · Syllabus` : "Syllabus",
                        url: item.drive_url,
                        filePath: item.file_path,
                      })
                    }
                  >
                    <Eye size={13} /> View Syllabus
                  </button>
                  {item.drive_url && (
                    <a
                      className="button compact"
                      href={item.drive_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Open in new Google tab (Trainer)"
                    >
                      <ExternalLink size={13} /> Open Tab
                    </a>
                  )}
                </div>
              </article>
            );
          })}

          {!syllabi.length && (
            <div className="card portal-empty" style={{ gridColumn: "1 / -1" }}>
              <BookOpen size={24} />
              <strong>No course syllabi uploaded yet</strong>
              <span>Use the button above to upload and distribute a syllabus for your courses.</span>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ----------------------------------------------------
  // Tab 5: Materials & Drive Files
  // ----------------------------------------------------
  function renderMaterialsAndDrive() {
    const pendingRequests = downloadRequests.filter((r) => r.status === "pending");
    const filteredMaterials = materials.filter((m) => {
      if (selectedMaterialCategoryFilter !== "all" && m.category !== selectedMaterialCategoryFilter) {
        return false;
      }
      if (!query.trim()) return true;
      const q = query.trim().toLowerCase();
      const course = coursesById[m.course_id];
      return (
        m.title?.toLowerCase().includes(q) ||
        m.description?.toLowerCase().includes(q) ||
        m.category?.toLowerCase().includes(q) ||
        course?.code?.toLowerCase().includes(q)
      );
    });

    return (
      <div className="trainer-materials-view">
        <div className="page-heading">
          <div>
            <div className="eyebrow">Cloud Storage &amp; Documents</div>
            <h1>Drive &amp; Course Materials</h1>
            <p>Upload class notes, practice data sets, projects, and review student download requests.</p>
          </div>
          <div className="heading-actions">
            <button
              className="button primary"
              type="button"
              onClick={() => setShowMaterialModal(true)}
            >
              <Plus size={15} /> Upload Material / Link Drive
            </button>
          </div>
        </div>

        {/* Sub-Tabs: Materials vs Download Requests */}
        <div className="portal-tabs" role="tablist" style={{ marginBottom: "18px" }}>
          <button
            className={`portal-tab ${materialActiveSubTab === "files" ? "active" : ""}`}
            type="button"
            onClick={() => setMaterialActiveSubTab("files")}
          >
            <HardDrive size={15} />
            <span>Materials ({materials.length})</span>
          </button>
          <button
            className={`portal-tab ${materialActiveSubTab === "requests" ? "active" : ""}`}
            type="button"
            onClick={() => setMaterialActiveSubTab("requests")}
          >
            <Download size={15} />
            <span>Download Requests</span>
            {pendingRequests.length > 0 && (
              <span className="portal-tab-count pending">{pendingRequests.length}</span>
            )}
          </button>
        </div>

        {materialActiveSubTab === "requests" ? (
          /* Download Requests Management */
          <div className="card" style={{ padding: "16px" }}>
            <h2 style={{ fontSize: "16px", fontWeight: 700, margin: "0 0 12px" }}>
              Student Download Requests ({downloadRequests.length})
            </h2>

            <div style={{ overflowX: "auto" }}>
              <table className="admin-table" style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: "left", padding: "10px 14px" }}>Student</th>
                    <th style={{ textAlign: "left", padding: "10px 14px" }}>Material / Note</th>
                    <th style={{ textAlign: "left", padding: "10px 14px" }}>Reason</th>
                    <th style={{ textAlign: "left", padding: "10px 14px" }}>Status</th>
                    <th style={{ textAlign: "right", padding: "10px 14px" }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {downloadRequests.map((req) => {
                    const student = studentsById[req.student_id];
                    const mat = materials.find((m) => m.id === req.material_id);
                    const isPending = req.status === "pending";

                    return (
                      <tr key={req.id} style={{ borderBottom: "1px solid var(--line)" }}>
                        <td style={{ padding: "10px 14px" }}>
                          <strong style={{ fontSize: "13px" }}>{student?.full_name || student?.email || "Student"}</strong>
                        </td>
                        <td style={{ padding: "10px 14px" }}>
                          <span style={{ fontSize: "13px", fontWeight: 600 }}>{mat?.title || "Document"}</span>
                          <br />
                          <small style={{ color: "var(--muted)" }}>{mat?.category || "File"}</small>
                        </td>
                        <td style={{ padding: "10px 14px", fontSize: "12px", color: "var(--muted)" }}>
                          {req.reason || "No reason given"}
                        </td>
                        <td style={{ padding: "10px 14px" }}>
                          <span className={`portal-status ${req.status}`}>
                            {req.status === "approved" ? "Approved" : req.status === "rejected" ? "Declined" : "Pending"}
                          </span>
                        </td>
                        <td style={{ padding: "10px 14px", textAlign: "right" }}>
                          {isPending ? (
                            <div style={{ display: "inline-flex", gap: "6px" }}>
                              <button
                                className="button primary compact"
                                type="button"
                                onClick={() => handleReviewDownloadRequest(req.id, "approved", student?.full_name || student?.email)}
                              >
                                <Check size={12} /> Approve
                              </button>
                              <button
                                className="button compact"
                                type="button"
                                onClick={() => handleReviewDownloadRequest(req.id, "rejected", student?.full_name || student?.email)}
                              >
                                Decline
                              </button>
                            </div>
                          ) : (
                            <span style={{ fontSize: "12px", color: "var(--muted)" }}>Reviewed</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {!downloadRequests.length && (
                <div className="card portal-empty">
                  <Download size={22} />
                  <span>No download requests from students.</span>
                </div>
              )}
            </div>
          </div>
        ) : (
          /* Materials List */
          <div>
            {/* Category Filter Pills */}
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "16px", alignItems: "center" }}>
              <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--muted)", marginRight: "4px" }}>
                <Filter size={13} style={{ display: "inline", verticalAlign: "middle" }} /> Category:
              </span>
              {["all", ...MATERIAL_CATEGORIES].map((cat) => {
                const label = cat === "all" ? "All Categories" : cat;
                const count = cat === "all" ? materials.length : materials.filter((m) => m.category === cat).length;
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setSelectedMaterialCategoryFilter(cat)}
                    style={{
                      fontSize: "11.5px",
                      fontWeight: selectedMaterialCategoryFilter === cat ? 700 : 500,
                      padding: "3px 10px",
                      borderRadius: "20px",
                      border: selectedMaterialCategoryFilter === cat ? "1px solid #4f46e5" : "1px solid var(--line)",
                      background: selectedMaterialCategoryFilter === cat ? "#eef2ff" : "#fff",
                      color: selectedMaterialCategoryFilter === cat ? "#4f46e5" : "var(--ink)",
                      cursor: "pointer",
                    }}
                  >
                    {label} ({count})
                  </button>
                );
              })}
            </div>

            {/* Grid */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "16px" }}>
              {filteredMaterials.map((mat) => {
                const course = coursesById[mat.course_id];
                const isDrive = !!mat.drive_url;

                return (
                  <article className="card panel" key={mat.id} style={{ display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "8px" }}>
                        <span className="badge blue" style={{ fontSize: "11px" }}>{course?.code || "Campus-wide"}</span>
                        <span className="badge-view-only" style={{ background: isDrive ? "#eef2ff" : "#f1f5f9", color: isDrive ? "#4f46e5" : "#475569", fontSize: "11px" }}>
                          {mat.category || (isDrive ? "Google Drive" : "PDF Document")}
                        </span>
                      </div>

                      <h3 style={{ fontSize: "15.5px", fontWeight: 700, margin: "0 0 4px", color: "var(--ink)" }}>{mat.title}</h3>
                      <p style={{ fontSize: "12.5px", color: "var(--muted)", margin: "0 0 10px", lineHeight: 1.4 }}>
                        {mat.description || "No overview provided."}
                      </p>
                    </div>

                    <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", borderTop: "1px solid var(--line)", paddingTop: "10px" }}>
                      <button
                        className="button primary compact"
                        type="button"
                        onClick={() =>
                          setViewingDoc({
                            title: mat.title,
                            subtitle: course ? `${course.code} · ${mat.category}` : mat.category,
                            url: mat.drive_url,
                            filePath: mat.file_path,
                          })
                        }
                      >
                        <Eye size={12} /> View Document
                      </button>
                      {mat.drive_url && (
                        <a
                          className="button compact"
                          href={mat.drive_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Open Drive directly (Trainer)"
                        >
                          <ExternalLink size={12} /> Open Tab
                        </a>
                      )}
                    </div>
                  </article>
                );
              })}

              {!filteredMaterials.length && (
                <div className="card portal-empty" style={{ gridColumn: "1 / -1" }}>
                  <HardDrive size={22} />
                  <span>No materials found in this category.</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Upload Material Modal */}
        {showMaterialModal && (
          <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) setShowMaterialModal(false); }}>
            <div className="modal" style={{ maxWidth: "560px" }}>
              <div className="modal-heading">
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <span className="portal-item-icon assignment" style={{ width: "38px", height: "38px", background: "#eef2ff", color: "#4f46e5" }}>
                    <HardDrive size={18} />
                  </span>
                  <div>
                    <h2>Upload / Link Material</h2>
                    <p>Add class notes, practice data sets, projects, or study guides.</p>
                  </div>
                </div>
                <button type="button" className="quiet-icon" onClick={() => setShowMaterialModal(false)}><X size={18} /></button>
              </div>

              <form onSubmit={handleUploadMaterial} style={{ marginTop: "16px" }}>
                <div style={{ display: "flex", gap: "10px", marginBottom: "14px" }}>
                  <button
                    type="button"
                    className={`button ${matSource === "upload" ? "primary" : ""}`}
                    onClick={() => setMatSource("upload")}
                    style={{ flex: 1 }}
                  >
                    <Upload size={14} /> Upload File (PDF)
                  </button>
                  <button
                    type="button"
                    className={`button ${matSource === "drive" ? "primary" : ""}`}
                    onClick={() => setMatSource("drive")}
                    style={{ flex: 1 }}
                  >
                    <Link2 size={14} /> Google Drive Link
                  </button>
                </div>

                <label className="form-field">
                  <span>Material Title *</span>
                  <input
                    required
                    placeholder="e.g. Week 2 Practice Data Sets, Project Brief"
                    value={matTitle}
                    onChange={(e) => setMatTitle(e.target.value)}
                  />
                </label>

                <div className="form-grid-2" style={{ marginTop: "12px" }}>
                  <label className="form-field">
                    <span>Category</span>
                    <select value={matCategory} onChange={(e) => setMatCategory(e.target.value)}>
                      {MATERIAL_CATEGORIES.map((cat) => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                  </label>

                  <label className="form-field">
                    <span>Subject / Course</span>
                    <select value={matCourseId} onChange={(e) => setMatCourseId(e.target.value)}>
                      <option value="">General / Campus-wide</option>
                      {courses.map((c) => (
                        <option key={c.id} value={c.id}>
                          [{c.code}] {c.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                {matSource === "upload" ? (
                  <label className="form-field" style={{ marginTop: "12px" }}>
                    <span>Select File (PDF / Document) *</span>
                    <input
                      type="file"
                      required
                      accept=".pdf,.doc,.docx,.csv,.xlsx,.zip"
                      onChange={(e) => setMatFile(e.target.files[0] || null)}
                    />
                  </label>
                ) : (
                  <label className="form-field" style={{ marginTop: "12px" }}>
                    <span>Google Drive / Docs Link *</span>
                    <input
                      type="url"
                      required
                      placeholder="https://drive.google.com/... or https://docs.google.com/..."
                      value={matDriveUrl}
                      onChange={(e) => setMatDriveUrl(e.target.value)}
                    />
                  </label>
                )}

                <label className="form-field" style={{ marginTop: "12px" }}>
                  <span>Description / Instructions</span>
                  <textarea
                    rows={3}
                    placeholder="Provide overview, reading goals, or practice objectives..."
                    value={matDescription}
                    onChange={(e) => setMatDescription(e.target.value)}
                  />
                </label>

                {/* Target Students Selection */}
                <div style={{ marginTop: "12px", padding: "10px", background: "#f8fafc", borderRadius: "8px", border: "1px solid var(--line)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                    <span style={{ fontSize: "12px", fontWeight: 700, color: "var(--ink)" }}>
                      Grant Access to Students ({matSelectedStudentIds.length} selected)
                    </span>
                    <button
                      type="button"
                      className="button compact"
                      style={{ fontSize: "11px" }}
                      onClick={() => setMatSelectedStudentIds(Array.from(myAssignedStudentIds))}
                    >
                      Select My Assigned ({myAssignedStudents.length})
                    </button>
                  </div>
                  <div style={{ maxHeight: "130px", overflowY: "auto" }}>
                    {myAssignedStudents.map((s) => (
                      <label key={s.id} style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px", padding: "3px 0", cursor: "pointer" }}>
                        <input
                          type="checkbox"
                          checked={matSelectedStudentIds.includes(s.id)}
                          onChange={(e) => {
                            if (e.target.checked) setMatSelectedStudentIds((prev) => [...prev, s.id]);
                            else setMatSelectedStudentIds((prev) => prev.filter((id) => id !== s.id));
                          }}
                        />
                        <span>{s.full_name || s.email}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="form-actions" style={{ marginTop: "18px" }}>
                  <button className="button" type="button" onClick={() => setShowMaterialModal(false)}>Cancel</button>
                  <button className="button primary" disabled={busy}>
                    <Plus size={14} /> {busy ? "Saving..." : "Save Material"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ----------------------------------------------------
  // Tab 5: Tests & Assessments
  // ----------------------------------------------------
  function renderTests() {
    const filteredTests = assessments.filter((a) => {
      if (!query.trim()) return true;
      const q = query.trim().toLowerCase();
      const course = coursesById[a.course_id];
      return (
        a.title?.toLowerCase().includes(q) ||
        a.description?.toLowerCase().includes(q) ||
        course?.name?.toLowerCase().includes(q) ||
        course?.code?.toLowerCase().includes(q)
      );
    });

    const myAttempts = assessmentAttempts.filter((att) => myAssignedStudentIds.has(att.student_id));

    return (
      <div className="trainer-tests-view">
        <div className="page-heading">
          <div>
            <div className="eyebrow">Assessments &amp; Evaluations</div>
            <h1>Tests &amp; Quizzes</h1>
            <p>
              Assign tests, exam portals, and quizzes to your assigned students. Changes replicate to student profiles in real time.
            </p>
          </div>
          <div className="heading-actions">
            <button
              className="button primary"
              type="button"
              onClick={() => {
                setSelectedTestToAssign(assessments[0] || null);
                setTestTargetStudentIds(Array.from(myAssignedStudentIds));
                setShowAssignTestModal(true);
              }}
            >
              <Plus size={15} /> Assign Test to Students
            </button>
          </div>
        </div>

        {/* Metric Summary */}
        <section className="metrics student-metrics" style={{ marginBottom: "20px" }}>
          <article className="card metric-card">
            <div className="metric-top">
              <span>Available Tests</span>
              <span className="metric-icon blue"><ClipboardList size={17} /></span>
            </div>
            <strong>{assessments.length}</strong>
            <small>Active exams in campus catalog</small>
          </article>

          <article className="card metric-card">
            <div className="metric-top">
              <span>My Assigned Students</span>
              <span className="metric-icon green"><Users size={17} /></span>
            </div>
            <strong>{myAssignedStudents.length}</strong>
            <small>Eligible for test targeting</small>
          </article>

          <article className="card metric-card">
            <div className="metric-top">
              <span>Completed Attempts</span>
              <span className="metric-icon purple"><CheckCircle2 size={17} /></span>
            </div>
            <strong>{myAttempts.length}</strong>
            <small>Evaluations from your students</small>
          </article>
        </section>

        {/* Tests Grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: "18px" }}>
          {filteredTests.map((test) => {
            const course = coursesById[test.course_id];
            const testRecipients = assessmentRecipients.filter((r) => r.assessment_id === test.id);
            const myAssignedCount = myAssignedStudents.filter((s) =>
              testRecipients.some((r) => r.student_id === s.id)
            ).length;

            const testAttemptsForMyStudents = assessmentAttempts.filter(
              (att) => att.assessment_id === test.id && myAssignedStudentIds.has(att.student_id)
            );

            return (
              <article
                className="card panel"
                key={test.id}
                style={{ display: "flex", flexDirection: "column", justifyContent: "space-between" }}
              >
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "8px" }}>
                    <span className="badge blue" style={{ fontSize: "11px", fontWeight: 700 }}>
                      {course ? course.code : "General"}
                    </span>
                    <span className="badge green" style={{ fontSize: "11px", fontWeight: 600 }}>
                      {myAssignedCount} of {myAssignedStudents.length} Assigned
                    </span>
                  </div>

                  <h3 style={{ fontSize: "16px", margin: "0 0 6px", color: "var(--ink)", fontWeight: 700 }}>
                    {test.title}
                  </h3>

                  {test.description && (
                    <p style={{ fontSize: "13px", color: "var(--muted)", margin: "0 0 12px", lineHeight: 1.4 }}>
                      {test.description}
                    </p>
                  )}

                  <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", fontSize: "12px", color: "var(--muted)", marginBottom: "14px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                      <CalendarClock size={13} />
                      <span>Due {test.due_at ? new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(test.due_at)) : "Open deadline"}</span>
                    </div>
                    {test.external_url && (
                      <span className="badge" style={{ fontSize: "11px", background: "#fdf4ff", color: "#9333ea" }}>
                        External Exam Link
                      </span>
                    )}
                  </div>

                  {/* Student Submissions List for this test */}
                  {testAttemptsForMyStudents.length > 0 && (
                    <div style={{ marginTop: "10px", padding: "10px", background: "#f8fafc", borderRadius: "8px", border: "1px solid var(--line)" }}>
                      <strong style={{ fontSize: "11.5px", color: "var(--muted)", textTransform: "uppercase", display: "block", marginBottom: "6px" }}>
                        Recent Student Submissions ({testAttemptsForMyStudents.length})
                      </strong>
                      <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                        {testAttemptsForMyStudents.map((att) => {
                          const s = studentsById[att.student_id];
                          return (
                            <div key={att.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "12px" }}>
                              <span style={{ fontWeight: 600, color: "var(--ink)" }}>{s?.full_name || s?.email || "Student"}</span>
                              <span className="badge green" style={{ fontSize: "11px", padding: "1px 6px" }}>
                                {att.score} / {att.max_score} pts ({Math.round((att.score / (att.max_score || 100)) * 100)}%)
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                <div className="card-actions" style={{ display: "flex", gap: "8px", marginTop: "14px", borderTop: "1px solid var(--line)", paddingTop: "12px" }}>
                  <button
                    className="button primary compact"
                    type="button"
                    style={{ flex: 1 }}
                    onClick={() => {
                      setSelectedTestToAssign(test);
                      const currentAssigned = testRecipients
                        .filter((r) => myAssignedStudentIds.has(r.student_id))
                        .map((r) => r.student_id);
                      setTestTargetStudentIds(currentAssigned.length > 0 ? currentAssigned : Array.from(myAssignedStudentIds));
                      setShowAssignTestModal(true);
                    }}
                  >
                    <Users size={13} /> Manage / Assign Students
                  </button>

                  {test.external_url && (
                    <button
                      className="button compact"
                      type="button"
                      onClick={() =>
                        setViewingDoc({
                          title: test.title,
                          subtitle: `Assessment · ${course?.name || "General"}`,
                          url: test.external_url,
                        })
                      }
                    >
                      <Eye size={13} /> Preview
                    </button>
                  )}
                </div>
              </article>
            );
          })}

          {!filteredTests.length && (
            <div className="card portal-empty" style={{ gridColumn: "1 / -1" }}>
              <ClipboardList size={26} />
              <strong>No assessments found</strong>
              <span>Tests created by administrators or curriculum coordinators will appear here for student targeting.</span>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ----------------------------------------------------
  // Tab 6: Messages & Chat
  // ----------------------------------------------------
  function renderMessages() {
    return (
      <div className="trainer-messages-view">
        <div className="page-heading">
          <div>
            <div className="eyebrow">Direct Messaging</div>
            <h1>Student Conversations</h1>
            <p>Send and receive direct real-time messages with students.</p>
          </div>
          <div className="heading-actions">
            <button
              className="button primary"
              type="button"
              onClick={() => setShowNewMsgModal(true)}
            >
              <Plus size={14} /> New Message
            </button>
          </div>
        </div>

        {/* Split Inbox Layout */}
        <div className="card admin-inbox" style={{ minHeight: "520px", display: "grid", gridTemplateColumns: "320px 1fr" }}>
          {/* Threads Column */}
          <aside className="thread-list" style={{ borderRight: "1px solid var(--line)" }}>
            <div className="thread-list-heading" style={{ padding: "14px 16px", borderBottom: "1px solid var(--line)" }}>
              <strong>Student Threads</strong>
              <span className="day-label">{conversations.length} total</span>
            </div>

            <div style={{ overflowY: "auto", maxHeight: "480px" }}>
              {conversations.map((thread) => {
                const student = studentsById[thread.student_id];
                const isSelected = thread.id === selectedConversationId;

                return (
                  <button
                    key={thread.id}
                    type="button"
                    className={`message-row ${isSelected ? "active" : ""}`}
                    onClick={() => setSelectedConversationId(thread.id)}
                    style={{
                      width: "100%",
                      textAlign: "left",
                      padding: "12px 14px",
                      background: isSelected ? "#eef2ff" : "transparent",
                      borderBottom: "1px solid var(--line)",
                      borderLeft: isSelected ? "3px solid #4f46e5" : "3px solid transparent",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                    }}
                  >
                    <span className="student-avatar" style={{ width: "32px", height: "32px", fontSize: "11px", flexShrink: 0 }}>
                      {(student?.full_name || student?.email || "S").slice(0, 1).toUpperCase()}
                    </span>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <strong style={{ fontSize: "13px", color: "var(--ink)", display: "block", textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>
                        {student?.full_name || student?.email || "Student"}
                      </strong>
                      <span style={{ fontSize: "12px", color: "var(--muted)", textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap", display: "block" }}>
                        {thread.subject}
                      </span>
                    </div>
                  </button>
                );
              })}

              {!conversations.length && (
                <div style={{ padding: "24px 16px", textAlign: "center", color: "var(--muted)", fontSize: "13px" }}>
                  No active student conversations. Start one using New Message.
                </div>
              )}
            </div>
          </aside>

          {/* Active Conversation Pane */}
          <main className="thread-chat-pane" style={{ display: "flex", flexDirection: "column", height: "100%" }}>
            {selectedConversationId ? (
              <>
                {/* Chat Header */}
                <div style={{ padding: "12px 18px", borderBottom: "1px solid var(--line)", background: "#fafafa", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div>
                    <strong style={{ fontSize: "14px", color: "var(--ink)", display: "block" }}>
                      {conversations.find((c) => c.id === selectedConversationId)?.subject || "Conversation"}
                    </strong>
                    <small style={{ color: "var(--muted)" }}>
                      Student: {studentsById[conversations.find((c) => c.id === selectedConversationId)?.student_id]?.full_name || "Student"}
                    </small>
                  </div>
                </div>

                {/* Messages Stream */}
                <div
                  ref={chatScrollRef}
                  style={{
                    flex: 1,
                    overflowY: "auto",
                    padding: "16px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "12px",
                    maxHeight: "380px",
                  }}
                >
                  {messages.map((msg) => {
                    const isMe = msg.sender_id === user.id;

                    return (
                      <div
                        key={msg.id}
                        style={{
                          alignSelf: isMe ? "flex-end" : "flex-start",
                          maxWidth: "75%",
                          display: "flex",
                          flexDirection: "column",
                          alignItems: isMe ? "flex-end" : "flex-start",
                        }}
                      >
                        <div
                          style={{
                            padding: "10px 14px",
                            borderRadius: isMe ? "14px 14px 2px 14px" : "14px 14px 14px 2px",
                            background: isMe ? "#4f46e5" : "#f1f5f9",
                            color: isMe ? "#ffffff" : "var(--ink)",
                            fontSize: "13.5px",
                            lineHeight: 1.45,
                            wordBreak: "break-word",
                          }}
                        >
                          {msg.body}
                        </div>
                        <small style={{ fontSize: "10.5px", color: "var(--muted)", marginTop: "3px" }}>
                          {new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit" }).format(new Date(msg.created_at))}
                        </small>
                      </div>
                    );
                  })}
                  {!messages.length && (
                    <div style={{ textAlign: "center", color: "var(--muted)", margin: "auto", fontSize: "13px" }}>
                      No messages yet in this thread. Say hello!
                    </div>
                  )}
                </div>

                {/* Message Input Box */}
                <form
                  onSubmit={handleSendMessage}
                  style={{
                    padding: "12px 16px",
                    borderTop: "1px solid var(--line)",
                    display: "flex",
                    gap: "8px",
                    background: "#ffffff",
                  }}
                >
                  <input
                    type="text"
                    placeholder="Type a message to the student…"
                    value={chatMessageText}
                    onChange={(e) => setChatMessageText(e.target.value)}
                    style={{ flex: 1, height: "40px", padding: "0 14px", borderRadius: "8px", border: "1px solid var(--line)", fontSize: "13.5px" }}
                  />
                  <button
                    className="button primary"
                    type="submit"
                    disabled={sendingMessage || !chatMessageText.trim()}
                    style={{ minHeight: "40px", padding: "0 18px" }}
                  >
                    <Send size={15} />
                    <span>Send</span>
                  </button>
                </form>
              </>
            ) : (
              <div style={{ display: "grid", placeItems: "center", height: "100%", padding: "40px", color: "var(--muted)", textAlign: "center" }}>
                <div>
                  <MessageSquare size={36} style={{ color: "#c7d2fe", marginBottom: "8px" }} />
                  <h3 style={{ fontSize: "16px", margin: "0 0 4px", color: "var(--ink)" }}>No conversation selected</h3>
                  <p style={{ margin: 0, fontSize: "13px" }}>Choose a conversation from the left or start a new message.</p>
                </div>
              </div>
            )}
          </main>
        </div>

        {/* New Message Dialog */}
        {showNewMsgModal && (
          <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) setShowNewMsgModal(false); }}>
            <div className="modal" style={{ maxWidth: "480px" }}>
              <div className="modal-heading">
                <div>
                  <h2>Start New Student Conversation</h2>
                  <p>Send a message directly to any student.</p>
                </div>
                <button type="button" className="quiet-icon" onClick={() => setShowNewMsgModal(false)}><X size={18} /></button>
              </div>

              <form onSubmit={handleStartNewConversation} style={{ marginTop: "16px" }}>
                <label className="form-field">
                  <span>Select Student *</span>
                  <select
                    required
                    value={newMsgStudentId}
                    onChange={(e) => setNewMsgStudentId(e.target.value)}
                  >
                    <option value="">Choose student...</option>
                    {myAssignedStudents.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.full_name || s.email} ({s.email})
                      </option>
                    ))}
                  </select>
                </label>

                <label className="form-field" style={{ marginTop: "12px" }}>
                  <span>Subject / Topic *</span>
                  <input
                    required
                    placeholder="e.g. Question on Homework 2, Project Feedback"
                    value={newMsgSubject}
                    onChange={(e) => setNewMsgSubject(e.target.value)}
                  />
                </label>

                <div className="form-actions" style={{ marginTop: "18px" }}>
                  <button className="button" type="button" onClick={() => setShowNewMsgModal(false)}>Cancel</button>
                  <button className="button primary" disabled={busy}>
                    <Send size={14} /> Start Thread
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ----------------------------------------------------
  // Tab 7: Students Directory
  // ----------------------------------------------------
  function renderStudents() {
    const listToFilter = myAssignedStudents;

    const filteredStudents = listToFilter.filter((s) => {
      if (!query.trim()) return true;
      const q = query.trim().toLowerCase();
      return (s.full_name || "").toLowerCase().includes(q) || (s.email || "").toLowerCase().includes(q);
    });

    return (
      <div className="trainer-students-view">
        <div className="page-heading">
          <div>
            <div className="eyebrow">Student Roster</div>
            <h1>My Assigned Students</h1>
            <p>
              {myAssignedStudents.length} student{myAssignedStudents.length === 1 ? "" : "s"} specifically assigned to your mentorship and training programs.
            </p>
          </div>
        </div>

        <div style={{ display: "flex", gap: "10px", alignItems: "center", marginBottom: "16px" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: "6px", background: "rgba(22, 163, 74, 0.1)", color: "#15803d", padding: "6px 14px", borderRadius: "8px", fontWeight: 700, fontSize: "12.5px" }}>
            <Users size={14} /> My Assigned Students ({myAssignedStudents.length})
          </div>
        </div>

        <div className="card" style={{ padding: "6px" }}>
          <div style={{ overflowX: "auto" }}>
            <table className="admin-table" style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", padding: "12px 16px" }}>Student</th>
                  <th style={{ textAlign: "left", padding: "12px 16px" }}>Student ID</th>
                  <th style={{ textAlign: "left", padding: "12px 16px" }}>Program / Timing</th>
                  <th style={{ textAlign: "left", padding: "12px 16px" }}>Enrolled Courses</th>
                  <th style={{ textAlign: "left", padding: "12px 16px" }}>Assignment Status</th>
                  <th style={{ textAlign: "right", padding: "12px 16px" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredStudents.map((student) => {
                  const studentCourses = enrollments
                    .filter((e) => e.student_id === student.id)
                    .map((e) => coursesById[e.course_id] || { id: e.course_id, code: "COURSE", name: "Enrolled Course" });
                  const isAssigned = myAssignedStudentIds.has(student.id);

                  return (
                    <tr key={student.id} style={{ borderBottom: "1px solid var(--line)", background: isAssigned ? "rgba(240, 253, 244, 0.4)" : undefined }}>
                      <td style={{ padding: "12px 16px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                          <span className="student-avatar" style={{ width: "34px", height: "34px", fontSize: "12px", background: isAssigned ? "#16a34a" : undefined, color: isAssigned ? "#ffffff" : undefined }}>
                            {(student.full_name || student.email || "S").slice(0, 1).toUpperCase()}
                          </span>
                          <div>
                            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                              <strong style={{ fontSize: "13.5px", color: "var(--ink)" }}>
                                {student.full_name || "Student"}
                              </strong>
                              {isAssigned && (
                                <span className="badge green" style={{ fontSize: "10px", padding: "1px 5px" }}>
                                  Assigned
                                </span>
                              )}
                            </div>
                            <small style={{ color: "var(--muted)", fontSize: "12px" }}>{student.email}</small>
                          </div>
                        </div>
                      </td>

                      <td style={{ padding: "12px 16px" }}>
                        <div style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}>
                          <code
                            style={{
                              fontSize: "11px",
                              background: "#f1f5f9",
                              padding: "2px 6px",
                              borderRadius: "4px",
                              color: "#334155",
                              fontFamily: "monospace",
                            }}
                            title={`Full Student ID: ${student.id}`}
                          >
                            {student.id.slice(0, 8)}...
                          </code>
                          <button
                            type="button"
                            className="quiet-icon"
                            style={{ padding: "3px" }}
                            title={`Copy Student ID: ${student.id}`}
                            onClick={() => {
                              navigator.clipboard.writeText(student.id);
                              setToast(`Copied Student ID: ${student.id}`);
                            }}
                          >
                            <Copy size={11} />
                          </button>
                        </div>
                      </td>

                      <td style={{ padding: "12px 16px", fontSize: "13px" }}>
                        {student.timing || "Standard Program"}
                      </td>

                      <td style={{ padding: "12px 16px" }}>
                        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                          {studentCourses.map((c) => (
                            <span
                              key={c.id}
                              className="badge blue"
                              style={{ fontSize: "11px", padding: "2px 6px" }}
                              title={`${c.code} · ${c.name} (${c.schedule || "Regular"})`}
                            >
                              <strong>{c.code}</strong> · {c.name}
                            </span>
                          ))}
                          {!studentCourses.length && <span style={{ color: "var(--muted)", fontSize: "12px" }}>Not enrolled</span>}
                        </div>
                      </td>

                      <td style={{ padding: "12px 16px" }}>
                        {isAssigned ? (
                          <span className="badge green" style={{ fontSize: "11px", display: "inline-flex", alignItems: "center", gap: "3px" }}>
                            <Check size={11} /> Assigned to You
                          </span>
                        ) : (
                          <span className="badge" style={{ fontSize: "11px", color: "var(--muted)" }}>
                            Campus Student
                          </span>
                        )}
                      </td>

                      <td style={{ padding: "12px 16px", textAlign: "right" }}>
                        <div style={{ display: "inline-flex", gap: "6px" }}>
                          <button
                            className="button compact"
                            type="button"
                            onClick={() => {
                              setTaskSelectedStudents([student.id]);
                              setShowTaskForm(true);
                              setActiveTab("Tasks");
                            }}
                            title={`Add note or task individually to ${student.full_name || "this student"}`}
                          >
                            <CheckCircle2 size={12} /> Add Note / Task
                          </button>
                          <button
                            className="button compact"
                            type="button"
                            style={{ background: "#7c3aed", color: "#fff" }}
                            onClick={() => {
                              setSelectedTestToAssign(assessments[0] || null);
                              setTestTargetStudentIds([student.id]);
                              setShowAssignTestModal(true);
                              setActiveTab("Tests");
                            }}
                            title="Assign test to this student"
                          >
                            <ClipboardList size={12} /> Assign Test
                          </button>
                          <button
                            className="button compact"
                            type="button"
                            onClick={() => {
                              setNewMsgStudentId(student.id);
                              setShowNewMsgModal(true);
                              setActiveTab("Messages");
                            }}
                            title="Message student"
                          >
                            <Mail size={12} /> Message
                          </button>
                          <button
                            className="button compact"
                            type="button"
                            onClick={() => setSelectedStudentDetail(student)}
                            title="View student profile & stats"
                          >
                            <Eye size={12} /> Details
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  // ----------------------------------------------------
  // Main Layout
  // ----------------------------------------------------
  return (
    <div className="app-shell trainer-app">
      {mobileNavOpen && (
        <button
          className="mobile-backdrop"
          aria-label="Close navigation"
          onClick={() => setMobileNavOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`sidebar ${mobileNavOpen ? "mobile-open" : ""}`} aria-label="Trainer navigation">
        {mobileNavOpen && (
          <button
            className="drawer-close icon-button"
            type="button"
            aria-label="Close navigation"
            onClick={() => setMobileNavOpen(false)}
          >
            <X size={16} />
          </button>
        )}

        <div className="brand" style={{ cursor: "pointer" }} onClick={() => setActiveTab("Overview")}>
          <span className="brand-mark" style={{ background: "#4338ca", color: "#fff" }}>
            <GraduationCap size={21} />
          </span>
          <span className="brand-copy">
            <strong>LearnForge</strong>
            <small>Trainer Portal</small>
          </span>
        </div>

        <div className="nav-label">Trainer Workspace</div>

        <nav className="side-nav">
          {TRAINER_NAV.map((item) => (
            <button
              key={item.label}
              className={`nav-link ${activeTab === item.label ? "active" : ""}`}
              type="button"
              onClick={() => {
                setActiveTab(item.label);
                setMobileNavOpen(false);
              }}
              aria-current={activeTab === item.label ? "page" : undefined}
            >
              <item.icon className="nav-icon" size={18} />
              <span>{item.label}</span>
              {item.label === "Materials & Drive" && downloadRequests.filter((r) => r.status === "pending").length > 0 && (
                <span className="nav-count">{downloadRequests.filter((r) => r.status === "pending").length}</span>
              )}
            </button>
          ))}
        </nav>

        <div className="sidebar-spacer" />

        <div className="student-support">
          <ShieldCheck size={16} />
          <span>
            <strong>Trainer Authenticated</strong>
            <small>Full instruction privileges</small>
          </span>
        </div>

        <div className="profile">
          <span className="profile-avatar">
            {(profile?.full_name || "TR").slice(0, 2).toUpperCase()}
          </span>
          <span className="profile-copy">
            <strong>{profile?.full_name || user?.email || "Trainer"}</strong>
            <small>Instructor</small>
          </span>
        </div>

        {isAdminPreview ? (
          <button
            className="signout-button"
            type="button"
            onClick={onExitToAdmin || onSignOut}
            title="Return to Admin Workspace"
            style={{ color: "#2563eb", background: "rgba(37, 99, 235, 0.08)", borderColor: "rgba(37, 99, 235, 0.2)" }}
          >
            <ArrowLeft size={15} />
            <span>Back to Admin</span>
          </button>
        ) : onSignOut ? (
          <button className="signout-button" type="button" onClick={onSignOut} title="Sign out">
            <LogOut size={15} />
            <span>Sign out</span>
          </button>
        ) : null}
      </aside>

      {/* Main Content Area */}
      <main className="main-content">
        <header className="topbar">
          <div className="topbar-left">
            <button
              className="mobile-menu icon-button"
              type="button"
              onClick={() => setMobileNavOpen((open) => !open)}
              aria-label="Toggle navigation"
            >
              <Menu size={18} />
            </button>
            <div className="breadcrumb">
              Trainer Portal <span>/</span> <strong>{activeTab}</strong>
            </div>
            {isAdminPreview && (
              <div style={{ display: "inline-flex", alignItems: "center", gap: "8px", marginLeft: "12px" }}>
                <span className="badge blue" style={{ fontSize: "11px", display: "inline-flex", alignItems: "center", gap: "4px" }}>
                  <Shield size={12} /> Admin Mode
                </span>
                {trainersList.length > 0 && (
                  <label style={{ display: "inline-flex", alignItems: "center", gap: "4px", margin: 0 }}>
                    <span style={{ fontSize: "11.5px", color: "var(--muted)", fontWeight: 700 }}>Trainer:</span>
                    <select
                      value={activeTrainerId}
                      onChange={(e) => setSelectedTrainerId(e.target.value)}
                      style={{
                        padding: "2px 8px",
                        borderRadius: "6px",
                        border: "1px solid #93c5fd",
                        background: "#eff6ff",
                        color: "#1e3a8a",
                        fontSize: "12px",
                        fontWeight: 700,
                        height: "28px",
                        cursor: "pointer",
                      }}
                      title="Select trainer to view"
                    >
                      {trainersList.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.full_name || t.email} {t.timing ? `(${t.timing})` : ""}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
            )}
          </div>

          <div className="top-actions">
            <label className="search-box">
              <Search size={15} />
              <input
                type="search"
                placeholder={`Search ${activeTab.toLowerCase()}…`}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>

            <span className="top-avatar" title={user?.email}>
              {(profile?.full_name || "TR").slice(0, 2).toUpperCase()}
            </span>

            {isAdminPreview ? (
              <button
                className="button primary compact"
                type="button"
                onClick={onExitToAdmin || onSignOut}
                title="Return to Admin Workspace"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  fontWeight: 600,
                  fontSize: "12.5px",
                }}
              >
                <ArrowLeft size={13} />
                <span>Back to Admin Dashboard</span>
              </button>
            ) : onSignOut ? (
              <button
                className="button compact"
                type="button"
                onClick={onSignOut}
                title="Sign out of Trainer Portal"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  borderColor: "rgba(239, 68, 68, 0.3)",
                  color: "#dc2626",
                  background: "#fef2f2",
                  fontWeight: 500,
                  fontSize: "12.5px",
                }}
              >
                <LogOut size={13} />
                <span>Sign out</span>
              </button>
            ) : null}
          </div>
        </header>

        <div className="content">
          {error && (
            <div className="portal-alert error" role="alert" style={{ marginBottom: "16px" }}>
              {error}
              <button type="button" onClick={() => setError("")}>Dismiss</button>
            </div>
          )}

          {toast && (
            <div className="portal-alert success" role="status" style={{ marginBottom: "16px" }}>
              <CheckCircle2 size={15} /> {toast}
              <button type="button" onClick={() => setToast("")}>Dismiss</button>
            </div>
          )}

          {loading ? (
            <div className="card portal-loading">Loading trainer dashboard records…</div>
          ) : activeTab === "Attendance" ? (
            renderAttendance()
          ) : activeTab === "Tasks" ? (
            renderTasks()
          ) : activeTab === "Syllabus" ? (
            renderSyllabus()
          ) : activeTab === "Materials & Drive" ? (
            renderMaterialsAndDrive()
          ) : activeTab === "Tests" ? (
            renderTests()
          ) : activeTab === "Messages" ? (
            renderMessages()
          ) : activeTab === "Students" ? (
            renderStudents()
          ) : (
            renderOverview()
          )}
        </div>
      </main>

      {/* Assign Test Modal */}
      {showAssignTestModal && (
        <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) setShowAssignTestModal(false); }}>
          <div className="modal" style={{ maxWidth: "540px" }}>
            <div className="modal-heading">
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <span className="portal-item-icon test" style={{ width: "38px", height: "38px", background: "#f5f3ff", color: "#7c3aed" }}>
                  <ClipboardList size={18} />
                </span>
                <div>
                  <h2>Assign Test to Students</h2>
                  <p>Select which students can access and take this test.</p>
                </div>
              </div>
              <button type="button" className="quiet-icon" onClick={() => setShowAssignTestModal(false)}><X size={18} /></button>
            </div>

            <div style={{ marginTop: "16px" }}>
              <label className="form-field">
                <span>Select Test / Quiz *</span>
                <select
                  value={selectedTestToAssign?.id || ""}
                  onChange={(e) => {
                    const t = assessments.find((a) => a.id === e.target.value);
                    setSelectedTestToAssign(t);
                    if (t) {
                      const currentRecs = assessmentRecipients
                        .filter((r) => r.assessment_id === t.id && myAssignedStudentIds.has(r.student_id))
                        .map((r) => r.student_id);
                      setTestTargetStudentIds(currentRecs.length > 0 ? currentRecs : Array.from(myAssignedStudentIds));
                    }
                  }}
                >
                  {assessments.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.title} {coursesById[a.course_id] ? `(${coursesById[a.course_id].code})` : ""}
                    </option>
                  ))}
                  {!assessments.length && <option value="">No tests available in catalog</option>}
                </select>
              </label>

              {/* Student Selection Checkboxes */}
              <div style={{ marginTop: "14px", padding: "14px", background: "#f8fafc", borderRadius: "10px", border: "1px solid var(--line)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px", flexWrap: "wrap", gap: "8px" }}>
                  <strong style={{ fontSize: "13.5px", color: "var(--ink)", display: "flex", alignItems: "center", gap: "6px" }}>
                    <Users size={16} style={{ color: "#7c3aed" }} />
                    Target Students ({testTargetStudentIds.length} selected) *
                  </strong>
                  <div style={{ display: "flex", gap: "6px" }}>
                    <button
                      type="button"
                      className="button compact"
                      style={{ background: "#ede9fe", color: "#5b21b6", fontWeight: 700 }}
                      onClick={() => setTestTargetStudentIds(Array.from(myAssignedStudentIds))}
                    >
                      Select My Assigned ({myAssignedStudents.length})
                    </button>
                    <button
                      type="button"
                      className="button compact"
                      onClick={() => setTestTargetStudentIds([])}
                    >
                      Clear
                    </button>
                  </div>
                </div>

                <div style={{ maxHeight: "200px", overflowY: "auto", border: "1px solid var(--line)", borderRadius: "6px", background: "#fff", padding: "4px" }}>
                  {myAssignedStudents.map((student) => {
                    const isChecked = testTargetStudentIds.includes(student.id);
                    const isAlreadyAssigned = assessmentRecipients.some(
                      (r) => r.assessment_id === selectedTestToAssign?.id && r.student_id === student.id
                    );

                    return (
                      <label
                        key={student.id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: "8px",
                          padding: "6px 8px",
                          borderRadius: "4px",
                          background: isChecked ? "#f5f3ff" : "#fff",
                          cursor: "pointer",
                          fontSize: "12.5px",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setTestTargetStudentIds((prev) => [...prev, student.id]);
                              } else {
                                setTestTargetStudentIds((prev) => prev.filter((id) => id !== student.id));
                              }
                            }}
                          />
                          <div>
                            <span style={{ fontWeight: 600, color: "var(--ink)" }}>{student.full_name || student.email}</span>
                            <small style={{ color: "var(--muted)", display: "block" }}>{student.email}</small>
                          </div>
                        </div>

                        {isAlreadyAssigned && (
                          <span className="badge green" style={{ fontSize: "10px" }}>Already Assigned</span>
                        )}
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="form-actions" style={{ marginTop: "18px" }}>
                <button className="button" type="button" onClick={() => setShowAssignTestModal(false)}>Cancel</button>
                <button
                  className="button primary"
                  disabled={busy || !selectedTestToAssign}
                  style={{ background: "#7c3aed" }}
                  onClick={() => handleAssignTest(selectedTestToAssign.id, testTargetStudentIds)}
                >
                  <Check size={14} /> {busy ? "Assigning..." : `Save & Grant Test Access (${testTargetStudentIds.length})`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Student Details Modal */}
      {selectedStudentDetail && (
        <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) setSelectedStudentDetail(null); }}>
          <div className="modal" style={{ maxWidth: "620px" }}>
            <div className="modal-heading">
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <span className="student-avatar" style={{ width: "42px", height: "42px", background: "#16a34a", color: "#fff", fontSize: "16px", fontWeight: 700 }}>
                  {(selectedStudentDetail.full_name || selectedStudentDetail.email || "S").slice(0, 1).toUpperCase()}
                </span>
                <div>
                  <h2 style={{ margin: 0 }}>{selectedStudentDetail.full_name || "Student Profile"}</h2>
                  <p style={{ margin: 0 }}>{selectedStudentDetail.email} · {selectedStudentDetail.timing || "Standard Program"}</p>
                </div>
              </div>
              <button type="button" className="quiet-icon" onClick={() => setSelectedStudentDetail(null)}><X size={18} /></button>
            </div>

            <div style={{ marginTop: "16px", display: "flex", flexDirection: "column", gap: "16px" }}>
              {/* IDs and Metadata */}
              <div style={{ padding: "12px", background: "#f8fafc", borderRadius: "8px", border: "1px solid var(--line)", display: "flex", flexWrap: "wrap", gap: "14px" }}>
                <div>
                  <span style={{ fontSize: "11px", color: "var(--muted)", textTransform: "uppercase", display: "block" }}>Student ID</span>
                  <div style={{ display: "inline-flex", alignItems: "center", gap: "5px", marginTop: "2px" }}>
                    <code style={{ fontSize: "11px", background: "#fff", padding: "2px 6px", borderRadius: "4px", border: "1px solid var(--line)" }}>
                      {selectedStudentDetail.id}
                    </code>
                    <button
                      type="button"
                      className="quiet-icon"
                      style={{ padding: "3px" }}
                      title="Copy Student ID"
                      onClick={() => {
                        navigator.clipboard.writeText(selectedStudentDetail.id);
                        setToast(`Copied Student ID: ${selectedStudentDetail.id}`);
                      }}
                    >
                      <Copy size={12} />
                    </button>
                  </div>
                </div>

                <div>
                  <span style={{ fontSize: "11px", color: "var(--muted)", textTransform: "uppercase", display: "block" }}>Program Timing</span>
                  <strong style={{ fontSize: "13px", color: "var(--ink)", display: "block", marginTop: "2px" }}>
                    {selectedStudentDetail.timing || "Standard Program"}
                  </strong>
                </div>

                <div>
                  <span style={{ fontSize: "11px", color: "var(--muted)", textTransform: "uppercase", display: "block" }}>Trainer Status</span>
                  <span className="badge green" style={{ fontSize: "11px", display: "inline-flex", alignItems: "center", gap: "3px", marginTop: "2px" }}>
                    <Check size={11} /> Assigned to You
                  </span>
                </div>
              </div>

              {/* Enrolled Courses */}
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                  <strong style={{ fontSize: "13px", color: "var(--ink)" }}>
                    Enrolled Courses ({enrollments.filter((e) => e.student_id === selectedStudentDetail.id).length})
                  </strong>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  {enrollments
                    .filter((e) => e.student_id === selectedStudentDetail.id)
                    .map((e) => coursesById[e.course_id] || { id: e.course_id, code: "COURSE", name: "Enrolled Course" })
                    .map((c) => (
                      <div key={c.id} style={{ padding: "8px 12px", background: "#f1f5f9", borderRadius: "6px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div>
                          <span className="badge blue" style={{ fontSize: "11px", marginRight: "6px" }}>{c.code}</span>
                          <strong style={{ fontSize: "13px", color: "var(--ink)" }}>{c.name}</strong>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <small style={{ color: "var(--muted)" }}>{c.schedule || "Regular"}</small>
                          <button
                            type="button"
                            className="button compact ghost"
                            style={{ color: "#ef4444", padding: "2px 6px", fontSize: "11px", display: "inline-flex", alignItems: "center", gap: "3px" }}
                            title="Remove student from this course"
                            disabled={enrollBusy}
                            onClick={() => handleTrainerUnenrollCourse(selectedStudentDetail.id, c.id)}
                          >
                            <X size={12} /> Remove
                          </button>
                        </div>
                      </div>
                    ))}
                  {!enrollments.some((e) => e.student_id === selectedStudentDetail.id) && (
                    <span style={{ fontSize: "13px", color: "var(--muted)" }}>Not enrolled in any courses yet.</span>
                  )}
                </div>

                {/* Quick Course Enrollment Selector for Trainers */}
                {courses.filter((c) => !enrollments.some((e) => e.student_id === selectedStudentDetail.id && e.course_id === c.id)).length > 0 && (
                  <div style={{ display: "flex", gap: "8px", marginTop: "10px", alignItems: "center" }}>
                    <select
                      className="form-input"
                      style={{ fontSize: "12px", padding: "6px 10px", flex: 1 }}
                      value={enrollingCourseId}
                      onChange={(e) => setEnrollingCourseId(e.target.value)}
                    >
                      <option value="">Select a course to enroll...</option>
                      {courses
                        .filter((c) => !enrollments.some((e) => e.student_id === selectedStudentDetail.id && e.course_id === c.id))
                        .map((c) => (
                          <option key={c.id} value={c.id}>
                            [{c.code}] {c.name}
                          </option>
                        ))}
                    </select>
                    <button
                      type="button"
                      className="button compact primary"
                      style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}
                      disabled={!enrollingCourseId || enrollBusy}
                      onClick={() => handleTrainerEnrollCourse(selectedStudentDetail.id, enrollingCourseId)}
                    >
                      <Plus size={13} /> {enrollBusy ? "Enrolling..." : "Enroll"}
                    </button>
                  </div>
                )}
              </div>

              {/* Attendance Summary */}
              <div>
                <strong style={{ fontSize: "13px", color: "var(--ink)", display: "block", marginBottom: "8px" }}>
                  Attendance Record Summary
                </strong>
                {(() => {
                  const studentRecords = attendanceRecords.filter((r) => r.student_id === selectedStudentDetail.id);
                  const p = studentRecords.filter((r) => r.status === "Present").length;
                  const l = studentRecords.filter((r) => r.status === "Late").length;
                  const a = studentRecords.filter((r) => r.status === "Absent").length;
                  const total = studentRecords.length;
                  const pct = total ? Math.round(((p + l * 0.5) / total) * 100) : 100;

                  return (
                    <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                      <span className="badge green">Present: {p}</span>
                      <span className="badge amber">Late: {l}</span>
                      <span className="badge rose">Absent: {a}</span>
                      <span className="badge blue">Overall: {pct}% Rate ({total} total check-ins)</span>
                    </div>
                  );
                })()}
              </div>

              {/* Quick Actions */}
              <div style={{ display: "flex", gap: "8px", borderTop: "1px solid var(--line)", paddingTop: "14px", marginTop: "4px" }}>
                <button
                  className="button primary"
                  type="button"
                  onClick={() => {
                    setTaskSelectedStudents([selectedStudentDetail.id]);
                    setShowTaskForm(true);
                    setSelectedStudentDetail(null);
                    setActiveTab("Tasks");
                  }}
                  title="Add note or task individually to this student"
                >
                  <CheckCircle2 size={13} /> Add Note / Task
                </button>

                <button
                  className="button primary"
                  type="button"
                  style={{ background: "#7c3aed" }}
                  onClick={() => {
                    setSelectedTestToAssign(assessments[0] || null);
                    setTestTargetStudentIds([selectedStudentDetail.id]);
                    setShowAssignTestModal(true);
                    setSelectedStudentDetail(null);
                    setActiveTab("Tests");
                  }}
                >
                  <ClipboardList size={13} /> Assign Test
                </button>

                <button
                  className="button"
                  type="button"
                  onClick={() => {
                    setNewMsgStudentId(selectedStudentDetail.id);
                    setShowNewMsgModal(true);
                    setSelectedStudentDetail(null);
                    setActiveTab("Messages");
                  }}
                >
                  <Mail size={13} /> Message
                </button>

                <button
                  className="button"
                  type="button"
                  onClick={() => setSelectedStudentDetail(null)}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Document Viewer Modal */}
      {viewingDoc && (
        <SecureDocumentViewer
          title={viewingDoc.title}
          subtitle={viewingDoc.subtitle}
          url={viewingDoc.url}
          filePath={viewingDoc.filePath}
          userEmail={user?.email}
          isSuperuser={false}
          isTrainer={true}
          downloadStatus="approved"
          onClose={() => setViewingDoc(null)}
          onDownload={() => {
            if (viewingDoc.url) {
              const dl = getDriveDownloadExportUrl(viewingDoc.url);
              window.open(dl, "_blank");
            }
          }}
        />
      )}
    </div>
  );
}

