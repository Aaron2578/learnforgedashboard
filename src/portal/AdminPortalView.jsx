import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle, ArrowRight, Award, BookOpen, CalendarClock, Camera, CheckCircle2, ClipboardList,
  Clock, Clock3, Download, ExternalLink, Eye, EyeOff, FileText, Mail, MapPin, MessageSquare,
  Monitor, Paperclip, Pencil, Play, Plus, Send, ShieldCheck, Trash2, Users, X,
} from "lucide-react";
import { getFunctionErrorMessage } from "../lib/functionErrors.js";
import { uploadDocumentAttachment, resolveStorageSignedUrl, triggerDocumentDownload } from "../lib/driveUtils.js";
import { formatSeconds, syncAssessmentQuestions, updateAssessmentRecord, validateAndNormalizeQuizJson } from "../lib/quizUtils.js";
import SecureDocumentViewer from "../components/SecureDocumentViewer";
import EditAssignmentModal from "../components/EditAssignmentModal";
import EditTestModal from "../components/EditTestModal";
import ProctoredQuizConfigPanel from "../components/ProctoredQuizConfigPanel";
import ProctoredExamRunner from "../components/ProctoredExamRunner";

function prettyDate(value, fallback = "No deadline") {
  if (!value) return fallback;
  try {
    const d = new Date(value);
    if (isNaN(d.getTime())) return fallback;
    return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(d);
  } catch {
    return fallback;
  }
}

function StudentRecipients({ students, selected, onChange }) {
  function toggle(id) {
    onChange(selected.includes(id) ? selected.filter((item) => item !== id) : [...selected, id]);
  }
  function toggleAll() {
    if (selected.length === students.length) {
      onChange([]);
    } else {
      onChange(students.map((s) => s.id));
    }
  }
  const allSelected = students.length > 0 && selected.length === students.length;

  return <fieldset className="admin-options">
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
      <legend style={{ margin: 0 }}>Assign to approved students ({selected.length}/{students.length})</legend>
      {students.length > 0 && (
        <button type="button" className="button" style={{ minHeight: "26px", padding: "2px 8px", fontSize: "11px" }} onClick={toggleAll}>
          {allSelected ? "Deselect all" : "Select all students"}
        </button>
      )}
    </div>
    {students.map((student) => <label className="admin-option" key={student.id}><input type="checkbox" checked={selected.includes(student.id)} onChange={() => toggle(student.id)} /><span>{student.full_name || student.email}</span><small>{student.email}</small></label>)}
    {!students.length && <p>There are no approved student accounts to assign this to yet.</p>}
  </fieldset>;
}

function AdminAssignmentForm({ onCancel, onCreate, busy, students }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [due, setDue] = useState("");
  const [questionFile, setQuestionFile] = useState(null);
  const [questionUrl, setQuestionUrl] = useState("");
  const [recipientIds, setRecipientIds] = useState(() => students.map((s) => s.id));
  return <form className="card admin-create-form" onSubmit={(event) => {
    event.preventDefault();
    onCreate({ title: title.trim(), description: description.trim(), due, recipientIds, questionFile, questionUrl: questionUrl.trim() });
  }}>
    <div className="panel-heading"><div><h2>Publish an assignment</h2><p>Students can view attached question papers and submit a written response or document.</p></div></div>
    <label className="form-field"><span>Assignment title</span><input required maxLength={150} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Lab report: cell structure" /></label>
    <label className="form-field"><span>Instructions</span><textarea rows="4" maxLength={10000} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Explain what students need to submit." /></label>
    <label className="form-field"><span>Due date (optional)</span><input type="datetime-local" value={due} onChange={(event) => setDue(event.target.value)} /></label>
    <label className="form-field">
      <span>Question Paper / Attachment (PDF, DOCX, etc. — optional)</span>
      <input
        type="file"
        accept=".pdf,.doc,.docx,.txt,.ppt,.pptx,.xls,.xlsx,.csv,.zip,.png,.jpg,.jpeg,.webp"
        onChange={(event) => setQuestionFile(event.target.files?.[0] || null)}
      />
      {questionFile && (
        <small style={{ color: "#4f46e5", marginTop: "4px", display: "block" }}>
          Attached: {questionFile.name}
        </small>
      )}
    </label>
    <label className="form-field">
      <span>External Question / Reference Link (optional)</span>
      <input
        type="url"
        value={questionUrl}
        onChange={(event) => setQuestionUrl(event.target.value)}
        placeholder="https://drive.google.com/..."
      />
    </label>
    <StudentRecipients students={students} selected={recipientIds} onChange={setRecipientIds} />
    <div className="form-actions"><button className="button" type="button" onClick={onCancel}>Cancel</button><button className="button primary" disabled={busy}><Plus size={14} />{busy ? "Publishing…" : "Publish assignment"}</button></div>
  </form>;
}

function AdminTestForm({ onCancel, onCreate, busy, students }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [testType, setTestType] = useState("built_in");
  const [externalUrl, setExternalUrl] = useState("");
  const [rawJson, setRawJson] = useState("");
  const [proctorSettings, setProctorSettings] = useState({
    durationMinutes: 30,
    requireCamera: false,
    allowCameraOff: false,
    trackTabSwitches: true,
    maxTabSwitches: 3,
    passingPercentage: 50,
    showMarks: true,
  });
  const [due, setDue] = useState("");
  const [recipientIds, setRecipientIds] = useState(() => students.map((s) => s.id));
  const [localError, setLocalError] = useState("");

  function handleSubmit(event) {
    event.preventDefault();
    setLocalError("");

    let questions = [];
    if (testType === "built_in") {
      const check = validateAndNormalizeQuizJson(rawJson);
      if (!check.valid) {
        setLocalError(check.errors[0] || "Fix JSON validation errors before publishing.");
        return;
      }
      questions = check.questions;
    }

    onCreate({
      title: title.trim(),
      description: description.trim(),
      testType,
      externalUrl: externalUrl.trim(),
      questions,
      proctoring: proctorSettings,
      due,
      recipientIds,
    });
  }

  return <form className="card admin-create-form" onSubmit={handleSubmit}>
    <div className="panel-heading"><div><h2>Create a test</h2><p>Configure a proctored JSON quiz with webcam/tab rules, or attach an external test link.</p></div></div>
    {localError && <div className="portal-alert error" style={{ marginBottom: "12px" }}>{localError}<button type="button" onClick={() => setLocalError("")}>Dismiss</button></div>}
    <label className="form-field"><span>Test title</span><input required maxLength={150} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Biology chapter 1 proctored quiz" /></label>
    <label className="form-field"><span>Instructions</span><textarea rows="2" maxLength={2000} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Optional instructions for students" /></label>
    <label className="form-field"><span>Test delivery method</span><select value={testType} onChange={(event) => setTestType(event.target.value)}><option value="built_in">Proctored Built-in Quiz (JSON Question Bank)</option><option value="external">External test link (Google Forms / LMS)</option></select></label>
    {testType === "external" ? <label className="form-field"><span>External test URL</span><input type="url" required pattern="https://.*" value={externalUrl} onChange={(event) => setExternalUrl(event.target.value)} placeholder="https://…" /></label> : (
      <ProctoredQuizConfigPanel
        rawJson={rawJson}
        onRawJsonChange={(val) => {
          setLocalError("");
          setRawJson(val);
        }}
        settings={proctorSettings}
        onSettingsChange={setProctorSettings}
      />
    )}
    <label className="form-field"><span>Due date (optional)</span><input type="datetime-local" value={due} onChange={(event) => setDue(event.target.value)} /></label>
    <StudentRecipients students={students} selected={recipientIds} onChange={setRecipientIds} />
    <div className="form-actions"><button className="button" type="button" onClick={onCancel}>Cancel</button><button className="button primary" disabled={busy}><Plus size={14} />{busy ? "Publishing…" : "Publish test"}</button></div>
  </form>;
}

