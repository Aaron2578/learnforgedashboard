import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight, BookOpen, CalendarClock, Check, CheckCircle2, ClipboardList, Clock3,
  Copy, Download, ExternalLink, Eye, FileSpreadsheet, FileText, GraduationCap, HardDrive, LayoutDashboard, Link2,
  Lock, LogOut, Mail, MapPin, Menu, MessageSquare, Paperclip, Plus, Send,
  Shield, ShieldCheck, Sparkles, Unlock, Upload, Users, X,
} from "lucide-react";
import SecureDocumentViewer from "../components/SecureDocumentViewer";
import AttendanceCalendar from "../components/AttendanceCalendar";
import { extractDriveUrl, cleanNoteBody, getDriveDocTypeLabel, getDriveDownloadExportUrl } from "../lib/driveUtils.js";

const STUDENT_NAV = [
  { label: "My learning", icon: LayoutDashboard },
  { label: "Notes", icon: FileText },
  { label: "Assignments", icon: BookOpen },
  { label: "Tests", icon: ClipboardList },
  { label: "Attendance", icon: Clock3 },
  { label: "Syllabus", icon: FileSpreadsheet },
  { label: "Drive & Files", icon: HardDrive },
  { label: "Courses", icon: GraduationCap },
  { label: "Updates", icon: Mail },
  { label: "Messages", icon: MessageSquare },
];
const ALLOWED_FILE_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/zip",
  "application/x-zip-compressed",
  "text/plain",
  "text/csv",
]);
const MAX_FILE_SIZE = 10 * 1024 * 1024;

