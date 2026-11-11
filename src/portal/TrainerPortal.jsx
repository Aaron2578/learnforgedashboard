import React, { Suspense, lazy, useState, useEffect, useMemo, useCallback, useRef } from "react";
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
  Code2,
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
  Award,
  BarChart3,
} from "lucide-react";
import SecureDocumentViewer from "../components/SecureDocumentViewer";
import EditMaterialModal from "../components/EditMaterialModal";
import { extractDriveUrl, cleanNoteBody, getDriveDocTypeLabel, getDriveDownloadExportUrl } from "../lib/driveUtils.js";
import { isHolidayRecord, normalizeAttendanceStatus, cleanAttendanceNote, insertAttendanceWithFallback } from "../lib/attendanceUtils.js";
import { getCourseLabRecommendations, isItCourse } from "../lib/courseUtils.js";

const OnlineCompiler = lazy(() => import("../components/OnlineCompiler.jsx"));

const TRAINER_NAV = [
  { label: "Overview", icon: LayoutDashboard },
  { label: "Notes", icon: FileText },
  { label: "Assignments", icon: BookOpen },
  { label: "Attendance", icon: CalendarCheck },
  { label: "Tests", icon: ClipboardList },
  { label: "Gradebook", icon: BarChart3 },
  { label: "Syllabus", icon: GraduationCap },
  { label: "Code Lab", icon: Code2 },
  { label: "Materials & Drive", icon: HardDrive },
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

function formatDateTime(val, fallback = "Submitted") {
  if (!val) return fallback;
  try {
    const d = new Date(val);
    if (isNaN(d.getTime())) return fallback;
    return new Intl.DateTimeFormat("en", { dateStyle: "short", timeStyle: "short" }).format(d);
  } catch {
    return fallback;
  }
}

function formatDateMedium(val, fallback = "Open deadline") {
  if (!val) return fallback;
  try {
    const d = new Date(val);
    if (isNaN(d.getTime())) return fallback;
    return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(d);
  } catch {
    return fallback;
  }
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

  // Assignments State
  const [assignments, setAssignments] = useState([]);
  const [assignmentSubmissions, setAssignmentSubmissions] = useState([]);
  const [assignmentRecipients, setAssignmentRecipients] = useState([]);
  const [showAssignmentModal, setShowAssignmentModal] = useState(false);
  const [editingAssignment, setEditingAssignment] = useState(null);
  const [assignmentTitle, setAssignmentTitle] = useState("");
  const [assignmentDesc, setAssignmentDesc] = useState("");
  const [assignmentCourseId, setAssignmentCourseId] = useState("");
  const [assignmentDueDate, setAssignmentDueDate] = useState("");
  const [assignmentTotalMarks, setAssignmentTotalMarks] = useState(100);
  const [assignmentTargetStudentIds, setAssignmentTargetStudentIds] = useState([]);
  const [assignmentCourseFilter, setAssignmentCourseFilter] = useState("all");
  const [showSubmissionsModal, setShowSubmissionsModal] = useState(false);
  const [selectedAssignmentForSubmissions, setSelectedAssignmentForSubmissions] = useState(null);
  const [gradingState, setGradingState] = useState({});
  const [savingGradeId, setSavingGradeId] = useState(null);
  const [showAssignAssignmentModal, setShowAssignAssignmentModal] = useState(false);
  const [selectedAssignmentToAssign, setSelectedAssignmentToAssign] = useState(null);
  const [assignmentAssignTargetStudentIds, setAssignmentAssignTargetStudentIds] = useState([]);

  // Notes Modal State
  const [editingNote, setEditingNote] = useState(null);
  const [noteDriveUrl, setNoteDriveUrl] = useState("");
  const [showShareNoteModal, setShowShareNoteModal] = useState(false);
  const [selectedNoteToShare, setSelectedNoteToShare] = useState(null);
  const [noteShareTargetStudentIds, setNoteShareTargetStudentIds] = useState([]);

  // Tests & Assessments State
  const [assessments, setAssessments] = useState([]);
  const [assessmentRecipients, setAssessmentRecipients] = useState([]);
  const [assessmentAttempts, setAssessmentAttempts] = useState([]);
  const [showAssignTestModal, setShowAssignTestModal] = useState(false);
  const [showCreateTestModal, setShowCreateTestModal] = useState(false);
  const [selectedTestToAssign, setSelectedTestToAssign] = useState(null);
  const [testTargetStudentIds, setTestTargetStudentIds] = useState([]);
  const [testTitle, setTestTitle] = useState("");
  const [testDescription, setTestDescription] = useState("");
  const [testCourseId, setTestCourseId] = useState("");
  const [testTotalMarks, setTestTotalMarks] = useState(100);
  const [testDuration, setTestDuration] = useState(60);
  const [testExternalUrl, setTestExternalUrl] = useState("");

  // Gradebook State
  const [gradebookCourseFilter, setGradebookCourseFilter] = useState("all");
  const [gradebookSearch, setGradebookSearch] = useState("");

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
  const [editingMaterial, setEditingMaterial] = useState(null);
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
        assignmentsRes,
        assignmentSubmissionsRes,
        assignmentRecipientsRes,
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
        supabase.from("assignments").select("*").order("created_at", { ascending: false }).then((r) => r.error ? { data: [] } : r),
        supabase.from("assignment_submissions").select("*").order("submitted_at", { ascending: false }).then((r) => r.error ? { data: [] } : r),
        supabase.from("assignment_recipients").select("*").then((r) => r.error ? { data: [] } : r),
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
      setAssignments(assignmentsRes.data || []);
      setAssignmentSubmissions(assignmentSubmissionsRes.data || []);
      setAssignmentRecipients(assignmentRecipientsRes.data || []);
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
      .on("postgres_changes", { event: "*", schema: "public", table: "assignments" }, debouncedTrainerReload)
      .on("postgres_changes", { event: "*", schema: "public", table: "assignment_submissions" }, debouncedTrainerReload)
      .on("postgres_changes", { event: "*", schema: "public", table: "assignment_recipients" }, debouncedTrainerReload)
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

  // Quick Mappings
  const coursesById = useMemo(() => Object.fromEntries(courses.map((c) => [c.id, c])), [courses]);
  const studentsById = useMemo(() => Object.fromEntries(students.map((s) => [s.id, s])), [students]);

  const activeTrainerId = isAdminPreview ? (selectedTrainerId || trainersList[0]?.id || user?.id) : (user?.id || profile?.id);

  const activeTrainer = useMemo(() => {
    if (isAdminPreview) {
      return (
        trainersList.find((t) => t.id === activeTrainerId) ||
        (trainersList.length > 0 ? trainersList[0] : null)
      );
    }
    return (
      (profile && profile.id === activeTrainerId ? profile : null) ||
      trainersList.find((t) => t.id === activeTrainerId) ||
      profile ||
      (user ? { id: user.id, email: user.email, full_name: user.user_metadata?.full_name } : null)
    );
  }, [isAdminPreview, trainersList, activeTrainerId, profile, user]);

  // Courses strictly taught by this trainer
  const myTrainerCourses = useMemo(() => {
    if (!activeTrainerId) return [];
    const trainerName = (activeTrainer?.full_name || "").toLowerCase().trim();
    const trainerEmail = (activeTrainer?.email || "").toLowerCase().trim();

    return courses.filter((c) => {
      // 1. Explicit trainer_id match
      if (c.trainer_id) {
        return c.trainer_id === activeTrainerId;
      }
      // 2. Instructor text match
      const inst = (c.instructor || "").toLowerCase().trim();
      if (!inst) return false;
      if (trainerName && (inst === trainerName || inst.includes(trainerName) || trainerName.includes(inst))) return true;
      if (trainerEmail && (inst === trainerEmail || inst.includes(trainerEmail))) return true;
      return false;
    });
  }, [courses, activeTrainerId, activeTrainer]);

  const myTrainerCourseIds = useMemo(() => new Set(myTrainerCourses.map((c) => c.id)), [myTrainerCourses]);
  const trainerItCourses = useMemo(() => myTrainerCourses.filter(isItCourse), [myTrainerCourses]);
  const trainerHasItLab = trainerItCourses.length > 0 || myTrainerCourses.length === 0;
  const trainerRecommendedModes = useMemo(
    () => getCourseLabRecommendations(trainerItCourses),
    [trainerItCourses]
  );
  const visibleTrainerNav = useMemo(
    () => (trainerHasItLab ? TRAINER_NAV : TRAINER_NAV.filter((item) => item.label !== "Code Lab")),
    [trainerHasItLab]
  );

  // Synchronize course dropdown selections when active trainer changes
  useEffect(() => {
    if (attendanceCourseId !== "all" && !myTrainerCourseIds.has(attendanceCourseId)) {
      setAttendanceCourseId("all");
    }
  }, [attendanceCourseId, myTrainerCourseIds]);

  useEffect(() => {
    if (taskCourseId && !myTrainerCourseIds.has(taskCourseId)) {
      setTaskCourseId("");
    }
  }, [taskCourseId, myTrainerCourseIds]);

  useEffect(() => {
    if (syllabusCourseId && !myTrainerCourseIds.has(syllabusCourseId)) {
      setSyllabusCourseId(myTrainerCourses[0]?.id || "");
    }
  }, [syllabusCourseId, myTrainerCourseIds, myTrainerCourses]);

  useEffect(() => {
    if (matCourseId && !myTrainerCourseIds.has(matCourseId)) {
      setMatCourseId("");
    }
  }, [matCourseId, myTrainerCourseIds]);

  // Students strictly assigned to this trainer (or in their courses, without conflicting trainer)
  const myAssignedStudentIds = useMemo(() => {
    const ids = new Set();
    const targetId = activeTrainerId;
    if (!targetId) return ids;

    // 1. Explicit assignments in trainer_students
    for (const ts of trainerStudents) {
      if (ts.trainer_id === targetId) ids.add(ts.student_id);
    }
    // 2. Explicit assignments in profiles.trainer_id
    for (const s of students) {
      if (s.trainer_id === targetId) ids.add(s.id);
    }
    // 3. Students enrolled in courses taught by this trainer
    for (const e of enrollments) {
      if (myTrainerCourseIds.has(e.course_id)) {
        const s = studentsById[e.student_id];
        // Only include if student does not belong to another trainer
        if (!s?.trainer_id || s.trainer_id === targetId) {
          ids.add(e.student_id);
        }
      }
    }
    // Strictly exclude any student assigned to a different trainer
    for (const s of students) {
      if (s.trainer_id && s.trainer_id !== targetId) {
        ids.delete(s.id);
      }
    }
    return ids;
  }, [trainerStudents, students, enrollments, myTrainerCourseIds, activeTrainerId, studentsById]);

  const myAssignedStudents = useMemo(() => {
    return students.filter((s) => myAssignedStudentIds.has(s.id));
  }, [students, myAssignedStudentIds]);

  // Assessments for this trainer's courses or created by this trainer
  const myTrainerAssessments = useMemo(() => {
    return assessments.filter((a) => myTrainerCourseIds.has(a.course_id) || a.created_by === activeTrainerId);
  }, [assessments, myTrainerCourseIds, activeTrainerId]);

  // Assignments strictly for this trainer's courses or created by this trainer
  const myTrainerAssignments = useMemo(() => {
    return assignments.filter((a) =>
      a.trainer_id === activeTrainerId ||
      a.created_by === activeTrainerId ||
      myTrainerCourseIds.has(a.course_id)
    );
  }, [assignments, activeTrainerId, myTrainerCourseIds]);

  const myTrainerAssignmentIds = useMemo(() => new Set(myTrainerAssignments.map((a) => a.id)), [myTrainerAssignments]);

  // Submissions for trainer's assignments or from assigned students
  const myTrainerSubmissions = useMemo(() => {
    return assignmentSubmissions.filter((s) =>
      myTrainerAssignmentIds.has(s.assignment_id) || myAssignedStudentIds.has(s.student_id)
    );
  }, [assignmentSubmissions, myTrainerAssignmentIds, myAssignedStudentIds]);

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
      const norm = normalizeAttendanceStatus(r);
      const titleCase = norm === "present" ? "Present" : norm === "late" ? "Late" : norm === "absent" ? "Absent" : "Holiday";
      stateMap[r.student_id] = { status: titleCase, note: cleanAttendanceNote(r.note) };
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
            status: (entry.status || "present").toLowerCase(),
            note: entry.note || "",
            created_by: user.id,
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

      // Lightning-fast batch delete + batch insert with automatic holiday fallback
      const studentIds = recordsToUpsert.map((r) => r.student_id);
      await supabase
        .from("attendance_records")
        .delete()
        .in("student_id", studentIds)
        .eq("attendance_date", attendanceDate);

      await insertAttendanceWithFallback(supabase, recordsToUpsert);

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
  // Actions: Notes & Tasks
  // ----------------------------------------------------
  async function handleCreateTask(e) {
    e.preventDefault();
    if (!taskTitle.trim()) {
      setError("Note / task title is required.");
      return;
    }
    if (taskSelectedStudents.length === 0) {
      setError("Select at least one student to assign this note.");
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
        body: taskInstructions.trim() || "Course notes and materials.",
        drive_url: noteDriveUrl.trim() || null,
        status: "assigned",
        category: taskCategory || "Class Notes",
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
          body: taskInstructions.trim() || "Course notes and materials.",
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
      setNoteDriveUrl("");
      setTaskDueAt("");
      setTaskSelectedStudents([]);
      loadTrainerData(false);
    } catch (err) {
      setError(err.message || "Failed to assign note.");
    } finally {
      setBusy(false);
    }
  }

  async function handleUpdateNote(e) {
    e.preventDefault();
    if (!editingNote || !editingNote.title?.trim()) {
      setError("Note title is required.");
      return;
    }
    setBusy(true);
    try {
      const dueIso = editingNote.due_at ? new Date(editingNote.due_at).toISOString() : null;
      const { error: updateErr } = await supabase
        .from("student_notes")
        .update({
          title: editingNote.title.trim(),
          body: editingNote.body?.trim() || "",
          drive_url: editingNote.drive_url?.trim() || null,
          category: editingNote.category || "Class Notes",
          course_id: editingNote.course_id || null,
          due_at: dueIso,
          updated_at: new Date().toISOString(),
        })
        .eq("id", editingNote.id);

      if (updateErr) throw updateErr;

      setTasks((prev) =>
        prev.map((t) => (t.id === editingNote.id ? { ...t, ...editingNote, due_at: dueIso } : t))
      );
      setToast("Note updated successfully!");
      setEditingNote(null);
    } catch (err) {
      setError("Failed to update note: " + err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleToggleTaskStatus(task) {
    const nextStatus = task.status === "completed" ? "assigned" : "completed";
    try {
      await supabase.from("student_notes").update({ status: nextStatus }).eq("id", task.id);
      setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, status: nextStatus } : t)));
      setToast(nextStatus === "completed" ? "Marked as completed!" : "Marked as assigned.");
    } catch (err) {
      setError("Could not update status: " + err.message);
    }
  }

  async function handleDeleteTask(taskId) {
    if (!window.confirm("Delete this note / task?")) return;
    try {
      await supabase.from("student_notes").delete().eq("id", taskId);
      setTasks((prev) => prev.filter((t) => t.id !== taskId));
      setToast("Note removed.");
    } catch (err) {
      setError(err.message);
    }
  }
  const handleDeleteNote = handleDeleteTask;

  // ----------------------------------------------------
  // Actions: Assignments & Submissions
  // ----------------------------------------------------
  async function handleSaveAssignment(e) {
    e.preventDefault();
    if (!assignmentTitle.trim()) {
      setError("Assignment title is required.");
      return;
    }
    setBusy(true);
    setError("");

    try {
      const dueIso = assignmentDueDate ? new Date(assignmentDueDate).toISOString() : null;
      const targetStudents = assignmentTargetStudentIds.length > 0 
        ? assignmentTargetStudentIds 
        : Array.from(myAssignedStudentIds);

      if (editingAssignment) {
        const { error: updateErr } = await supabase
          .from("assignments")
          .update({
            title: assignmentTitle.trim(),
            description: assignmentDesc.trim(),
            course_id: assignmentCourseId || null,
            total_marks: Number(assignmentTotalMarks) || 100,
            due_at: dueIso,
          })
          .eq("id", editingAssignment.id);

        if (updateErr) throw updateErr;

        if (targetStudents.length > 0) {
          await supabase.from("assignment_recipients").delete().eq("assignment_id", editingAssignment.id);
          await supabase.from("assignment_recipients").insert(
            targetStudents.map((sid) => ({
              assignment_id: editingAssignment.id,
              student_id: sid,
            }))
          );
        }

        setToast("Assignment updated successfully!");
      } else {
        const { data: newAssign, error: insertErr } = await supabase
          .from("assignments")
          .insert({
            title: assignmentTitle.trim(),
            description: assignmentDesc.trim(),
            course_id: assignmentCourseId || null,
            trainer_id: activeTrainerId,
            total_marks: Number(assignmentTotalMarks) || 100,
            due_at: dueIso,
            published: true,
            created_by: user.id,
          })
          .select()
          .single();

        if (insertErr) throw insertErr;

        if (newAssign && targetStudents.length > 0) {
          await supabase.from("assignment_recipients").insert(
            targetStudents.map((sid) => ({
              assignment_id: newAssign.id,
              student_id: sid,
            }))
          );
        }

        setToast(`Assignment "${assignmentTitle}" posted and assigned to ${targetStudents.length} student(s)!`);
      }

      setShowAssignmentModal(false);
      setEditingAssignment(null);
      setAssignmentTitle("");
      setAssignmentDesc("");
      setAssignmentCourseId("");
      setAssignmentDueDate("");
      setAssignmentTotalMarks(100);
      setAssignmentTargetStudentIds([]);
      loadTrainerData(false);
    } catch (err) {
      setError(err.message || "Failed to save assignment.");
    } finally {
      setBusy(false);
    }
  }

  async function handleAssignAssignmentToStudents(assignmentId, targetStudentIds) {
    if (!targetStudentIds || targetStudentIds.length === 0) {
      setError("Please select at least one student to assign this assignment.");
      return;
    }
    setBusy(true);
    setError("");

    try {
      const records = targetStudentIds.map((sid) => ({
        assignment_id: assignmentId,
        student_id: sid,
      }));

      // Optimistic update
      setAssignmentRecipients((prev) => {
        const remaining = prev.filter((r) => r.assignment_id !== assignmentId);
        return [...remaining, ...records];
      });

      // Clear existing recipients and insert updated list
      await supabase.from("assignment_recipients").delete().eq("assignment_id", assignmentId);
      const { error: insErr } = await supabase.from("assignment_recipients").insert(records);
      if (insErr) throw insErr;

      const assignTitle = selectedAssignmentToAssign?.title || "Assignment";
      setToast(`Assignment "${assignTitle}" successfully assigned to ${targetStudentIds.length} student(s)!`);
      setShowAssignAssignmentModal(false);
      setSelectedAssignmentToAssign(null);
      setAssignmentAssignTargetStudentIds([]);
      loadTrainerData(false);
    } catch (err) {
      setError("Failed to assign assignment: " + err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleShareNoteWithStudents(noteRecord, targetStudentIds) {
    if (!targetStudentIds || targetStudentIds.length === 0) {
      setError("Please select at least one student to assign this note.");
      return;
    }
    setBusy(true);
    setError("");

    try {
      const payloads = targetStudentIds.map((sid) => ({
        student_id: sid,
        course_id: noteRecord.course_id || null,
        title: noteRecord.title,
        body: noteRecord.body,
        drive_url: noteRecord.drive_url || null,
        status: "assigned",
        category: noteRecord.category || "Class Notes",
        due_at: noteRecord.due_at || null,
        material_id: noteRecord.material_id || null,
        created_by: user.id,
      }));

      const { error: insErr } = await supabase.from("student_notes").insert(payloads);
      if (insErr) {
        // Fallback for older schemas
        const fallback = targetStudentIds.map((sid) => ({
          student_id: sid,
          course_id: noteRecord.course_id || null,
          title: noteRecord.title,
          body: noteRecord.body,
          created_by: user.id,
        }));
        const retry = await supabase.from("student_notes").insert(fallback);
        if (retry.error) throw retry.error;
      }

      setToast(`Note "${noteRecord.title}" successfully assigned to ${targetStudentIds.length} student(s)!`);
      setShowShareNoteModal(false);
      setSelectedNoteToShare(null);
      setNoteShareTargetStudentIds([]);
      loadTrainerData(false);
    } catch (err) {
      setError("Failed to assign note: " + err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteAssignment(assignmentId) {
    if (!window.confirm("Delete this assignment? All student submissions for it will also be removed.")) return;
    try {
      await supabase.from("assignments").delete().eq("id", assignmentId);
      setAssignments((prev) => prev.filter((a) => a.id !== assignmentId));
      if (selectedAssignmentForSubmissions?.id === assignmentId) {
        setShowSubmissionsModal(false);
        setSelectedAssignmentForSubmissions(null);
      }
      if (editingAssignment?.id === assignmentId) {
        setShowAssignmentModal(false);
        setEditingAssignment(null);
      }
      setToast("Assignment removed.");
    } catch (err) {
      setError("Could not delete assignment: " + err.message);
    }
  }

  async function handleSaveGrade(assignmentId, studentId, existingSubmissionId, maxScore = 100) {
    const curKey = existingSubmissionId || `${assignmentId}-${studentId}`;
    const cur = gradingState[curKey] || {};
    const gradeVal = cur.grade !== undefined && cur.grade !== "" ? Number(cur.grade) : null;
    const feedbackVal = (cur.feedback || "").trim();

    if (gradeVal !== null && (isNaN(gradeVal) || gradeVal < 0 || gradeVal > maxScore)) {
      setError(`Grade must be between 0 and ${maxScore}.`);
      return;
    }

    setSavingGradeId(curKey);
    setError("");
    try {
      const payload = {
        assignment_id: assignmentId,
        student_id: studentId,
        grade: gradeVal,
        feedback: feedbackVal || null,
        graded_at: new Date().toISOString(),
        answer_text: cur.answer_text || "Trainer Evaluation",
        status: "Completed",
        submitted_at: cur.submitted_at || new Date().toISOString(),
      };
      if (existingSubmissionId) {
        payload.id = existingSubmissionId;
      }

      const { data: savedSub, error: gradeErr } = await supabase
        .from("assignment_submissions")
        .upsert(payload, { onConflict: "assignment_id,student_id" })
        .select()
        .single();

      if (gradeErr) throw gradeErr;

      setAssignmentSubmissions((prev) => {
        const idx = prev.findIndex((s) => s.assignment_id === assignmentId && s.student_id === studentId);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = { ...next[idx], ...savedSub, grade: gradeVal, feedback: feedbackVal, graded_at: new Date().toISOString() };
          return next;
        }
        return [savedSub, ...prev];
      });
      setToast("Grade and feedback saved successfully!");
    } catch (err) {
      setError("Failed to save grade: " + err.message);
    } finally {
      setSavingGradeId(null);
    }
  }

  async function handleDeleteMaterial(mat) {
    if (!mat) return;
    if (!window.confirm(`Delete "${mat.title}"? This will remove student access and cannot be undone.`)) return;
    setBusy(true);
    setError("");
    try {
      if (mat.file_path && !mat.file_path.startsWith("data:")) {
        let bucket = "course-materials";
        let cleanPath = mat.file_path;
        if (mat.file_path.startsWith("course-materials:")) {
          cleanPath = mat.file_path.replace("course-materials:", "");
        } else if (mat.file_path.startsWith("assignment-files:")) {
          bucket = "assignment-files";
          cleanPath = mat.file_path.replace("assignment-files:", "");
        }
        try {
          await supabase.storage.from(bucket).remove([cleanPath]);
        } catch (stErr) {
          console.warn("Storage deletion warning:", stErr);
        }
      }

      const { error: delErr } = await supabase.from("course_materials").delete().eq("id", mat.id);
      if (delErr) throw delErr;

      setMaterials((prev) => prev.filter((m) => m.id !== mat.id));
      setToast(`"${mat.title}" deleted successfully.`);
    } catch (err) {
      setError("Could not delete material: " + err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleUpdateMaterial(materialId, form) {
    setBusy(true);
    setError("");
    try {
      const payload = {
        title: form.title.trim(),
        description: form.description?.trim() || "",
        category: form.category || "Class Notes",
        course_id: form.courseId || null,
        drive_url: form.driveUrl?.trim() || null,
      };
      const { error: updErr } = await supabase.from("course_materials").update(payload).eq("id", materialId);
      if (updErr) throw updErr;

      setMaterials((prev) => prev.map((m) => (m.id === materialId ? { ...m, ...payload } : m)));
      setEditingMaterial(null);
      setToast("Material updated successfully.");
    } catch (err) {
      setError("Failed to update material: " + err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleDownloadSubmissionFile(filePath) {
    try {
      let cleanPath = filePath;
      if (filePath.startsWith("assignment-files:")) {
        cleanPath = filePath.replace("assignment-files:", "");
      }
      const { data, error } = await supabase.storage.from("assignment-files").createSignedUrl(cleanPath, 3600);
      if (error) throw error;
      if (data?.signedUrl) {
        window.open(data.signedUrl, "_blank", "noopener,noreferrer");
      }
    } catch (err) {
      setError("Could not open student submission file: " + err.message);
    }
  }

  async function handleDeleteStudentSubmissionFile(sub) {
    if (!sub?.file_path) return;
    if (!window.confirm("Delete this student's uploaded file? The file will be permanently removed from cloud storage.")) return;
    setBusy(true);
    setError("");
    try {
      let cleanPath = sub.file_path;
      if (cleanPath.startsWith("assignment-files:")) {
        cleanPath = cleanPath.replace("assignment-files:", "");
      }
      try {
        await supabase.storage.from("assignment-files").remove([cleanPath]);
      } catch (stErr) {
        console.warn("Storage removal warning:", stErr);
      }
      const hasOtherContent = Boolean(sub.submission_link || (sub.answer_text && sub.answer_text.trim()));
      const updatePayload = {
        file_path: null,
        answer_text: hasOtherContent ? sub.answer_text : "(File removed by trainer)",
      };
      const { error: dbErr } = await supabase
        .from("assignment_submissions")
        .update(updatePayload)
        .eq("id", sub.id);

      if (dbErr) throw dbErr;

      setAssignmentSubmissions((prev) =>
        prev.map((s) => (s.id === sub.id ? { ...s, ...updatePayload } : s))
      );
      setToast("Student uploaded file deleted manually.");
    } catch (err) {
      setError("Could not delete student file: " + err.message);
    } finally {
      setBusy(false);
    }
  }

  // ----------------------------------------------------
  // Actions: Tests & Quizzes
  // ----------------------------------------------------
  async function handleCreateTest(e) {
    e.preventDefault();
    if (!testTitle.trim()) {
      setError("Test title is required.");
      return;
    }
    setBusy(true);
    setError("");

    try {
      const targetStudents = testTargetStudentIds.length > 0 
        ? testTargetStudentIds 
        : Array.from(myAssignedStudentIds);

      const { data: newTest, error: testErr } = await supabase
        .from("assessments")
        .insert({
          title: testTitle.trim(),
          description: testDescription.trim(),
          course_id: testCourseId || null,
          trainer_id: activeTrainerId,
          total_marks: Number(testTotalMarks) || 100,
          duration_minutes: Number(testDuration) || 60,
          external_url: testExternalUrl.trim() || null,
          published: true,
          created_by: user.id,
        })
        .select()
        .single();

      if (testErr) throw testErr;

      if (newTest && targetStudents.length > 0) {
        await supabase.from("assessment_recipients").insert(
          targetStudents.map((sid) => ({
            assessment_id: newTest.id,
            student_id: sid,
          }))
        );
      }

      setToast(`Test "${testTitle}" created and assigned to ${targetStudents.length} student(s)!`);
      setShowCreateTestModal(false);
      setTestTitle("");
      setTestDescription("");
      setTestCourseId("");
      setTestTotalMarks(100);
      setTestDuration(60);
      setTestExternalUrl("");
      setTestTargetStudentIds([]);
      loadTrainerData(false);
    } catch (err) {
      setError(err.message || "Failed to create test.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteTest(testId) {
    if (!window.confirm("Delete this test? Any student attempts will also be removed.")) return;
    try {
      await supabase.from("assessments").delete().eq("id", testId);
      setAssessments((prev) => prev.filter((a) => a.id !== testId));
      setToast("Test deleted successfully.");
    } catch (err) {
      setError("Could not delete test: " + err.message);
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
      const { data: sentMsg, error: sendError } = await supabase.from("messages").insert({
        conversation_id: selectedConversationId,
        sender_id: user.id,
        body: chatMessageText.trim(),
      }).select().single();

      if (sendError) throw sendError;
      if (sentMsg) {
        setMessages((prev) => (prev.some((m) => m.id === sentMsg.id) ? prev : [...prev, sentMsg]));
      }
      setChatMessageText("");
      setTimeout(() => {
        if (chatScrollRef.current) {
          chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
        }
      }, 50);
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
    const todayAttendanceCount = attendanceRecords.filter((r) => r.attendance_date === todayStr && myAssignedStudentIds.has(r.student_id)).length;
    const allMyAtt = attendanceRecords.filter((r) => myAssignedStudentIds.has(r.student_id));
    const attPresent = allMyAtt.filter((r) => normalizeAttendanceStatus(r) === "present").length;
    const attLate = allMyAtt.filter((r) => normalizeAttendanceStatus(r) === "late").length;
    const attWorkingDays = allMyAtt.filter((r) => {
      const s = normalizeAttendanceStatus(r);
      return s === "present" || s === "late" || s === "absent";
    }).length;
    const overallAttRate = attWorkingDays > 0 ? Math.round(((attPresent + attLate * 0.5) / attWorkingDays) * 100) : 100;

    const myTasks = tasks.filter((t) => myAssignedStudentIds.has(t.student_id) || t.created_by === activeTrainerId);
    const activeAssignments = myTrainerAssignments;
    const submissions = myTrainerSubmissions;
    const pendingGrading = submissions.filter((s) => s.grade === null || s.grade === undefined);
    const myAttempts = assessmentAttempts.filter((att) => myAssignedStudentIds.has(att.student_id));
    const pendingRequestsCount = downloadRequests.filter((r) => r.status === "pending" && myAssignedStudentIds.has(r.student_id)).length;

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
                Welcome back, {(isAdminPreview ? activeTrainer?.full_name : profile?.full_name) || "Trainer"}!
              </h1>
              <p style={{ margin: 0, color: "#c7d2fe", fontSize: "14px", maxWidth: "600px" }}>
                Manage attendance check-ins, create coursework assignments, post learning notes, and monitor student evaluations in real time.
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
                  setEditingAssignment(null);
                  setAssignmentTitle("");
                  setAssignmentDesc("");
                  setAssignmentCourseId(myTrainerCourses[0]?.id || "");
                  setAssignmentDueDate("");
                  setAssignmentTotalMarks(100);
                  setAssignmentTargetStudentIds(Array.from(myAssignedStudentIds));
                  setShowAssignmentModal(true);
                  setActiveTab("Assignments");
                }}
              >
                <BookOpen size={15} /> Create Assignment
              </button>
              <button
                className="button"
                style={{ background: "rgba(255, 255, 255, 0.15)", color: "#ffffff", border: "1px solid rgba(255, 255, 255, 0.25)" }}
                type="button"
                onClick={() => setActiveTab("Gradebook")}
              >
                <BarChart3 size={15} /> Gradebook
              </button>
            </div>
          </div>
        </section>

        {/* Metric Cards - Role Specific Summary */}
        <section className="metrics student-metrics" style={{ marginBottom: "24px" }}>
          <article className="card metric-card" style={{ cursor: "pointer" }} onClick={() => setActiveTab("Attendance")}>
            <div className="metric-top">
              <span>Class Attendance</span>
              <span className="metric-icon green"><CalendarCheck size={17} /></span>
            </div>
            <strong>{overallAttRate}%</strong>
            <small>{todayAttendanceCount} check-in{todayAttendanceCount === 1 ? "" : "s"} today</small>
          </article>

          <article className="card metric-card" style={{ cursor: "pointer" }} onClick={() => setActiveTab("Assignments")}>
            <div className="metric-top">
              <span>Active Assignments</span>
              <span className="metric-icon blue"><BookOpen size={17} /></span>
            </div>
            <strong>{activeAssignments.length}</strong>
            <small>{pendingGrading.length} pending review</small>
          </article>

          <article className="card metric-card" style={{ cursor: "pointer" }} onClick={() => setActiveTab("Tests")}>
            <div className="metric-top">
              <span>Tests &amp; Evaluations</span>
              <span className="metric-icon purple"><ClipboardList size={17} /></span>
            </div>
            <strong>{myTrainerAssessments.length}</strong>
            <small>{myAttempts.length} completed attempts</small>
          </article>

          <article className="card metric-card" style={{ cursor: "pointer" }} onClick={() => setActiveTab("Students")}>
            <div className="metric-top">
              <span>Assigned Students</span>
              <span className="metric-icon green"><Users size={17} /></span>
            </div>
            <strong>{myAssignedStudents.length}</strong>
            <small>{myAssignedStudents.length === 1 ? "1 active mentee" : `${myAssignedStudents.length} active mentees`}</small>
          </article>

          <article className="card metric-card" style={{ cursor: "pointer" }} onClick={() => setActiveTab("Notes")}>
            <div className="metric-top">
              <span>Course Notes</span>
              <span className="metric-icon amber"><FileText size={17} /></span>
            </div>
            <strong>{myTasks.length}</strong>
            <small>{myTasks.filter((t) => t.drive_url).length} with Google Drive links</small>
          </article>
        </section>

        {/* Courses & Quick Actions Grid */}
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
              {myTrainerCourses.map((course) => {
                const enrolledCount = enrollments.filter((e) => e.course_id === course.id && myAssignedStudentIds.has(e.student_id)).length;
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
              {!myTrainerCourses.length && <div className="portal-empty compact"><span>No courses assigned to you yet.</span></div>}
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
                <span style={{ fontSize: "12px", color: "var(--muted)" }}>Mark Present, Late, Absent, or Holiday.</span>
              </button>

              <button
                className="card"
                type="button"
                onClick={() => {
                  setEditingAssignment(null);
                  setAssignmentTitle("");
                  setAssignmentDesc("");
                  setAssignmentCourseId(myTrainerCourses[0]?.id || "");
                  setAssignmentDueDate("");
                  setAssignmentTotalMarks(100);
                  setAssignmentTargetStudentIds(Array.from(myAssignedStudentIds));
                  setShowAssignmentModal(true);
                  setActiveTab("Assignments");
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
                  <BookOpen size={18} />
                </div>
                <strong style={{ fontSize: "14px", color: "var(--ink)" }}>New Assignment</strong>
                <span style={{ fontSize: "12px", color: "var(--muted)" }}>Create coursework with marks.</span>
              </button>

              <button
                className="card"
                type="button"
                onClick={() => {
                  setShowTaskForm(true);
                  setActiveTab("Notes");
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
                  <FileText size={18} />
                </div>
                <strong style={{ fontSize: "14px", color: "var(--ink)" }}>Add Course Note</strong>
                <span style={{ fontSize: "12px", color: "var(--muted)" }}>Share notes &amp; Drive links.</span>
              </button>

              <button
                className="card"
                type="button"
                onClick={() => {
                  setShowCreateTestModal(true);
                  setActiveTab("Tests");
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
                <div style={{ width: "36px", height: "36px", borderRadius: "8px", background: "#f5f3ff", color: "#7c3aed", display: "grid", placeItems: "center" }}>
                  <ClipboardList size={18} />
                </div>
                <strong style={{ fontSize: "14px", color: "var(--ink)" }}>Create Test</strong>
                <span style={{ fontSize: "12px", color: "var(--muted)" }}>Quizzes &amp; evaluations.</span>
              </button>
            </div>
          </article>
        </div>

        {/* Recent Submissions & Reviews Section */}
        {submissions.length > 0 && (
          <section className="card panel" style={{ marginTop: "24px" }}>
            <div className="panel-heading">
              <div>
                <h2>Recent Student Submissions</h2>
                <p>Latest coursework submitted by your assigned students awaiting review or evaluation</p>
              </div>
              <button className="button compact" type="button" onClick={() => setActiveTab("Assignments")}>
                View All Assignments
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {submissions.slice(0, 5).map((sub) => {
                const student = studentsById[sub.student_id];
                const assignment = assignments.find((a) => a.id === sub.assignment_id);
                const isGraded = sub.grade !== null && sub.grade !== undefined;

                return (
                  <div
                    key={sub.id}
                    style={{
                      padding: "12px 16px",
                      background: "#f8fafc",
                      borderRadius: "8px",
                      border: "1px solid var(--line)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      flexWrap: "wrap",
                      gap: "10px",
                    }}
                  >
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <span className="badge green" style={{ fontSize: "11px", fontWeight: 700 }}>
                          {sub.submission_type || "File"}
                        </span>
                        <strong style={{ fontSize: "14px", color: "var(--ink)" }}>
                          {assignment?.title || "Coursework Assignment"}
                        </strong>
                      </div>
                      <small style={{ color: "var(--muted)", display: "block", marginTop: "3px" }}>
                        By <strong>{student?.full_name || student?.email || "Student"}</strong> · Submitted {formatDateTime(sub.submitted_at, "Recently")}
                      </small>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      {isGraded ? (
                        <span className="badge purple" style={{ fontWeight: 700 }}>
                          Score: {sub.grade} / {assignment?.total_marks || 100}
                        </span>
                      ) : (
                        <span className="badge amber" style={{ fontWeight: 700 }}>
                          Awaiting Grade
                        </span>
                      )}
                      <button
                        className="button primary compact"
                        type="button"
                        onClick={() => {
                          if (assignment) {
                            setSelectedAssignmentForSubmissions(assignment);
                            const state = {};
                            submissions.filter((s) => s.assignment_id === assignment.id).forEach((s) => {
                              state[s.id] = { grade: s.grade ?? "", feedback: s.feedback ?? "" };
                            });
                            setGradingState(state);
                            setShowSubmissionsModal(true);
                          } else {
                            setActiveTab("Assignments");
                          }
                        }}
                      >
                        {isGraded ? "Edit Grade" : "Review & Grade"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

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
                .filter((e) => e.student_id === student.id && myTrainerCourseIds.has(e.course_id))
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
    const presentCount = attendanceStudents.filter((s) => (attendanceState[s.id]?.status || "").toLowerCase() === "present").length;
    const lateCount = attendanceStudents.filter((s) => (attendanceState[s.id]?.status || "").toLowerCase() === "late").length;
    const absentCount = attendanceStudents.filter((s) => (attendanceState[s.id]?.status || "").toLowerCase() === "absent").length;
    const holidayCount = attendanceStudents.filter((s) => (attendanceState[s.id]?.status || "").toLowerCase() === "holiday").length;
    const unmarkedCount = attendanceStudents.length - (presentCount + lateCount + absentCount + holidayCount);

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
                  {myTrainerCourses.map((c) => {
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
                style={{ background: "#ede9fe", color: "#6d28d9", borderColor: "#ddd6fe", fontWeight: 600 }}
                onClick={() => markAllAttendance("Holiday")}
                title="Mark all students holiday"
              >
                <Sparkles size={13} style={{ color: "#7c3aed" }} /> Mark All Holiday
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
            <span className="badge" style={{ padding: "4px 10px", fontSize: "12px", background: "#ede9fe", color: "#6d28d9" }}>Holiday: {holidayCount}</span>
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
                    .filter((e) => e.student_id === student.id && myTrainerCourseIds.has(e.course_id))
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
                        {(() => {
                          const isPresent = (status || "").toLowerCase() === "present";
                          const isLate = (status || "").toLowerCase() === "late";
                          const isAbsent = (status || "").toLowerCase() === "absent";
                          const isHoliday = (status || "").toLowerCase() === "holiday";
                          return (
                            <div style={{ display: "inline-flex", gap: "6px", background: "#f1f5f9", padding: "4px", borderRadius: "8px" }}>
                              <button
                                type="button"
                                className={`button compact ${isPresent ? "primary" : ""}`}
                                style={{
                                  background: isPresent ? "#16a34a" : "transparent",
                                  color: isPresent ? "#fff" : "var(--ink)",
                                  border: "none",
                                  minHeight: "28px",
                                  padding: "2px 10px",
                                  fontSize: "12px",
                                  fontWeight: isPresent ? 700 : 500,
                                }}
                                onClick={() => setStudentAttendance(student.id, "Present")}
                              >
                                Present
                              </button>

                              <button
                                type="button"
                                className={`button compact ${isLate ? "primary" : ""}`}
                                style={{
                                  background: isLate ? "#d97706" : "transparent",
                                  color: isLate ? "#fff" : "var(--ink)",
                                  border: "none",
                                  minHeight: "28px",
                                  padding: "2px 10px",
                                  fontSize: "12px",
                                  fontWeight: isLate ? 700 : 500,
                                }}
                                onClick={() => setStudentAttendance(student.id, "Late")}
                              >
                                Late
                              </button>

                              <button
                                type="button"
                                className={`button compact ${isAbsent ? "primary" : ""}`}
                                style={{
                                  background: isAbsent ? "#dc2626" : "transparent",
                                  color: isAbsent ? "#fff" : "var(--ink)",
                                  border: "none",
                                  minHeight: "28px",
                                  padding: "2px 10px",
                                  fontSize: "12px",
                                  fontWeight: isAbsent ? 700 : 500,
                                }}
                                onClick={() => setStudentAttendance(student.id, "Absent")}
                              >
                                Absent
                              </button>

                              <button
                                type="button"
                                className={`button compact ${isHoliday ? "primary" : ""}`}
                                style={{
                                  background: isHoliday ? "#7c3aed" : "transparent",
                                  color: isHoliday ? "#fff" : "var(--ink)",
                                  border: "none",
                                  minHeight: "28px",
                                  padding: "2px 10px",
                                  fontSize: "12px",
                                  fontWeight: isHoliday ? 700 : 500,
                                }}
                                onClick={() => setStudentAttendance(student.id, "Holiday")}
                              >
                                Holiday
                              </button>
                            </div>
                          );
                        })()}
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
  // Tab 3: Notes & Learning Materials
  // ----------------------------------------------------
  function renderNotes() {
    const filteredTasks = tasks.filter((t) => {
      // Strictly only notes/tasks for trainer's assigned students or created by trainer
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
            <div className="eyebrow">Learning Materials &amp; Guides</div>
            <h1>Notes &amp; Tasks</h1>
            <p>Publish formatted study notes, problem sets, and Google Drive resources for your assigned students.</p>
          </div>
          <div className="heading-actions">
            <button
              className="button primary"
              type="button"
              onClick={() => setShowTaskForm((prev) => !prev)}
            >
              <Plus size={15} /> {showTaskForm ? "Close Form" : "Add Note / Task"}
            </button>
          </div>
        </div>

        {/* Toolbar & Student/Category Filters */}
        <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap", marginBottom: "16px" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: "6px", background: "rgba(22, 163, 74, 0.1)", color: "#15803d", padding: "6px 14px", borderRadius: "8px", fontWeight: 700, fontSize: "12.5px" }}>
            <Users size={14} /> My Assigned Students ({myTasksCount} total items)
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
              <option value="Class Notes">Class Notes</option>
              <option value="Task">Task</option>
              <option value="Practice Data Sets">Practice Data Sets</option>
              <option value="Projects">Projects</option>
              <option value="Homework">Homework</option>
              <option value="Lab Assignment">Lab Assignment</option>
              <option value="Other">Other</option>
            </select>
          </label>
        </div>

        {/* Create Note / Task Form */}
        {showTaskForm && (
          <form className="card admin-create-form" onSubmit={handleCreateTask} style={{ marginBottom: "24px" }}>
            <div className="panel-heading">
              <div>
                <h2>Create Note / Task</h2>
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
                <span>Title *</span>
                <input
                  required
                  placeholder="e.g. React Hooks Deep-Dive, SAP Configuration Steps"
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
                  {myTrainerCourses.map((c) => (
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
                  <option value="Class Notes">Class Notes</option>
                  <option value="Task">Task</option>
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

            <label className="form-field" style={{ marginTop: "12px" }}>
              <span>Google Drive Resource Link (Optional)</span>
              <input
                type="url"
                placeholder="https://drive.google.com/file/d/... or Google Drive folder"
                value={noteDriveUrl}
                onChange={(e) => setNoteDriveUrl(e.target.value)}
              />
              <small style={{ color: "var(--muted)", fontSize: "11.5px" }}>
                Add direct Google Drive resource links. Students will have integrated preview and direct open access.
              </small>
            </label>

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
              <span>Formatted Text Content &amp; Instructions *</span>
              <textarea
                required
                rows={4}
                placeholder="Enter lecture summary, core concepts, exercise guidelines, or references..."
                value={taskInstructions}
                onChange={(e) => setTaskInstructions(e.target.value)}
              />
            </label>

            <div className="form-actions" style={{ marginTop: "16px" }}>
              <button className="button" type="button" onClick={() => setShowTaskForm(false)}>
                Cancel
              </button>
              <button className="button primary" disabled={busy || taskSelectedStudents.length === 0}>
                <Plus size={14} /> {busy ? "Publishing..." : taskSelectedStudents.length === 1
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
            All Notes ({tasks.length})
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

        {/* Note Cards */}
        <div className="admin-work-list" style={{ display: "grid", gap: "14px" }}>
          {filteredTasks.map((task) => {
            const student = studentsById[task.student_id];
            const course = coursesById[task.course_id];
            const isCompleted = task.status === "completed";
            const driveUrl = task.drive_url || extractDriveUrl(task.body);
            const cleanBody = cleanNoteBody(task.body, driveUrl);
            const docType = getDriveDocTypeLabel(driveUrl);

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
                        <span className="badge blue" style={{ fontSize: "11px" }}>{task.category || "Class Notes"}</span>
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

                  <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", alignItems: "center" }}>
                    <button
                      className="button compact"
                      type="button"
                      onClick={() => handleToggleTaskStatus(task)}
                      title="Toggle completion status"
                    >
                      <CheckCircle2 size={12} /> {isCompleted ? "Mark Assigned" : "Mark Completed"}
                    </button>
                    <button
                      className="button compact"
                      type="button"
                      style={{ background: "#e0e7ff", color: "#3730a3", borderColor: "#c7d2fe", fontWeight: 600 }}
                      onClick={() => {
                        setSelectedNoteToShare(task);
                        setNoteShareTargetStudentIds([]);
                        setShowShareNoteModal(true);
                      }}
                      title="Assign or share this note individually to other students"
                    >
                      <Send size={11} /> Assign to Student
                    </button>
                    <button
                      className="button compact"
                      type="button"
                      onClick={() => setEditingNote(task)}
                      title="Edit note"
                    >
                      <Pencil size={12} /> Edit
                    </button>
                    <button
                      className="quiet-icon danger-icon"
                      type="button"
                      onClick={() => handleDeleteTask(task.id)}
                      aria-label="Delete note"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>

                {/* Formatted Text Description */}
                {cleanBody && (
                  <p style={{ margin: "12px 0 0", fontSize: "13px", color: "var(--ink)", lineHeight: 1.5, whiteSpace: "pre-wrap", background: "#f8fafc", padding: "12px", borderRadius: "8px", border: "1px solid var(--line)" }}>
                    {cleanBody}
                  </p>
                )}

                {/* Google Drive Resource Link */}
                {driveUrl && (
                  <div
                    style={{
                      marginTop: "12px",
                      padding: "10px 14px",
                      background: "#eff6ff",
                      borderRadius: "8px",
                      border: "1px solid #bfdbfe",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      flexWrap: "wrap",
                      gap: "10px",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <HardDrive size={16} style={{ color: "#2563eb" }} />
                      <span style={{ fontSize: "13px", fontWeight: 600, color: "#1e40af" }}>
                        Google Drive Resource ({docType})
                      </span>
                    </div>
                    <div style={{ display: "flex", gap: "6px" }}>
                      <button
                        className="button compact"
                        type="button"
                        style={{ fontSize: "11.5px", background: "#ffffff", borderColor: "#bfdbfe" }}
                        onClick={() =>
                          setViewingDoc({
                            title: task.title,
                            subtitle: course ? course.name : "Learning Material",
                            url: driveUrl,
                          })
                        }
                      >
                        <Eye size={12} /> Preview
                      </button>
                      <a
                        className="button compact"
                        href={driveUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ fontSize: "11.5px", background: "#2563eb", color: "#ffffff", borderColor: "#2563eb", textDecoration: "none" }}
                      >
                        <ExternalLink size={12} /> Open Drive Link
                      </a>
                    </div>
                  </div>
                )}
              </article>
            );
          })}

          {!filteredTasks.length && (
            <div className="card portal-empty">
              <FileText size={24} />
              <strong>No notes found</strong>
              <span>Use the Add Note / Task button above to distribute study material and exercises.</span>
            </div>
          )}
        </div>
      </div>
    );
  }

  const renderTasks = renderNotes;

  // ----------------------------------------------------
  // Tab: Assignments & Submissions Management
  // ----------------------------------------------------
  function renderAssignments() {
    const filteredAssignments = myTrainerAssignments.filter((a) => {
      if (assignmentCourseFilter !== "all" && a.course_id !== assignmentCourseFilter) return false;
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

    const totalSubmissionsCount = myTrainerSubmissions.length;
    const pendingGradingCount = myTrainerSubmissions.filter((s) => s.grade === null || s.grade === undefined).length;
    const gradedCount = totalSubmissionsCount - pendingGradingCount;

    return (
      <div className="trainer-assignments-view">
        <div className="page-heading">
          <div>
            <div className="eyebrow">Student Coursework &amp; Submissions</div>
            <h1>Assignments</h1>
            <p>
              Create and post new assignments, set due dates and total marks, and evaluate student submissions.
            </p>
          </div>
          <div className="heading-actions">
            <button
              className="button primary"
              type="button"
              onClick={() => {
                setEditingAssignment(null);
                setAssignmentTitle("");
                setAssignmentDesc("");
                setAssignmentCourseId(myTrainerCourses[0]?.id || "");
                setAssignmentDueDate("");
                setAssignmentTotalMarks(100);
                setAssignmentTargetStudentIds(Array.from(myAssignedStudentIds));
                setShowAssignmentModal(true);
              }}
            >
              <Plus size={15} /> Create Assignment
            </button>
          </div>
        </div>

        {/* Metric Summary */}
        <section className="metrics student-metrics" style={{ marginBottom: "20px" }}>
          <article className="card metric-card">
            <div className="metric-top">
              <span>Active Assignments</span>
              <span className="metric-icon blue"><BookOpen size={17} /></span>
            </div>
            <strong>{myTrainerAssignments.length}</strong>
            <small>Total coursework items</small>
          </article>

          <article className="card metric-card">
            <div className="metric-top">
              <span>Total Submissions</span>
              <span className="metric-icon green"><CheckCircle2 size={17} /></span>
            </div>
            <strong>{totalSubmissionsCount}</strong>
            <small>Received from students</small>
          </article>

          <article className="card metric-card">
            <div className="metric-top">
              <span>Awaiting Grading</span>
              <span className="metric-icon amber"><Clock3 size={17} /></span>
            </div>
            <strong>{pendingGradingCount}</strong>
            <small>{pendingGradingCount > 0 ? "Pending review & scores" : "All graded"}</small>
          </article>

          <article className="card metric-card">
            <div className="metric-top">
              <span>Graded &amp; Scored</span>
              <span className="metric-icon purple"><Award size={17} /></span>
            </div>
            <strong>{gradedCount}</strong>
            <small>Evaluations recorded</small>
          </article>
        </section>

        {/* Toolbar & Filter */}
        <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap", marginBottom: "16px" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: "6px", background: "rgba(22, 163, 74, 0.1)", color: "#15803d", padding: "6px 14px", borderRadius: "8px", fontWeight: 700, fontSize: "12.5px" }}>
            <Users size={14} /> My Assigned Students ({myAssignedStudents.length})
          </div>

          <label style={{ display: "inline-flex", alignItems: "center", gap: "6px", margin: 0 }}>
            <span style={{ fontSize: "12px", color: "var(--muted)", fontWeight: 600 }}>Filter Course:</span>
            <select
              value={assignmentCourseFilter}
              onChange={(e) => setAssignmentCourseFilter(e.target.value)}
              style={{ height: "34px", fontSize: "12px", padding: "0 8px", borderRadius: "6px", border: "1px solid var(--line)", background: "#fff" }}
            >
              <option value="all">All Courses ({myTrainerCourses.length})</option>
              {myTrainerCourses.map((c) => (
                <option key={c.id} value={c.id}>
                  [{c.code}] {c.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        {/* Assignments Grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: "18px" }}>
          {filteredAssignments.map((assignment) => {
            const course = coursesById[assignment.course_id];
            const subs = assignmentSubmissions.filter((s) => s.assignment_id === assignment.id);
            const recips = assignmentRecipients.filter((r) => r.assignment_id === assignment.id);
            const targetCount = recips.length > 0 ? recips.length : myAssignedStudents.length;
            const dueFormatted = formatDateMedium(assignment.due_at, "Open deadline");

            return (
              <article
                className="card panel"
                key={assignment.id}
                style={{ display: "flex", flexDirection: "column", justifyContent: "space-between" }}
              >
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "8px" }}>
                    <span className="badge blue" style={{ fontSize: "11px", fontWeight: 700 }}>
                      {course ? course.code : "General"}
                    </span>
                    <span className="badge green" style={{ fontSize: "11px", fontWeight: 600 }}>
                      {subs.length} of {targetCount} Submitted
                    </span>
                  </div>

                  <h3 style={{ fontSize: "16px", margin: "0 0 6px", color: "var(--ink)", fontWeight: 700 }}>
                    {assignment.title}
                  </h3>

                  {assignment.description && (
                    <p style={{ fontSize: "13px", color: "var(--muted)", margin: "0 0 12px", lineHeight: 1.4 }}>
                      {assignment.description}
                    </p>
                  )}

                  <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", fontSize: "12px", color: "var(--muted)", marginBottom: "14px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                      <CalendarClock size={13} />
                      <span>Due {dueFormatted}</span>
                    </div>
                    <span className="badge" style={{ fontSize: "11px", background: "#f0fdf4", color: "#166534" }}>
                      {assignment.total_marks || 100} Total Marks
                    </span>
                  </div>

                  {subs.length > 0 && (
                    <div style={{ marginTop: "8px", padding: "8px 12px", background: "#f8fafc", borderRadius: "8px", border: "1px solid var(--line)", fontSize: "12px" }}>
                      <strong style={{ color: "var(--ink)", display: "block", marginBottom: "4px" }}>
                        Submissions: {subs.length} received ({subs.filter((s) => s.grade !== null).length} graded)
                      </strong>
                    </div>
                  )}
                </div>

                <div className="card-actions" style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginTop: "14px", borderTop: "1px solid var(--line)", paddingTop: "12px" }}>
                  <button
                    className="button primary compact"
                    type="button"
                    style={{ flex: 1, minWidth: "140px" }}
                    onClick={() => {
                      setSelectedAssignmentForSubmissions(assignment);
                      const state = {};
                      subs.forEach((s) => {
                        state[s.id] = { grade: s.grade ?? "", feedback: s.feedback ?? "" };
                      });
                      setGradingState(state);
                      setShowSubmissionsModal(true);
                    }}
                  >
                    <CheckCircle2 size={13} /> Submissions ({subs.length})
                  </button>
                  <button
                    className="button compact"
                    type="button"
                    style={{ background: "#f0fdf4", color: "#166534", borderColor: "#bbf7d0", fontWeight: 600 }}
                    onClick={() => {
                      setSelectedAssignmentToAssign(assignment);
                      const currentRecips = recips.map((r) => r.student_id);
                      setAssignmentAssignTargetStudentIds(currentRecips.length > 0 ? currentRecips : Array.from(myAssignedStudentIds));
                      setShowAssignAssignmentModal(true);
                    }}
                    title="Assign or reassign this assignment individually to students"
                  >
                    <Users size={12} /> Assign ({recips.length > 0 ? recips.length : myAssignedStudents.length})
                  </button>
                  <button
                    className="button compact"
                    type="button"
                    title="Edit assignment"
                    onClick={() => {
                      setEditingAssignment(assignment);
                      setAssignmentTitle(assignment.title || "");
                      setAssignmentDesc(assignment.description || "");
                      setAssignmentCourseId(assignment.course_id || "");
                      setAssignmentDueDate(assignment.due_at ? assignment.due_at.slice(0, 16) : "");
                      setAssignmentTotalMarks(assignment.total_marks || 100);
                      const currentRecips = recips.map((r) => r.student_id);
                      setAssignmentTargetStudentIds(currentRecips.length > 0 ? currentRecips : Array.from(myAssignedStudentIds));
                      setShowAssignmentModal(true);
                    }}
                  >
                    <Pencil size={13} />
                  </button>
                  <button
                    className="button compact danger-outline"
                    type="button"
                    title="Delete assignment"
                    onClick={() => handleDeleteAssignment(assignment.id)}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </article>
            );
          })}

          {!filteredAssignments.length && (
            <div className="card portal-empty" style={{ gridColumn: "1 / -1" }}>
              <BookOpen size={26} />
              <strong>No assignments created yet</strong>
              <span>Click "Create Assignment" to post new coursework for your students.</span>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ----------------------------------------------------
  // Tab: Trainer Profile / Gradebook Page
  // ----------------------------------------------------
  function renderGradebook() {
    const filteredStudents = myAssignedStudents.filter((s) => {
      if (gradebookCourseFilter !== "all") {
        const inCourse = enrollments.some((e) => e.student_id === s.id && e.course_id === gradebookCourseFilter);
        if (!inCourse) return false;
      }
      if (!gradebookSearch.trim()) return true;
      const q = gradebookSearch.trim().toLowerCase();
      return (s.full_name || "").toLowerCase().includes(q) || (s.email || "").toLowerCase().includes(q);
    });

    let totalAttSessions = 0;
    let totalAttPresent = 0;
    let totalAssignmentsAssigned = 0;
    let totalAssignmentsSubmitted = 0;
    let sumGrades = 0;
    let countGrades = 0;
    let sumTestPct = 0;
    let countTestAttempts = 0;

    myAssignedStudents.forEach((s) => {
      const att = attendanceRecords.filter((r) => r.student_id === s.id);
      const workingDays = att.filter((r) => {
        const st = normalizeAttendanceStatus(r);
        return st === "present" || st === "late" || st === "absent";
      }).length;
      totalAttSessions += workingDays;
      totalAttPresent += att.filter((r) => normalizeAttendanceStatus(r) === "present").length + att.filter((r) => normalizeAttendanceStatus(r) === "late").length * 0.5;

      const subs = assignmentSubmissions.filter((sub) => sub.student_id === s.id && myTrainerAssignmentIds.has(sub.assignment_id));
      totalAssignmentsSubmitted += subs.length;
      totalAssignmentsAssigned += myTrainerAssignments.length;
      subs.forEach((sub) => {
        if (sub.grade !== null && sub.grade !== undefined) {
          sumGrades += Number(sub.grade);
          countGrades++;
        }
      });

      const attempts = assessmentAttempts.filter((att) => att.student_id === s.id && myTrainerAssessments.some((a) => a.id === att.assessment_id));
      attempts.forEach((att) => {
        const pct = (att.score / (att.max_score || 100)) * 100;
        sumTestPct += pct;
        countTestAttempts++;
      });
    });

    const classAvgAtt = totalAttSessions > 0 ? Math.round((totalAttPresent / totalAttSessions) * 100) : 100;
    const classAvgGrade = countGrades > 0 ? Math.round(sumGrades / countGrades) : 0;
    const classAvgTest = countTestAttempts > 0 ? Math.round(sumTestPct / countTestAttempts) : 0;
    const classSubmissionRate = totalAssignmentsAssigned > 0 ? Math.round((totalAssignmentsSubmitted / totalAssignmentsAssigned) * 100) : 100;

    return (
      <div className="trainer-gradebook-view">
        <div className="page-heading">
          <div>
            <div className="eyebrow">Academic Analytics &amp; Reports</div>
            <h1>Trainer Gradebook</h1>
            <p>
              Centralized performance dashboard for tracking student attendance rates, assignment completion &amp; grades, and test scores.
            </p>
          </div>
        </div>

        {/* Summary Metrics */}
        <section className="metrics student-metrics" style={{ marginBottom: "20px" }}>
          <article className="card metric-card">
            <div className="metric-top">
              <span>Assigned Students</span>
              <span className="metric-icon blue"><Users size={17} /></span>
            </div>
            <strong>{myAssignedStudents.length}</strong>
            <small>Active in your cohorts</small>
          </article>

          <article className="card metric-card">
            <div className="metric-top">
              <span>Class Attendance</span>
              <span className="metric-icon green"><CalendarCheck size={17} /></span>
            </div>
            <strong>{classAvgAtt}%</strong>
            <small>Overall check-in rate</small>
          </article>

          <article className="card metric-card">
            <div className="metric-top">
              <span>Avg Assignment Score</span>
              <span className="metric-icon purple"><Award size={17} /></span>
            </div>
            <strong>{countGrades > 0 ? `${classAvgGrade} pts` : "N/A"}</strong>
            <small>{classSubmissionRate}% submission rate</small>
          </article>

          <article className="card metric-card">
            <div className="metric-top">
              <span>Avg Test Score</span>
              <span className="metric-icon amber"><ClipboardList size={17} /></span>
            </div>
            <strong>{countTestAttempts > 0 ? `${classAvgTest}%` : "N/A"}</strong>
            <small>{countTestAttempts} test evaluations</small>
          </article>
        </section>

        {/* Toolbar */}
        <div className="card" style={{ padding: "14px", marginBottom: "18px", display: "flex", flexWrap: "wrap", gap: "12px", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
            <label style={{ display: "inline-flex", alignItems: "center", gap: "6px", margin: 0 }}>
              <span style={{ fontSize: "12px", color: "var(--muted)", fontWeight: 600 }}>Filter by Course:</span>
              <select
                value={gradebookCourseFilter}
                onChange={(e) => setGradebookCourseFilter(e.target.value)}
                style={{ height: "34px", fontSize: "12px", padding: "0 8px", borderRadius: "6px", border: "1px solid var(--line)", background: "#fff" }}
              >
                <option value="all">All Courses ({myTrainerCourses.length})</option>
                {myTrainerCourses.map((c) => (
                  <option key={c.id} value={c.id}>
                    [{c.code}] {c.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="search-box" style={{ width: "240px", margin: 0 }}>
            <Search size={14} />
            <input
              type="search"
              placeholder="Search student name or email…"
              value={gradebookSearch}
              onChange={(e) => setGradebookSearch(e.target.value)}
              style={{ height: "34px", fontSize: "12px" }}
            />
          </label>
        </div>

        {/* Gradebook Table */}
        <div className="card" style={{ padding: "6px" }}>
          <div className="table-scroll" style={{ overflowX: "auto" }}>
            <table className="admin-table" style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", padding: "12px 14px" }}>Student</th>
                  <th style={{ textAlign: "left", padding: "12px 14px" }}>Enrolled Courses</th>
                  <th style={{ textAlign: "center", padding: "12px 14px" }}>Attendance Rate</th>
                  <th style={{ textAlign: "center", padding: "12px 14px" }}>Assignments</th>
                  <th style={{ textAlign: "center", padding: "12px 14px" }}>Tests Completed</th>
                  <th style={{ textAlign: "center", padding: "12px 14px" }}>Overall Standing</th>
                  <th style={{ textAlign: "right", padding: "12px 14px" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredStudents.map((student) => {
                  const studentCourses = enrollments
                    .filter((e) => e.student_id === student.id && myTrainerCourseIds.has(e.course_id))
                    .map((e) => coursesById[e.course_id])
                    .filter(Boolean);

                  const att = attendanceRecords.filter((r) => r.student_id === student.id);
                  const pres = att.filter((r) => normalizeAttendanceStatus(r) === "present").length;
                  const late = att.filter((r) => normalizeAttendanceStatus(r) === "late").length;
                  const abs = att.filter((r) => normalizeAttendanceStatus(r) === "absent").length;
                  const hol = att.filter((r) => normalizeAttendanceStatus(r) === "holiday").length;
                  const workingDays = pres + late + abs;
                  const attRate = workingDays > 0 ? Math.round(((pres + late * 0.5) / workingDays) * 100) : 100;

                  const subs = assignmentSubmissions.filter((sub) => sub.student_id === student.id && myTrainerAssignmentIds.has(sub.assignment_id));
                  const gradedSubs = subs.filter((sub) => sub.grade !== null && sub.grade !== undefined);
                  const avgGrade = gradedSubs.length > 0 ? Math.round(gradedSubs.reduce((acc, c) => acc + Number(c.grade), 0) / gradedSubs.length) : null;

                  const attempts = assessmentAttempts.filter((att) => att.student_id === student.id && myTrainerAssessments.some((a) => a.id === att.assessment_id));
                  const avgTestScore = attempts.length > 0 ? Math.round(attempts.reduce((acc, c) => acc + (c.score / (c.max_score || 100)) * 100, 0) / attempts.length) : null;

                  const standingScore = Math.round((attRate * 0.3) + ((avgGrade ?? 85) * 0.35) + ((avgTestScore ?? 85) * 0.35));
                  const standingLabel = standingScore >= 85 ? "Excellent" : standingScore >= 70 ? "Good" : "Needs Attention";
                  const standingBadgeClass = standingScore >= 85 ? "badge green" : standingScore >= 70 ? "badge blue" : "badge rose";

                  return (
                    <tr key={student.id} style={{ borderBottom: "1px solid var(--line)" }}>
                      <td style={{ padding: "12px 14px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                          <span className="student-avatar" style={{ width: "34px", height: "34px", fontSize: "13px" }}>
                            {(student.full_name || student.email || "S").slice(0, 1).toUpperCase()}
                          </span>
                          <div>
                            <strong style={{ fontSize: "13.5px", color: "var(--ink)", display: "block" }}>
                              {student.full_name || "Unnamed Student"}
                            </strong>
                            <small style={{ color: "var(--muted)", fontSize: "11.5px" }}>
                              {student.email} · {student.timing || "Standard"}
                            </small>
                          </div>
                        </div>
                      </td>

                      <td style={{ padding: "12px 14px" }}>
                        <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
                          {studentCourses.map((c) => (
                            <span key={c.id} className="course-code-badge" style={{ fontSize: "10.5px" }}>
                              {c.code}
                            </span>
                          ))}
                          {!studentCourses.length && <span style={{ color: "var(--muted)", fontSize: "12px" }}>None</span>}
                        </div>
                      </td>

                      <td style={{ padding: "12px 14px", textAlign: "center" }}>
                        <div style={{ display: "inline-flex", flexDirection: "column", alignItems: "center" }}>
                          <span className={`badge ${attRate >= 80 ? "green" : attRate >= 60 ? "amber" : "rose"}`} style={{ fontWeight: 700 }}>
                            {attRate}%
                          </span>
                          <small style={{ color: "var(--muted)", fontSize: "11px", marginTop: "2px" }}>
                            {pres}P / {late}L / {abs}A ({att.length} sessions)
                          </small>
                        </div>
                      </td>

                      <td style={{ padding: "12px 14px", textAlign: "center" }}>
                        <div>
                          <strong style={{ fontSize: "13px", color: "var(--ink)" }}>
                            {subs.length} / {myTrainerAssignments.length} submitted
                          </strong>
                          <div style={{ fontSize: "11.5px", color: "var(--muted)" }}>
                            {avgGrade !== null ? `Avg: ${avgGrade} pts` : "No graded work"}
                          </div>
                        </div>
                      </td>

                      <td style={{ padding: "12px 14px", textAlign: "center" }}>
                        <div>
                          <strong style={{ fontSize: "13px", color: "var(--ink)" }}>
                            {attempts.length} / {myTrainerAssessments.length} taken
                          </strong>
                          <div style={{ fontSize: "11.5px", color: "var(--muted)" }}>
                            {avgTestScore !== null ? `Avg: ${avgTestScore}%` : "No tests completed"}
                          </div>
                        </div>
                      </td>

                      <td style={{ padding: "12px 14px", textAlign: "center" }}>
                        <span className={standingBadgeClass} style={{ fontWeight: 700, fontSize: "11.5px" }}>
                          {standingLabel} ({standingScore}%)
                        </span>
                      </td>

                      <td style={{ padding: "12px 14px", textAlign: "right" }}>
                        <div style={{ display: "inline-flex", gap: "6px" }}>
                          <button
                            className="button compact"
                            type="button"
                            title="View Student Profile"
                            onClick={() => setSelectedStudentDetail(student)}
                          >
                            <Eye size={13} />
                          </button>
                          <button
                            className="button compact"
                            type="button"
                            title="Message Student"
                            onClick={() => {
                              setNewMsgStudentId(student.id);
                              setShowNewMsgModal(true);
                              setActiveTab("Messages");
                            }}
                          >
                            <MessageSquare size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}

                {!filteredStudents.length && (
                  <tr>
                    <td colSpan={7} style={{ textAlign: "center", padding: "28px", color: "var(--muted)" }}>
                      No students found matching your criteria.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  // ----------------------------------------------------
  // Tab 4: Syllabus Management
  // ----------------------------------------------------
  function renderSyllabus() {
    const syllabi = materials.filter(
      (m) => m.category === "Syllabus" && (myTrainerCourseIds.has(m.course_id) || m.uploaded_by === activeTrainerId)
    );

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
                    {myTrainerCourses.map((c) => (
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

                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", borderTop: "1px solid var(--line)", paddingTop: "12px", alignItems: "center" }}>
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
                  <button
                    className="button compact"
                    type="button"
                    onClick={() => setEditingMaterial(item)}
                    title="Edit syllabus"
                  >
                    <Pencil size={12} /> Edit
                  </button>
                  <button
                    className="quiet-icon danger-icon"
                    type="button"
                    onClick={() => handleDeleteMaterial(item)}
                    title="Delete syllabus"
                    aria-label={`Delete ${item.title}`}
                  >
                    <Trash2 size={14} />
                  </button>
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
    const myMaterials = materials.filter(
      (m) => myTrainerCourseIds.has(m.course_id) || m.uploaded_by === activeTrainerId
    );
    const myDownloadRequests = downloadRequests.filter((r) => myAssignedStudentIds.has(r.student_id));
    const pendingRequests = myDownloadRequests.filter((r) => r.status === "pending");
    const filteredMaterials = myMaterials.filter((m) => {
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
            <span>Materials ({myMaterials.length})</span>
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
              Student Download Requests ({myDownloadRequests.length})
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
                  {myDownloadRequests.map((req) => {
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
              {!myDownloadRequests.length && (
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
                const count = cat === "all" ? myMaterials.length : myMaterials.filter((m) => m.category === cat).length;
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

                    <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", borderTop: "1px solid var(--line)", paddingTop: "10px", alignItems: "center" }}>
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
                      <button
                        className="button compact"
                        type="button"
                        onClick={() => setEditingMaterial(mat)}
                        title="Edit material details"
                      >
                        <Pencil size={12} /> Edit
                      </button>
                      <button
                        className="quiet-icon danger-icon"
                        type="button"
                        onClick={() => handleDeleteMaterial(mat)}
                        title="Delete material"
                        aria-label={`Delete ${mat.title}`}
                      >
                        <Trash2 size={13} />
                      </button>
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
                      {myTrainerCourses.map((c) => (
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
    const filteredTests = myTrainerAssessments.filter((a) => {
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
          <div className="heading-actions" style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <button
              className="button primary"
              type="button"
              onClick={() => {
                setTestTitle("");
                setTestDescription("");
                setTestCourseId(myTrainerCourses[0]?.id || "");
                setTestTotalMarks(100);
                setTestDuration(60);
                setTestExternalUrl("");
                setTestTargetStudentIds(Array.from(myAssignedStudentIds));
                setShowCreateTestModal(true);
              }}
            >
              <Plus size={15} /> Create New Test
            </button>
            <button
              className="button"
              type="button"
              onClick={() => {
                setSelectedTestToAssign(myTrainerAssessments[0] || null);
                setTestTargetStudentIds(Array.from(myAssignedStudentIds));
                setShowAssignTestModal(true);
              }}
            >
              <Users size={15} /> Assign Test to Students
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
            <strong>{myTrainerAssessments.length}</strong>
            <small>{myTrainerAssessments.length === 1 ? "1 active test in curriculum" : `${myTrainerAssessments.length} active tests in curriculum`}</small>
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

                  <button
                    className="button compact danger-outline"
                    type="button"
                    title="Delete test"
                    onClick={() => handleDeleteTest(test.id)}
                  >
                    <Trash2 size={13} />
                  </button>
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
    const myConversations = conversations.filter(
      (c) => myAssignedStudentIds.has(c.student_id) || c.trainer_id === activeTrainerId
    );

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
              <span className="day-label">{myConversations.length} total</span>
            </div>

            <div style={{ overflowY: "auto", maxHeight: "480px" }}>
              {myConversations.map((thread) => {
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

              {!myConversations.length && (
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
                    .filter((e) => e.student_id === student.id && myTrainerCourseIds.has(e.course_id))
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
                            <CheckCircle2 size={12} /> Note / Task
                          </button>
                          <button
                            className="button compact"
                            type="button"
                            style={{ background: "#ecfdf5", color: "#065f46", borderColor: "#a7f3d0" }}
                            onClick={() => {
                              setSelectedAssignmentToAssign(myTrainerAssignments[0] || null);
                              setAssignmentAssignTargetStudentIds([student.id]);
                              setShowAssignAssignmentModal(true);
                            }}
                            title={`Assign coursework assignment individually to ${student.full_name || "this student"}`}
                          >
                            <BookOpen size={12} /> Assign Assignment
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
          {visibleTrainerNav.map((item) => (
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
              {item.label === "Materials & Drive" && downloadRequests.filter((r) => r.status === "pending" && myAssignedStudentIds.has(r.student_id)).length > 0 && (
                <span className="nav-count">{downloadRequests.filter((r) => r.status === "pending" && myAssignedStudentIds.has(r.student_id)).length}</span>
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
            {((isAdminPreview ? activeTrainer?.full_name : profile?.full_name) || "TR").slice(0, 2).toUpperCase()}
          </span>
          <span className="profile-copy">
            <strong>{(isAdminPreview ? activeTrainer?.full_name : (profile?.full_name || user?.email)) || "Trainer"}</strong>
            <small>{isAdminPreview ? `Instructor (${activeTrainer?.email || "Preview"})` : "Instructor"}</small>
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
            <div className="portal-alert error" role="alert" style={{ marginBottom: "16px", display: "flex", flexDirection: "column", gap: "10px", alignItems: "stretch" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "10px" }}>
                <span>{error}</span>
                <button type="button" onClick={() => setError("")} style={{ flexShrink: 0 }}>Dismiss</button>
              </div>
              {error.includes("attendance_records_status_check") && (
                <div style={{ background: "rgba(0,0,0,0.06)", padding: "10px 12px", borderRadius: "8px", display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: "10px" }}>
                  <code style={{ fontSize: "12px", color: "var(--ink)", wordBreak: "break-all" }}>
                    ALTER TABLE public.attendance_records DROP CONSTRAINT IF EXISTS attendance_records_status_check; ALTER TABLE public.attendance_records ADD CONSTRAINT attendance_records_status_check CHECK (lower(status) in ('present', 'late', 'absent', 'holiday'));
                  </code>
                  <button
                    type="button"
                    className="button compact primary"
                    style={{ background: "#7c3aed" }}
                    onClick={() => {
                      navigator.clipboard.writeText("ALTER TABLE public.attendance_records DROP CONSTRAINT IF EXISTS attendance_records_status_check;\nALTER TABLE public.attendance_records ADD CONSTRAINT attendance_records_status_check CHECK (lower(status) in ('present', 'late', 'absent', 'holiday'));");
                      setToast("SQL command copied to clipboard! Paste and execute it in your Supabase SQL Editor.");
                    }}
                  >
                    <Copy size={13} /> Copy Migration SQL
                  </button>
                </div>
              )}
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
          ) : activeTab === "Notes" || activeTab === "Tasks" ? (
            renderNotes()
          ) : activeTab === "Assignments" ? (
            renderAssignments()
          ) : activeTab === "Gradebook" ? (
            renderGradebook()
          ) : activeTab === "Syllabus" ? (
            renderSyllabus()
          ) : activeTab === "Code Lab" && trainerHasItLab ? (
            <Suspense fallback={<div className="card portal-loading">Loading IT Code Lab…</div>}>
              <OnlineCompiler
                enrolledItCourses={trainerItCourses}
                recommendedModes={trainerRecommendedModes}
                roleLabel="Trainer"
                supabase={supabase}
              />
            </Suspense>
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
                    const t = myTrainerAssessments.find((a) => a.id === e.target.value);
                    setSelectedTestToAssign(t);
                    if (t) {
                      const currentRecs = assessmentRecipients
                        .filter((r) => r.assessment_id === t.id && myAssignedStudentIds.has(r.student_id))
                        .map((r) => r.student_id);
                      setTestTargetStudentIds(currentRecs.length > 0 ? currentRecs : Array.from(myAssignedStudentIds));
                    }
                  }}
                >
                  {myTrainerAssessments.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.title} {coursesById[a.course_id] ? `(${coursesById[a.course_id].code})` : ""}
                    </option>
                  ))}
                  {!myTrainerAssessments.length && <option value="">No tests available for your courses</option>}
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

      {/* Assign Assignment Modal */}
      {showAssignAssignmentModal && (
        <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) setShowAssignAssignmentModal(false); }}>
          <div className="modal" style={{ maxWidth: "540px" }}>
            <div className="modal-heading">
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <span className="portal-item-icon assignment" style={{ width: "38px", height: "38px", background: "#f0fdf4", color: "#16a34a", borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <BookOpen size={18} />
                </span>
                <div>
                  <h2 style={{ margin: 0 }}>Assign Assignment to Students</h2>
                  <p>Choose which individual students are assigned this coursework item.</p>
                </div>
              </div>
              <button type="button" className="quiet-icon" onClick={() => setShowAssignAssignmentModal(false)}><X size={18} /></button>
            </div>

            <div style={{ marginTop: "16px" }}>
              <label className="form-field">
                <span>Select Assignment *</span>
                <select
                  value={selectedAssignmentToAssign?.id || ""}
                  onChange={(e) => {
                    const assign = myTrainerAssignments.find((a) => a.id === e.target.value);
                    setSelectedAssignmentToAssign(assign);
                    if (assign) {
                      const currentRecs = assignmentRecipients
                        .filter((r) => r.assignment_id === assign.id && myAssignedStudentIds.has(r.student_id))
                        .map((r) => r.student_id);
                      setAssignmentAssignTargetStudentIds(currentRecs.length > 0 ? currentRecs : Array.from(myAssignedStudentIds));
                    }
                  }}
                >
                  {myTrainerAssignments.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.title} {coursesById[a.course_id] ? `(${coursesById[a.course_id].code})` : ""}
                    </option>
                  ))}
                  {!myTrainerAssignments.length && <option value="">No assignments available</option>}
                </select>
              </label>

              {/* Student Selection Checkboxes */}
              <div style={{ marginTop: "14px", padding: "14px", background: "#f8fafc", borderRadius: "10px", border: "1px solid var(--line)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px", flexWrap: "wrap", gap: "8px" }}>
                  <strong style={{ fontSize: "13.5px", color: "var(--ink)", display: "flex", alignItems: "center", gap: "6px" }}>
                    <Users size={16} style={{ color: "#16a34a" }} />
                    Target Students ({assignmentAssignTargetStudentIds.length} selected) *
                  </strong>
                  <div style={{ display: "flex", gap: "6px" }}>
                    <button
                      type="button"
                      className="button compact"
                      style={{ background: "#dcfce7", color: "#166534", fontWeight: 700 }}
                      onClick={() => setAssignmentAssignTargetStudentIds(Array.from(myAssignedStudentIds))}
                    >
                      Select All ({myAssignedStudents.length})
                    </button>
                    <button
                      type="button"
                      className="button compact"
                      onClick={() => setAssignmentAssignTargetStudentIds([])}
                    >
                      Clear
                    </button>
                  </div>
                </div>

                <div style={{ maxHeight: "220px", overflowY: "auto", border: "1px solid var(--line)", borderRadius: "6px", background: "#fff", padding: "4px" }}>
                  {myAssignedStudents.map((student) => {
                    const isChecked = assignmentAssignTargetStudentIds.includes(student.id);
                    const isAlreadyAssigned = assignmentRecipients.some(
                      (r) => r.assignment_id === selectedAssignmentToAssign?.id && r.student_id === student.id
                    );

                    return (
                      <label
                        key={student.id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          padding: "8px 10px",
                          borderBottom: "1px solid var(--line)",
                          cursor: "pointer",
                          background: isChecked ? "rgba(22, 163, 74, 0.05)" : "transparent",
                          borderRadius: "4px",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setAssignmentAssignTargetStudentIds((prev) => [...prev, student.id]);
                              } else {
                                setAssignmentAssignTargetStudentIds((prev) => prev.filter((id) => id !== student.id));
                              }
                            }}
                          />
                          <div>
                            <strong style={{ fontSize: "13px", display: "block" }}>{student.full_name || student.email}</strong>
                            <small style={{ color: "var(--muted)", fontSize: "11px" }}>{student.email}</small>
                          </div>
                        </div>

                        {isAlreadyAssigned && (
                          <span className="badge green" style={{ fontSize: "10px", padding: "2px 6px" }}>
                            Currently Assigned
                          </span>
                        )}
                      </label>
                    );
                  })}
                  {!myAssignedStudents.length && (
                    <div style={{ padding: "14px", textAlign: "center", color: "var(--muted)", fontSize: "12px" }}>
                      No students currently assigned to your roster.
                    </div>
                  )}
                </div>
              </div>

              <div className="form-actions" style={{ marginTop: "18px" }}>
                <button className="button" type="button" onClick={() => setShowAssignAssignmentModal(false)}>Cancel</button>
                <button
                  className="button primary"
                  disabled={busy || !selectedAssignmentToAssign}
                  onClick={() => handleAssignAssignmentToStudents(selectedAssignmentToAssign.id, assignmentAssignTargetStudentIds)}
                >
                  <Users size={14} /> {busy ? "Assigning..." : `Save & Assign (${assignmentAssignTargetStudentIds.length} Student${assignmentAssignTargetStudentIds.length === 1 ? "" : "s"})`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Share / Assign Note Modal */}
      {showShareNoteModal && selectedNoteToShare && (
        <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) setShowShareNoteModal(false); }}>
          <div className="modal" style={{ maxWidth: "540px" }}>
            <div className="modal-heading">
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <span className="portal-item-icon" style={{ width: "38px", height: "38px", background: "#e0e7ff", color: "#3730a3", borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <FileText size={18} />
                </span>
                <div>
                  <h2 style={{ margin: 0 }}>Assign Note to Students</h2>
                  <p>Distribute a copy of "{selectedNoteToShare.title}" individually to your assigned students.</p>
                </div>
              </div>
              <button type="button" className="quiet-icon" onClick={() => setShowShareNoteModal(false)}><X size={18} /></button>
            </div>

            <div style={{ marginTop: "16px" }}>
              <div style={{ padding: "10px 14px", background: "#f8fafc", borderRadius: "8px", border: "1px solid var(--line)", marginBottom: "14px", fontSize: "12.5px" }}>
                <strong style={{ color: "var(--ink)", display: "block" }}>{selectedNoteToShare.title}</strong>
                <span style={{ color: "var(--muted)" }}>Category: {selectedNoteToShare.category || "Class Notes"}</span>
              </div>

              {/* Student Selection Checkboxes */}
              <div style={{ padding: "14px", background: "#f8fafc", borderRadius: "10px", border: "1px solid var(--line)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px", flexWrap: "wrap", gap: "8px" }}>
                  <strong style={{ fontSize: "13.5px", color: "var(--ink)", display: "flex", alignItems: "center", gap: "6px" }}>
                    <Users size={16} style={{ color: "#4f46e5" }} />
                    Select Students to Assign ({noteShareTargetStudentIds.length} selected) *
                  </strong>
                  <div style={{ display: "flex", gap: "6px" }}>
                    <button
                      type="button"
                      className="button compact"
                      style={{ background: "#e0e7ff", color: "#3730a3", fontWeight: 700 }}
                      onClick={() => setNoteShareTargetStudentIds(Array.from(myAssignedStudentIds))}
                    >
                      Select All ({myAssignedStudents.length})
                    </button>
                    <button
                      type="button"
                      className="button compact"
                      onClick={() => setNoteShareTargetStudentIds([])}
                    >
                      Clear
                    </button>
                  </div>
                </div>

                <div style={{ maxHeight: "220px", overflowY: "auto", border: "1px solid var(--line)", borderRadius: "6px", background: "#fff", padding: "4px" }}>
                  {myAssignedStudents.map((student) => {
                    const isChecked = noteShareTargetStudentIds.includes(student.id);

                    return (
                      <label
                        key={student.id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          padding: "8px 10px",
                          borderBottom: "1px solid var(--line)",
                          cursor: "pointer",
                          background: isChecked ? "rgba(79, 70, 229, 0.05)" : "transparent",
                          borderRadius: "4px",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setNoteShareTargetStudentIds((prev) => [...prev, student.id]);
                              } else {
                                setNoteShareTargetStudentIds((prev) => prev.filter((id) => id !== student.id));
                              }
                            }}
                          />
                          <div>
                            <strong style={{ fontSize: "13px", display: "block" }}>{student.full_name || student.email}</strong>
                            <small style={{ color: "var(--muted)", fontSize: "11px" }}>{student.email}</small>
                          </div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="form-actions" style={{ marginTop: "18px" }}>
                <button className="button" type="button" onClick={() => setShowShareNoteModal(false)}>Cancel</button>
                <button
                  className="button primary"
                  disabled={busy || noteShareTargetStudentIds.length === 0}
                  onClick={() => handleShareNoteWithStudents(selectedNoteToShare, noteShareTargetStudentIds)}
                >
                  <Send size={14} /> {busy ? "Assigning..." : `Assign Note to ${noteShareTargetStudentIds.length} Student${noteShareTargetStudentIds.length === 1 ? "" : "s"}`}
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
                    Enrolled Courses ({enrollments.filter((e) => e.student_id === selectedStudentDetail.id && myTrainerCourseIds.has(e.course_id)).length})
                  </strong>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  {enrollments
                    .filter((e) => e.student_id === selectedStudentDetail.id && myTrainerCourseIds.has(e.course_id))
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
                  {!enrollments.some((e) => e.student_id === selectedStudentDetail.id && myTrainerCourseIds.has(e.course_id)) && (
                    <span style={{ fontSize: "13px", color: "var(--muted)" }}>Not enrolled in any of your courses yet.</span>
                  )}
                </div>

                {/* Quick Course Enrollment Selector for Trainers */}
                {myTrainerCourses.filter((c) => !enrollments.some((e) => e.student_id === selectedStudentDetail.id && e.course_id === c.id)).length > 0 && (
                  <div style={{ display: "flex", gap: "8px", marginTop: "10px", alignItems: "center" }}>
                    <select
                      className="form-input"
                      style={{ fontSize: "12px", padding: "6px 10px", flex: 1 }}
                      value={enrollingCourseId}
                      onChange={(e) => setEnrollingCourseId(e.target.value)}
                    >
                      <option value="">Select a course to enroll...</option>
                      {myTrainerCourses
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
                  const p = studentRecords.filter((r) => normalizeAttendanceStatus(r) === "present").length;
                  const l = studentRecords.filter((r) => normalizeAttendanceStatus(r) === "late").length;
                  const a = studentRecords.filter((r) => normalizeAttendanceStatus(r) === "absent").length;
                  const h = studentRecords.filter((r) => normalizeAttendanceStatus(r) === "holiday").length;
                  const workingDays = p + l + a;
                  const pct = workingDays ? Math.round(((p + l * 0.5) / workingDays) * 100) : 100;

                  return (
                    <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                      <span className="badge green">Present: {p}</span>
                      <span className="badge amber">Late: {l}</span>
                      <span className="badge rose">Absent: {a}</span>
                      {h > 0 && <span className="badge" style={{ background: "#ede9fe", color: "#6d28d9" }}>Holiday: {h}</span>}
                      <span className="badge blue">Overall: {pct}% Rate ({studentRecords.length} check-ins)</span>
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
                  style={{ background: "#059669" }}
                  onClick={() => {
                    setSelectedAssignmentToAssign(myTrainerAssignments[0] || null);
                    setAssignmentAssignTargetStudentIds([selectedStudentDetail.id]);
                    setShowAssignAssignmentModal(true);
                    setSelectedStudentDetail(null);
                    setActiveTab("Assignments");
                  }}
                  title="Assign assignment individually to this student"
                >
                  <BookOpen size={13} /> Assign Assignment
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

      {/* Edit Note Modal */}
      {editingNote && (
        <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) setEditingNote(null); }}>
          <div className="modal" style={{ maxWidth: "560px" }}>
            <div className="modal-heading">
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <span className="portal-item-icon note" style={{ width: "38px", height: "38px", background: "#eef2ff", color: "#4f46e5" }}>
                  <Pencil size={18} />
                </span>
                <div>
                  <h2 style={{ margin: 0 }}>Edit Note / Learning Material</h2>
                  <p style={{ margin: 0 }}>Update note content, instructions, or Google Drive link.</p>
                </div>
              </div>
              <button type="button" className="quiet-icon" onClick={() => setEditingNote(null)}><X size={18} /></button>
            </div>

            <form onSubmit={handleUpdateNote}>
              <label className="form-field">
                <span>Title *</span>
                <input
                  required
                  value={editingNote.title || ""}
                  onChange={(e) => setEditingNote((prev) => ({ ...prev, title: e.target.value }))}
                />
              </label>

              <div className="form-grid-2" style={{ marginTop: "12px" }}>
                <label className="form-field">
                  <span>Category</span>
                  <select
                    value={editingNote.category || "Class Notes"}
                    onChange={(e) => setEditingNote((prev) => ({ ...prev, category: e.target.value }))}
                  >
                    <option value="Class Notes">Class Notes</option>
                    <option value="Task">Task</option>
                    <option value="Practice Data Sets">Practice Data Sets</option>
                    <option value="Projects">Projects</option>
                    <option value="Homework">Homework</option>
                    <option value="Lab Assignment">Lab Assignment</option>
                    <option value="Other">Other</option>
                  </select>
                </label>

                <label className="form-field">
                  <span>Course</span>
                  <select
                    value={editingNote.course_id || ""}
                    onChange={(e) => setEditingNote((prev) => ({ ...prev, course_id: e.target.value || null }))}
                  >
                    <option value="">General</option>
                    {myTrainerCourses.map((c) => (
                      <option key={c.id} value={c.id}>
                        [{c.code}] {c.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="form-field" style={{ marginTop: "12px" }}>
                <span>Google Drive Resource Link</span>
                <input
                  type="url"
                  placeholder="https://drive.google.com/..."
                  value={editingNote.drive_url || ""}
                  onChange={(e) => setEditingNote((prev) => ({ ...prev, drive_url: e.target.value }))}
                />
              </label>

              <label className="form-field" style={{ marginTop: "12px" }}>
                <span>Note Content / Instructions</span>
                <textarea
                  rows={4}
                  value={editingNote.body || ""}
                  onChange={(e) => setEditingNote((prev) => ({ ...prev, body: e.target.value }))}
                />
              </label>

              <div className="modal-actions" style={{ marginTop: "16px" }}>
                <button className="button" type="button" onClick={() => setEditingNote(null)}>
                  Cancel
                </button>
                <button className="button primary" disabled={busy}>
                  {busy ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create / Edit Assignment Modal */}
      {showAssignmentModal && (
        <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) { setShowAssignmentModal(false); setEditingAssignment(null); } }}>
          <div className="modal" style={{ maxWidth: "600px" }}>
            <div className="modal-heading">
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <span className="portal-item-icon assignment" style={{ width: "38px", height: "38px", background: "#f0fdf4", color: "#16a34a" }}>
                  <BookOpen size={18} />
                </span>
                <div>
                  <h2 style={{ margin: 0 }}>{editingAssignment ? "Edit Assignment" : "Create New Assignment"}</h2>
                  <p style={{ margin: 0 }}>Define tasks, due dates, and marks. Students can submit via File Upload or URL link.</p>
                </div>
              </div>
              <button type="button" className="quiet-icon" onClick={() => { setShowAssignmentModal(false); setEditingAssignment(null); }}><X size={18} /></button>
            </div>

            <form onSubmit={handleSaveAssignment}>
              <label className="form-field">
                <span>Assignment Title *</span>
                <input
                  required
                  placeholder="e.g. Capstone Financial Statement Modeling, React Redux Dashboard"
                  value={assignmentTitle}
                  onChange={(e) => setAssignmentTitle(e.target.value)}
                />
              </label>

              <div className="form-grid-2" style={{ marginTop: "12px" }}>
                <label className="form-field">
                  <span>Linked Course</span>
                  <select
                    value={assignmentCourseId}
                    onChange={(e) => setAssignmentCourseId(e.target.value)}
                  >
                    <option value="">General / All Subjects</option>
                    {myTrainerCourses.map((c) => (
                      <option key={c.id} value={c.id}>
                        [{c.code}] {c.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="form-field">
                  <span>Total Marks</span>
                  <input
                    type="number"
                    min="1"
                    max="1000"
                    value={assignmentTotalMarks}
                    onChange={(e) => setAssignmentTotalMarks(e.target.value)}
                  />
                </label>
              </div>

              <label className="form-field" style={{ marginTop: "12px" }}>
                <span>Due Date &amp; Time (Optional)</span>
                <input
                  type="datetime-local"
                  value={assignmentDueDate}
                  onChange={(e) => setAssignmentDueDate(e.target.value)}
                />
              </label>

              <label className="form-field" style={{ marginTop: "12px" }}>
                <span>Assignment Description &amp; Instructions</span>
                <textarea
                  rows={4}
                  placeholder="Provide instructions, required deliverable format (PDF, DOCX, ZIP, or Google Drive / GitHub link)..."
                  value={assignmentDesc}
                  onChange={(e) => setAssignmentDesc(e.target.value)}
                />
              </label>

              {/* Target Students */}
              <div style={{ marginTop: "14px", padding: "12px", background: "#f8fafc", borderRadius: "8px", border: "1px solid var(--line)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                  <strong style={{ fontSize: "12.5px", color: "var(--ink)" }}>
                    Target Students ({assignmentTargetStudentIds.length} of {myAssignedStudents.length} selected)
                  </strong>
                  <div style={{ display: "flex", gap: "6px" }}>
                    <button
                      type="button"
                      className="button compact"
                      style={{ fontSize: "11px" }}
                      onClick={() => setAssignmentTargetStudentIds(Array.from(myAssignedStudentIds))}
                    >
                      Select All
                    </button>
                    <button
                      type="button"
                      className="button compact"
                      style={{ fontSize: "11px" }}
                      onClick={() => setAssignmentTargetStudentIds([])}
                    >
                      Clear
                    </button>
                  </div>
                </div>

                <div style={{ maxHeight: "140px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "4px" }}>
                  {myAssignedStudents.map((s) => {
                    const isChecked = assignmentTargetStudentIds.includes(s.id);
                    return (
                      <label key={s.id} style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px", cursor: "pointer", padding: "3px 6px", borderRadius: "4px", background: isChecked ? "#eef2ff" : "#fff" }}>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            if (e.target.checked) setAssignmentTargetStudentIds((prev) => [...prev, s.id]);
                            else setAssignmentTargetStudentIds((prev) => prev.filter((id) => id !== s.id));
                          }}
                        />
                        <span>{s.full_name || s.email}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="modal-actions" style={{ marginTop: "16px" }}>
                <button className="button" type="button" onClick={() => { setShowAssignmentModal(false); setEditingAssignment(null); }}>
                  Cancel
                </button>
                <button className="button primary" disabled={busy}>
                  {busy ? "Saving..." : editingAssignment ? "Update Assignment" : "Publish Assignment"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Review Submissions & Grading Modal */}
      {showSubmissionsModal && selectedAssignmentForSubmissions && (
        <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) setShowSubmissionsModal(false); }}>
          <div className="modal" style={{ maxWidth: "780px" }}>
            <div className="modal-heading">
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <span className="portal-item-icon assignment" style={{ width: "38px", height: "38px", background: "#f0fdf4", color: "#16a34a" }}>
                  <Award size={18} />
                </span>
                <div>
                  <h2 style={{ margin: 0 }}>Submissions: {selectedAssignmentForSubmissions.title}</h2>
                  <p style={{ margin: 0 }}>
                    Max score: <strong>{selectedAssignmentForSubmissions.total_marks || 100} pts</strong> · Total submissions received: <strong>{assignmentSubmissions.filter((s) => s.assignment_id === selectedAssignmentForSubmissions.id).length}</strong>
                  </p>
                </div>
              </div>
              <button type="button" className="quiet-icon" onClick={() => setShowSubmissionsModal(false)}><X size={18} /></button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "14px", maxHeight: "65vh", overflowY: "auto", paddingRight: "4px" }}>
              {myAssignedStudents.map((student) => {
                const sub = assignmentSubmissions.find((s) => s.assignment_id === selectedAssignmentForSubmissions.id && s.student_id === student.id);
                const hasSubmission = Boolean(sub);
                const draftKey = sub?.id || `${selectedAssignmentForSubmissions.id}-${student.id}`;
                const currentGrading = gradingState[draftKey] ?? { grade: sub?.grade ?? "", feedback: sub?.feedback ?? "" };

                return (
                  <div
                    key={student.id}
                    className="card"
                    style={{
                      padding: "16px",
                      background: hasSubmission ? "#ffffff" : "#f8fafc",
                      border: hasSubmission ? "1px solid var(--line)" : "1px dashed var(--line)",
                      borderRadius: "10px",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "10px", marginBottom: "10px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        <span className="student-avatar" style={{ width: "32px", height: "32px", fontSize: "12px" }}>
                          {(student.full_name || student.email || "S").slice(0, 1).toUpperCase()}
                        </span>
                        <div>
                          <strong style={{ fontSize: "13.5px", color: "var(--ink)", display: "block" }}>
                            {student.full_name || "Unnamed Student"}
                          </strong>
                          <small style={{ color: "var(--muted)", fontSize: "11.5px" }}>{student.email}</small>
                        </div>
                      </div>

                      {hasSubmission ? (
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <span className="badge green" style={{ fontWeight: 700, fontSize: "11px" }}>
                            <Check size={11} strokeWidth={3} /> Completed
                          </span>
                          <span className="badge blue" style={{ fontSize: "11px" }}>
                            {sub.submission_type || "File"}
                          </span>
                          <span style={{ fontSize: "11.5px", color: "var(--muted)" }}>
                            {formatDateTime(sub.submitted_at, "Recently")}
                          </span>
                        </div>
                      ) : (
                        <span className="badge amber" style={{ fontSize: "11px", display: "inline-flex", alignItems: "center", gap: "4px" }}>
                          <Clock3 size={11} /> Pending Online / In-Person Evaluation
                        </span>
                      )}
                    </div>

                    <div style={{ marginTop: "10px", paddingTop: "10px", borderTop: "1px solid var(--line)" }}>
                      {/* Submission Deliverables (if any) */}
                      {hasSubmission && (
                        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap", marginBottom: "12px" }}>
                          {sub.file_path && (
                            <>
                              <button
                                className="button compact"
                                type="button"
                                onClick={() => handleDownloadSubmissionFile(sub.file_path)}
                                style={{ display: "inline-flex", alignItems: "center", gap: "6px", background: "#f0fdf4", borderColor: "#bbf7d0", color: "#166534" }}
                              >
                                <Download size={13} /> Download Submitted File
                              </button>
                              <button
                                className="button compact"
                                type="button"
                                onClick={() => handleDeleteStudentSubmissionFile(sub)}
                                style={{ display: "inline-flex", alignItems: "center", gap: "6px", background: "#fee2e2", borderColor: "#fca5a5", color: "#991b1b" }}
                                title="Manually delete student uploaded file"
                              >
                                <Trash2 size={12} /> Delete File Manually
                              </button>
                            </>
                          )}
                          {(sub.submission_link || (sub.submission_type === "Link" && sub.answer_text)) && (
                            <a
                              className="button compact"
                              href={sub.submission_link || sub.answer_text}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{ display: "inline-flex", alignItems: "center", gap: "6px", background: "#eff6ff", borderColor: "#bfdbfe", color: "#1e40af", textDecoration: "none" }}
                            >
                              <ExternalLink size={13} /> Open Submission URL ({sub.submission_link || sub.answer_text})
                            </a>
                          )}
                          {sub.answer_text && sub.submission_type !== "Link" && (
                            <div style={{ width: "100%", fontSize: "12.5px", background: "#f8fafc", padding: "8px 12px", borderRadius: "6px", border: "1px solid var(--line)", marginTop: "4px" }}>
                              <strong>Student Notes:</strong> {sub.answer_text}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Inline Grading Form for All Students */}
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", alignItems: "center", background: "#f8fafc", padding: "12px", borderRadius: "8px" }}>
                        <label style={{ display: "flex", alignItems: "center", gap: "6px", margin: 0 }}>
                          <span style={{ fontSize: "12px", fontWeight: 700, color: "var(--ink)" }}>Score:</span>
                          <input
                            type="number"
                            min="0"
                            max={selectedAssignmentForSubmissions.total_marks || 100}
                            placeholder="Marks"
                            value={currentGrading?.grade ?? ""}
                            onChange={(e) =>
                              setGradingState((prev) => ({
                                ...prev,
                                [draftKey]: { ...(prev[draftKey] || {}), grade: e.target.value },
                              }))
                            }
                            style={{ width: "70px", height: "32px", fontSize: "12px", padding: "0 6px" }}
                          />
                          <span style={{ fontSize: "12px", color: "var(--muted)" }}>/ {selectedAssignmentForSubmissions.total_marks || 100}</span>
                        </label>

                        <input
                          placeholder="Feedback comments for student..."
                          value={currentGrading?.feedback ?? ""}
                          onChange={(e) =>
                            setGradingState((prev) => ({
                              ...prev,
                              [draftKey]: { ...(prev[draftKey] || {}), feedback: e.target.value },
                            }))
                          }
                          style={{ flex: 1, minWidth: "180px", height: "32px", fontSize: "12px", padding: "0 8px" }}
                        />

                        <button
                          className="button primary compact"
                          type="button"
                          disabled={savingGradeId === draftKey}
                          onClick={() => handleSaveGrade(selectedAssignmentForSubmissions.id, student.id, sub?.id, selectedAssignmentForSubmissions.total_marks || 100)}
                        >
                          <Check size={12} /> {savingGradeId === draftKey ? "Saving..." : sub?.graded_at ? "Update Grade" : "Save Grade"}
                        </button>
                      </div>

                      {sub?.graded_at && (
                        <div style={{ marginTop: "6px", fontSize: "11px", color: "#15803d", display: "flex", alignItems: "center", gap: "4px" }}>
                          <CheckCircle2 size={12} /> Graded: {sub.grade} / {selectedAssignmentForSubmissions.total_marks || 100} pts {sub.feedback ? `· "${sub.feedback}"` : ""}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

              {!myAssignedStudents.length && (
                <div className="card portal-empty">
                  <span>No students assigned to your profile yet.</span>
                </div>
              )}
            </div>

            <div className="modal-actions" style={{ marginTop: "16px" }}>
              <button className="button" type="button" onClick={() => setShowSubmissionsModal(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Test Modal */}
      {showCreateTestModal && (
        <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) setShowCreateTestModal(false); }}>
          <div className="modal" style={{ maxWidth: "580px" }}>
            <div className="modal-heading">
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <span className="portal-item-icon test" style={{ width: "38px", height: "38px", background: "#f5f3ff", color: "#7c3aed" }}>
                  <ClipboardList size={18} />
                </span>
                <div>
                  <h2 style={{ margin: 0 }}>Create New Assessment / Test</h2>
                  <p style={{ margin: 0 }}>Set up quizzes, practical evaluations, and exams for your students.</p>
                </div>
              </div>
              <button type="button" className="quiet-icon" onClick={() => setShowCreateTestModal(false)}><X size={18} /></button>
            </div>

            <form onSubmit={handleCreateTest}>
              <label className="form-field">
                <span>Test / Assessment Title *</span>
                <input
                  required
                  placeholder="e.g. Midterm Evaluation, SAP FICO Final Exam"
                  value={testTitle}
                  onChange={(e) => setTestTitle(e.target.value)}
                />
              </label>

              <div className="form-grid-2" style={{ marginTop: "12px" }}>
                <label className="form-field">
                  <span>Linked Course</span>
                  <select
                    value={testCourseId}
                    onChange={(e) => setTestCourseId(e.target.value)}
                  >
                    <option value="">General Assessment</option>
                    {myTrainerCourses.map((c) => (
                      <option key={c.id} value={c.id}>
                        [{c.code}] {c.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="form-field">
                  <span>Total Marks</span>
                  <input
                    type="number"
                    min="1"
                    max="1000"
                    value={testTotalMarks}
                    onChange={(e) => setTestTotalMarks(e.target.value)}
                  />
                </label>
              </div>

              <div className="form-grid-2" style={{ marginTop: "12px" }}>
                <label className="form-field">
                  <span>Duration (Minutes)</span>
                  <input
                    type="number"
                    min="5"
                    max="360"
                    value={testDuration}
                    onChange={(e) => setTestDuration(e.target.value)}
                  />
                </label>

                <label className="form-field">
                  <span>External Exam Link (Optional)</span>
                  <input
                    type="url"
                    placeholder="https://forms.google.com/..."
                    value={testExternalUrl}
                    onChange={(e) => setTestExternalUrl(e.target.value)}
                  />
                </label>
              </div>

              <label className="form-field" style={{ marginTop: "12px" }}>
                <span>Test Description &amp; Instructions</span>
                <textarea
                  rows={3}
                  placeholder="Enter assessment syllabus, rules, and evaluation guidelines..."
                  value={testDescription}
                  onChange={(e) => setTestDescription(e.target.value)}
                />
              </label>

              <div style={{ marginTop: "14px", padding: "12px", background: "#f8fafc", borderRadius: "8px", border: "1px solid var(--line)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                  <strong style={{ fontSize: "12.5px", color: "var(--ink)" }}>
                    Target Students ({testTargetStudentIds.length} of {myAssignedStudents.length} selected)
                  </strong>
                  <div style={{ display: "flex", gap: "6px" }}>
                    <button
                      type="button"
                      className="button compact"
                      style={{ fontSize: "11px" }}
                      onClick={() => setTestTargetStudentIds(Array.from(myAssignedStudentIds))}
                    >
                      Select All
                    </button>
                    <button
                      type="button"
                      className="button compact"
                      style={{ fontSize: "11px" }}
                      onClick={() => setTestTargetStudentIds([])}
                    >
                      Clear
                    </button>
                  </div>
                </div>

                <div style={{ maxHeight: "140px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "4px" }}>
                  {myAssignedStudents.map((s) => {
                    const isChecked = testTargetStudentIds.includes(s.id);
                    return (
                      <label key={s.id} style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px", cursor: "pointer", padding: "3px 6px", borderRadius: "4px", background: isChecked ? "#eef2ff" : "#fff" }}>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            if (e.target.checked) setTestTargetStudentIds((prev) => [...prev, s.id]);
                            else setTestTargetStudentIds((prev) => prev.filter((id) => id !== s.id));
                          }}
                        />
                        <span>{s.full_name || s.email}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="modal-actions" style={{ marginTop: "16px" }}>
                <button className="button" type="button" onClick={() => setShowCreateTestModal(false)}>
                  Cancel
                </button>
                <button className="button primary" disabled={busy}>
                  {busy ? "Creating..." : "Create & Publish Test"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Material Modal */}
      {editingMaterial && (
        <EditMaterialModal
          material={editingMaterial}
          courses={myTrainerCourses}
          onClose={() => setEditingMaterial(null)}
          onSave={handleUpdateMaterial}
          onDelete={handleDeleteMaterial}
        />
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