function AdminPortalView({ view, supabase, user, query, onToast }) {
  const [assignments, setAssignments] = useState([]);
  const [submissions, setSubmissions] = useState([]);
  const [tests, setTests] = useState([]);
  const [attempts, setAttempts] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [messages, setMessages] = useState([]);
  const [profiles, setProfiles] = useState({});
  const [students, setStudents] = useState([]);
  const [assignmentRecipients, setAssignmentRecipients] = useState({});
  const [assessmentRecipients, setAssessmentRecipients] = useState({});
  const [selectedConversation, setSelectedConversation] = useState("");
  const [reply, setReply] = useState("");
  const [gradeDrafts, setGradeDrafts] = useState({});
  const [showForm, setShowForm] = useState(false);
  const [editingAssignment, setEditingAssignment] = useState(null);
  const [editingTest, setEditingTest] = useState(null);
  const [previewTest, setPreviewTest] = useState(null);
  const [previewQuiz, setPreviewQuiz] = useState(null);
  const [testCohortFilter, setTestCohortFilter] = useState({});
  const [gradingModal, setGradingModal] = useState(null);
  const [gradingSubmitting, setGradingSubmitting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadAdminData = useCallback(async (forceLoading = false) => {
    if (forceLoading) setLoading(true);
    setError("");
    if (view === "Assignments") {
      const [assignmentResult, submissionResult, studentResult, recipientResult] = await Promise.all([
        supabase.from("assignments").select("id, title, description, due_at, created_at, question_file_path, question_file_name, question_file_type, question_url").order("created_at", { ascending: false }),
        supabase.from("assignment_submissions").select("id, assignment_id, student_id, answer_text, file_path, submitted_at, grade, feedback, graded_at").order("submitted_at", { ascending: false }),
        supabase.from("profiles").select("id, full_name, email").eq("role", "student").eq("is_approved", true),
        supabase.from("assignment_recipients").select("assignment_id, student_id"),
      ]);
      const failed = [assignmentResult, submissionResult, studentResult, recipientResult].find((result) => result.error);
      if (failed) setError(failed.error.message);
      else {
        setAssignments(assignmentResult.data ?? []);
        setSubmissions(submissionResult.data ?? []);
        setStudents(studentResult.data ?? []);
        setProfiles(Object.fromEntries((studentResult.data ?? []).map((profile) => [profile.id, profile])));
        setAssignmentRecipients((recipientResult.data ?? []).reduce((result, row) => {
          result[row.assignment_id] = [...(result[row.assignment_id] ?? []), row.student_id];
          return result;
        }, {}));
        const studentIds = [...new Set((submissionResult.data ?? []).map((submission) => submission.student_id))];
        if (studentIds.length) {
          const { data: studentProfiles, error: profileError } = await supabase.from("profiles").select("id, full_name, email").in("id", studentIds);
          if (profileError) setError(profileError.message);
          else setProfiles(Object.fromEntries((studentProfiles ?? []).map((profile) => [profile.id, profile])));
        }
      }
    } else if (view === "Tests") {
      const [testResult, attemptResult, studentResult, recipientResult] = await Promise.all([
        supabase.from("assessments").select("id, title, description, due_at, external_url, show_marks, duration_minutes, require_camera, allow_camera_off, track_tab_switches, max_tab_switches, passing_percentage, total_marks, created_at").order("created_at", { ascending: false }),
        supabase.from("assessment_attempts").select("id, assessment_id, student_id, answers, score, max_score, submitted_at, student_name, roll_number, time_taken_seconds, tab_switch_count, camera_status, submission_reason, proctoring_log, percentage, passed").order("submitted_at", { ascending: false }),
        supabase.from("profiles").select("id, full_name, email").eq("role", "student").eq("is_approved", true),
        supabase.from("assessment_recipients").select("assessment_id, student_id"),
      ]);
      const failed = [testResult, attemptResult, studentResult, recipientResult].find((result) => result.error);
      if (failed) setError(failed.error.message);
      else {
        setTests(testResult.data ?? []);
        setAttempts(attemptResult.data ?? []);
        setStudents(studentResult.data ?? []);
        setProfiles(Object.fromEntries((studentResult.data ?? []).map((profile) => [profile.id, profile])));
        setAssessmentRecipients((recipientResult.data ?? []).reduce((result, row) => {
          result[row.assessment_id] = [...(result[row.assessment_id] ?? []), row.student_id];
          return result;
        }, {}));
        const studentIds = [...new Set((attemptResult.data ?? []).map((attempt) => attempt.student_id))];
        if (studentIds.length) {
          const { data: studentProfiles, error: profileError } = await supabase.from("profiles").select("id, full_name, email").in("id", studentIds);
          if (profileError) setError(profileError.message);
          else setProfiles(Object.fromEntries((studentProfiles ?? []).map((profile) => [profile.id, profile])));
        }
      }
    } else if (view === "Messages") {
      const { data: threadData, error: threadError } = await supabase.from("conversations").select("id, student_id, subject, created_at").order("created_at", { ascending: false });
      if (threadError) setError(threadError.message);
      else {
        const threadIds = (threadData ?? []).map((thread) => thread.id);
        const studentIds = [...new Set((threadData ?? []).map((thread) => thread.student_id))];
        const [messageResult, profileResult] = await Promise.all([
          threadIds.length ? supabase.from("messages").select("id, conversation_id, sender_id, body, read_at, created_at").in("conversation_id", threadIds).order("created_at") : Promise.resolve({ data: [], error: null }),
          studentIds.length ? supabase.from("profiles").select("id, full_name, email").in("id", studentIds) : Promise.resolve({ data: [], error: null }),
        ]);
        if (messageResult.error || profileResult.error) setError(messageResult.error?.message || profileResult.error?.message);
        else {
          setConversations(threadData ?? []);
          setMessages(messageResult.data ?? []);
          setProfiles(Object.fromEntries((profileResult.data ?? []).map((profile) => [profile.id, profile])));
          if (selectedConversation && !threadIds.includes(selectedConversation)) setSelectedConversation("");
        }
      }
    }
    setLoading(false);
  }, [supabase, view, selectedConversation]);

  useEffect(() => { loadAdminData(true); }, [loadAdminData]);

  useEffect(() => {
    if (!supabase) return;
    const channel = supabase
      .channel(`admin-portal-realtime-${view}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, () => loadAdminData())
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, () => loadAdminData())
      .on("postgres_changes", { event: "*", schema: "public", table: "assignments" }, () => loadAdminData())
      .on("postgres_changes", { event: "*", schema: "public", table: "assignment_submissions" }, () => loadAdminData())
      .on("postgres_changes", { event: "*", schema: "public", table: "assessments" }, () => loadAdminData())
      .on("postgres_changes", { event: "*", schema: "public", table: "assessment_attempts" }, () => loadAdminData())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, view, loadAdminData]);

  useEffect(() => {
    if (view !== "Messages" || !selectedConversation) return;
    const unreadIncoming = messages.filter((message) =>
      message.conversation_id === selectedConversation
      && message.sender_id !== user.id
      && !message.read_at);
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
  }, [view, selectedConversation, messages, supabase, user.id]);

  const filteredAssignments = useMemo(() => assignments.filter((item) => `${item.title} ${item.description}`.toLowerCase().includes(query.trim().toLowerCase())), [assignments, query]);
  const filteredTests = useMemo(() => tests.filter((item) => `${item.title} ${item.description}`.toLowerCase().includes(query.trim().toLowerCase())), [tests, query]);
  const filteredConversations = useMemo(() => conversations.filter((item) => `${item.subject} ${profiles[item.student_id]?.full_name ?? ""} ${profiles[item.student_id]?.email ?? ""}`.toLowerCase().includes(query.trim().toLowerCase())), [conversations, profiles, query]);
  const selectedThread = conversations.find((thread) => thread.id === selectedConversation);
  const threadMessages = messages.filter((message) => message.conversation_id === selectedConversation);

  async function handleOpenQuestionPreview(assignment) {
    setError("");
    try {
      const url = await resolveStorageSignedUrl(
        supabase,
        assignment.question_file_path,
        assignment.question_url || ""
      );
      if (!url) {
        setError("No question document URL available to preview.");
        return;
      }
      setPreviewTest({
        title: assignment.title,
        subtitle: "Assignment Question Document",
        external_url: url,
        directDownloadUrl: url,
        fileName: assignment.question_file_name || "Question Paper",
        fileType: assignment.question_file_type || "",
      });
    } catch (err) {
      setError(err.message || "Could not open question document.");
    }
  }

  async function handleDownloadQuestionFile(assignment) {
    setError("");
    try {
      await triggerDocumentDownload(
        supabase,
        assignment.question_file_path,
        assignment.question_file_name || "question-document",
        assignment.question_url || ""
      );
    } catch (err) {
      setError(err.message || "Could not download question document.");
    }
  }

  async function createAssignment(form) {
    if (!form.recipientIds.length) {
      setError("Select at least one approved student for this assignment.");
      return;
    }
    setBusy(true);
    setError("");
    let questionAttachment = null;
    if (form.questionFile) {
      try {
        questionAttachment = await uploadDocumentAttachment(supabase, form.questionFile, "assignment_questions");
      } catch (uploadErr) {
        setError(uploadErr.message || "Failed to upload question document.");
        setBusy(false);
        return;
      }
    }
    const { data: assignment, error: insertError } = await supabase.from("assignments").insert({
      title: form.title,
      description: form.description,
      due_at: form.due ? new Date(form.due).toISOString() : null,
      created_by: user.id,
      published: true,
      question_file_path: questionAttachment?.filePath || null,
      question_file_name: questionAttachment?.fileName || null,
      question_file_type: questionAttachment?.fileType || null,
      question_url: form.questionUrl || null,
    }).select("id").single();
    if (insertError) setError(insertError.message);
    else {
      const { error: targetError } = await supabase.from("assignment_recipients").insert(form.recipientIds.map((studentId) => ({ assignment_id: assignment.id, student_id: studentId })));
      if (targetError) {
        const { error: rollbackError } = await supabase.from("assignments").delete().eq("id", assignment.id);
        setError(rollbackError
          ? `Could not assign students (${targetError.message}); cleanup also failed (${rollbackError.message}).`
          : `Could not assign students: ${targetError.message}`);
      } else {
        const { data: notificationResult, error: notifyError } = await supabase.functions.invoke("admin-actions", {
          body: { action: "notify_students", studentIds: form.recipientIds, subject: `New assignment: ${form.title}`, body: form.description || "A new assignment is available in your student portal." },
        });
        setShowForm(false);
        if (notifyError) setError(`Assignment published, but notification failed: ${await getFunctionErrorMessage(notifyError)}`);
        else if (notificationResult?.emailFailures?.length) {
          setError(`Assignment published and in-app notifications saved, but email delivery failed: ${notificationResult.emailFailures.join(" | ")}`);
        }
        else onToast("Assignment published and students notified.");
        await loadAdminData();
      }
    }
    setBusy(false);
  }

  async function handleOpenQuizRunner(test, attemptOverride = null, studentOverride = null) {
    setError("");
    setBusy(true);
    try {
      const { data: qRows, error: qErr } = await supabase
        .from("assessment_questions")
        .select("id, assessment_id, external_id, prompt, options, correct_index, explanation, points, sort_order")
        .eq("assessment_id", test.id)
        .order("sort_order", { ascending: true });
      if (qErr) throw qErr;
      setPreviewQuiz({
        test,
        questions: qRows ?? [],
        attempt: attemptOverride,
        student: studentOverride,
      });
    } catch (err) {
      setError(err.message || "Could not load quiz questions.");
    } finally {
      setBusy(false);
    }
  }

  async function createTest(form) {
    if (!form.recipientIds.length) {
      setError("Select at least one approved student for this test.");
      return;
    }
    if (form.testType === "external") {
      const candidate = form.externalUrl.trim();
      if (!/^https:\/\//i.test(candidate)) {
        setError("External test URLs must use HTTPS.");
        return;
      }
    } else if (!form.questions?.length) {
      setError("Add at least 1 valid multiple-choice question in the JSON editor.");
      return;
    }

    const proctoring = form.proctoring || {};
    const totalPoints =
      form.testType === "built_in"
        ? form.questions.reduce((acc, q) => acc + (q.points || 1), 0)
        : 100;

    setBusy(true);
    setError("");
    const { data: createdTest, error: insertError } = await supabase.from("assessments").insert({
      title: form.title,
      description: form.description,
      due_at: form.due ? new Date(form.due).toISOString() : null,
      external_url: form.testType === "external" ? form.externalUrl : null,
      duration_minutes: Number(proctoring.durationMinutes) || 30,
      require_camera: Boolean(proctoring.requireCamera),
      allow_camera_off: Boolean(proctoring.requireCamera && proctoring.allowCameraOff),
      track_tab_switches: proctoring.trackTabSwitches !== false,
      max_tab_switches: Number(proctoring.maxTabSwitches) || 3,
      passing_percentage: Number(proctoring.passingPercentage) || 50,
      show_marks: proctoring.showMarks !== undefined ? Boolean(proctoring.showMarks) : true,
      total_marks: totalPoints,
      created_by: user.id,
      published: true,
    }).select("id").single();
    if (insertError) {
      setError(insertError.message);
      setBusy(false);
      return;
    }
    let questionError = null;
    if (form.testType === "built_in") {
      try {
        await syncAssessmentQuestions(supabase, createdTest.id, form.questions);
      } catch (qErr) {
        questionError = qErr;
      }
    }
    const { error: targetError } = questionError
      ? { error: null }
      : await supabase.from("assessment_recipients").insert(form.recipientIds.map((studentId) => ({ assessment_id: createdTest.id, student_id: studentId })));
    if (questionError || targetError) {
      const { error: rollbackError } = await supabase.from("assessments").delete().eq("id", createdTest.id);
      const failure = questionError || targetError;
      setError(rollbackError
        ? `Could not finish test setup (${failure.message}); cleanup also failed (${rollbackError.message}).`
        : `Could not finish test setup: ${failure.message}`);
    } else {
      const { data: notificationResult, error: notifyError } = await supabase.functions.invoke("admin-actions", {
        body: { action: "notify_students", studentIds: form.recipientIds, subject: `New test: ${form.title}`, body: form.description || "A new test is available in your student portal." },
      });
      setShowForm(false);
      if (notifyError) setError(`Test published, but notification failed: ${await getFunctionErrorMessage(notifyError)}`);
      else if (notificationResult?.emailFailures?.length) {
        setError(`Test published and in-app notifications saved, but email delivery failed: ${notificationResult.emailFailures.join(" | ")}`);
      }
      else onToast("Test published and students notified.");
      await loadAdminData();
    }
    setBusy(false);
  }

  async function sendReminder(item, studentIds, kind) {
    if (!studentIds?.length) {
      setError("This item has no assigned students to remind.");
      return;
    }
    setBusy(true);
    setError("");
    const { data: reminderResult, error: reminderError } = await supabase.functions.invoke("admin-actions", {
      body: { action: "notify_students", studentIds, subject: `Reminder: ${item.title}`, body: `Reminder: ${item.title}${item.due_at ? ` is due ${prettyDate(item.due_at)}` : " is available"}. Open LearnForge to review it.` },
    });
    if (reminderError) setError(`Could not send ${kind} reminder: ${await getFunctionErrorMessage(reminderError)}`);
    else if (reminderResult?.emailFailures?.length) {
      setError(`${kind} reminder saved in the student portal, but email delivery failed: ${reminderResult.emailFailures.join(" | ")}`);
    }
    else onToast(`${kind} reminder sent.`);
    setBusy(false);
  }

  async function gradeStudentSubmission(assignment, student, existingSubmission) {
    const draftKey = existingSubmission?.id || `${assignment.id}-${student.id}`;
    const draft = gradeDrafts[draftKey] ?? {
      grade: existingSubmission?.grade ?? "",
      feedback: existingSubmission?.feedback ?? "",
    };
    const numericGrade = Number(draft.grade);
    if (!Number.isFinite(numericGrade) || numericGrade < 0 || numericGrade > 100) {
      setError("Enter a grade from 0 to 100.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const payload = {
        assignment_id: assignment.id,
        student_id: student.id,
        grade: numericGrade,
        feedback: (draft.feedback ?? "").trim() || null,
        graded_at: new Date().toISOString(),
        answer_text: existingSubmission?.answer_text || "Instructor Evaluation",
        status: "Completed",
      };
      if (existingSubmission?.id) {
        payload.id = existingSubmission.id;
      }
      const { error: gradeError } = await supabase
        .from("assignment_submissions")
        .upsert(payload, { onConflict: "assignment_id,student_id" });

      if (gradeError) throw gradeError;
      onToast(`Assignment grade (${numericGrade}/100) saved for ${student.full_name || student.email}.`);
      await loadAdminData();
    } catch (err) {
      setError(`Could not save grade: ${err.message}`);
    } finally {
      setBusy(false);
    }
  }

  const gradeSubmission = (sub) => {
    const student = profiles[sub.student_id] || { id: sub.student_id };
    const assignment = assignments.find((a) => a.id === sub.assignment_id) || { id: sub.assignment_id };
    return gradeStudentSubmission(assignment, student, sub);
  };

  async function downloadSubmission(path) {
    const { data, error: fileError } = await supabase.storage.from("assignment-files").createSignedUrl(path, 60);
    if (fileError) setError(fileError.message);
    else window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  async function deleteStudentSubmissionFile(submission) {
    if (!submission?.file_path) return;
    if (!window.confirm("Are you sure you want to manually delete this student's uploaded file? The file will be removed from storage.")) return;
    setBusy(true);
    setError("");
    try {
      let cleanPath = submission.file_path;
      if (cleanPath.startsWith("assignment-files:")) {
        cleanPath = cleanPath.replace("assignment-files:", "");
      }
      try {
        await supabase.storage.from("assignment-files").remove([cleanPath]);
      } catch (storageErr) {
        console.warn("Storage delete warning:", storageErr);
      }
      const hasOtherContent = Boolean(submission.submission_link || (submission.answer_text && submission.answer_text.trim()));
      const updatePayload = {
        file_path: null,
        answer_text: hasOtherContent ? submission.answer_text : "(File removed by administrator)",
      };
      const { error: dbErr } = await supabase
        .from("assignment_submissions")
        .update(updatePayload)
        .eq("id", submission.id);

      if (dbErr) throw dbErr;
      setSubmissions((prev) =>
        prev.map((s) => (s.id === submission.id ? { ...s, ...updatePayload } : s))
      );
      onToast("Student uploaded file deleted manually.");
      await loadAdminData();
    } catch (err) {
      setError(`Could not delete student file: ${err.message}`);
    } finally {
      setBusy(false);
    }
  }

  async function deleteAssignment(assignment) {
    if (!assignment) return;
    if (!window.confirm(`Delete “${assignment.title}” and its submissions? This cannot be undone.`)) return;
    setBusy(true);
    try {
      const { error: deleteError } = await supabase.from("assignments").delete().eq("id", assignment.id);
      if (deleteError) throw deleteError;
      setAssignments((prev) => prev.filter((a) => a.id !== assignment.id));
      if (editingAssignment?.id === assignment.id) setEditingAssignment(null);
      onToast("Assignment deleted.");
      await loadAdminData();
    } catch (err) {
      setError(`Could not delete assignment: ${err.message}`);
    } finally {
      setBusy(false);
    }
  }

  async function deleteTest(test) {
    if (!window.confirm(`Delete “${test.title}” and its questions and attempts? This cannot be undone.`)) return;
    const { error: deleteError } = await supabase.from("assessments").delete().eq("id", test.id);
    if (deleteError) setError(deleteError.message);
    else {
      onToast("Test deleted.");
      await loadAdminData();
    }
  }

  async function updateAssignment(assignmentId, form) {
    setBusy(true);
    setError("");
    try {
      let questionAttachment = form.existingQuestionFile || null;
      if (form.questionFile) {
        questionAttachment = await uploadDocumentAttachment(supabase, form.questionFile, "assignment_questions");
      }
      const { error: updateError } = await supabase.from("assignments").update({
        title: form.title.trim(),
        description: form.description.trim(),
        due_at: form.due ? new Date(form.due).toISOString() : null,
        question_file_path: questionAttachment?.filePath || null,
        question_file_name: questionAttachment?.fileName || null,
        question_file_type: questionAttachment?.fileType || null,
        question_url: form.questionUrl?.trim() || null,
      }).eq("id", assignmentId);
      if (updateError) throw updateError;

      if (form.recipientIds) {
        await supabase.from("assignment_recipients").delete().eq("assignment_id", assignmentId);
        if (form.recipientIds.length > 0) {
          const { error: insErr } = await supabase.from("assignment_recipients").insert(
            form.recipientIds.map((sid) => ({ assignment_id: assignmentId, student_id: sid }))
          );
          if (insErr) throw insErr;
        }
      }
      onToast(`Assignment “${form.title}” updated.`);
      setEditingAssignment(null);
      await loadAdminData();
    } catch (err) {
      setError(`Could not update assignment: ${err.message}`);
    } finally {
      setBusy(false);
    }
  }

  async function updateTest(testId, form) {
    setBusy(true);
    setError("");
    try {
      await updateAssessmentRecord(supabase, testId, form);

      if (form.recipientIds) {
        await supabase.from("assessment_recipients").delete().eq("assessment_id", testId);
        if (form.recipientIds.length > 0) {
          const { error: insErr } = await supabase.from("assessment_recipients").insert(
            form.recipientIds.map((sid) => ({ assessment_id: testId, student_id: sid }))
          );
          if (insErr) throw insErr;
        }
      }
      onToast(`Test “${form.title}” updated.`);
      setEditingTest(null);
      await loadAdminData();
    } catch (err) {
      setError(`Could not update test: ${err.message}`);
      throw err;
    } finally {
      setBusy(false);
    }
  }

  async function togglePublishMarks(test) {
    const nextVal = !test.show_marks;
    setBusy(true);
    setError("");
    try {
      const { error: updErr } = await supabase.from("assessments").update({ show_marks: nextVal }).eq("id", test.id);
      if (updErr) throw updErr;
      onToast(nextVal ? `Marks released to students for “${test.title}”.` : `Marks hidden from students for “${test.title}”.`);
      await loadAdminData();
    } catch (err) {
      setError(`Could not update marks visibility: ${err.message}`);
    } finally {
      setBusy(false);
    }
  }

  async function sendReply(event) {
    event.preventDefault();
    const body = reply.trim();
    if (!body || !selectedConversation) return;
    setBusy(true);
    setError("");
    const { error: sendError } = await supabase.from("messages").insert({
      conversation_id: selectedConversation,
      sender_id: user.id,
      body,
    });
    if (sendError) setError(sendError.message);
    else {
      setReply("");
      onToast("Reply sent to the student.");
      await loadAdminData();
    }
    setBusy(false);
  }

  async function recordAttemptScore(event) {
    event.preventDefault();
    if (!gradingModal) return;
    setGradingSubmitting(true);
    setError("");
    try {
      const scoreNum = Math.max(0, parseInt(gradingModal.score, 10) || 0);
      const maxScoreNum = Math.max(1, parseInt(gradingModal.maxScore, 10) || 100);
      const { error: recordError } = await supabase.rpc("admin_record_assessment_attempt", {
        p_assessment_id: gradingModal.test.id,
        p_student_id: gradingModal.student.id,
        p_score: scoreNum,
        p_max_score: maxScoreNum,
      });
      if (recordError) throw recordError;
      onToast(`Assessment score (${scoreNum}/${maxScoreNum}) saved for ${gradingModal.student.full_name || gradingModal.student.email}.`);
      setGradingModal(null);
      await loadAdminData();
    } catch (err) {
      setError(`Could not record exam score: ${err.message}`);
    } finally {
      setGradingSubmitting(false);
    }
  }

  const titles = {
    Assignments: ["Student work", "Assignments", "Publish coursework and review student submissions."],
    Tests: ["Assessment center", "Tests", "Create tests or external links and review student attempts."],
    Messages: ["Campus community", "Student messages", "Respond to private messages from your students."],
  };
  const [eyebrow, title, description] = titles[view] ?? titles.Assignments;
  const unreadCount = messages.filter((message) => message.sender_id !== user.id && !message.read_at).length;

  return <div className="admin-workspace">
    <div className="page-heading"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{description}</p></div><div className="heading-actions">
      {view === "Assignments" && <button className="button primary" onClick={() => setShowForm((current) => !current)}><Plus size={15} />Add assignment</button>}
      {view === "Tests" && <button className="button primary" onClick={() => setShowForm((current) => !current)}><Plus size={15} />Create test</button>}
      {view === "Messages" && <button className="button" onClick={loadAdminData}><Mail size={15} />{unreadCount} unread</button>}
    </div></div>
    {error && <div className="portal-alert error" role="alert">{error}<button type="button" onClick={() => setError("")}>Dismiss</button></div>}
    {showForm && view === "Assignments" && <AdminAssignmentForm busy={busy} students={students} onCancel={() => setShowForm(false)} onCreate={createAssignment} />}
    {showForm && view === "Tests" && <AdminTestForm busy={busy} students={students} onCancel={() => setShowForm(false)} onCreate={createTest} />}
    {loading ? <div className="card portal-loading">Loading secure student records…</div> : view === "Assignments" ? <section className="admin-work-list">
      {filteredAssignments.map((assignment) => {
        const rows = submissions.filter((submission) => submission.assignment_id === assignment.id);
        const recipientIds = assignmentRecipients[assignment.id] ?? [];
        const assignedStudents = recipientIds.length > 0
          ? students.filter((s) => recipientIds.includes(s.id))
          : students;
        const extraStudents = students.filter((s) => !assignedStudents.some((a) => a.id === s.id) && rows.some((r) => r.student_id === s.id));
        const fullRoster = [...assignedStudents, ...extraStudents];

        return <article className="card admin-assignment-card" key={assignment.id}>
          <div className="panel-heading"><div className="admin-assignment-title"><span className="portal-item-icon assignment"><BookOpen size={16} /></span><span><h2>{assignment.title}</h2><p>{assignment.description || "No additional instructions."}</p><small><CalendarClock size={12} />Due {prettyDate(assignment.due_at)} · {rows.length} submitted · {fullRoster.length} assigned</small></span></div><div className="heading-actions"><button className="button compact" type="button" onClick={() => setEditingAssignment(assignment)}><Pencil size={13} /> Edit</button><button className="button" type="button" disabled={busy} onClick={() => sendReminder(assignment, assignmentRecipients[assignment.id], "Assignment")}><Mail size={14} />Remind</button><button className="quiet-icon danger-icon" type="button" onClick={() => deleteAssignment(assignment)} aria-label={`Delete ${assignment.title}`}><Trash2 size={15} /></button></div></div>
          {(assignment.question_file_path || assignment.question_url) && (
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "10px",
                padding: "10px 12px",
                marginBottom: "12px",
                borderRadius: "8px",
                background: "rgba(99, 102, 241, 0.06)",
                border: "1px solid rgba(99, 102, 241, 0.2)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px" }}>
                <Paperclip size={15} />
                <span>
                  <strong>Question Paper:</strong>{" "}
                  {assignment.question_file_name || "External Question Link"}
                </span>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                {assignment.question_file_path && (
                  <>
                    <button
                      type="button"
                      className="button compact"
                      onClick={() => handleOpenQuestionPreview(assignment)}
                    >
                      <Eye size={13} /> Preview
                    </button>
                    <button
                      type="button"
                      className="button compact"
                      onClick={() => handleDownloadQuestionFile(assignment)}
                    >
                      <Download size={13} /> Download
                    </button>
                  </>
                )}
                {assignment.question_url && (
                  <a
                    className="button compact"
                    href={assignment.question_url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <ExternalLink size={13} /> Open Link
                  </a>
                )}
              </div>
            </div>
          )}
          {fullRoster.length ? <div className="submission-list">{fullRoster.map((student) => {
            const submission = rows.find((s) => s.student_id === student.id);
            const draftKey = submission?.id || `${assignment.id}-${student.id}`;
            const draft = gradeDrafts[draftKey] ?? { grade: submission?.grade ?? "", feedback: submission?.feedback ?? "" };

            return <div className="admin-submission" key={student.id}>
              <div className="admin-student"><span className="student-avatar">{(student?.full_name || student?.email || "ST").split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase()}</span><span><strong>{student?.full_name || "Student"}</strong><small>{student?.email || "Student account"}</small></span></div>
              {submission ? (
                <span className="submission-time" style={{ color: "#166534", fontWeight: 600 }}>Submitted {submission.submitted_at ? prettyDate(submission.submitted_at, "Recently") : "Recently"}</span>
              ) : (
                <span className="badge amber" style={{ fontSize: "11px", display: "inline-flex", alignItems: "center", gap: "4px" }}>
                  <Clock3 size={11} /> Pending submission / In-Class
                </span>
              )}
              {submission?.answer_text && <p className="submission-answer">{submission.answer_text}</p>}
              {submission?.file_path && (
                <div style={{ display: "flex", alignItems: "center", gap: "10px", margin: "6px 0", flexWrap: "wrap" }}>
                  <button className="text-link" type="button" onClick={() => downloadSubmission(submission.file_path)}>
                    <Download size={13} /> Download student file
                  </button>
                  <button
                    className="button compact"
                    type="button"
                    style={{ background: "#fee2e2", borderColor: "#fca5a5", color: "#991b1b", height: "26px", fontSize: "11px", padding: "0 8px" }}
                    onClick={() => deleteStudentSubmissionFile(submission)}
                    title="Manually delete student uploaded file from storage"
                  >
                    <Trash2 size={11} /> Delete file manually
                  </button>
                </div>
              )}
              <div className="grading-controls"><label className="form-field"><span>Grade / 100</span><input type="number" min="0" max="100" step="0.5" value={draft.grade} onChange={(event) => setGradeDrafts((current) => ({ ...current, [draftKey]: { ...draft, grade: event.target.value } }))} placeholder="Marks" /></label><label className="form-field"><span>Feedback</span><input maxLength="2000" value={draft.feedback} onChange={(event) => setGradeDrafts((current) => ({ ...current, [draftKey]: { ...draft, feedback: event.target.value } }))} placeholder="Optional feedback for the student" /></label><button className="button primary" disabled={busy} onClick={() => gradeStudentSubmission(assignment, student, submission)}><CheckCircle2 size={14} />{submission?.graded_at ? "Update grade" : "Save grade"}</button></div>
            </div>;
          })}</div> : <div className="admin-no-submissions"><Users size={15} />No students assigned to this coursework.</div>}
        </article>;
      })}
      {!filteredAssignments.length && <div className="card portal-empty"><BookOpen size={22} /><strong>No assignments found</strong><span>Publish an assignment for your students to get started.</span></div>}
    </section> : view === "Tests" && previewQuiz ? (
      <ProctoredExamRunner
        assessment={previewQuiz.test}
        questions={previewQuiz.questions}
        studentProfile={
          previewQuiz.student
            ? { full_name: previewQuiz.student.full_name || previewQuiz.student.email }
            : { full_name: user?.email?.split("@")[0] || "Admin Preview" }
        }
        initialAttempt={previewQuiz.attempt || null}
        initialStage={previewQuiz.attempt ? "review" : "precheck"}
        previewMode={true}
        onClose={() => setPreviewQuiz(null)}
      />
    ) : view === "Tests" ? <section className="admin-work-list">
      {filteredTests.map((test) => {
        const recipientIds = assessmentRecipients[test.id] ?? [];
        const eligible = recipientIds.length > 0
          ? students.filter((s) => recipientIds.includes(s.id))
          : students;
        const testAttempts = attempts.filter((attempt) => attempt.assessment_id === test.id);
        const attemptMap = new Map(testAttempts.map((a) => [a.student_id, a]));
        const extraStudents = students.filter(
          (s) => !eligible.some((e) => e.id === s.id) && attemptMap.has(s.id)
        );
        const fullRoster = [...eligible, ...extraStudents];
        const completedStudents = fullRoster.filter((s) => attemptMap.has(s.id));
        const pendingStudents = fullRoster.filter((s) => !attemptMap.has(s.id));
        const activeTab = testCohortFilter[test.id] || "all";
        const visibleStudents = activeTab === "completed"
          ? completedStudents
          : activeTab === "pending"
          ? pendingStudents
          : fullRoster;
        const completionPercent = fullRoster.length
          ? Math.round((completedStudents.length / fullRoster.length) * 100)
          : 0;

        return (
          <article className="card admin-assignment-card" key={test.id}>
            <div className="panel-heading">
              <div className="admin-assignment-title">
                <span className="portal-item-icon test">
                  <ClipboardList size={16} />
                </span>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                    <h2>{test.title}</h2>
                    {test.external_url ? (
                      <span className="source-tag google">External Form</span>
                    ) : (
                      <span className="source-tag db">Portal Quiz</span>
                    )}
                  </div>
                  <p>{test.description || "No additional instructions."}</p>
                  <small>
                    <CalendarClock size={12} />
                    Due {prettyDate(test.due_at)} · {fullRoster.length} assigned / can attend
                    {!test.external_url && (
                      <>
                        {" · "}
                        {test.duration_minutes || 30}m Timer
                        {" · "}
                        {test.require_camera
                          ? test.allow_camera_off
                            ? "Camera Required (Off Permitted)"
                            : "Camera Locked ON"
                          : "Camera Off"}
                        {" · "}
                        {test.track_tab_switches !== false
                          ? `Tab Limit: ${test.max_tab_switches || 3}`
                          : "Tab Tracking Off"}
                      </>
                    )}
                  </small>
                </div>
              </div>
              <div className="heading-actions">
                {!test.external_url && (
                  <button
                    className="button primary compact"
                    type="button"
                    disabled={busy}
                    onClick={() => handleOpenQuizRunner(test)}
                    title="Launch & test this proctored quiz in Preview Mode"
                  >
                    <Play size={13} />
                    <span>Launch / Preview Quiz</span>
                  </button>
                )}
                {test.external_url && (
                  <button
                    className="button compact"
                    type="button"
                    onClick={() => setPreviewTest(test)}
                    title="Preview external test inside dashboard"
                  >
                    <Eye size={13} />
                    <span>Preview</span>
                  </button>
                )}
                {test.external_url && (
                  <a
                    className="button compact"
                    href={test.external_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Open external test link in new tab"
                  >
                    <ExternalLink size={13} />
                    <span>Open link</span>
                  </a>
                )}
                <button
                  className={`button compact ${test.show_marks ? "primary" : ""}`}
                  type="button"
                  disabled={busy}
                  onClick={() => togglePublishMarks(test)}
                  title={test.show_marks ? "Marks currently visible to students. Click to hide." : "Marks hidden from students. Click to release."}
                  style={{ gap: "5px" }}
                >
                  {test.show_marks ? <CheckCircle2 size={13} /> : <EyeOff size={13} />}
                  <span>{test.show_marks ? "Marks Released" : "Marks Hidden (Permit)"}</span>
                </button>
                <button
                  className="button compact"
                  type="button"
                  onClick={() => setEditingTest(test)}
                >
                  <Pencil size={13} /> Edit
                </button>
                {pendingStudents.length > 0 && (
                  <button
                    className="button"
                    type="button"
                    disabled={busy}
                    onClick={() => sendReminder(test, pendingStudents.map((s) => s.id), "Test")}
                    title="Send reminder to all pending students"
                  >
                    <Mail size={14} />
                    Remind Pending ({pendingStudents.length})
                  </button>
                )}
                <button
                  className="quiet-icon danger-icon"
                  type="button"
                  onClick={() => deleteTest(test)}
                  aria-label={`Delete ${test.title}`}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>

            {/* Attendance & Completion Cohort Metrics Summary */}
            <div className="exam-cohort-summary">
              <div className="cohort-stat-chip">
                <Users size={14} />
                <span>Who Can Attend: <strong>{fullRoster.length}</strong></span>
              </div>
              <div className="cohort-stat-chip completed">
                <CheckCircle2 size={14} />
                <span>Completed: <strong>{completedStudents.length}</strong></span>
              </div>
              <div className="cohort-stat-chip pending">
                <Clock size={14} />
                <span>Pending / Not Attended: <strong>{pendingStudents.length}</strong></span>
              </div>
              <div className="cohort-stat-chip rate">
                <Award size={14} />
                <span>Completion: <strong>{completionPercent}%</strong></span>
              </div>
              <div className="cohort-progress-track" title={`${completionPercent}% completed`}>
                <div
                  className="cohort-progress-fill"
                  style={{ width: `${completionPercent}%` }}
                />
              </div>
            </div>

            {/* Cohort Tabs: All Eligible | Completed | Pending / Not Attended */}
            <div className="cohort-tabs-nav">
              <button
                type="button"
                className={`cohort-tab ${activeTab === "all" ? "active" : ""}`}
                onClick={() => setTestCohortFilter((prev) => ({ ...prev, [test.id]: "all" }))}
              >
                All Can Attend ({fullRoster.length})
              </button>
              <button
                type="button"
                className={`cohort-tab ${activeTab === "completed" ? "active" : ""}`}
                onClick={() => setTestCohortFilter((prev) => ({ ...prev, [test.id]: "completed" }))}
              >
                ✓ Completed ({completedStudents.length})
              </button>
              <button
                type="button"
                className={`cohort-tab ${activeTab === "pending" ? "active" : ""}`}
                onClick={() => setTestCohortFilter((prev) => ({ ...prev, [test.id]: "pending" }))}
              >
                ⏳ Pending / Not Attended ({pendingStudents.length})
              </button>
            </div>

            {/* Student Cohort List */}
            {visibleStudents.length > 0 ? (
              <div className="cohort-student-list">
                {visibleStudents.map((student) => {
                  const attempt = attemptMap.get(student.id);
                  const isCompleted = Boolean(attempt);
                  const studentInitials = (student.full_name || student.email || "ST")
                    .split(/\s+/)
                    .slice(0, 2)
                    .map((part) => part[0])
                    .join("")
                    .toUpperCase();

                  return (
                    <div className="cohort-student-row" key={student.id}>
                      <div className="admin-student">
                        <span className="student-avatar">{studentInitials}</span>
                        <span>
                          <strong>{student.full_name || "Student"}</strong>
                          <small>{student.email || ""}</small>
                        </span>
                      </div>

                      <div className="cohort-student-status">
                        {isCompleted ? (
                          <span className="cohort-status-pill completed">
                            <CheckCircle2 size={13} />
                            <span>Completed</span>
                          </span>
                        ) : (
                          <span className="cohort-status-pill pending">
                            <Clock size={13} />
                            <span>Not Attended</span>
                          </span>
                        )}
                      </div>

                      <div className="cohort-student-score">
                        {isCompleted ? (
                          <div>
                            <div className="test-score">
                              <CheckCircle2 size={14} />
                              <strong>{attempt.score} / {attempt.max_score}</strong>
                              <small>({Math.round((attempt.score / (attempt.max_score || 100)) * 100)}%)</small>
                            </div>
                            {!test.external_url && (
                              <div className="proctor-attempt-meta">
                                <span><Clock size={11} /> {formatSeconds(attempt.time_taken_seconds)}</span>
                                <span><Monitor size={11} /> Switches: {attempt.tab_switch_count ?? 0}</span>
                                <span><Camera size={11} /> {attempt.camera_status || "Off"}</span>
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="no-score-label">—</span>
                        )}
                      </div>

                      <div className="cohort-student-time">
                        {isCompleted && attempt.submitted_at ? (
                          <small title={attempt.submitted_at}>{prettyDate(attempt.submitted_at)}</small>
                        ) : (
                          <small className="muted-text">Awaiting submission</small>
                        )}
                      </div>

                      <div className="cohort-student-actions">
                        {isCompleted ? (
                          <>
                            {!test.external_url && (
                              <button
                                className="button compact"
                                type="button"
                                disabled={busy}
                                onClick={() => handleOpenQuizRunner(test, attempt, student)}
                                title="Inspect student answer review & proctoring log"
                              >
                                <ShieldCheck size={12} />
                                <span>Review &amp; Log</span>
                              </button>
                            )}
                            <button
                              className="button compact"
                              type="button"
                              onClick={() =>
                                setGradingModal({
                                  test,
                                  student,
                                  score: attempt.score,
                                  maxScore: attempt.max_score,
                                  isEdit: true,
                                })
                              }
                              title="Edit exam score"
                            >
                              <Pencil size={12} />
                              <span>Edit Score</span>
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              className="button primary compact"
                              type="button"
                              onClick={() =>
                                setGradingModal({
                                  test,
                                  student,
                                  score: 100,
                                  maxScore: 100,
                                  isEdit: false,
                                })
                              }
                              title="Record score and mark exam completed for this student"
                            >
                              <CheckCircle2 size={12} />
                              <span>Record Score / Mark Completed</span>
                            </button>
                            <button
                              className="button compact"
                              type="button"
                              disabled={busy}
                              onClick={() => sendReminder(test, [student.id], "Test")}
                              title="Send reminder to this student"
                            >
                              <Mail size={12} />
                              <span>Remind</span>
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="admin-no-submissions">
                <Users size={15} />
                <span>
                  {activeTab === "completed"
                    ? "No students have completed this exam yet."
                    : activeTab === "pending"
                    ? "All eligible students have completed this exam!"
                    : "No students assigned to attend this test."}
                </span>
              </div>
            )}
          </article>
        );
      })}
      {!filteredTests.length && <div className="card portal-empty"><ClipboardList size={22} /><strong>No tests found</strong><span>Create a test to check student learning.</span></div>}
    </section> : <div className="card admin-inbox">
      <aside className="thread-list"><div className="thread-list-heading"><strong>Student conversations</strong><span className="day-label">{unreadCount} unread</span></div>
        {filteredConversations.map((thread) => {
          const student = profiles[thread.student_id];
          const lastMessage = messages.filter((message) => message.conversation_id === thread.id).at(-1);
          const hasUnread = messages.some((message) => message.conversation_id === thread.id && message.sender_id !== user.id && !message.read_at);
          return <button className={`thread-preview ${selectedConversation === thread.id ? "active" : ""}`} key={thread.id} type="button" onClick={() => setSelectedConversation(thread.id)}><span className="thread-avatar"><MessageSquare size={15} /></span><span><strong>{student?.full_name || student?.email || "Student"}{hasUnread && <i className="thread-unread" />}</strong><small>{thread.subject} · {lastMessage?.body ?? "No messages yet"}</small></span></button>;
        })}
        {!filteredConversations.length && <p className="thread-empty">Student messages will appear here.</p>}
      </aside>
      <section className="thread-body">
        <div className="thread-heading"><div><strong>{selectedThread?.subject || "Select a conversation"}</strong><small>{selectedThread ? profiles[selectedThread.student_id]?.email : "Choose a student message to read and reply."}</small></div></div>
        {selectedThread ? <>
          <div className="thread-messages">{threadMessages.map((message) => <div className={`chat-message ${message.sender_id === user.id ? "mine" : ""}`} key={message.id}><span>{message.sender_id === user.id ? "You" : profiles[selectedThread.student_id]?.full_name || "Student"}</span><p>{message.body}</p><small>{prettyDate(message.created_at)}</small></div>)}</div>
          <form className="message-compose" onSubmit={sendReply}><label className="sr-only" htmlFor="admin-reply">Reply to student</label><textarea id="admin-reply" rows="3" maxLength="10000" required value={reply} onChange={(event) => setReply(event.target.value)} placeholder="Write a reply to the student…" /><div className="compose-footer"><span>Replies are sent to the student's private inbox.</span><button className="button primary" disabled={busy || !reply.trim()}><Send size={14} />Send reply</button></div></form>
        </> : <div className="thread-empty-state"><MessageSquare size={22} /><strong>Your student inbox</strong><span>Select a conversation to read and reply.</span></div>}
      </section>
    </div>}

    {previewTest && (
      <SecureDocumentViewer
        title={previewTest.title}
        subtitle={previewTest.subtitle || "Online Assessment Preview"}
        url={previewTest.external_url}
        directDownloadUrl={previewTest.directDownloadUrl}
        fileName={previewTest.fileName}
        fileType={previewTest.fileType}
        userEmail={user.email}
        isSuperuser={true}
        onClose={() => setPreviewTest(null)}
      />
    )}

    {editingAssignment && (
      <EditAssignmentModal
        assignment={editingAssignment}
        students={students}
        currentRecipients={assignmentRecipients[editingAssignment.id] ?? []}
        onClose={() => setEditingAssignment(null)}
        onSave={updateAssignment}
        onDelete={deleteAssignment}
      />
    )}

    {editingTest && (
      <EditTestModal
        test={editingTest}
        students={students}
        currentRecipients={assessmentRecipients[editingTest.id] ?? []}
        supabase={supabase}
        onClose={() => setEditingTest(null)}
        onSave={updateTest}
        onDelete={deleteTest}
      />
    )}

    {gradingModal && (
      <div className="secure-request-dialog-backdrop" role="dialog" aria-modal="true">
        <div className="card secure-request-dialog" style={{ maxWidth: "440px" }}>
          <div className="panel-heading">
            <div>
              <h3>{gradingModal.isEdit ? "Edit Student Score" : "Record Score & Mark Completed"}</h3>
              <p>
                {gradingModal.test.title} · {gradingModal.student.full_name || gradingModal.student.email}
              </p>
            </div>
            <button
              className="quiet-icon"
              type="button"
              onClick={() => setGradingModal(null)}
              aria-label="Close dialog"
            >
              <X size={16} />
            </button>
          </div>

          <form onSubmit={recordAttemptScore}>
            <div className="secure-request-details" style={{ marginBottom: "12px" }}>
              <div className="admin-student" style={{ padding: "6px 0" }}>
                <span className="student-avatar">
                  {(gradingModal.student.full_name || gradingModal.student.email || "ST")
                    .split(/\s+/)
                    .slice(0, 2)
                    .map((p) => p[0])
                    .join("")
                    .toUpperCase()}
                </span>
                <span>
                  <strong>{gradingModal.student.full_name || "Student"}</strong>
                  <small>{gradingModal.student.email}</small>
                </span>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              <label className="form-field">
                <span>Score Points</span>
                <input
                  type="number"
                  min="0"
                  max="1000"
                  required
                  value={gradingModal.score}
                  onChange={(e) =>
                    setGradingModal((prev) => ({ ...prev, score: e.target.value }))
                  }
                  placeholder="e.g. 85"
                />
              </label>

              <label className="form-field">
                <span>Max Score</span>
                <input
                  type="number"
                  min="1"
                  max="1000"
                  required
                  value={gradingModal.maxScore}
                  onChange={(e) =>
                    setGradingModal((prev) => ({ ...prev, maxScore: e.target.value }))
                  }
                  placeholder="e.g. 100"
                />
              </label>
            </div>

            <p style={{ fontSize: "12px", color: "var(--muted)", margin: "8px 0 16px" }}>
              Saving will immediately update this student's status to <strong>Completed</strong> and sync to their portal in real time.
            </p>

            <div className="form-actions">
              <button
                className="button"
                type="button"
                onClick={() => setGradingModal(null)}
                disabled={gradingSubmitting}
              >
                Cancel
              </button>
              <button
                className="button primary"
                type="submit"
                disabled={gradingSubmitting}
              >
                <CheckCircle2 size={14} />
                <span>{gradingSubmitting ? "Saving..." : "Save Score"}</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    )}
  </div>;
}

export default AdminPortalView;