function dateLabel(value) {
  if (!value) return "No deadline";
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function isPast(value) {
  return value ? new Date(value).getTime() <= Date.now() : false;
}

function getInitialStudentView() {
  try {
    const hash = window.location.hash.replace("#", "").toLowerCase();
    if (hash) {
      const match = STUDENT_NAV.find((item) => item.label.toLowerCase().replace(/[^a-z0-9]/g, "-") === hash);
      if (match) return match.label;
    }
    const saved = localStorage.getItem("student_active_view");
    if (saved && STUDENT_NAV.some((item) => item.label === saved)) {
      return saved;
    }
  } catch {}
  return "My learning";
}

function StudentPortal({ user, profile, supabase, onSignOut }) {
  const [activeView, setActiveView] = useState(getInitialStudentView);
  const [assignments, setAssignments] = useState([]);
  const [submissions, setSubmissions] = useState([]);
  const [tests, setTests] = useState([]);
  const [courses, setCourses] = useState([]);
  const [notes, setNotes] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [downloadRequests, setDownloadRequests] = useState([]);
  const [permittedMaterialIds, setPermittedMaterialIds] = useState(() => new Set());
  const [permittedAssessmentIds, setPermittedAssessmentIds] = useState(() => new Set());
  const [enrolledCourseIds, setEnrolledCourseIds] = useState(() => new Set());
  const [viewingDocument, setViewingDocument] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [attempts, setAttempts] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [messages, setMessages] = useState([]);
  const [selectedConversation, setSelectedConversation] = useState("");
  const [selectedTest, setSelectedTest] = useState("");
  const [answers, setAnswers] = useState({});
  const [submissionDraft, setSubmissionDraft] = useState(null);
  const [submissionModeByAssignment, setSubmissionModeByAssignment] = useState({});
  const [newSubject, setNewSubject] = useState("");
  const [messageDraft, setMessageDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [courseSessionFilter, setCourseSessionFilter] = useState("all");
  const [syllabusCourseFilter, setSyllabusCourseFilter] = useState("all");
  const [expandedCourseSyllabus, setExpandedCourseSyllabus] = useState(() => new Set());
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const loadPortal = useCallback(async (forceLoading = false) => {
    if (forceLoading) setLoading(true);
    setError("");

    const noteQuery = supabase
      .from("student_notes")
      .select("id, course_id, title, body, status, category, due_at, drive_url, material_id, created_at")
      .eq("student_id", user.id)
      .order("created_at", { ascending: false })
      .then(async (res) => {
        if (res.error) {
          return supabase
            .from("student_notes")
            .select("id, course_id, title, body, drive_url, material_id, created_at")
            .eq("student_id", user.id)
            .order("created_at", { ascending: false })
            .then(async (fallbackRes) => {
              if (fallbackRes.error) {
                return supabase
                  .from("student_notes")
                  .select("id, course_id, title, body, created_at")
                  .eq("student_id", user.id)
                  .order("created_at", { ascending: false });
              }
              return fallbackRes;
            });
        }
        return res;
      });

    const materialRecipientsQuery = supabase
      .from("material_recipients")
      .select("material_id")
      .eq("student_id", user.id)
      .then((res) => (res.error ? { data: [] } : res));

    const assessmentRecipientsQuery = supabase
      .from("assessment_recipients")
      .select("assessment_id")
      .eq("student_id", user.id)
      .then((res) => (res.error ? { data: [] } : res));

    const [
      assignmentResult,
      submissionResult,
      testResult,
      attemptResult,
      conversationResult,
      courseResult,
      noteResult,
      attendanceResult,
      notificationResult,
      materialResult,
      requestResult,
      materialRecipientsResult,
      assessmentRecipientsResult,
      enrollmentResult,
    ] = await Promise.all([
      supabase.from("assignments").select("id, title, description, due_at, course_id, total_marks, created_at").eq("published", true).order("due_at", { ascending: true, nullsFirst: false }),
      supabase.from("assignment_submissions").select("id, assignment_id, answer_text, file_path, submission_type, submission_link, status, submitted_at, grade, feedback, graded_at").eq("student_id", user.id),
      supabase.from("assessments").select("id, title, description, due_at, external_url, file_path, show_marks, created_at").eq("published", true).order("due_at", { ascending: true, nullsFirst: false }),
      supabase.from("assessment_attempts").select("id, assessment_id, score, max_score, submitted_at").eq("student_id", user.id),
      supabase.from("conversations").select("id, subject, created_at").eq("student_id", user.id).order("created_at", { ascending: false }),
      supabase.from("courses").select("id, name, code, description, department, instructor, schedule, room").order("name"),
      noteQuery,
      supabase.from("attendance_records").select("id, course_id, attendance_date, status, note").eq("student_id", user.id).order("attendance_date", { ascending: false }),
      supabase.from("student_notifications").select("id, title, body, read_at, created_at").eq("student_id", user.id).order("created_at", { ascending: false }),
      supabase.from("course_materials").select("*").order("created_at", { ascending: false }),
      supabase.from("download_requests").select("*").eq("student_id", user.id),
      materialRecipientsQuery,
      assessmentRecipientsQuery,
      supabase.from("course_enrollments").select("course_id").eq("student_id", user.id).then((r) => (r.error ? { data: [] } : r)),
    ]);
    const failed = [assignmentResult, submissionResult, testResult, attemptResult, conversationResult, courseResult, noteResult, attendanceResult, notificationResult, materialResult, requestResult].find((result) => result.error);
    if (failed) {
      console.warn("Portal coursework query warning:", failed.error);
    }

    const loadedTests = testResult.data ?? [];
    const loadedConversations = conversationResult.data ?? [];
    const [questionResult, messageResult] = await Promise.all([
      loadedTests.length
        ? supabase.from("student_assessment_questions").select("id, assessment_id, prompt, options, points, sort_order").in("assessment_id", loadedTests.map((test) => test.id)).order("sort_order")
        : Promise.resolve({ data: [], error: null }),
      loadedConversations.length
        ? supabase.from("messages").select("id, conversation_id, sender_id, body, read_at, created_at").in("conversation_id", loadedConversations.map((conversation) => conversation.id)).order("created_at")
        : Promise.resolve({ data: [], error: null }),
    ]);

    setAssignments(assignmentResult.data ?? []);
    setSubmissions(submissionResult.data ?? []);
    setTests(loadedTests);
    setCourses(courseResult.data ?? []);
    setNotes(noteResult.data ?? []);
    setAttendance(attendanceResult.data ?? []);
    setNotifications(notificationResult.data ?? []);
    setMaterials(materialResult.data ?? []);
    setDownloadRequests(requestResult.data ?? []);
    const permittedMatIds = new Set((materialRecipientsResult?.data ?? []).map((r) => r.material_id));
    for (const n of (noteResult.data ?? [])) {
      if (n.material_id) permittedMatIds.add(n.material_id);
    }
    for (const m of (materialResult.data ?? [])) {
      if ((m.category || "").toLowerCase() === "syllabus" || (m.title || "").toLowerCase().includes("syllabus")) {
        permittedMatIds.add(m.id);
      }
    }
    setPermittedMaterialIds(permittedMatIds);
    setPermittedAssessmentIds(new Set((assessmentRecipientsResult?.data ?? []).map((r) => r.assessment_id)));
    setEnrolledCourseIds(new Set((enrollmentResult?.data ?? []).map((r) => r.course_id)));
    setQuestions(questionResult.data ?? []);
    setAttempts(attemptResult.data ?? []);
    setConversations(loadedConversations);
    setMessages(messageResult.data ?? []);
    setLoading(false);
  }, [supabase, user.id]);

  useEffect(() => { loadPortal(true); }, [loadPortal]);

  // Debounced quiet reload to eliminate lag and prevent duplicate cascading fetches
  const debounceTimerRef = useRef(null);
  const debouncedReload = useCallback(() => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      loadPortal(false);
    }, 120);
  }, [loadPortal]);

  // Real-time synchronization with instant memory patching for zero-latency UI updates
  useEffect(() => {
    if (!supabase || !user?.id) return;
    const channel = supabase
      .channel(`student-portal-realtime-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, debouncedReload)
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, debouncedReload)
      .on("postgres_changes", { event: "*", schema: "public", table: "assignments" }, debouncedReload)
      .on("postgres_changes", { event: "*", schema: "public", table: "assignment_submissions" }, debouncedReload)
      .on("postgres_changes", { event: "*", schema: "public", table: "assessments" }, debouncedReload)
      .on("postgres_changes", { event: "*", schema: "public", table: "assessment_attempts" }, debouncedReload)
      .on("postgres_changes", { event: "*", schema: "public", table: "courses" }, debouncedReload)
      .on("postgres_changes", { event: "*", schema: "public", table: "course_enrollments" }, debouncedReload)
      .on("postgres_changes", { event: "*", schema: "public", table: "attendance_records" }, (payload) => {
        // Instant optimistic patch for attendance
        if (payload.new && payload.new.student_id === user.id) {
          setAttendance((prev) => {
            const next = prev.filter((r) => !(r.student_id === user.id && r.attendance_date === payload.new.attendance_date));
            return [payload.new, ...next];
          });
        }
        debouncedReload();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "student_notes" }, (payload) => {
        // Instant optimistic patch for notes / tasks
        if (payload.new && payload.new.student_id === user.id) {
          setNotes((prev) => {
            const exists = prev.some((n) => n.id === payload.new.id);
            if (exists) {
              return prev.map((n) => (n.id === payload.new.id ? payload.new : n));
            }
            return [payload.new, ...prev];
          });
        } else if (payload.eventType === "DELETE" && payload.old) {
          setNotes((prev) => prev.filter((n) => n.id !== payload.old.id));
        }
        debouncedReload();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "course_materials" }, debouncedReload)
      .on("postgres_changes", { event: "*", schema: "public", table: "material_recipients" }, (payload) => {
        // Instant patch for syllabus / material permission
        if (payload.new && payload.new.student_id === user.id) {
          setPermittedMaterialIds((prev) => new Set([...prev, payload.new.material_id]));
        } else if (payload.eventType === "DELETE" && payload.old?.student_id === user.id) {
          setPermittedMaterialIds((prev) => {
            const next = new Set(prev);
            next.delete(payload.old.material_id);
            return next;
          });
        }
        debouncedReload();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "assessment_recipients" }, (payload) => {
        // Instant patch for test permission
        if (payload.new && payload.new.student_id === user.id) {
          setPermittedAssessmentIds((prev) => new Set([...prev, payload.new.assessment_id]));
        } else if (payload.eventType === "DELETE" && payload.old?.student_id === user.id) {
          setPermittedAssessmentIds((prev) => {
            const next = new Set(prev);
            next.delete(payload.old.assessment_id);
            return next;
          });
        }
        debouncedReload();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "download_requests" }, debouncedReload)
      .on("postgres_changes", { event: "*", schema: "public", table: "student_notifications" }, debouncedReload)
      .subscribe();

    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      supabase.removeChannel(channel);
    };
  }, [supabase, user.id, debouncedReload]);

  useEffect(() => {
    if (activeView !== "Messages" || !user.id) return;
    const unreadIncoming = messages.filter((message) => message.sender_id !== user.id && !message.read_at);
    if (!unreadIncoming.length) return;
    const messageIds = unreadIncoming.map((message) => message.id);
    supabase.from("messages").update({ read_at: new Date().toISOString() }).in("id", messageIds)
      .then(({ error: updateError }) => {
        if (updateError) setError(`Could not mark messages as read: ${updateError.message}`);
        else {
          const marked = new Set(messageIds);
          setMessages((current) => current.map((message) => marked.has(message.id) ? { ...message, read_at: new Date().toISOString() } : message));
        }
      });
  }, [activeView, messages, supabase, user.id]);

  const submissionByAssignment = useMemo(() => new Map(submissions.map((item) => [item.assignment_id, item])), [submissions]);
  const attemptByTest = useMemo(() => new Map(attempts.map((item) => [item.assessment_id, item])), [attempts]);
  const coursesById = useMemo(() => Object.fromEntries(courses.map((c) => [c.id, c])), [courses]);
  const requestByMaterial = useMemo(
    () => new Map((downloadRequests || []).filter((r) => r.material_id).map((r) => [r.material_id, r])),
    [downloadRequests]
  );
  const requestByTest = useMemo(
    () => new Map((downloadRequests || []).filter((r) => r.assessment_id).map((r) => [r.assessment_id, r])),
    [downloadRequests]
  );
  const unreadMessages = messages.filter((message) => message.sender_id !== user.id && !message.read_at).length;
  const filteredAssignments = assignments.filter((item) => `${item.title} ${item.description}`.toLowerCase().includes(query.trim().toLowerCase()));
  const allowedTests = useMemo(() => {
    return tests.filter((item) => {
      // If student has an attempt, show it (e.g. past submitted test)
      if (attemptByTest.has(item.id)) return true;
      // If explicitly permitted to this student
      if (permittedAssessmentIds.has(item.id)) return true;
      return false;
    });
  }, [tests, permittedAssessmentIds, attemptByTest]);
  const filteredTests = allowedTests.filter((item) => `${item.title} ${item.description || ""}`.toLowerCase().includes(query.trim().toLowerCase()));
  const filteredConversations = conversations.filter((item) => item.subject.toLowerCase().includes(query.trim().toLowerCase()));
  const activeConversation = conversations.find((item) => item.id === selectedConversation);
  const currentThread = messages.filter((item) => item.conversation_id === selectedConversation);
  const currentTest = allowedTests.find((item) => item.id === selectedTest);
  const currentQuestions = questions.filter((item) => item.assessment_id === selectedTest);
  const currentAttempt = attemptByTest.get(selectedTest);

  async function openSecureViewer({ title, subtitle, url, filePath, materialId, testId }) {
    let finalUrl = url;
    let directDownload = null;

    if (filePath) {
      if (filePath.startsWith("data:") || filePath.startsWith("http")) {
        finalUrl = filePath;
        directDownload = filePath;
      } else {
        let bucket = "course-materials";
        let cleanPath = filePath;
        if (filePath.startsWith("course-materials:")) {
          cleanPath = filePath.replace("course-materials:", "");
        } else if (filePath.startsWith("assignment-files:")) {
          bucket = "assignment-files";
          cleanPath = filePath.replace("assignment-files:", "");
        }

        let signedData = null;
        let { data, error: signedError } = await supabase.storage
          .from(bucket)
          .createSignedUrl(cleanPath, 3600);

        if (!signedError && data?.signedUrl) {
          signedData = data;
        } else {
          // Try other bucket fallback
          const otherBucket = bucket === "course-materials" ? "assignment-files" : "course-materials";
          const { data: fallbackData } = await supabase.storage
            .from(otherBucket)
            .createSignedUrl(cleanPath, 3600);
          signedData = fallbackData;
        }

        if (signedData?.signedUrl) {
          finalUrl = signedData.signedUrl;
          directDownload = signedData.signedUrl;
        } else {
          setError("Could not generate a secure preview URL for this document.");
          return;
        }
      }
    }

    const existingRequest = materialId
      ? requestByMaterial.get(materialId)
      : testId
      ? requestByTest.get(testId)
      : null;

    setViewingDocument({
      title,
      subtitle,
      url: finalUrl,
      directDownloadUrl: directDownload,
      materialId,
      testId,
      downloadStatus: existingRequest?.status || null,
    });
  }

  async function submitDownloadRequest(materialId, testId, reason = "") {
    setBusy(true);
    setError("");
    try {
      const { error: reqError } = await supabase.rpc("request_download", {
        p_material_id: materialId || null,
        p_assessment_id: testId || null,
        p_reason: reason || "",
      });
      if (reqError) throw reqError;
      setNotice("Download request sent to administrator. Once approved, the download button will unlock.");
      await loadPortal();
      if (viewingDocument) {
        setViewingDocument((curr) => curr ? { ...curr, downloadStatus: "pending" } : null);
      }
    } catch (err) {
      setError(`Could not send request: ${err.message}`);
    } finally {
      setBusy(false);
    }
  }

  async function markExternalTestCompleted(testId) {
    setBusy(true);
    setError("");
    try {
      const { error: submitError } = await supabase.rpc("student_complete_external_assessment", {
        p_assessment_id: testId,
      });
      if (submitError) throw submitError;
      setNotice("Exam marked as submitted! Your instructor has received your completion status.");
      if (viewingDocument && viewingDocument.testId === testId) {
        setViewingDocument(null);
      }
      await loadPortal();
    } catch (err) {
      setError(`Could not mark test as completed: ${err.message}`);
    } finally {
      setBusy(false);
    }
  }

  async function downloadApprovedItem(material) {
    try {
      if (material.file_path) {
        if (material.file_path.startsWith("data:") || material.file_path.startsWith("http")) {
          const a = document.createElement("a");
          a.href = material.file_path;
          a.download = material.file_name || `${material.title || "document"}.pdf`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          return;
        }

        let bucket = "course-materials";
        let cleanPath = material.file_path;
        if (material.file_path.startsWith("course-materials:")) {
          cleanPath = material.file_path.replace("course-materials:", "");
        } else if (material.file_path.startsWith("assignment-files:")) {
          bucket = "assignment-files";
          cleanPath = material.file_path.replace("assignment-files:", "");
        }

        let { data, error: signedError } = await supabase.storage
          .from(bucket)
          .createSignedUrl(cleanPath, 120);

        if (!signedError && data?.signedUrl) {
          window.open(data.signedUrl, "_blank");
        } else {
          const otherBucket = bucket === "course-materials" ? "assignment-files" : "course-materials";
          const { data: fallbackData } = await supabase.storage
            .from(otherBucket)
            .createSignedUrl(cleanPath, 120);
          if (fallbackData?.signedUrl) {
            window.open(fallbackData.signedUrl, "_blank");
          } else {
            throw new Error(signedError?.message || "File could not be found in storage.");
          }
        }
      } else if (material.drive_url) {
        const downloadUrl = getDriveDownloadExportUrl(material.drive_url);
        window.open(downloadUrl, "_blank");
      }
    } catch (err) {
      setError(`Download error: ${err.message}`);
    }
  }

  async function toggleTaskStatus(taskId, currentStatus) {
    const nextStatus = currentStatus === "completed" ? "assigned" : "completed";
    setBusy(true);
    try {
      const { error: updateErr } = await supabase
        .from("student_notes")
        .update({ status: nextStatus })
        .eq("id", taskId);
      if (updateErr) {
        console.warn("Could not update task status:", updateErr.message);
      }
      setNotes((prev) =>
        prev.map((n) => (n.id === taskId ? { ...n, status: nextStatus } : n))
      );
      setNotice(nextStatus === "completed" ? "Task marked as completed!" : "Task marked as assigned.");
    } catch (err) {
      console.warn(err);
    } finally {
      setBusy(false);
    }
  }

  function navigate(view) {
    setActiveView(view);
    try {
      localStorage.setItem("student_active_view", view);
      window.location.hash = view.toLowerCase().replace(/[^a-z0-9]/g, "-");
    } catch {}
    setQuery("");
    setNotice("");
    setError("");
    setMobileNavOpen(false);
  }

  async function submitAssignment(event, assignment) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const subMode = formData.get("submission_type") || submissionModeByAssignment[assignment.id] || "file";
    const answerText = String(formData.get("answer_text") ?? "").trim();
    const linkUrl = String(formData.get("submission_link") ?? "").trim();
    const file = formData.get("attachment");
    const actualFile = file instanceof File && file.size > 0 ? file : null;

    if (subMode === "link" && !linkUrl) {
      setError("Please provide a valid URL link (e.g. Google Drive, GitHub repo, or external URL).");
      return;
    }
    if (subMode === "file" && !actualFile && !submissionByAssignment.get(assignment.id)?.file_path && !answerText) {
      setError("Please attach a document (PDF, DOCX, ZIP) or write a response.");
      return;
    }
    if (actualFile && actualFile.size > MAX_FILE_SIZE) {
      setError("File exceeds 10 MB limit.");
      return;
    }

    setBusy(true);
    setError("");
    setNotice("");
    const previous = submissionByAssignment.get(assignment.id);
    let uploadedPath = null;
    try {
      if (actualFile && subMode === "file") {
        const safeName = actualFile.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        uploadedPath = `${user.id}/${assignment.id}/${crypto.randomUUID()}-${safeName}`;
        const { error: uploadError } = await supabase.storage.from("assignment-files").upload(uploadedPath, actualFile, { contentType: actualFile.type || "application/octet-stream", upsert: false });
        if (uploadError) throw uploadError;
      }

      const { error: saveError } = await supabase.from("assignment_submissions").upsert({
        assignment_id: assignment.id,
        student_id: user.id,
        answer_text: answerText || (subMode === "link" ? linkUrl : ""),
        submission_type: subMode === "link" ? "Link" : "File",
        submission_link: subMode === "link" ? linkUrl : (previous?.submission_link || null),
        file_path: uploadedPath || (subMode === "file" ? previous?.file_path : null),
        status: "Completed",
        submitted_at: new Date().toISOString(),
      }, { onConflict: "assignment_id,student_id" });
      if (saveError) {
        if (uploadedPath) await supabase.storage.from("assignment-files").remove([uploadedPath]);
        throw saveError;
      }
      if (uploadedPath && previous?.file_path) {
        await supabase.storage.from("assignment-files").remove([previous.file_path]).catch(() => {});
      }
      setSubmissionDraft(null);
      event.currentTarget.reset();
      setNotice("Work submitted successfully! Assignment status automatically changed to Completed.");
      await loadPortal();
    } catch (requestError) {
      setError(requestError.message || "Your assignment could not be submitted.");
    } finally {
      setBusy(false);
    }
  }

  async function openSubmissionFile(path) {
    const { data: fileData, error: fileError } = await supabase.storage.from("assignment-files").createSignedUrl(path, 60);
    if (fileError) {
      setError(fileError.message);
      return;
    }
    window.open(fileData.signedUrl, "_blank", "noopener,noreferrer");
  }

  async function submitTest(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const { data: result, error: submitError } = await supabase.rpc("submit_assessment", { p_assessment_id: selectedTest, p_answers: answers });
    if (submitError) {
      setError(submitError.message);
    } else {
      const attempt = Array.isArray(result) ? result[0] : result;
      setNotice(`Test submitted. Your score is ${attempt.score} out of ${attempt.max_score}.`);
      setSelectedTest("");
      setAnswers({});
      await loadPortal();
    }
    setBusy(false);
  }

  async function sendMessage(event) {
    event.preventDefault();
    const body = messageDraft.trim();
    const subject = newSubject.trim();
    if (!body || (!selectedConversation && !subject)) return;
    setBusy(true);
    setError("");
    setNotice("");
    let conversationId = selectedConversation;
    if (!conversationId) {
      const { data: conversation, error: conversationError } = await supabase.from("conversations")
        .insert({ student_id: user.id, subject }).select("id, subject, created_at").single();
      if (conversationError) {
        setError(conversationError.message);
        setBusy(false);
        return;
      }
      conversationId = conversation.id;
      setConversations((prev) => [conversation, ...prev]);
    }
    const { data: sentMsg, error: messageError } = await supabase.from("messages").insert({
      conversation_id: conversationId,
      sender_id: user.id,
      body,
    }).select("id, conversation_id, sender_id, body, read_at, created_at").single();
    if (messageError) {
      setError(messageError.message);
    } else {
      if (sentMsg) {
        setMessages((prev) => (prev.some((m) => m.id === sentMsg.id) ? prev : [...prev, sentMsg]));
      }
      setMessageDraft("");
      setNewSubject("");
      setSelectedConversation(conversationId);
      setNotice("Your message was sent.");
      await loadPortal();
    }
    setBusy(false);
  }

  function renderAssignments() {
    return (
      <section className="portal-list">
        {filteredAssignments.map((assignment) => {
          const submission = submissionByAssignment.get(assignment.id);
          const closed = isPast(assignment.due_at);
          const editing = submissionDraft === assignment.id;
          const isCompleted = !!submission || submission?.status === "Completed";
          const currentMode = submissionModeByAssignment[assignment.id] || (submission?.submission_type === "Link" || submission?.submission_link ? "link" : "file");

          return (
            <article className="card portal-item" key={assignment.id}>
              <div className="portal-item-heading">
                <span className="portal-item-icon assignment"><BookOpen size={17} /></span>
                <span className="portal-item-title">
                  <strong>{assignment.title}</strong>
                  <small><CalendarClock size={12} />Due {dateLabel(assignment.due_at)}</small>
                </span>
                <span
                  className={`badge ${isCompleted ? "green" : closed ? "rose" : "amber"}`}
                  style={{ fontWeight: 700, fontSize: "11px", display: "inline-flex", alignItems: "center", gap: "4px" }}
                >
                  {isCompleted ? <CheckCircle2 size={12} /> : closed ? <Clock3 size={12} /> : <Clock3 size={12} />}
                  {isCompleted ? "Completed" : closed ? "Past Due" : "Pending"}
                </span>
              </div>

              {assignment.description && <p className="portal-description">{assignment.description}</p>}

              {/* Submission Receipt */}
              {submission && (
                <div className="submission-receipt" style={{ marginTop: "12px", padding: "12px 14px", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "8px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <CheckCircle2 size={16} style={{ color: "#16a34a" }} />
                      <span style={{ fontSize: "13px", fontWeight: 700, color: "#166534" }}>
                        Status: Completed · Submitted {dateLabel(submission.submitted_at)}
                      </span>
                      <span className="badge blue" style={{ fontSize: "10.5px" }}>
                        {submission.submission_type || (submission.submission_link ? "URL Link" : "File Upload")}
                      </span>
                    </div>
                    {submission.grade !== null && (
                      <span className="badge green" style={{ fontSize: "12px", fontWeight: 800 }}>
                        Grade: {submission.grade} / {assignment.total_marks || 100} pts
                      </span>
                    )}
                  </div>

                  <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginTop: "10px" }}>
                    {submission.submission_link && (
                      <a
                        href={submission.submission_link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="button compact"
                        style={{ background: "#ffffff", borderColor: "#93c5fd", color: "#1d4ed8", display: "inline-flex", alignItems: "center", gap: "5px", textDecoration: "none" }}
                      >
                        <ExternalLink size={13} /> Open Submitted URL ({submission.submission_link.slice(0, 32)}...)
                      </a>
                    )}
                    {submission.file_path && (
                      <button
                        className="button compact"
                        type="button"
                        style={{ background: "#ffffff", borderColor: "#86efac", color: "#15803d", display: "inline-flex", alignItems: "center", gap: "5px" }}
                        onClick={() => openSubmissionFile(submission.file_path)}
                      >
                        <Download size={13} /> Download Submitted Document
                      </button>
                    )}
                  </div>

                  {submission.answer_text && submission.submission_type === "File" && (
                    <p style={{ margin: "8px 0 0", fontSize: "12.5px", color: "#334155" }}>
                      <strong>Note:</strong> {submission.answer_text}
                    </p>
                  )}

                  {submission.feedback && (
                    <div style={{ marginTop: "8px", paddingTop: "8px", borderTop: "1px solid #dcfce7", fontSize: "12.5px", color: "#14532d" }}>
                      <strong>Instructor Feedback:</strong> {submission.feedback}
                    </div>
                  )}
                </div>
              )}

              {!closed && !submission?.graded_at && (
                <div style={{ marginTop: "12px" }}>
                  <button
                    className="button"
                    type="button"
                    onClick={() => setSubmissionDraft(editing ? null : assignment.id)}
                  >
                    {submission ? "Update submission" : "Submit assignment"}
                    <ArrowRight size={14} />
                  </button>
                </div>
              )}

              {/* Submission Form with File Upload OR URL Link */}
              {editing && (
                <form
                  className="portal-form"
                  onSubmit={(event) => submitAssignment(event, assignment)}
                  style={{ marginTop: "14px", padding: "16px", background: "#f8fafc", borderRadius: "10px", border: "1px solid var(--line)" }}
                >
                  <div style={{ marginBottom: "12px" }}>
                    <span style={{ fontSize: "12.5px", fontWeight: 700, color: "var(--ink)", display: "block", marginBottom: "6px" }}>
                      Submission Method (Choose one):
                    </span>
                    <div style={{ display: "inline-flex", gap: "8px" }}>
                      <button
                        type="button"
                        className="button compact"
                        style={{
                          background: currentMode === "file" ? "#4f46e5" : "#fff",
                          color: currentMode === "file" ? "#fff" : "var(--ink)",
                          borderColor: currentMode === "file" ? "#4f46e5" : "var(--line)",
                          fontWeight: 700,
                        }}
                        onClick={() => setSubmissionModeByAssignment((prev) => ({ ...prev, [assignment.id]: "file" }))}
                      >
                        <Upload size={13} /> File Upload (PDF, DOCX, ZIP)
                      </button>
                      <button
                        type="button"
                        className="button compact"
                        style={{
                          background: currentMode === "link" ? "#4f46e5" : "#fff",
                          color: currentMode === "link" ? "#fff" : "var(--ink)",
                          borderColor: currentMode === "link" ? "#4f46e5" : "var(--line)",
                          fontWeight: 700,
                        }}
                        onClick={() => setSubmissionModeByAssignment((prev) => ({ ...prev, [assignment.id]: "link" }))}
                      >
                        <ExternalLink size={13} /> Direct URL Link (Google Drive / GitHub)
                      </button>
                    </div>
                    <input type="hidden" name="submission_type" value={currentMode} />
                  </div>

                  {currentMode === "link" ? (
                    <label className="form-field">
                      <span>Direct URL Link (Google Drive, GitHub repo, external URL) *</span>
                      <input
                        type="url"
                        name="submission_link"
                        required
                        defaultValue={submission?.submission_link || ""}
                        placeholder="https://drive.google.com/... or https://github.com/..."
                        style={{ fontSize: "13px" }}
                      />
                    </label>
                  ) : (
                    <label className="file-drop">
                      <Upload size={16} />
                      <span>Attach completed document <small>PDF, DOC, DOCX, ZIP, or TXT · Up to 10 MB</small></span>
                      <input
                        name="attachment"
                        type="file"
                        accept=".pdf,.doc,.docx,.zip,.txt,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/zip,text/plain"
                      />
                    </label>
                  )}

                  {submission?.file_path && currentMode === "file" && (
                    <small className="file-hint">
                      <Paperclip size={12} /> Your existing attachment stays unless you select a replacement file.
                    </small>
                  )}

                  <label className="form-field" style={{ marginTop: "10px" }}>
                    <span>Comments / Remarks (Optional)</span>
                    <textarea
                      name="answer_text"
                      rows="3"
                      maxLength="20000"
                      defaultValue={submission?.answer_text ?? ""}
                      placeholder="Add any notes for your instructor…"
                    />
                  </label>

                  <div className="form-actions" style={{ marginTop: "14px" }}>
                    <button className="button" type="button" onClick={() => setSubmissionDraft(null)}>Cancel</button>
                    <button className="button primary" disabled={busy}>
                      <CheckCircle2 size={14} /> {busy ? "Submitting…" : "Submit & Mark Completed"}
                    </button>
                  </div>
                </form>
              )}
            </article>
          );
        })}
        {!filteredAssignments.length && (
          <div className="card portal-empty">
            <BookOpen size={22} />
            <strong>No assignments found</strong>
            <span>New assignments from your instructor will appear here.</span>
          </div>
        )}
      </section>
    );
  }

  function renderTests() {
    if (currentTest && !currentAttempt) {
      return <article className="card test-panel">
        <button className="text-link" type="button" onClick={() => { setSelectedTest(""); setAnswers({}); }}>← All tests</button>
        <div className="panel-heading test-heading"><div><div className="eyebrow">Online test</div><h2>{currentTest.title}</h2><p>{currentTest.description}</p></div><span className="day-label">{currentQuestions.length} questions</span></div>
        {!currentQuestions.length ? <div className="form-error">This test does not have any questions yet. Contact your instructor.</div> : <form className="quiz-form" onSubmit={submitTest}>
          {currentQuestions.map((question, index) => <fieldset className="quiz-question" key={question.id}><legend><span>{String(index + 1).padStart(2, "0")}</span>{question.prompt}<small>{question.points} {question.points === 1 ? "point" : "points"}</small></legend><div className="quiz-options">{question.options.map((option, optionIndex) => <label className="quiz-option" key={optionIndex}><input type="radio" name={question.id} required checked={answers[question.id] === optionIndex} onChange={() => setAnswers((current) => ({ ...current, [question.id]: optionIndex }))} /><span>{option}</span></label>)}</div></fieldset>)}
          <div className="form-actions"><button className="button" type="button" onClick={() => { setSelectedTest(""); setAnswers({}); }}>Cancel</button><button className="button primary" disabled={busy || currentQuestions.some((question) => answers[question.id] === undefined)}><CheckCircle2 size={14} />{busy ? "Submitting…" : "Submit test"}</button></div>
        </form>}
      </article>;
    }
    return <section className="portal-list">{filteredTests.map((test) => {
      const attempt = attemptByTest.get(test.id);
      const closed = isPast(test.due_at);
      const count = questions.filter((question) => question.assessment_id === test.id).length;
      return <article className="card portal-item" key={test.id}>
        <div className="portal-item-heading"><span className="portal-item-icon test"><ClipboardList size={17} /></span><span className="portal-item-title"><strong>{test.title}</strong><small><CalendarClock size={12} />Due {dateLabel(test.due_at)} · {test.external_url ? "External test" : `${count} questions`}</small></span><span className={`portal-status ${attempt ? "submitted" : closed ? "overdue" : "pending"}`}>{attempt ? "Completed" : closed ? "Closed" : "Ready"}</span></div>
        {test.description && <p className="portal-description">{test.description}</p>}
        {attempt ? (
          <div className="test-completion-card">
            <div className="test-score-header">
              <span className="cohort-status-pill completed">
                <CheckCircle2 size={13} /> Completed
              </span>
              <span className="submission-date">Submitted {dateLabel(attempt.submitted_at)}</span>
            </div>
            {test.show_marks ? (
              <div className="test-score" style={{ marginTop: "6px" }}>
                <CheckCircle2 size={15} />
                <strong>Score: {attempt.score} / {attempt.max_score} ({Math.round((attempt.score / (attempt.max_score || 100)) * 100)}%)</strong>
                <span className="marks-verified-tag">Marks Released by Admin</span>
              </div>
            ) : (
              <div className="test-marks-pending">
                <Lock size={13} />
                <span>Marks pending evaluation · Will be released by administrator</span>
              </div>
            )}
          </div>
        ) : test.external_url ? (
          <div className="portal-actions" style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "10px" }}>
            <button
              className={`button ${closed ? "disabled" : "primary"}`}
              type="button"
              disabled={closed}
              onClick={() => openSecureViewer({
                title: test.title,
                subtitle: `Assessment · Due ${dateLabel(test.due_at)}`,
                url: test.external_url,
                testId: test.id,
              })}
            >
              <Eye size={14} />
              <span>{closed ? "Test closed" : "Open Test in Dashboard"}</span>
            </button>
            <a
              className="button"
              href={test.external_url}
              target="_blank"
              rel="noopener noreferrer"
              title="Open test link directly in new window"
            >
              <ExternalLink size={14} />
              <span>Open in New Tab</span>
            </a>
            {!closed && (
              <button
                className="button primary"
                type="button"
                disabled={busy}
                onClick={() => markExternalTestCompleted(test.id)}
                title="Mark this external exam as submitted"
              >
                <CheckCircle2 size={14} />
                <span>✓ I Have Submitted This Exam</span>
              </button>
            )}
          </div>
        ) : (
          <button className="button" type="button" disabled={closed} onClick={() => { setSelectedTest(test.id); setAnswers({}); }}>
            {closed ? "Test closed" : "Start test"}
            <ArrowRight size={14} />
          </button>
        )}
      </article>;
    })}
    {!filteredTests.length && <div className="card portal-empty"><ClipboardList size={22} /><strong>No tests found</strong><span>Published tests from your instructors will appear here.</span></div>}
    </section>;
  }

  function renderMaterials() {
    // 1. Direct course materials permitted to this student
    const directMaterials = materials.filter((item) => {
      const isPermitted = permittedMaterialIds.has(item.id);
      if (!isPermitted) return false;
      const course = coursesById[item.course_id];
      return `${item.title} ${item.description || ""} ${item.category} ${course?.name ?? ""} ${course?.code ?? ""}`
        .toLowerCase()
        .includes(query.trim().toLowerCase());
    });

    // 2. Also include any Google Drive attachments from student's notes
    const noteDriveItems = notes
      .filter((n) => n.drive_url || extractDriveUrl(n.body))
      .map((n) => {
        const driveUrl = n.drive_url || extractDriveUrl(n.body);
        return {
          id: `note-${n.id}`,
          title: n.title,
          description: cleanNoteBody(n.body, driveUrl),
          category: getDriveDocTypeLabel(driveUrl),
          course_id: n.course_id,
          drive_url: driveUrl,
          created_at: n.created_at,
          file_size: 0,
          isFromNotes: true,
        };
      });

    const seenUrls = new Set();
    const filtered = [];

    for (const m of directMaterials) {
      if (m.drive_url) seenUrls.add(m.drive_url.trim().toLowerCase());
      filtered.push(m);
    }

    for (const nd of noteDriveItems) {
      const u = nd.drive_url?.trim().toLowerCase();
      if (!u || !seenUrls.has(u)) {
        if (u) seenUrls.add(u);
        const course = coursesById[nd.course_id];
        const match = `${nd.title} ${nd.description || ""} ${nd.category} ${course?.name ?? ""} ${course?.code ?? ""}`
          .toLowerCase()
          .includes(query.trim().toLowerCase());
        if (match) {
          filtered.push(nd);
        }
      }
    }

    return (
      <section className="portal-materials-section">
        <div className="materials-grid">
          {filtered.map((item) => {
            const course = coursesById[item.course_id];
            const req = requestByMaterial.get(item.id);
            const isApproved = req?.status === "approved";
            const isPending = req?.status === "pending";
            const isRevoked = req?.status === "revoked";
            const isDrive = !!item.drive_url;

            return (
              <article className={`card material-card ${isDrive ? "material-card-drive" : "material-card-pdf"}`} key={item.id}>
                <div className="material-card-header">
                  <span className={`material-icon ${isDrive ? "drive" : "pdf"}`}>
                    {isDrive ? <Link2 size={18} /> : <FileText size={18} />}
                  </span>
                  <div className="material-card-badges">
                    <span className="badge gray">{item.category}</span>
                    {course ? (
                      <span className="badge blue">{course.code}</span>
                    ) : (
                      <span className="badge green">Campus-wide</span>
                    )}
                  </div>
                </div>

                <h3 className="material-title">{item.title}</h3>
                {item.description && <p className="material-desc">{item.description}</p>}

                <div className="material-meta">
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
                    <Check size={11} strokeWidth={3} /> Status: Assigned
                  </span>
                  <span className="badge-view-only" title="Protected view">
                    <Eye size={12} /> View-only in dashboard
                  </span>
                  {item.file_size > 0 && <span>{(item.file_size / (1024 * 1024)).toFixed(1)} MB</span>}
                  {isApproved && (
                    <span className="badge green"><Unlock size={11} /> Download Unlocked</span>
                  )}
                  {isPending && (
                    <span className="badge amber"><Clock3 size={11} /> Download Pending Approval</span>
                  )}
                  {isRevoked && (
                    <span className="badge rose"><Lock size={11} /> Download Revoked</span>
                  )}
                </div>

                <div className="material-actions student-material-actions two-buttons">
                  <button
                    className="button primary material-preview-btn"
                    type="button"
                    onClick={() =>
                      openSecureViewer({
                        title: item.title,
                        subtitle: item.category + (course ? ` · ${course.code}` : " · Campus-wide"),
                        url: item.drive_url,
                        filePath: item.file_path,
                        materialId: item.id,
                      })
                    }
                  >
                    <Eye size={14} />
                    <span>Open in Dashboard</span>
                  </button>

                  {isApproved ? (
                    <button
                      className="button material-student-action-btn material-btn-unlocked"
                      type="button"
                      onClick={() => downloadApprovedItem(item)}
                      title="Download document (approved by administrator)"
                    >
                      <Download size={13} /> <span>Download</span>
                    </button>
                  ) : isPending ? (
                    <button className="button disabled material-student-action-btn" type="button" disabled title="Waiting for instructor / admin approval">
                      <Clock3 size={13} /> <span>Pending</span>
                    </button>
                  ) : (
                    <button
                      className="button material-student-action-btn material-btn-request"
                      type="button"
                      onClick={() => submitDownloadRequest(item.id, null)}
                      title="Request permission to download this material"
                    >
                      <Lock size={13} /> <span>Request Download</span>
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
        {!filtered.length && (
          <div className="card portal-empty">
            <HardDrive size={22} />
            <strong>No study materials found</strong>
            <span>Course materials and Drive links uploaded by your administrator will appear here.</span>
          </div>
        )}
      </section>
    );
  }

  function renderCourses() {
    // Only display courses the student is actually enrolled in (fallback to all if no enrollments recorded yet)
    const activeCourses = enrolledCourseIds.size > 0 ? courses.filter((c) => enrolledCourseIds.has(c.id)) : courses;
    const filtered = activeCourses.filter((course) => {
      const search = `${course.name} ${course.code} ${course.department || ""} ${course.instructor || ""} ${course.room || ""} ${course.description || ""}`.toLowerCase();
      return search.includes(query.trim().toLowerCase());
    });

    const itCourses = filtered.filter(
      (c) => (c.department || "").toUpperCase() === "IT" ||
             (c.code || "").toUpperCase().startsWith("TMIT") ||
             /JAVA|PYTHON|REACT|WEB|SQL|CLOUD|NODE|FULL STACK/i.test(c.name || "")
    );

    const sapCourses = filtered.filter(
      (c) => (c.department || "").toUpperCase() === "SAP" ||
             (c.code || "").toUpperCase().startsWith("TMSAP") ||
             /SAP|FICO|MM|SD|ABAP|HANA/i.test(c.name || "")
    );

    const otherCourses = filtered.filter(
      (c) => !itCourses.some((it) => it.id === c.id) && !sapCourses.some((sap) => sap.id === c.id)
    );

    function renderSingleCourseCard(course) {
      return (
        <article className="card interactive-course-card student-course-card" key={course.id}>
          <div className="course-card-top">
            <div className="course-badges-group">
              <span className="course-code-badge">{course.code}</span>
              {course.department && <span className="course-dept-badge">{course.department}</span>}
            </div>
            <span className="portal-status submitted" style={{ fontSize: "11px", padding: "3px 8px" }}>
              Enrolled
            </span>
          </div>

          <div className="course-card-body">
            <h3 className="course-card-title">{course.name}</h3>
            {course.description ? (
              <p className="course-card-description">{course.description}</p>
            ) : (
              <p className="course-card-description placeholder">No syllabus outline provided yet.</p>
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

          <div style={{ marginTop: "14px", borderTop: "1px solid var(--line)", paddingTop: "12px", display: "flex", justifyContent: "flex-end" }}>
            <button
              type="button"
              className="button compact"
              onClick={() => {
                setSyllabusCourseFilter(course.id);
                navigate("Syllabus");
              }}
              title={`View syllabus and course roadmap for ${course.name}`}
            >
              <FileSpreadsheet size={13} /> View Syllabus
            </button>
          </div>
        </article>
      );
    }

    return (
      <div className="course-sessions-container">
        {/* Session Filter Tabs */}
        <div className="course-session-tabs">
          <button
            type="button"
            className={`course-session-tab ${courseSessionFilter === "all" ? "active" : ""}`}
            onClick={() => setCourseSessionFilter("all")}
          >
            All Courses ({filtered.length})
          </button>
          <button
            type="button"
            className={`course-session-tab ${courseSessionFilter === "it" ? "active" : ""}`}
            onClick={() => setCourseSessionFilter("it")}
          >
            🖥️ IT Courses ({itCourses.length})
          </button>
          <button
            type="button"
            className={`course-session-tab ${courseSessionFilter === "sap" ? "active" : ""}`}
            onClick={() => setCourseSessionFilter("sap")}
          >
            💼 SAP Modules ({sapCourses.length})
          </button>
        </div>

        {/* IT Courses Session */}
        {(courseSessionFilter === "all" || courseSessionFilter === "it") && (
          <div className="course-session-block">
            <div className="course-session-heading">
              <div className="course-session-title">
                <span>🖥️ IT &amp; Technical Programs</span>
                <span className="course-session-pill">{itCourses.length} Courses</span>
              </div>
            </div>
            {itCourses.length > 0 ? (
              <section className="courses-grid student-courses">
                {itCourses.map(renderSingleCourseCard)}
              </section>
            ) : (
              <p style={{ color: "var(--muted)", fontStyle: "italic", padding: "8px 0" }}>
                No IT courses enrolled in this track.
              </p>
            )}
          </div>
        )}

        {/* SAP Courses Session */}
        {(courseSessionFilter === "all" || courseSessionFilter === "sap") && (
          <div className="course-session-block">
            <div className="course-session-heading">
              <div className="course-session-title">
                <span>💼 SAP Enterprise Modules</span>
                <span className="course-session-pill sap">{sapCourses.length} Courses</span>
              </div>
            </div>
            {sapCourses.length > 0 ? (
              <section className="courses-grid student-courses">
                {sapCourses.map(renderSingleCourseCard)}
              </section>
            ) : (
              <p style={{ color: "var(--muted)", fontStyle: "italic", padding: "8px 0" }}>
                No SAP courses enrolled in this track.
              </p>
            )}
          </div>
        )}

        {/* Other Courses if any */}
        {otherCourses.length > 0 && courseSessionFilter === "all" && (
          <div className="course-session-block">
            <div className="course-session-heading">
              <div className="course-session-title">
                <span>Additional Courses</span>
                <span className="course-session-pill">{otherCourses.length} Courses</span>
              </div>
            </div>
            <section className="courses-grid student-courses">
              {otherCourses.map(renderSingleCourseCard)}
            </section>
          </div>
        )}

        {!filtered.length && (
          <div className="card portal-empty">
            <GraduationCap size={22} />
            <strong>No courses found</strong>
            <span>Your enrolled courses will appear here.</span>
          </div>
        )}
      </div>
    );
  }

  function renderSyllabus() {
    // Only display courses the student is actually enrolled in (fallback to all if no enrollments recorded yet)
    const activeCourses = enrolledCourseIds.size > 0
      ? courses.filter((c) => enrolledCourseIds.has(c.id))
      : courses;

    const allSyllabusMaterials = materials.filter((m) => {
      const cat = (m.category || "").toLowerCase();
      const title = (m.title || "").toLowerCase();
      return cat === "syllabus" || title.includes("syllabus");
    });

    const filtered = activeCourses.filter((course) => {
      if (syllabusCourseFilter !== "all" && course.id !== syllabusCourseFilter) {
        return false;
      }
      if (courseSessionFilter === "it") {
        const isIt = (course.department || "").toUpperCase() === "IT" ||
                     (course.code || "").toUpperCase().startsWith("TMIT") ||
                     /JAVA|PYTHON|REACT|WEB|SQL|CLOUD|NODE|FULL STACK/i.test(course.name || "");
        if (!isIt) return false;
      } else if (courseSessionFilter === "sap") {
        const isSap = (course.department || "").toUpperCase() === "SAP" ||
                      (course.code || "").toUpperCase().startsWith("TMSAP") ||
                      /SAP|FICO|MM|SD|ABAP|HANA/i.test(course.name || "");
        if (!isSap) return false;
      }

      const search = `${course.name} ${course.code} ${course.department || ""} ${course.instructor || ""} ${course.description || ""}`.toLowerCase();
      const queryMatch = search.includes(query.trim().toLowerCase());
      const hasMatchingDoc = allSyllabusMaterials.some(
        (m) => m.course_id === course.id && `${m.title} ${m.description || ""}`.toLowerCase().includes(query.trim().toLowerCase())
      );
      return queryMatch || hasMatchingDoc;
    });

    const generalSyllabi = allSyllabusMaterials.filter((m) => {
      if (m.course_id && coursesById[m.course_id]) return false;
      if (!query.trim()) return true;
      return `${m.title} ${m.description || ""}`.toLowerCase().includes(query.trim().toLowerCase());
    });

    function renderSyllabusCard(course) {
      const courseSyllabi = allSyllabusMaterials.filter((m) => m.course_id === course.id);
      const isExpanded = expandedCourseSyllabus.has(course.id);

      return (
        <article className="card interactive-course-card student-course-card" key={course.id} style={{ display: "flex", flexDirection: "column", gap: "14px", padding: "20px" }}>
          <div className="course-card-top" style={{ marginBottom: 0 }}>
            <div className="course-badges-group">
              <span className="course-code-badge" style={{ fontWeight: 700 }}>{course.code}</span>
              {course.department && <span className="course-dept-badge">{course.department}</span>}
              <span className="badge-view-only" style={{ background: "#f0fdf4", color: "#166534", fontSize: "11px", fontWeight: 600 }}>
                <FileSpreadsheet size={11} /> Syllabus
              </span>
            </div>
            <span className="portal-status submitted" style={{ fontSize: "11px", padding: "3px 8px" }}>
              Enrolled
            </span>
          </div>

          <div>
            <h3 className="course-card-title" style={{ fontSize: "18px", marginBottom: "6px" }}>{course.name}</h3>
            <div className="course-meta-chips" style={{ marginTop: "4px" }}>
              {course.instructor && (
                <span className="course-meta-chip" title="Faculty Instructor">
                  <GraduationCap size={13} /> {course.instructor}
                </span>
              )}
              {course.schedule && (
                <span className="course-meta-chip" title="Weekly Schedule">
                  <Clock3 size={13} /> {course.schedule}
                </span>
              )}
              {course.room && (
                <span className="course-meta-chip" title="Classroom / Lab">
                  <MapPin size={13} /> {course.room}
                </span>
              )}
            </div>
          </div>

          {/* Curriculum Outline Box */}
          <div style={{
            background: "#f8fafc",
            border: "1px solid #e2e8f0",
            borderRadius: "10px",
            padding: "14px 16px",
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "6px", fontWeight: 700, fontSize: "13px", color: "var(--ink)" }}>
                <BookOpen size={14} style={{ color: "var(--blue)" }} />
                <span>Curriculum &amp; Course Roadmap</span>
              </div>
              {course.description && course.description.length > 250 && (
                <button
                  type="button"
                  className="text-link"
                  style={{ fontSize: "12px", cursor: "pointer", background: "none", border: "none", color: "var(--blue)" }}
                  onClick={() => {
                    setExpandedCourseSyllabus((prev) => {
                      const next = new Set(prev);
                      if (next.has(course.id)) next.delete(course.id);
                      else next.add(course.id);
                      return next;
                    });
                  }}
                >
                  {isExpanded ? "Show Less" : "Expand Full Outline"}
                </button>
              )}
            </div>

            {course.description ? (
              <div style={{
                fontSize: "13px",
                lineHeight: "1.6",
                color: "#334155",
                whiteSpace: "pre-line",
                maxHeight: isExpanded ? "none" : "180px",
                overflow: isExpanded ? "visible" : "hidden",
                position: "relative"
              }}>
                {course.description}
                {!isExpanded && course.description.length > 250 && (
                  <div style={{
                    position: "absolute",
                    bottom: 0,
                    left: 0,
                    right: 0,
                    height: "40px",
                    background: "linear-gradient(transparent, #f8fafc)",
                    pointerEvents: "none"
                  }} />
                )}
              </div>
            ) : (
              <p style={{ margin: 0, fontSize: "13px", color: "var(--muted)", fontStyle: "italic" }}>
                Curriculum outline and topic schedule will be updated shortly by your instructor.
              </p>
            )}
          </div>

          {/* Attached Syllabus Documents */}
          {courseSyllabi.length > 0 ? (
            <div style={{ marginTop: "2px" }}>
              <div style={{
                fontSize: "11.5px",
                fontWeight: 700,
                color: "var(--muted)",
                textTransform: "uppercase",
                letterSpacing: "0.5px",
                marginBottom: "8px",
                display: "flex",
                alignItems: "center",
                gap: "6px"
              }}>
                <FileSpreadsheet size={13} /> Official Course Syllabi &amp; Handouts ({courseSyllabi.length})
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {courseSyllabi.map((mat) => (
                  <div
                    key={mat.id}
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "10px",
                      padding: "12px 14px",
                      background: "#f0fdf4",
                      border: "1px solid #bbf7d0",
                      borderRadius: "8px"
                    }}
                  >
                    <div style={{ flex: 1, minWidth: "200px" }}>
                      <strong style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "14px", color: "#166534" }}>
                        <FileSpreadsheet size={15} />
                        {mat.title}
                      </strong>
                      {mat.description && (
                        <p style={{ margin: "3px 0 0", fontSize: "12px", color: "#15803d", lineHeight: "1.4" }}>
                          {mat.description}
                        </p>
                      )}
                      <small style={{ color: "#166534", opacity: 0.85, fontSize: "11px", display: "block", marginTop: "4px" }}>
                        Uploaded {dateLabel(mat.created_at)} {mat.file_size ? `· ${(mat.file_size / 1024).toFixed(0)} KB` : ""}
                      </small>
                    </div>

                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
                      <button
                        type="button"
                        className="button primary compact"
                        style={{ background: "#16a34a", borderColor: "#15803d", minHeight: "32px", fontSize: "12px" }}
                        onClick={() =>
                          openSecureViewer({
                            title: mat.title,
                            subtitle: `${course.code} · Official Syllabus`,
                            url: mat.drive_url,
                            filePath: mat.file_path,
                            materialId: mat.id,
                          })
                        }
                      >
                        <Eye size={13} /> View Syllabus
                      </button>

                      {mat.drive_url && (
                        <a
                          className="button compact"
                          href={mat.drive_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Open Google Drive document"
                          style={{ borderColor: "#86efac", color: "#166534", minHeight: "32px", fontSize: "12px" }}
                        >
                          <ExternalLink size={13} /> Google Doc
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              padding: "8px 12px",
              background: "#fafafa",
              border: "1px dashed #e2e8f0",
              borderRadius: "6px",
              fontSize: "12px",
              color: "var(--muted)"
            }}>
              <CheckCircle2 size={13} style={{ color: "#16a34a", flexShrink: 0 }} />
              <span>Syllabus curriculum verified. Attached document handouts will appear here when posted.</span>
            </div>
          )}
        </article>
      );
    }

    return (
      <div className="course-sessions-container">
        {/* Session Filter Tabs & Course Dropdown */}
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "12px", marginBottom: "16px" }}>
          <div className="course-session-tabs" style={{ marginBottom: 0 }}>
            <button
              type="button"
              className={`course-session-tab ${courseSessionFilter === "all" && syllabusCourseFilter === "all" ? "active" : ""}`}
              onClick={() => {
                setCourseSessionFilter("all");
                setSyllabusCourseFilter("all");
              }}
            >
              All Enrolled ({activeCourses.length})
            </button>
            <button
              type="button"
              className={`course-session-tab ${courseSessionFilter === "it" && syllabusCourseFilter === "all" ? "active" : ""}`}
              onClick={() => {
                setCourseSessionFilter("it");
                setSyllabusCourseFilter("all");
              }}
            >
              🖥️ IT Courses
            </button>
            <button
              type="button"
              className={`course-session-tab ${courseSessionFilter === "sap" && syllabusCourseFilter === "all" ? "active" : ""}`}
              onClick={() => {
                setCourseSessionFilter("sap");
                setSyllabusCourseFilter("all");
              }}
            >
              💼 SAP Modules
            </button>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <label htmlFor="syllabus-course-select" style={{ fontSize: "12px", fontWeight: 600, color: "var(--muted)" }}>Filter Course:</label>
            <select
              id="syllabus-course-select"
              className="input-select"
              style={{ fontSize: "12px", padding: "6px 12px", borderRadius: "8px" }}
              value={syllabusCourseFilter}
              onChange={(e) => {
                setSyllabusCourseFilter(e.target.value);
                setCourseSessionFilter("all");
              }}
            >
              <option value="all">All Enrolled Courses</option>
              {activeCourses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code} · {c.name}
                </option>
              ))}
            </select>
            {syllabusCourseFilter !== "all" && (
              <button
                type="button"
                className="button compact"
                style={{ fontSize: "11px", padding: "4px 8px" }}
                onClick={() => setSyllabusCourseFilter("all")}
              >
                Reset
              </button>
            )}
          </div>
        </div>

        {/* Syllabi Grid */}
        {filtered.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            {filtered.map(renderSyllabusCard)}
          </div>
        ) : (
          <div className="card portal-empty">
            <FileSpreadsheet size={24} />
            <strong>No course syllabi found</strong>
            <span>{query ? `No syllabi matched "${query}". Try searching a different keyword.` : "Your enrolled course syllabi will appear here once registered."}</span>
          </div>
        )}

        {/* Campus-wide General Syllabi */}
        {generalSyllabi.length > 0 && (
          <div className="course-session-block" style={{ marginTop: "32px" }}>
            <div className="course-session-heading">
              <div className="course-session-title">
                <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <FileSpreadsheet size={16} /> Campus-Wide Academic Syllabi &amp; Calendars
                </span>
                <span className="course-session-pill">{generalSyllabi.length} Document{generalSyllabi.length > 1 ? "s" : ""}</span>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "16px" }}>
              {generalSyllabi.map((mat) => (
                <article className="card panel" key={mat.id} style={{ display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "8px" }}>
                      <span className="badge blue" style={{ fontSize: "11px", fontWeight: 700 }}>
                        Campus-Wide
                      </span>
                      <span className="badge-view-only" style={{ background: "#f0fdf4", color: "#166534", fontSize: "11px" }}>
                        Syllabus
                      </span>
                    </div>

                    <h3 style={{ fontSize: "16px", fontWeight: 700, margin: "0 0 6px", color: "var(--ink)" }}>{mat.title}</h3>
                    <p style={{ fontSize: "13px", color: "var(--muted)", margin: "0 0 12px", lineHeight: 1.4 }}>
                      {mat.description || "General campus academic syllabus and course schedule."}
                    </p>
                  </div>

                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", borderTop: "1px solid var(--line)", paddingTop: "12px" }}>
                    <button
                      className="button primary compact"
                      type="button"
                      onClick={() =>
                        openSecureViewer({
                          title: mat.title,
                          subtitle: "Campus-Wide Syllabus",
                          url: mat.drive_url,
                          filePath: mat.file_path,
                          materialId: mat.id,
                        })
                      }
                    >
                      <Eye size={13} /> View Syllabus
                    </button>
                    {mat.drive_url && (
                      <a
                        className="button compact"
                        href={mat.drive_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Open in new Google tab"
                      >
                        <ExternalLink size={13} /> Google Doc
                      </a>
                    )}
                  </div>
                </article>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  function renderNotes() {
    const filtered = notes.filter((note) => `${note.title} ${note.body} ${coursesById[note.course_id]?.name ?? ""}`.toLowerCase().includes(query.trim().toLowerCase()));

    const permittedLectureMaterials = materials.filter((m) => {
      // Only show course materials explicitly permitted to this student
      if (!permittedMaterialIds.has(m.id)) return false;
      // Avoid duplicate display if already present in student_notes
      const alreadyInNotes = notes.some((n) => n.material_id === m.id || n.title.toLowerCase() === m.title.toLowerCase());
      if (alreadyInNotes) return false;
      const matchesSearch = `${m.title} ${m.description || ""}`.toLowerCase().includes(query.trim().toLowerCase());
      return matchesSearch;
    });

    return (
      <div className="student-notes-section">
        <section className="portal-list">
          {filtered.map((note) => {
            const course = coursesById[note.course_id];
            const driveUrl = note.drive_url || extractDriveUrl(note.body);
            const cleanBody = cleanNoteBody(note.body, driveUrl);
            const docType = getDriveDocTypeLabel(driveUrl);
            const isCompleted = note.status === "completed";
            const dueFormatted = note.due_at
              ? new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(note.due_at))
              : null;

            return (
              <article className={`card portal-item note-portal-card ${isCompleted ? "task-completed-card" : ""}`} key={note.id}>
                <div className="portal-item-heading" style={{ alignItems: "flex-start" }}>
                  <span
                    className="portal-item-icon"
                    style={{
                      width: "40px",
                      height: "40px",
                      flexShrink: 0,
                      background: isCompleted ? "#ecfdf5" : "#eef2ff",
                      color: isCompleted ? "#059669" : "#4f46e5",
                    }}
                  >
                    {isCompleted ? <CheckCircle2 size={18} /> : <FileText size={18} />}
                  </span>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px" }}>
                      <strong style={{ fontSize: "16px", color: "var(--ink)", textDecoration: isCompleted ? "line-through" : "none" }}>
                        {note.title}
                      </strong>
                      {course && (
                        <span className="course-code-badge" style={{ fontSize: "11px" }}>
                          {course.code}
                        </span>
                      )}
                      <span className="badge blue" style={{ fontSize: "11px", fontWeight: 650 }}>
                        {note.category || "Task"}
                      </span>
                      {isCompleted ? (
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
                          <Check size={11} strokeWidth={3} /> Completed
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
                          <Clock3 size={11} /> To Do
                        </span>
                      )}
                    </div>

                    <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", marginTop: "4px", fontSize: "12px", color: "var(--muted)" }}>
                      <span>{course ? `${course.name} · ` : ""}Assigned {dateLabel(note.created_at)}</span>
                      {dueFormatted && (
                        <span style={{ color: "#d97706", fontWeight: 600, display: "flex", alignItems: "center", gap: "4px" }}>
                          <CalendarClock size={12} /> Due: {dueFormatted}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {cleanBody && (
                  <p className="portal-description" style={{ marginTop: "12px", whiteSpace: "pre-wrap", color: "var(--ink)", lineHeight: 1.5 }}>
                    {cleanBody}
                  </p>
                )}

                <div style={{ marginTop: "14px", display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "10px", borderTop: "1px solid var(--line)", paddingTop: "12px" }}>
                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                    {driveUrl && (
                      <button
                        type="button"
                        className="button primary compact"
                        onClick={() =>
                          openSecureViewer({
                            title: note.title,
                            subtitle: course ? `${course.code} · ${course.name}` : "Task Attachment",
                            url: driveUrl,
                          })
                        }
                      >
                        <Eye size={13} /> View Attached Doc in Dashboard
                      </button>
                    )}
                  </div>

                  <button
                    type="button"
                    className={`button compact ${isCompleted ? "" : "primary"}`}
                    onClick={() => toggleTaskStatus(note.id, note.status || "assigned")}
                    disabled={busy}
                    style={{ minHeight: "32px", fontSize: "12px" }}
                  >
                    <CheckCircle2 size={13} />
                    <span>{isCompleted ? "Mark as Incomplete" : "Mark as Completed"}</span>
                  </button>
                </div>
              </article>
            );
          })}

          {!filtered.length && !permittedLectureMaterials.length && (
            <div className="card portal-empty">
              <CheckCircle2 size={24} />
              <strong>No tasks assigned</strong>
              <span>Course tasks and practice assignments assigned specifically to your account will appear here.</span>
            </div>
          )}
        </section>

        {permittedLectureMaterials.length > 0 && (
          <div style={{ marginTop: "32px" }}>
            <div className="course-session-heading" style={{ marginBottom: "14px" }}>
              <div className="course-session-title">
                <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <BookOpen size={16} /> Course Lecture Notes &amp; Study Guides
                </span>
                <span className="course-session-pill">{permittedLectureMaterials.length} Permitted</span>
              </div>
            </div>

            <section className="portal-list">
              {permittedLectureMaterials.map((mat) => {
                const course = coursesById[mat.course_id];
                const docType = mat.drive_url ? getDriveDocTypeLabel(mat.drive_url) : "PDF Document";

                return (
                  <article className="card portal-item" key={mat.id}>
                    <div className="portal-item-heading" style={{ alignItems: "flex-start" }}>
                      <span className="portal-item-icon" style={{ width: "40px", height: "40px", flexShrink: 0, background: "#eef2ff", color: "#4f46e5" }}>
                        <HardDrive size={18} />
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px" }}>
                          <strong style={{ fontSize: "16px", color: "var(--ink)" }}>{mat.title}</strong>
                          {course && <span className="course-code-badge" style={{ fontSize: "11px" }}>{course.code}</span>}
                          <span className="badge-view-only" style={{ background: "#eef2ff", color: "#4f46e5", fontSize: "11px" }}>
                            <HardDrive size={11} /> {mat.category || docType}
                          </span>
                        </div>
                        <small style={{ display: "block", marginTop: "3px", color: "var(--muted)" }}>
                          {course ? `${course.name} · ` : ""}Added {dateLabel(mat.created_at)}
                        </small>
                      </div>
                    </div>

                    {mat.description && <p className="portal-description" style={{ marginTop: "10px" }}>{mat.description}</p>}

                    <div className="note-lecture-actions" style={{ marginTop: "12px", display: "flex", gap: "8px", flexWrap: "wrap" }}>
                      <button
                        type="button"
                        className="button primary compact"
                        onClick={() =>
                          openSecureViewer({
                            title: mat.title,
                            subtitle: course ? `${course.code} · ${course.name}` : "Lecture Notes",
                            url: mat.drive_url,
                            filePath: mat.file_path,
                            materialId: mat.id,
                          })
                        }
                      >
                        <Eye size={13} /> View Note Document
                      </button>
                    </div>
                  </article>
                );
              })}
            </section>
          </div>
        )}
      </div>
    );
  }

  function renderAttendance() {
    const totalDays = attendance.length;
    const presentCount = attendance.filter((r) => (r.status || "").toLowerCase() === "present").length;
    const lateCount = attendance.filter((r) => (r.status || "").toLowerCase() === "late").length;
    const absentCount = attendance.filter((r) => (r.status || "").toLowerCase() === "absent").length;
    const attendanceRate = totalDays > 0 ? Math.round(((presentCount + lateCount * 0.5) / totalDays) * 100) : 100;

    return (
      <div className="student-attendance-view">
        <section className="metrics student-metrics" style={{ marginBottom: "20px" }}>
          <article className="card metric-card">
            <div className="metric-top">
              <span>Overall Attendance</span>
              <span className="metric-icon green"><Clock3 size={17} /></span>
            </div>
            <div className="metric-value">{attendanceRate}%</div>
            <div className="metric-foot">{presentCount} of {totalDays} sessions attended</div>
          </article>
          <article className="card metric-card">
            <div className="metric-top">
              <span>Present</span>
              <span className="metric-icon green"><CheckCircle2 size={17} /></span>
            </div>
            <div className="metric-value">{presentCount}</div>
            <div className="metric-foot">On-time check-ins</div>
          </article>
          <article className="card metric-card">
            <div className="metric-top">
              <span>Late</span>
              <span className="metric-icon amber"><Clock3 size={17} /></span>
            </div>
            <div className="metric-value">{lateCount}</div>
            <div className="metric-foot">Late arrivals</div>
          </article>
          <article className="card metric-card">
            <div className="metric-top">
              <span>Absent</span>
              <span className="metric-icon rose"><X size={17} /></span>
            </div>
            <div className="metric-value">{absentCount}</div>
            <div className="metric-foot">Recorded absences</div>
          </article>
        </section>

        <AttendanceCalendar
          records={attendance}
          courses={courses}
          isAdmin={false}
        />
      </div>
    );
  }

  function renderUpdates() {
    const filtered = notifications.filter((item) => `${item.title} ${item.body}`.toLowerCase().includes(query.trim().toLowerCase()));
    return <section className="portal-list">{filtered.map((item) => <article className="card portal-item" key={item.id}><div className="portal-item-heading"><span className="portal-item-icon test"><Mail size={17} /></span><span className="portal-item-title"><strong>{item.title}</strong><small>{dateLabel(item.created_at)}</small></span><span className={`portal-status ${item.read_at ? "submitted" : "pending"}`}>{item.read_at ? "Read" : "New"}</span></div><p className="portal-description">{item.body}</p>{!item.read_at && <button className="text-link" type="button" onClick={async () => {
      const { error: updateError } = await supabase.from("student_notifications").update({ read_at: new Date().toISOString() }).eq("id", item.id);
      if (updateError) setError(`Could not mark update as read: ${updateError.message}`);
      else setNotifications((current) => current.map((notification) => notification.id === item.id ? { ...notification, read_at: new Date().toISOString() } : notification));
    }}>Mark as read</button>}</article>)}{!filtered.length && <div className="card portal-empty"><Mail size={22} /><strong>No updates</strong><span>Assignment and test notifications will appear here.</span></div>}</section>;
  }

  function renderMessages() {
    const selectedMessages = messages.filter((message) => message.conversation_id === selectedConversation);
    return <div className="card student-inbox">
      <aside className="thread-list"><div className="thread-list-heading"><strong>Your conversations</strong><button className="icon-button" aria-label="New message" type="button" onClick={() => { setSelectedConversation(""); setMessageDraft(""); }}><Plus size={15} /></button></div>
        {filteredConversations.map((conversation) => {
          const lastMessage = messages.filter((message) => message.conversation_id === conversation.id).at(-1);
          return <button className={`thread-preview ${selectedConversation === conversation.id ? "active" : ""}`} key={conversation.id} type="button" onClick={() => { setSelectedConversation(conversation.id); setNewSubject(""); }}>
            <span className="thread-avatar"><Mail size={15} /></span><span><strong>{conversation.subject}</strong><small>{lastMessage?.body ?? "No messages yet"}</small></span>
          </button>;
        })}
        {!filteredConversations.length && <p className="thread-empty">Start a conversation with your institution.</p>}
      </aside>
      <section className="thread-body">
        <div className="thread-heading"><div><strong>{activeConversation?.subject ?? "New message"}</strong><small>{activeConversation ? "Your message thread with the institution" : "Send a message to the institution team"}</small></div></div>
        {activeConversation ? <div className="thread-messages">{currentThread.map((message) => <div className={`chat-message ${message.sender_id === user.id ? "mine" : ""}`} key={message.id}><span>{message.sender_id === user.id ? "You" : "LearnForge team"}</span><p>{message.body}</p><small>{dateLabel(message.created_at)}</small></div>)}</div> : <div className="thread-empty-state"><MessageSquare size={22} /><strong>How can we help?</strong><span>Start a new conversation with your institution.</span></div>}
        <form className="message-compose" onSubmit={sendMessage}>
          {!activeConversation && <label className="form-field"><span>Subject</span><input required maxLength={150} value={newSubject} onChange={(event) => setNewSubject(event.target.value)} placeholder="What would you like to discuss?" /></label>}
          <label className="sr-only" htmlFor="student-message">Your message</label><textarea id="student-message" rows="3" maxLength="10000" required value={messageDraft} onChange={(event) => setMessageDraft(event.target.value)} placeholder="Write a message…" />
          <div className="compose-footer"><span>Messages are visible to the institution support team.</span><button className="button primary" disabled={busy || !messageDraft.trim()}><Send size={14} />Send message</button></div>
        </form>
      </section>
    </div>;
  }

  function renderOverview() {
    const submittedCount = submissions.length;
    const completedTests = attempts.length;
    const upcomingAssignments = assignments.filter((item) => !isPast(item.due_at) && !submissionByAssignment.has(item.id)).length;
    const pendingNotesCount = notes.filter((n) => n.status !== "completed").length;

    // Overall Attendance Rate %
    const totalDays = attendance.length;
    const presentCount = attendance.filter((r) => (r.status || "").toLowerCase() === "present").length;
    const lateCount = attendance.filter((r) => (r.status || "").toLowerCase() === "late").length;
    const attendancePercentage = totalDays > 0 ? Math.round(((presentCount + lateCount * 0.5) / totalDays) * 100) : 100;

    // Recent Test Marks
    const recentAttempt = attempts[0];
    const recentTest = recentAttempt ? tests.find((t) => t.id === recentAttempt.assessment_id) : null;

    return <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">{new Intl.DateTimeFormat("en", { weekday: "long", year: "numeric", month: "long", day: "numeric" }).format(new Date())}</div>
          <h1>Welcome, {profile.full_name || user.email?.split("@")[0]} <Sparkles className="greeting-icon" size={19} /></h1>
          <p>Your assignments, tests, and campus messages in one place.</p>
          {profile?.timing && (
            <div className="student-timing-chip" style={{ marginTop: "6px", width: "fit-content" }}>
              <Clock3 size={13} /> Class Timing: <strong>{profile.timing}</strong>
            </div>
          )}
        </div>
        <button className="button" onClick={loadPortal}>Refresh data</button>
      </div>

      <section className="metrics student-metrics">
        <article className="card metric-card" style={{ cursor: "pointer" }} onClick={() => navigate("Assignments")}>
          <div className="metric-top"><span>Assignments Due</span><span className="metric-icon blue"><BookOpen size={17} /></span></div>
          <div className="metric-value">{upcomingAssignments}</div>
          <div className="metric-foot">{submittedCount} completed tasks</div>
        </article>

        <article className="card metric-card" style={{ cursor: "pointer" }} onClick={() => navigate("Attendance")}>
          <div className="metric-top"><span>Attendance Rate</span><span className="metric-icon green"><Clock3 size={17} /></span></div>
          <div className="metric-value">{attendancePercentage}%</div>
          <div className="metric-foot">{presentCount} present · {totalDays} recorded</div>
        </article>

        <article className="card metric-card" style={{ cursor: "pointer" }} onClick={() => navigate("Tests")}>
          <div className="metric-top"><span>Tests Completed</span><span className="metric-icon amber"><ClipboardList size={17} /></span></div>
          <div className="metric-value">{completedTests}</div>
          <div className="metric-foot">{recentAttempt ? `Latest: ${recentAttempt.score}/${recentAttempt.max_score} pts` : "Automatic evaluations"}</div>
        </article>

        <article className="card metric-card" style={{ cursor: "pointer" }} onClick={() => navigate("Notes")}>
          <div className="metric-top"><span>Learning Notes</span><span className="metric-icon purple"><FileText size={17} /></span></div>
          <div className="metric-value">{notes.length}</div>
          <div className="metric-foot">{pendingNotesCount > 0 ? `${pendingNotesCount} pending review` : "All reviewed"}</div>
        </article>
      </section>
      <section className="student-overview-grid">
        <article className="card panel"><div className="panel-heading"><div><h2>Next assignments</h2><p>Keep an eye on upcoming deadlines</p></div><button className="text-link" onClick={() => navigate("Assignments")}>All assignments <ArrowRight size={13} /></button></div>
          {assignments.slice(0, 3).map((assignment) => <div className="overview-work-item" key={assignment.id}><span className="portal-item-icon assignment"><BookOpen size={15} /></span><span><strong>{assignment.title}</strong><small>Due {dateLabel(assignment.due_at)}</small></span><span className={`portal-status ${submissionByAssignment.has(assignment.id) ? "submitted" : isPast(assignment.due_at) ? "overdue" : "pending"}`}>{submissionByAssignment.has(assignment.id) ? "Submitted" : isPast(assignment.due_at) ? "Past due" : "To do"}</span></div>)}
          {!assignments.length && <div className="portal-empty compact"><BookOpen size={18} /><span>No assignments are published yet.</span></div>}
        </article>
        <article className="card panel"><div className="panel-heading"><div><h2>Course Syllabus &amp; Roadmaps</h2><p>Access outlines and official syllabi</p></div><button className="text-link" onClick={() => navigate("Syllabus")}>All syllabi <ArrowRight size={13} /></button></div>
          {(enrolledCourseIds.size > 0 ? courses.filter((c) => enrolledCourseIds.has(c.id)) : courses).slice(0, 3).map((course) => (
            <div className="overview-work-item" key={course.id} style={{ cursor: "pointer" }} onClick={() => { setSyllabusCourseFilter(course.id); navigate("Syllabus"); }}>
              <span className="portal-item-icon" style={{ background: "#f0fdf4", color: "#166534" }}><FileSpreadsheet size={15} /></span>
              <span><strong>{course.code} · {course.name}</strong><small>{course.instructor ? `Faculty: ${course.instructor}` : "Syllabus available"}</small></span>
              <button className="quiet-icon" type="button" aria-label={`Open syllabus for ${course.name}`}><ArrowRight size={15} /></button>
            </div>
          ))}
          {!courses.length && <div className="portal-empty compact"><FileSpreadsheet size={18} /><span>No course syllabi available yet.</span></div>}
        </article>
      </section>
    </>;
  }

  const pageTitles = {
    "My learning": ["Student portal", "My learning", "Your coursework and campus conversations."],
    "Drive & Files": ["My campus", "Drive & Files", "Protected study materials, lecture PDFs, and Drive documents."],
    Assignments: ["Coursework", "Assignments", "Read the instructions, then submit written work or an attachment."],
    Tests: ["Coursework", "Tests", "Complete your online tests and see your score immediately."],
    Courses: ["My campus", "Courses", "Courses your administrator has enrolled you in."],
    Syllabus: ["Academic syllabus", "Course Syllabus", "Access comprehensive course outlines, syllabus documents, and learning roadmaps."],
    Tasks: ["Academic coursework", "My Tasks", "Review tasks, practice exercises, and project milestones assigned to you."],
    Notes: ["Academic coursework", "My Tasks", "Review tasks, practice exercises, and project milestones assigned to you."],
    Attendance: ["My campus", "Attendance", "Your recorded attendance."],
    Updates: ["My campus", "Updates", "Assignment and test notifications from your administrator."],
    Messages: ["Campus community", "Messages", "Send a private message to your institution’s support team."],
  };
  const heading = pageTitles[activeView] || pageTitles["My learning"];
  const unreadConversations = new Set(messages.filter((message) => message.sender_id !== user.id && !message.read_at).map((message) => message.conversation_id)).size;

  return <div className="app-shell student-app">
    {mobileNavOpen && <button className="mobile-backdrop" aria-label="Close navigation" onClick={() => setMobileNavOpen(false)} />}
    <aside className={`sidebar student-sidebar ${mobileNavOpen ? "mobile-open" : ""}`} aria-label="Student navigation">
      {mobileNavOpen && <button className="drawer-close icon-button" type="button" aria-label="Close navigation menu" onClick={() => setMobileNavOpen(false)}><X size={16} /></button>}
      <div className="brand"><span className="brand-mark"><GraduationCap size={21} /></span><span className="brand-copy"><strong>LearnForge</strong><small>Student portal</small></span></div>
      <div className="nav-label">My campus</div>
      <nav className="side-nav">{STUDENT_NAV.map((item) => <button key={item.label} className={`nav-link ${activeView === item.label ? "active" : ""}`} type="button" onClick={() => navigate(item.label)} aria-current={activeView === item.label ? "page" : undefined} title={item.label}><item.icon className="nav-icon" size={18} /><span>{item.label}</span>{item.label === "Messages" && unreadConversations > 0 && <span className="nav-count">{unreadConversations}</span>}{item.label === "Updates" && notifications.filter((notification) => !notification.read_at).length > 0 && <span className="nav-count">{notifications.filter((notification) => !notification.read_at).length}</span>}</button>)}</nav>
      <div className="sidebar-spacer" />
      <div className="student-support"><ShieldCheck size={16} /><span><strong>Your work is private</strong><small>Only you and your institution can view your submissions.</small></span></div>
      <div className="profile"><span className="profile-avatar">{profile.full_name?.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "ST"}</span><span className="profile-copy"><strong>{profile.full_name || user.email}</strong><small>{profile.timing ? `Timing: ${profile.timing}` : "Student"}</small></span></div>
      <button className="signout-button" type="button" onClick={onSignOut} title="Sign out" aria-label="Sign out"><LogOut size={15} /><span>Sign out</span></button>
    </aside>
    <main className="main-content">
      <header className="topbar"><div className="topbar-left"><button className="mobile-menu icon-button" onClick={() => setMobileNavOpen((open) => !open)} aria-label="Toggle navigation"><Menu size={18} /></button><div className="breadcrumb">Student portal <span>/</span> <strong>{activeView}</strong></div></div><div className="top-actions"><label className="search-box"><span className="sr-only">Search this page</span><input type="search" aria-label={`Search ${activeView.toLowerCase()}`} placeholder={`Search ${activeView.toLowerCase()}…`} value={query} onChange={(event) => setQuery(event.target.value)} /></label><span className="top-avatar" title={user.email}>{profile.full_name?.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "ST"}</span></div></header>
      <div className="content">
        <div className="page-heading"><div><div className="eyebrow">{heading[0]}</div><h1>{heading[1]}</h1><p>{heading[2]}</p></div>{activeView === "Messages" && <button className="button primary" onClick={() => { setSelectedConversation(""); setNewSubject(""); }}><Plus size={14} />New message</button>}</div>
        {error && <div className="portal-alert error" role="alert">{error}<button type="button" onClick={() => setError("")}>Dismiss</button></div>}
        {notice && <div className="portal-alert success" role="status"><CheckCircle2 size={15} />{notice}<button type="button" onClick={() => setNotice("")}>Dismiss</button></div>}
        {loading ? <div className="card portal-loading">Loading your secure coursework…</div> : activeView === "Drive & Files" ? renderMaterials() : activeView === "Assignments" ? renderAssignments() : activeView === "Tests" ? renderTests() : activeView === "Courses" ? renderCourses() : activeView === "Syllabus" ? renderSyllabus() : activeView === "Tasks" || activeView === "Notes" ? renderNotes() : activeView === "Attendance" ? renderAttendance() : activeView === "Updates" ? renderUpdates() : activeView === "Messages" ? renderMessages() : renderOverview()}
      </div>
    </main>

    {viewingDocument && (
      <SecureDocumentViewer
        title={viewingDocument.title}
        subtitle={viewingDocument.subtitle}
        url={viewingDocument.url}
        directDownloadUrl={viewingDocument.directDownloadUrl}
        userEmail={user.email}
        isSuperuser={false}
        downloadStatus={viewingDocument.downloadStatus}
        onRequestDownload={(reason) =>
          submitDownloadRequest(viewingDocument.materialId, viewingDocument.testId, reason)
        }
        onDownload={() => {
          if (viewingDocument.directDownloadUrl) {
            window.open(viewingDocument.directDownloadUrl, "_blank");
          } else if (viewingDocument.url) {
            const dlUrl = getDriveDownloadExportUrl(viewingDocument.url);
            window.open(dlUrl, "_blank");
          }
        }}
        onMarkCompleted={viewingDocument.testId ? () => markExternalTestCompleted(viewingDocument.testId) : null}
        onClose={() => setViewingDocument(null)}
      />
    )}
  </div>;
}

export default StudentPortal;
