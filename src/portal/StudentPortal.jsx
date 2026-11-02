import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowRight, BookOpen, CalendarClock, CheckCircle2, ClipboardList, Clock3,
  Download, ExternalLink, Eye, FileText, GraduationCap, HardDrive, LayoutDashboard, Link2,
  Lock, LogOut, Mail, MapPin, Menu, MessageSquare, Paperclip, Plus, Send,
  Shield, ShieldCheck, Sparkles, Unlock, Upload, Users, X,
} from "lucide-react";
import SecureDocumentViewer from "../components/SecureDocumentViewer";
import AttendanceCalendar from "../components/AttendanceCalendar";

const STUDENT_NAV = [
  { label: "My learning", icon: LayoutDashboard },
  { label: "Drive & Files", icon: HardDrive },
  { label: "Assignments", icon: BookOpen },
  { label: "Tests", icon: ClipboardList },
  { label: "Courses", icon: GraduationCap },
  { label: "Notes", icon: FileText },
  { label: "Attendance", icon: Clock3 },
  { label: "Updates", icon: Mail },
  { label: "Messages", icon: MessageSquare },
];
const ALLOWED_FILE_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
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
  const [viewingDocument, setViewingDocument] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [attempts, setAttempts] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [messages, setMessages] = useState([]);
  const [selectedConversation, setSelectedConversation] = useState("");
  const [selectedTest, setSelectedTest] = useState("");
  const [answers, setAnswers] = useState({});
  const [submissionDraft, setSubmissionDraft] = useState(null);
  const [newSubject, setNewSubject] = useState("");
  const [messageDraft, setMessageDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [courseSessionFilter, setCourseSessionFilter] = useState("all");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const loadPortal = useCallback(async (forceLoading = false) => {
    if (forceLoading) setLoading(true);
    setError("");
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
    ] = await Promise.all([
      supabase.from("assignments").select("id, title, description, due_at, created_at").eq("published", true).order("due_at", { ascending: true, nullsFirst: false }),
      supabase.from("assignment_submissions").select("id, assignment_id, answer_text, file_path, submitted_at, grade, feedback, graded_at").eq("student_id", user.id),
      supabase.from("assessments").select("id, title, description, due_at, external_url, file_path, show_marks, created_at").eq("published", true).order("due_at", { ascending: true, nullsFirst: false }),
      supabase.from("assessment_attempts").select("id, assessment_id, score, max_score, submitted_at").eq("student_id", user.id),
      supabase.from("conversations").select("id, subject, created_at").eq("student_id", user.id).order("created_at", { ascending: false }),
      supabase.from("courses").select("id, name, code, description, department, instructor, schedule, room").order("name"),
      supabase.from("student_notes").select("id, course_id, title, body, created_at").eq("student_id", user.id).order("created_at", { ascending: false }),
      supabase.from("attendance_records").select("id, course_id, attendance_date, status, note").eq("student_id", user.id).order("attendance_date", { ascending: false }),
      supabase.from("student_notifications").select("id, title, body, read_at, created_at").eq("student_id", user.id).order("created_at", { ascending: false }),
      supabase.from("course_materials").select("*").order("created_at", { ascending: false }),
      supabase.from("download_requests").select("*").eq("student_id", user.id),
    ]);
    const failed = [assignmentResult, submissionResult, testResult, attemptResult, conversationResult, courseResult, noteResult, attendanceResult, notificationResult, materialResult, requestResult].find((result) => result.error);
    if (failed) {
      setError(failed.error.message);
      setLoading(false);
      return;
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
    const secondaryFailure = [questionResult, messageResult].find((result) => result.error);
    if (secondaryFailure) {
      setError(secondaryFailure.error.message);
      setLoading(false);
      return;
    }

    setAssignments(assignmentResult.data ?? []);
    setSubmissions(submissionResult.data ?? []);
    setTests(loadedTests);
    setCourses(courseResult.data ?? []);
    setNotes(noteResult.data ?? []);
    setAttendance(attendanceResult.data ?? []);
    setNotifications(notificationResult.data ?? []);
    setMaterials(materialResult.data ?? []);
    setDownloadRequests(requestResult.data ?? []);
    setQuestions(questionResult.data ?? []);
    setAttempts(attemptResult.data ?? []);
    setConversations(loadedConversations);
    setMessages(messageResult.data ?? []);
    setLoading(false);
  }, [supabase, user.id]);

  useEffect(() => { loadPortal(true); }, [loadPortal]);

  useEffect(() => {
    if (!supabase || !user?.id) return;
    const channel = supabase
      .channel(`student-portal-realtime-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, () => loadPortal())
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, () => loadPortal())
      .on("postgres_changes", { event: "*", schema: "public", table: "assignments" }, () => loadPortal())
      .on("postgres_changes", { event: "*", schema: "public", table: "assignment_submissions" }, () => loadPortal())
      .on("postgres_changes", { event: "*", schema: "public", table: "assessments" }, () => loadPortal())
      .on("postgres_changes", { event: "*", schema: "public", table: "assessment_attempts" }, () => loadPortal())
      .on("postgres_changes", { event: "*", schema: "public", table: "courses" }, () => loadPortal())
      .on("postgres_changes", { event: "*", schema: "public", table: "course_enrollments" }, () => loadPortal())
      .on("postgres_changes", { event: "*", schema: "public", table: "attendance_records" }, () => loadPortal())
      .on("postgres_changes", { event: "*", schema: "public", table: "student_notes" }, () => loadPortal())
      .on("postgres_changes", { event: "*", schema: "public", table: "course_materials" }, () => loadPortal())
      .on("postgres_changes", { event: "*", schema: "public", table: "download_requests" }, () => loadPortal())
      .on("postgres_changes", { event: "*", schema: "public", table: "student_notifications" }, () => loadPortal())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, user.id, loadPortal]);

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
  const filteredTests = tests.filter((item) => `${item.title} ${item.description}`.toLowerCase().includes(query.trim().toLowerCase()));
  const filteredConversations = conversations.filter((item) => item.subject.toLowerCase().includes(query.trim().toLowerCase()));
  const activeConversation = conversations.find((item) => item.id === selectedConversation);
  const currentThread = messages.filter((item) => item.conversation_id === selectedConversation);
  const currentTest = tests.find((item) => item.id === selectedTest);
  const currentQuestions = questions.filter((item) => item.assessment_id === selectedTest);
  const currentAttempt = attemptByTest.get(selectedTest);

  async function openSecureViewer({ title, subtitle, url, filePath, materialId, testId }) {
    let finalUrl = url;
    let directDownload = null;

    if (filePath) {
      const { data: signedData, error: signedError } = await supabase.storage
        .from("course-materials")
        .createSignedUrl(filePath, 3600);
      if (signedError) {
        setError(`Could not open file: ${signedError.message}`);
        return;
      }
      finalUrl = signedData.signedUrl;
      directDownload = signedData.signedUrl;
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
        const { data, error: signedError } = await supabase.storage
          .from("course-materials")
          .createSignedUrl(material.file_path, 120);
        if (signedError) throw signedError;
        window.open(data.signedUrl, "_blank");
      } else if (material.drive_url) {
        window.open(material.drive_url, "_blank");
      }
    } catch (err) {
      setError(`Download error: ${err.message}`);
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
    const answerText = String(formData.get("answer_text") ?? "").trim();
    const file = formData.get("attachment");
    const actualFile = file instanceof File && file.size > 0 ? file : null;
    if (!answerText && !actualFile) {
      setError("Write a response or attach a file before submitting.");
      return;
    }
    if (actualFile && (!ALLOWED_FILE_TYPES.has(actualFile.type) || actualFile.size > MAX_FILE_SIZE)) {
      setError("Upload a PDF, DOC, DOCX, or TXT file up to 10 MB.");
      return;
    }

    setBusy(true);
    setError("");
    setNotice("");
    const previous = submissionByAssignment.get(assignment.id);
    let uploadedPath = null;
    try {
      if (actualFile) {
        const safeName = actualFile.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        uploadedPath = `${user.id}/${assignment.id}/${crypto.randomUUID()}-${safeName}`;
        const { error: uploadError } = await supabase.storage.from("assignment-files").upload(uploadedPath, actualFile, { contentType: actualFile.type, upsert: false });
        if (uploadError) throw uploadError;
      }

      const { error: saveError } = await supabase.from("assignment_submissions").upsert({
        assignment_id: assignment.id,
        student_id: user.id,
        answer_text: answerText,
        file_path: uploadedPath || previous?.file_path || null,
        submitted_at: new Date().toISOString(),
      }, { onConflict: "assignment_id,student_id" });
      if (saveError) {
        if (uploadedPath) await supabase.storage.from("assignment-files").remove([uploadedPath]);
        throw saveError;
      }
      if (uploadedPath && previous?.file_path) {
        const { error: removeError } = await supabase.storage.from("assignment-files").remove([previous.file_path]);
        if (removeError) setError(`Your new work was saved, but the previous attachment could not be removed: ${removeError.message}`);
      }
      setSubmissionDraft(null);
      event.currentTarget.reset();
      setNotice("Your assignment was submitted successfully.");
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
    }
    const { error: messageError } = await supabase.from("messages").insert({
      conversation_id: conversationId,
      sender_id: user.id,
      body,
    });
    if (messageError) {
      setError(messageError.message);
    } else {
      setMessageDraft("");
      setNewSubject("");
      setSelectedConversation(conversationId);
      setNotice("Your message was sent.");
      await loadPortal();
    }
    setBusy(false);
  }

  function renderAssignments() {
    return <section className="portal-list">
      {filteredAssignments.map((assignment) => {
        const submission = submissionByAssignment.get(assignment.id);
        const closed = isPast(assignment.due_at);
        const editing = submissionDraft === assignment.id;
        return <article className="card portal-item" key={assignment.id}>
          <div className="portal-item-heading"><span className="portal-item-icon assignment"><BookOpen size={17} /></span><span className="portal-item-title"><strong>{assignment.title}</strong><small><CalendarClock size={12} />Due {dateLabel(assignment.due_at)}</small></span><span className={`portal-status ${submission ? "submitted" : closed ? "overdue" : "pending"}`}>{submission ? "Submitted" : closed ? "Past due" : "Not submitted"}</span></div>
          {assignment.description && <p className="portal-description">{assignment.description}</p>}
          {submission && <div className="submission-receipt"><CheckCircle2 size={15} /><span>Submitted {dateLabel(submission.submitted_at)}{submission.grade !== null ? ` · Grade ${submission.grade}/100` : ""}</span>{submission.file_path && <button className="text-link" type="button" onClick={() => openSubmissionFile(submission.file_path)}><Download size={13} />Download file</button>}</div>}
          {submission?.feedback && <div className="feedback-box"><strong>Instructor feedback</strong><p>{submission.feedback}</p></div>}
          {!closed && !submission?.graded_at && <button className="button" type="button" onClick={() => setSubmissionDraft(editing ? null : assignment.id)}>{submission ? "Update submission" : "Submit assignment"}<ArrowRight size={14} /></button>}
          {editing && <form className="portal-form" onSubmit={(event) => submitAssignment(event, assignment)}>
            <label className="form-field"><span>Your response</span><textarea name="answer_text" rows="5" maxLength="20000" defaultValue={submission?.answer_text ?? ""} placeholder="Write your assignment response here…" /></label>
            <label className="file-drop"><Upload size={16} /><span>Attach a document <small>PDF, DOC, DOCX, or TXT · Up to 10 MB</small></span><input name="attachment" type="file" accept=".pdf,.doc,.docx,.txt,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain" /></label>
            {submission?.file_path && <small className="file-hint"><Paperclip size={12} />Your existing attachment stays unless you upload a replacement.</small>}
            <div className="form-actions"><button className="button" type="button" onClick={() => setSubmissionDraft(null)}>Cancel</button><button className="button primary" disabled={busy}><Send size={14} />{busy ? "Submitting…" : "Submit work"}</button></div>
          </form>}
        </article>;
      })}
      {!filteredAssignments.length && <div className="card portal-empty"><BookOpen size={22} /><strong>No assignments found</strong><span>New assignments from your institution will appear here.</span></div>}
    </section>;
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
    const filtered = materials.filter((item) => {
      const course = coursesById[item.course_id];
      return `${item.title} ${item.description} ${item.category} ${course?.name ?? ""} ${course?.code ?? ""}`
        .toLowerCase()
        .includes(query.trim().toLowerCase());
    });

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
              <article className="card material-card" key={item.id}>
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

                <div className="material-actions">
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
                      className="button"
                      type="button"
                      onClick={() => downloadApprovedItem(item)}
                      title="Download file approved by administrator"
                    >
                      <Download size={13} /> Download
                    </button>
                  ) : isPending ? (
                    <button className="button disabled" type="button" disabled title="Waiting for admin approval">
                      <Clock3 size={13} /> Pending
                    </button>
                  ) : (
                    <button
                      className="button"
                      type="button"
                      onClick={() => submitDownloadRequest(item.id, null)}
                      title="Request administrator permission to download this file"
                    >
                      <Lock size={13} /> Request Download
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
    const filtered = courses.filter((course) => {
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

  function renderNotes() {
    const filtered = notes.filter((note) => `${note.title} ${note.body} ${coursesById[note.course_id]?.name ?? ""}`.toLowerCase().includes(query.trim().toLowerCase()));
    return <section className="portal-list">{filtered.map((note) => {
      const course = coursesById[note.course_id];
      return <article className="card portal-item" key={note.id}>
        <div className="portal-item-heading">
          <span className="portal-item-icon assignment"><FileText size={17} /></span>
          <span className="portal-item-title">
            <strong>{note.title}</strong>
            <small>{course ? `${course.code} · ` : ""}{dateLabel(note.created_at)}</small>
          </span>
        </div>
        <p className="portal-description">{note.body}</p>
      </article>;
    })}{!filtered.length && <div className="card portal-empty"><FileText size={22} /><strong>No notes assigned</strong><span>Private notes from your administrator will appear here.</span></div>}</section>;
  }

  function renderAttendance() {
    return (
      <AttendanceCalendar
        records={attendance}
        courses={courses}
        isAdmin={false}
      />
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
        {activeConversation ? <div className="thread-messages">{currentThread.map((message) => <div className={`chat-message ${message.sender_id === user.id ? "mine" : ""}`} key={message.id}><span>{message.sender_id === user.id ? "You" : "Northstar team"}</span><p>{message.body}</p><small>{dateLabel(message.created_at)}</small></div>)}</div> : <div className="thread-empty-state"><MessageSquare size={22} /><strong>How can we help?</strong><span>Start a new conversation with your institution.</span></div>}
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
    const upcomingAssignments = assignments.filter((item) => !isPast(item.due_at)).length;
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
        <article className="card metric-card"><div className="metric-top"><span>Assignments due</span><span className="metric-icon blue"><BookOpen size={17} /></span></div><div className="metric-value">{upcomingAssignments}</div><div className="metric-foot">Published assignments</div></article>
        <article className="card metric-card"><div className="metric-top"><span>Work submitted</span><span className="metric-icon green"><CheckCircle2 size={17} /></span></div><div className="metric-value">{submittedCount}</div><div className="metric-foot">Across your assignments</div></article>
        <article className="card metric-card"><div className="metric-top"><span>Tests completed</span><span className="metric-icon amber"><ClipboardList size={17} /></span></div><div className="metric-value">{completedTests}</div><div className="metric-foot">Graded automatically</div></article>
        <article className="card metric-card"><div className="metric-top"><span>Unread messages</span><span className="metric-icon rose"><MessageSquare size={17} /></span></div><div className="metric-value">{unreadMessages}</div><div className="metric-foot">From your institution</div></article>
      </section>
      <section className="student-overview-grid">
        <article className="card panel"><div className="panel-heading"><div><h2>Next assignments</h2><p>Keep an eye on upcoming deadlines</p></div><button className="text-link" onClick={() => navigate("Assignments")}>All assignments <ArrowRight size={13} /></button></div>
          {assignments.slice(0, 3).map((assignment) => <div className="overview-work-item" key={assignment.id}><span className="portal-item-icon assignment"><BookOpen size={15} /></span><span><strong>{assignment.title}</strong><small>Due {dateLabel(assignment.due_at)}</small></span><span className={`portal-status ${submissionByAssignment.has(assignment.id) ? "submitted" : isPast(assignment.due_at) ? "overdue" : "pending"}`}>{submissionByAssignment.has(assignment.id) ? "Submitted" : isPast(assignment.due_at) ? "Past due" : "To do"}</span></div>)}
          {!assignments.length && <div className="portal-empty compact"><BookOpen size={18} /><span>No assignments are published yet.</span></div>}
        </article>
        <article className="card panel"><div className="panel-heading"><div><h2>Continue learning</h2><p>Pick up where you left off</p></div></div>
          {tests.slice(0, 2).map((test) => <div className="overview-test" key={test.id}><span className="portal-item-icon test"><ClipboardList size={15} /></span><span><strong>{test.title}</strong><small>{attemptByTest.has(test.id) ? (test.show_marks ? `Score ${attemptByTest.get(test.id).score}/${attemptByTest.get(test.id).max_score}` : "Completed") : `Due ${dateLabel(test.due_at)}`}</small></span><button className="quiet-icon" type="button" aria-label={`Open ${test.title}`} onClick={() => { setSelectedTest(test.id); navigate("Tests"); }}><ArrowRight size={15} /></button></div>)}
          {!tests.length && <div className="portal-empty compact"><ClipboardList size={18} /><span>No tests are published yet.</span></div>}
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
    Notes: ["My campus", "Notes", "Private notes from your administrator."],
    Attendance: ["My campus", "Attendance", "Your recorded attendance."],
    Updates: ["My campus", "Updates", "Assignment and test notifications from your administrator."],
    Messages: ["Campus community", "Messages", "Send a private message to your institution’s support team."],
  };
  const heading = pageTitles[activeView];
  const unreadConversations = new Set(messages.filter((message) => message.sender_id !== user.id && !message.read_at).map((message) => message.conversation_id)).size;

  return <div className="app-shell student-app">
    {mobileNavOpen && <button className="mobile-backdrop" aria-label="Close navigation" onClick={() => setMobileNavOpen(false)} />}
    <aside className={`sidebar student-sidebar ${mobileNavOpen ? "mobile-open" : ""}`} aria-label="Student navigation">
      {mobileNavOpen && <button className="drawer-close icon-button" type="button" aria-label="Close navigation menu" onClick={() => setMobileNavOpen(false)}><X size={16} /></button>}
      <div className="brand"><span className="brand-mark"><GraduationCap size={21} /></span><span className="brand-copy"><strong>TM Dashboard</strong><small>Student portal</small></span></div>
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
        {loading ? <div className="card portal-loading">Loading your secure coursework…</div> : activeView === "Drive & Files" ? renderMaterials() : activeView === "Assignments" ? renderAssignments() : activeView === "Tests" ? renderTests() : activeView === "Courses" ? renderCourses() : activeView === "Notes" ? renderNotes() : activeView === "Attendance" ? renderAttendance() : activeView === "Updates" ? renderUpdates() : activeView === "Messages" ? renderMessages() : renderOverview()}
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
            window.open(viewingDocument.url, "_blank");
          }
        }}
        onMarkCompleted={viewingDocument.testId ? () => markExternalTestCompleted(viewingDocument.testId) : null}
        onClose={() => setViewingDocument(null)}
      />
    )}
  </div>;
}

export default StudentPortal;
