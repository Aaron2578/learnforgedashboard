import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertOctagon,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Award,
  Camera,
  CameraOff,
  CheckCircle2,
  Clock,
  Download,
  Eraser,
  FileSpreadsheet,
  FileText,
  Lock,
  Monitor,
  Play,
  ShieldAlert,
  ShieldCheck,
  Video,
  XCircle,
} from "lucide-react";
import {
  buildSubmissionReasonLabel,
  exportExamResultCsv,
  exportExamResultJson,
  formatSeconds,
  formatTimerClock,
} from "../lib/quizUtils.js";

function WebcamVideo({ stream, className = "" }) {
  const videoRef = useRef(null);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return undefined;
    el.srcObject = stream || null;
    if (stream && typeof el.play === "function") {
      el.play().catch(() => {});
    }
    return () => {
      if (el) el.srcObject = null;
    };
  }, [stream]);

  return <video ref={videoRef} autoPlay playsInline muted className={className} />;
}

function nowTimeIso() {
  return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function buildReviewItems(rawQuestions = [], answersObj = {}) {
  const sorted = [...rawQuestions].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  return sorted.map((q, idx) => {
    const opts = Array.isArray(q.options) ? q.options : [];
    const rawSel = answersObj?.[q.id];
    const selectedIndex =
      rawSel !== undefined && rawSel !== null && Number.isInteger(Number(rawSel))
        ? Number(rawSel)
        : null;
    const correctIndex = Number.isInteger(q.correct_index) ? q.correct_index : null;
    const isUnanswered = selectedIndex === null || opts[selectedIndex] === undefined;
    const isCorrect = !isUnanswered && correctIndex !== null && selectedIndex === correctIndex;
    const points = Number(q.points) || 1;
    return {
      id: q.id,
      externalId: q.external_id || idx + 1,
      index: idx,
      question: q.prompt || q.question || "",
      options: opts,
      points,
      pointsEarned: isCorrect ? points : 0,
      selectedIndex,
      selectedAnswer: isUnanswered ? null : opts[selectedIndex],
      correctIndex,
      correctAnswer: correctIndex !== null ? opts[correctIndex] ?? null : null,
      explanation: q.explanation || "",
      isUnanswered,
      isCorrect,
    };
  });
}

export default function ProctoredExamRunner({
  assessment,
  questions = [],
  studentProfile = {},
  initialAttempt = null,
  initialReviewData = null,
  initialStage = "precheck", // "precheck" | "review"
  previewMode = false,
  supabase = null,
  onSubmitted,
  onClose,
}) {
  const orderedQuestions = useMemo(
    () => [...questions].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
    [questions]
  );

  const durationMinutes = Math.max(1, Number(assessment?.duration_minutes) || 30);
  const passingPercentage = Math.max(1, Math.min(100, Number(assessment?.passing_percentage) || 50));
  const requireCamera = Boolean(assessment?.require_camera);
  const allowCameraOff = Boolean(assessment?.allow_camera_off);
  const trackTabSwitches = assessment?.track_tab_switches !== false;
  const maxTabSwitches = Math.max(1, Number(assessment?.max_tab_switches) || 3);
  const totalPointsPossible = useMemo(
    () => Math.max(1, orderedQuestions.reduce((acc, q) => acc + (Number(q.points) || 1), 0)),
    [orderedQuestions]
  );

  // Stage state: "precheck" | "exam" | "result"
  const [stage, setStage] = useState(initialStage === "review" ? "result" : "precheck");
  const stageRef = useRef(stage);
  useEffect(() => {
    stageRef.current = stage;
  }, [stage]);

  // Candidate identity (Step 1)
  const [studentName, setStudentName] = useState(studentProfile?.full_name || "");
  const [rollNumber, setRollNumber] = useState(studentProfile?.roll_number || "");

  // Webcam state
  const streamRef = useRef(null);
  const [cameraStream, setCameraStream] = useState(null);
  const [cameraError, setCameraError] = useState("");
  const [cameraLoading, setCameraLoading] = useState(false);
  const [cameraManuallyOff, setCameraManuallyOff] = useState(false);
  const cameraManuallyOffRef = useRef(false);
  const [cameraWasEnabled, setCameraWasEnabled] = useState(false);
  const cameraWasEnabledRef = useRef(false);
  const [cameraBypassedInPreview, setCameraBypassedInPreview] = useState(false);
  const cameraBypassedRef = useRef(false);

  // Exam Progress & Proctoring State
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState({});
  const answersRef = useRef({});
  const [remainingSeconds, setRemainingSeconds] = useState(durationMinutes * 60);
  const examStartedAtRef = useRef(null);
  const [tabSwitchCount, setTabSwitchCount] = useState(0);
  const tabSwitchCountRef = useRef(0);
  const proctoringLogRef = useRef([]);
  const [warningModal, setWarningModal] = useState(null);
  const [confirmSubmitOpen, setConfirmSubmitOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const isSubmittingRef = useRef(false);
  const lastViolationAtRef = useRef(0);

  // Result Review state
  const [reviewFilter, setReviewFilter] = useState("all"); // "all" | "correct" | "incorrect" | "unanswered"
  const [resultSummary, setResultSummary] = useState(() => {
    if (initialStage !== "review" || !initialAttempt) return null;
    const reviewQuestions = initialReviewData?.questions || orderedQuestions;
    const attemptAnswers = initialAttempt.answers || {};
    const review = buildReviewItems(reviewQuestions, attemptAnswers);
    const showMarks = previewMode ? true : Boolean(initialReviewData?.show_marks ?? assessment?.show_marks);
    const maxScore = Number(initialAttempt.max_score) || totalPointsPossible;
    const score = Number(initialAttempt.score) || 0;
    const pct =
      initialAttempt.percentage !== undefined && initialAttempt.percentage !== null
        ? Number(initialAttempt.percentage)
        : Math.round((score / Math.max(1, maxScore)) * 10000) / 100;
    const passed =
      initialAttempt.passed !== undefined && initialAttempt.passed !== null
        ? Boolean(initialAttempt.passed)
        : pct >= passingPercentage;
    return {
      examTitle: assessment?.title || "Proctored Assessment",
      studentName: initialAttempt.student_name || studentProfile?.full_name || "Student",
      rollNumber: initialAttempt.roll_number || "N/A",
      submittedAt: initialAttempt.submitted_at,
      score,
      maxScore,
      percentage: pct,
      passingPercentage,
      passed,
      timeTakenSeconds: Number(initialAttempt.time_taken_seconds) || 0,
      submissionReason: initialAttempt.submission_reason || "manual",
      trackTabSwitches,
      tabSwitchCount: Number(initialAttempt.tab_switch_count) || 0,
      maxTabSwitches,
      cameraStatus: initialAttempt.camera_status || (requireCamera ? "Active" : "Not Required"),
      showMarks,
      proctoringLog: Array.isArray(initialAttempt.proctoring_log) ? initialAttempt.proctoring_log : [],
      review: showMarks ? review : [],
    };
  });

  const appendLog = useCallback((event, detail = "") => {
    const entry = {
      timestamp: nowTimeIso(),
      isoTime: new Date().toISOString(),
      event,
      detail,
    };
    proctoringLogRef.current = [...proctoringLogRef.current, entry];
    return proctoringLogRef.current;
  }, []);

  const stopCameraStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {
          // ignore track stop error
        }
      });
      streamRef.current = null;
    }
    setCameraStream(null);
  }, []);

  // Always stop webcam tracks on unmount
  useEffect(() => {
    return () => {
      stopCameraStream();
    };
  }, [stopCameraStream]);

  async function requestCameraAccess() {
    setCameraError("");
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraError("Webcam capture is not supported in this browser or requires an HTTPS connection.");
      return false;
    }
    setCameraLoading(true);
    try {
      stopCameraStream();
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      streamRef.current = mediaStream;
      setCameraStream(mediaStream);
      setCameraWasEnabled(true);
      cameraWasEnabledRef.current = true;
      setCameraManuallyOff(false);
      cameraManuallyOffRef.current = false;
      setCameraBypassedInPreview(false);
      cameraBypassedRef.current = false;

      const videoTrack = mediaStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.onended = () => {
          if (stageRef.current === "exam" && !isSubmittingRef.current) {
            appendLog("Camera Disconnected", "Video track ended unexpectedly during the exam.");
            streamRef.current = null;
            setCameraStream(null);
          }
        };
      }
      return true;
    } catch (err) {
      const msg =
        err?.name === "NotAllowedError" || err?.name === "PermissionDeniedError"
          ? "Camera permission was denied. Please allow webcam access in your browser address bar and retry."
          : err?.name === "NotFoundError"
          ? "No camera device was detected on this computer."
          : err?.message || "Unable to access webcam.";
      setCameraError(msg);
      return false;
    } finally {
      setCameraLoading(false);
    }
  }

  function handleToggleCameraDuringExam() {
    if (!allowCameraOff) return;
    if (cameraStream) {
      stopCameraStream();
      setCameraManuallyOff(true);
      cameraManuallyOffRef.current = true;
      appendLog("Camera Turned Off", "Student turned off webcam (permitted by Admin setting).");
    } else {
      appendLog("Camera Re-enabled", "Student turned webcam back on.");
      requestCameraAccess();
    }
  }

  function computeCameraStatusLabel() {
    if (!requireCamera && !cameraWasEnabledRef.current) return "Not Required";
    if (cameraBypassedRef.current) return "Preview Bypassed (No Camera)";
    if (cameraManuallyOffRef.current) return "Turned Off by Student (Admin Permitted)";
    if (!streamRef.current && cameraWasEnabledRef.current) return "Disconnected Mid-Exam";
    if (streamRef.current) return "Active Throughout Exam";
    return cameraError ? "Permission Denied" : "Off";
  }

  const finalizeSubmit = useCallback(
    async (reason = "manual", overrideSwitchCount = null, overrideLog = null) => {
      if (isSubmittingRef.current) return;
      isSubmittingRef.current = true;
      setSubmitting(true);
      setConfirmSubmitOpen(false);
      setWarningModal(null);
      setSubmitError("");

      const finalAnswers = { ...answersRef.current };
      const elapsedSeconds = examStartedAtRef.current
        ? Math.min(durationMinutes * 60, Math.max(1, Math.round((Date.now() - examStartedAtRef.current) / 1000)))
        : 0;
      const finalSwitchCount = overrideSwitchCount !== null ? overrideSwitchCount : tabSwitchCountRef.current;
      const reasonLabel = buildSubmissionReasonLabel(reason);
      const baseLog = overrideLog || proctoringLogRef.current;
      const finalLog = [
        ...baseLog,
        {
          timestamp: nowTimeIso(),
          isoTime: new Date().toISOString(),
          event: "Exam Submitted",
          detail: `${reasonLabel} · Time taken: ${formatSeconds(elapsedSeconds)}`,
        },
      ];
      const finalCameraStatus = computeCameraStatusLabel();

      // Clean up active webcam immediately when finishing
      stopCameraStream();

      try {
        if (previewMode || !supabase) {
          // Local grading for Admin/Trainer Preview Mode
          const review = buildReviewItems(orderedQuestions, finalAnswers);
          const score = review.reduce((sum, item) => sum + item.pointsEarned, 0);
          const maxScore = Math.max(1, review.reduce((sum, item) => sum + item.points, 0));
          const percentage = Math.round((score / maxScore) * 10000) / 100;
          const passed = percentage >= passingPercentage;
          const summary = {
            examTitle: assessment?.title || "Proctored Assessment",
            studentName: studentName.trim() || "Preview Candidate",
            rollNumber: rollNumber.trim() || "PREVIEW",
            submittedAt: new Date().toISOString(),
            score,
            maxScore,
            percentage,
            passingPercentage,
            passed,
            timeTakenSeconds: elapsedSeconds,
            submissionReason: reason,
            trackTabSwitches,
            tabSwitchCount: finalSwitchCount,
            maxTabSwitches,
            cameraStatus: finalCameraStatus,
            showMarks: true,
            proctoringLog: finalLog,
            review,
            previewMode: true,
          };
          setResultSummary(summary);
          setStage("result");
          return;
        }

        const { data, error } = await supabase.rpc("submit_assessment", {
          p_assessment_id: assessment.id,
          p_answers: finalAnswers,
          p_proctoring: {
            student_name: studentName.trim(),
            roll_number: rollNumber.trim(),
            time_taken_seconds: elapsedSeconds,
            tab_switch_count: finalSwitchCount,
            camera_status: finalCameraStatus,
            submission_reason: reason,
            proctoring_log: finalLog,
          },
        });

        if (error) {
          throw error;
        }

        const payload = Array.isArray(data) ? data[0] : data;
        const showMarks = Boolean(payload?.show_marks);
        const reviewQuestions = Array.isArray(payload?.review_questions) ? payload.review_questions : [];
        const review = showMarks ? buildReviewItems(reviewQuestions, finalAnswers) : [];
        const score = Number(payload?.score) || 0;
        const maxScore = Number(payload?.max_score) || totalPointsPossible;
        const percentage =
          payload?.percentage !== undefined && payload?.percentage !== null
            ? Number(payload.percentage)
            : Math.round((score / Math.max(1, maxScore)) * 10000) / 100;
        const passed =
          payload?.passed !== undefined && payload?.passed !== null
            ? Boolean(payload.passed)
            : percentage >= passingPercentage;

        const summary = {
          examTitle: assessment?.title || "Proctored Assessment",
          studentName: payload?.student_name || studentName.trim(),
          rollNumber: payload?.roll_number || rollNumber.trim(),
          submittedAt: payload?.submitted_at || new Date().toISOString(),
          score,
          maxScore,
          percentage,
          passingPercentage: Number(payload?.passing_percentage) || passingPercentage,
          passed,
          timeTakenSeconds: Number(payload?.time_taken_seconds ?? elapsedSeconds),
          submissionReason: payload?.submission_reason || reason,
          trackTabSwitches,
          tabSwitchCount: Number(payload?.tab_switch_count ?? finalSwitchCount),
          maxTabSwitches,
          cameraStatus: payload?.camera_status || finalCameraStatus,
          showMarks,
          proctoringLog: Array.isArray(payload?.proctoring_log) ? payload.proctoring_log : finalLog,
          review,
        };

        setResultSummary(summary);
        setStage("result");
        if (onSubmitted) onSubmitted(summary);
      } catch (err) {
        isSubmittingRef.current = false;
        setSubmitError(err?.message || "Failed to submit assessment. Please try again.");
      } finally {
        setSubmitting(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      assessment,
      durationMinutes,
      maxTabSwitches,
      onSubmitted,
      orderedQuestions,
      passingPercentage,
      previewMode,
      rollNumber,
      stopCameraStream,
      studentName,
      supabase,
      totalPointsPossible,
      trackTabSwitches,
    ]
  );

  // Countdown Timer Effect during "exam" stage
  useEffect(() => {
    if (stage !== "exam") return undefined;
    const totalSec = durationMinutes * 60;
    const interval = setInterval(() => {
      if (!examStartedAtRef.current || isSubmittingRef.current) return;
      const elapsed = Math.floor((Date.now() - examStartedAtRef.current) / 1000);
      const nextRemaining = Math.max(0, totalSec - elapsed);
      setRemainingSeconds(nextRemaining);
      if (nextRemaining <= 0) {
        clearInterval(interval);
        appendLog("Timer Expired", "Countdown reached 00:00 — auto-submitting exam.");
        finalizeSubmit("timer_expired");
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [stage, durationMinutes, appendLog, finalizeSubmit]);

  // Screen / Tab Switch Detection (visibilitychange + window.onblur) during "exam" stage
  useEffect(() => {
    if (stage !== "exam" || !trackTabSwitches) return undefined;

    const mountGraceUntil = Date.now() + 900;

    function registerViolation(sourceLabel) {
      if (isSubmittingRef.current) return;
      const now = Date.now();
      if (now < mountGraceUntil) return;
      // Deduplicate simultaneous blur + visibilitychange for a single switch action
      if (now - lastViolationAtRef.current < 1200) return;
      lastViolationAtRef.current = now;

      const nextCount = tabSwitchCountRef.current + 1;
      tabSwitchCountRef.current = nextCount;
      setTabSwitchCount(nextCount);

      const updatedLog = appendLog(
        `Screen/Tab Switch (${nextCount}/${maxTabSwitches})`,
        `Trigger: ${sourceLabel}`
      );

      if (nextCount > maxTabSwitches) {
        const exceededLog = [
          ...updatedLog,
          {
            timestamp: nowTimeIso(),
            isoTime: new Date().toISOString(),
            event: "Violation Limit Exceeded",
            detail: `Switched ${nextCount} times (limit: ${maxTabSwitches}) — triggering automatic exam submission.`,
          },
        ];
        proctoringLogRef.current = exceededLog;
        finalizeSubmit("violation_limit_exceeded", nextCount, exceededLog);
      } else {
        setWarningModal({
          count: nextCount,
          limit: maxTabSwitches,
          source: sourceLabel,
          isFinalWarning: nextCount === maxTabSwitches,
        });
      }
    }

    function handleVisibilityChange() {
      if (document.hidden) {
        registerViolation("Browser tab switched or window minimized (visibilitychange)");
      }
    }

    function handleWindowBlur() {
      registerViolation("Browser window lost focus / external window opened (window.blur)");
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("blur", handleWindowBlur);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("blur", handleWindowBlur);
    };
  }, [stage, trackTabSwitches, maxTabSwitches, appendLog, finalizeSubmit]);

  function handleStartExam() {
    if (!studentName.trim() || !rollNumber.trim()) return;
    if (requireCamera && !cameraStream && !cameraBypassedInPreview) return;

    answersRef.current = {};
    setAnswers({});
    setCurrentIdx(0);
    tabSwitchCountRef.current = 0;
    setTabSwitchCount(0);
    setRemainingSeconds(durationMinutes * 60);
    examStartedAtRef.current = Date.now();
    isSubmittingRef.current = false;

    const initialLog = [
      {
        timestamp: nowTimeIso(),
        isoTime: new Date().toISOString(),
        event: "Exam Started",
        detail: `Candidate: ${studentName.trim()} (${rollNumber.trim()}) · Camera: ${
          cameraStream ? "Active" : requireCamera ? "Preview Bypass" : "Not Required"
        }`,
      },
    ];
    proctoringLogRef.current = initialLog;
    setStage("exam");
  }

  function selectAnswer(questionId, optionIndex) {
    setAnswers((prev) => {
      const next = { ...prev, [questionId]: optionIndex };
      answersRef.current = next;
      return next;
    });
  }

  function clearAnswer(questionId) {
    setAnswers((prev) => {
      const next = { ...prev };
      delete next[questionId];
      answersRef.current = next;
      return next;
    });
  }

  const answeredCount = useMemo(
    () => orderedQuestions.filter((q) => answers[q.id] !== undefined && answers[q.id] !== null).length,
    [orderedQuestions, answers]
  );

  // =====================================================
  // STAGE 1: PRE-EXAM CHECK
  // =====================================================
  if (stage === "precheck") {
    const canBegin =
      orderedQuestions.length > 0 &&
      studentName.trim().length > 0 &&
      rollNumber.trim().length > 0 &&
      (!requireCamera || Boolean(cameraStream) || cameraBypassedInPreview);

    return (
      <section className="proctor-runner-card card">
        <div className="proctor-runner-top">
          <button
            type="button"
            className="text-link"
            onClick={() => {
              stopCameraStream();
              onClose();
            }}
          >
            <ArrowLeft size={14} style={{ verticalAlign: "-2px", marginRight: "4px" }} />
            Back to All Tests
          </button>
          {previewMode && <span className="badge blue">Admin / Trainer Preview Mode</span>}
        </div>

        <div className="proctor-precheck-header">
          <div className="eyebrow">Proctored Assessment · Pre-Exam Verification</div>
          <h2>{assessment?.title}</h2>
          {assessment?.description && <p className="proctor-subtitle">{assessment.description}</p>}
        </div>

        <div className="proctor-precheck-grid">
          {/* Left: Candidate Details & Active Rules */}
          <div className="proctor-precheck-col">
            <div className="proctor-rules-box">
              <h3>
                <ShieldCheck size={16} /> Candidate Details
              </h3>
              <div className="form-grid-2">
                <label className="form-field">
                  <span>Full Name *</span>
                  <input
                    required
                    value={studentName}
                    onChange={(e) => setStudentName(e.target.value)}
                    placeholder="Enter your full name"
                  />
                </label>
                <label className="form-field">
                  <span>Roll Number / Student ID *</span>
                  <input
                    required
                    value={rollNumber}
                    onChange={(e) => setRollNumber(e.target.value)}
                    placeholder="e.g. LF-2026-042"
                  />
                </label>
              </div>
            </div>

            <div className="proctor-rules-box">
              <h3>
                <Monitor size={16} /> Active Proctoring Rules
              </h3>
              <ul className="proctor-rule-list">
                <li>
                  <Clock size={15} />
                  <span>
                    <strong>Duration:</strong> {durationMinutes} minute{durationMinutes === 1 ? "" : "s"} ·{" "}
                    {orderedQuestions.length} question{orderedQuestions.length === 1 ? "" : "s"} ({totalPointsPossible} pts) · Pass: {passingPercentage}%
                  </span>
                </li>
                <li>
                  <Camera size={15} />
                  <span>
                    <strong>Webcam Policy:</strong>{" "}
                    {requireCamera
                      ? allowCameraOff
                        ? "Webcam is REQUIRED to start (you have admin permission to turn it off during the exam)."
                        : "Webcam is REQUIRED and LOCKED ON throughout the exam."
                      : "Webcam is NOT required for this test."}
                  </span>
                </li>
                <li>
                  <AlertTriangle size={15} />
                  <span>
                    <strong>Screen / Tab Monitoring:</strong>{" "}
                    {trackTabSwitches
                      ? `Enabled — Switching tabs or leaving the browser window issues warnings up to ${maxTabSwitches}/${maxTabSwitches}. Exceeding ${maxTabSwitches} switches will auto-submit your exam.`
                      : "Screen-switch tracking is disabled for this test."}
                  </span>
                </li>
              </ul>
            </div>
          </div>

          {/* Right: Webcam Verification */}
          <div className="proctor-precheck-col">
            <div className="proctor-camera-check-box">
              <div className="proctor-cam-head">
                <strong>
                  <Video size={15} /> Webcam Check
                </strong>
                <span className={`proctor-cam-status ${cameraStream ? "ready" : requireCamera ? "req" : "opt"}`}>
                  {cameraStream
                    ? "Camera Ready ✓"
                    : requireCamera
                    ? "Camera Required"
                    : "Optional"}
                </span>
              </div>

              <div className="proctor-cam-preview-frame">
                {cameraStream ? (
                  <WebcamVideo stream={cameraStream} className="proctor-cam-video" />
                ) : (
                  <div className="proctor-cam-placeholder">
                    <Camera size={32} />
                    <span>
                      {requireCamera
                        ? "Click Enable Webcam below to verify your video feed before starting."
                        : "Webcam is optional for this exam, or test your camera here."}
                    </span>
                  </div>
                )}
              </div>

              {cameraError && (
                <div className="proctor-validation-box error" style={{ marginTop: "10px" }}>
                  <AlertTriangle size={15} />
                  <div>{cameraError}</div>
                </div>
              )}

              <div className="proctor-cam-actions">
                <button
                  type="button"
                  className="button primary compact"
                  disabled={cameraLoading}
                  onClick={requestCameraAccess}
                >
                  <Camera size={14} />
                  <span>{cameraLoading ? "Requesting Camera…" : cameraStream ? "Restart Webcam" : "Enable Webcam"}</span>
                </button>
                {cameraStream && !requireCamera && (
                  <button type="button" className="button compact" onClick={stopCameraStream}>
                    <CameraOff size={14} /> Turn Off
                  </button>
                )}
                {previewMode && requireCamera && !cameraStream && (
                  <button
                    type="button"
                    className="button compact"
                    onClick={() => {
                      cameraBypassedRef.current = true;
                      setCameraBypassedInPreview(true);
                    }}
                  >
                    Bypass in Preview Mode
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {orderedQuestions.length === 0 && (
          <div className="form-error" style={{ marginTop: "14px" }}>
            No questions have been added to this assessment yet. Contact your instructor.
          </div>
        )}

        <div className="proctor-precheck-footer">
          <button
            type="button"
            className="button"
            onClick={() => {
              stopCameraStream();
              onClose();
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            className="button primary"
            disabled={!canBegin}
            onClick={handleStartExam}
          >
            <Play size={15} /> Begin Proctored Exam
          </button>
        </div>
      </section>
    );
  }

  // =====================================================
  // STAGE 2: ACTIVE PROCTORED EXAM
  // =====================================================
  if (stage === "exam") {
    const activeQ = orderedQuestions[currentIdx] || orderedQuestions[0];
    const selectedOpt = activeQ ? answers[activeQ.id] : undefined;
    const isUrgent = remainingSeconds <= 60;
    const isWarnTime = remainingSeconds > 60 && remainingSeconds <= 300;

    return (
      <section className="proctor-exam-shell">
        {/* Sticky Proctoring Top Bar */}
        <header className="proctor-exam-topbar card">
          <div className="proctor-exam-title-wrap">
            <span className="proctor-live-pill">
              <span className="proctor-pulse-dot" /> PROCTORED EXAM
            </span>
            <div>
              <h2>{assessment?.title}</h2>
              <small>
                Candidate: <strong>{studentName}</strong> · Roll: <strong>{rollNumber}</strong>
                {previewMode ? " · Preview Mode" : ""}
              </small>
            </div>
          </div>

          <div className="proctor-exam-metrics">
            {trackTabSwitches && (
              <div
                className={`proctor-metric-pill ${
                  tabSwitchCount >= maxTabSwitches ? "danger" : tabSwitchCount > 0 ? "warn" : ""
                }`}
                title="Detected screen or tab switches"
              >
                <Monitor size={14} />
                <span>
                  Switches: <strong>{tabSwitchCount}</strong> / {maxTabSwitches}
                </span>
              </div>
            )}

            <div className={`proctor-metric-pill ${cameraStream ? "ok" : requireCamera ? "warn" : ""}`}>
              {cameraStream ? <Camera size={14} /> : <CameraOff size={14} />}
              <span>
                {cameraStream ? "Cam ON" : cameraManuallyOff ? "Cam Paused" : requireCamera ? "Cam Off" : "No Cam"}
              </span>
            </div>

            <div className={`proctor-timer-pill ${isUrgent ? "urgent" : isWarnTime ? "warn" : ""}`}>
              <Clock size={15} />
              <span>{formatTimerClock(remainingSeconds)}</span>
            </div>

            <button
              type="button"
              className="button primary"
              disabled={submitting}
              onClick={() => setConfirmSubmitOpen(true)}
            >
              <CheckCircle2 size={14} /> Submit Test
            </button>
          </div>
        </header>

        {submitError && (
          <div className="portal-alert error" style={{ marginTop: "12px" }}>
            {submitError}
            <button type="button" onClick={() => setSubmitError("")}>Dismiss</button>
          </div>
        )}

        {/* Quiz Question Workspace + Right Palette */}
        <div className="proctor-exam-grid">
          {/* Active Question Panel */}
          <article className="card proctor-question-card">
            <div className="proctor-q-header">
              <span className="proctor-q-badge">
                Question {String(currentIdx + 1).padStart(2, "0")} of{" "}
                {String(orderedQuestions.length).padStart(2, "0")}
              </span>
              <span className="proctor-q-points">
                {activeQ?.points || 1} {(activeQ?.points || 1) === 1 ? "point" : "points"}
              </span>
            </div>

            <h3 className="proctor-q-prompt">{activeQ?.prompt}</h3>

            <div className="quiz-options" role="radiogroup" aria-label={`Question ${currentIdx + 1}`}>
              {(activeQ?.options || []).map((opt, optIdx) => {
                const isSelected = selectedOpt === optIdx;
                return (
                  <label
                    key={optIdx}
                    className={`quiz-option proctor-option-card ${isSelected ? "selected" : ""}`}
                  >
                    <input
                      type="radio"
                      name={`q-${activeQ.id}`}
                      checked={isSelected}
                      onChange={() => selectAnswer(activeQ.id, optIdx)}
                    />
                    <span className="proctor-opt-letter">{String.fromCharCode(65 + optIdx)}</span>
                    <span className="proctor-opt-text">{opt}</span>
                  </label>
                );
              })}
            </div>

            <div className="proctor-q-footer">
              <div className="proctor-q-nav-left">
                <button
                  type="button"
                  className="button"
                  disabled={currentIdx === 0}
                  onClick={() => setCurrentIdx((i) => Math.max(0, i - 1))}
                >
                  <ArrowLeft size={14} /> Previous
                </button>
                <button
                  type="button"
                  className="button"
                  disabled={selectedOpt === undefined}
                  onClick={() => activeQ && clearAnswer(activeQ.id)}
                >
                  <Eraser size={14} /> Clear Selection
                </button>
              </div>

              <div className="proctor-q-nav-right">
                {currentIdx < orderedQuestions.length - 1 ? (
                  <button
                    type="button"
                    className="button primary"
                    onClick={() => setCurrentIdx((i) => Math.min(orderedQuestions.length - 1, i + 1))}
                  >
                    Next <ArrowRight size={14} />
                  </button>
                ) : (
                  <button
                    type="button"
                    className="button primary"
                    disabled={submitting}
                    onClick={() => setConfirmSubmitOpen(true)}
                  >
                    <CheckCircle2 size={14} /> Review &amp; Submit
                  </button>
                )}
              </div>
            </div>
          </article>

          {/* Question Palette Sidebar */}
          <aside className="card proctor-palette-card">
            <div className="proctor-palette-head">
              <h4>Question Palette</h4>
              <small>
                {answeredCount} of {orderedQuestions.length} answered
              </small>
            </div>

            <div className="proctor-palette-grid">
              {orderedQuestions.map((q, idx) => {
                const isCurrent = idx === currentIdx;
                const isAnswered = answers[q.id] !== undefined && answers[q.id] !== null;
                return (
                  <button
                    key={q.id}
                    type="button"
                    className={`proctor-palette-btn ${isCurrent ? "current" : ""} ${
                      isAnswered ? "answered" : ""
                    }`}
                    onClick={() => setCurrentIdx(idx)}
                  >
                    {idx + 1}
                  </button>
                );
              })}
            </div>

            <div className="proctor-palette-legend">
              <span>
                <i className="dot answered" /> Answered ({answeredCount})
              </span>
              <span>
                <i className="dot unanswered" /> Unanswered ({orderedQuestions.length - answeredCount})
              </span>
              <span>
                <i className="dot current" /> Current
              </span>
            </div>

            <button
              type="button"
              className="button primary"
              style={{ width: "100%", marginTop: "14px" }}
              disabled={submitting}
              onClick={() => setConfirmSubmitOpen(true)}
            >
              <CheckCircle2 size={14} /> Submit Exam Now
            </button>
          </aside>
        </div>

        {/* Floating Live Webcam Picture-in-Picture Feed */}
        {(cameraStream || requireCamera || cameraWasEnabled) && (
          <div className="proctor-pip-floating" aria-label="Live Proctoring Camera Preview">
            <div className="proctor-pip-header">
              <span>
                <span className={`proctor-pip-dot ${cameraStream ? "on" : "off"}`} />
                {cameraStream ? "Webcam Live" : "Camera Off"}
              </span>
              {!allowCameraOff && requireCamera && (
                <span className="proctor-pip-lock" title="Admin locked camera ON during exam">
                  <Lock size={11} /> Locked
                </span>
              )}
            </div>

            <div className="proctor-pip-video-box">
              {cameraStream ? (
                <WebcamVideo stream={cameraStream} className="proctor-pip-video" />
              ) : (
                <div className="proctor-pip-off-state">
                  <CameraOff size={20} />
                  <span>{cameraManuallyOff ? "Camera paused" : "No video signal"}</span>
                </div>
              )}
            </div>

            {allowCameraOff && (
              <button
                type="button"
                className="button compact proctor-pip-toggle-btn"
                onClick={handleToggleCameraDuringExam}
              >
                {cameraStream ? (
                  <>
                    <CameraOff size={12} /> Turn Off Camera
                  </>
                ) : (
                  <>
                    <Camera size={12} /> Turn Camera On
                  </>
                )}
              </button>
            )}
          </div>
        )}

        {/* Prominent Screen/Tab Switch Violation Warning Modal */}
        {warningModal && (
          <div className="modal-backdrop proctor-warning-backdrop">
            <div className="modal proctor-warning-modal" role="alertdialog" aria-modal="true">
              <div className="proctor-warning-icon">
                <ShieldAlert size={28} />
              </div>
              <h3>
                Warning: Screen switch detected ({warningModal.count}/{warningModal.limit})
              </h3>
              <p>
                We detected that you navigated away from the exam tab or browser window ({warningModal.source}).
              </p>
              <div className={`proctor-warning-callout ${warningModal.isFinalWarning ? "final" : ""}`}>
                {warningModal.isFinalWarning ? (
                  <strong>
                    Final Warning ({warningModal.count}/{warningModal.limit}): One more screen/tab switch will automatically submit your exam immediately!
                  </strong>
                ) : (
                  <span>
                    Remaining warnings before auto-submit:{" "}
                    <strong>{warningModal.limit - warningModal.count}</strong>
                  </span>
                )}
              </div>
              <button
                type="button"
                className="button primary"
                onClick={() => setWarningModal(null)}
              >
                I Understand, Return to Exam
              </button>
            </div>
          </div>
        )}

        {/* Confirm Submit Modal */}
        {confirmSubmitOpen && (
          <div
            className="modal-backdrop"
            onClick={(e) => {
              if (e.target === e.currentTarget && !submitting) setConfirmSubmitOpen(false);
            }}
          >
            <div className="modal" style={{ maxWidth: "460px" }} role="dialog" aria-modal="true">
              <div className="modal-heading">
                <h2 style={{ margin: 0 }}>Confirm Exam Submission</h2>
              </div>
              <p style={{ color: "var(--muted)", marginTop: "6px" }}>
                You have answered <strong>{answeredCount}</strong> out of{" "}
                <strong>{orderedQuestions.length}</strong> question
                {orderedQuestions.length === 1 ? "" : "s"}.
                {answeredCount < orderedQuestions.length &&
                  ` (${orderedQuestions.length - answeredCount} unanswered question(s) will score 0 points.)`}
              </p>
              <div className="modal-actions" style={{ marginTop: "18px" }}>
                <button
                  type="button"
                  className="button"
                  disabled={submitting}
                  onClick={() => setConfirmSubmitOpen(false)}
                >
                  Continue Exam
                </button>
                <button
                  type="button"
                  className="button primary"
                  disabled={submitting}
                  onClick={() => finalizeSubmit("manual")}
                >
                  <CheckCircle2 size={14} /> {submitting ? "Submitting…" : "Yes, Submit Exam"}
                </button>
              </div>
            </div>
          </div>
        )}
      </section>
    );
  }

  // =====================================================
  // STAGE 3: INSTANT RESULT & REVIEW DASHBOARD
  // =====================================================
  const summary = resultSummary;
  const reviewList = summary?.review || [];
  const filteredReview = reviewList.filter((item) => {
    if (reviewFilter === "correct") return item.isCorrect;
    if (reviewFilter === "incorrect") return !item.isCorrect && !item.isUnanswered;
    if (reviewFilter === "unanswered") return item.isUnanswered;
    return true;
  });

  const correctCount = reviewList.filter((r) => r.isCorrect).length;
  const incorrectCount = reviewList.filter((r) => !r.isCorrect && !r.isUnanswered).length;
  const unansweredCount = reviewList.filter((r) => r.isUnanswered).length;

  return (
    <section className="proctor-result-shell">
      <div className="proctor-runner-top">
        <button type="button" className="text-link" onClick={onClose}>
          <ArrowLeft size={14} style={{ verticalAlign: "-2px", marginRight: "4px" }} />
          Back to All Tests
        </button>
        {summary?.previewMode && <span className="badge blue">Preview Result (Not Saved to DB)</span>}
      </div>

      {/* Hero Summary Card */}
      <article className="card proctor-result-hero">
        <div className="proctor-result-hero-head">
          <div>
            <div className="eyebrow">Instant Exam Result &amp; Review Dashboard</div>
            <h2>{summary?.examTitle}</h2>
            <p>
              Candidate: <strong>{summary?.studentName}</strong> · Roll Number:{" "}
              <strong>{summary?.rollNumber}</strong> ·{" "}
              {buildSubmissionReasonLabel(summary?.submissionReason)}
            </p>
          </div>

          <div className="proctor-export-actions">
            <button
              type="button"
              className="button compact"
              onClick={() => exportExamResultJson(summary)}
            >
              <FileText size={14} /> Export JSON
            </button>
            <button
              type="button"
              className="button primary compact"
              onClick={() => exportExamResultCsv(summary)}
            >
              <FileSpreadsheet size={14} /> Export CSV
            </button>
          </div>
        </div>

        {summary?.submissionReason === "violation_limit_exceeded" && (
          <div className="proctor-validation-box error" style={{ marginTop: "12px" }}>
            <AlertOctagon size={17} />
            <div>
              <strong>Exam Auto-Submitted Due to Screen/Tab Switch Limit Exceeded</strong>
              <p style={{ margin: "2px 0 0", fontSize: "12.5px" }}>
                Maximum warning threshold ({summary.maxTabSwitches}) was exceeded ({summary.tabSwitchCount} switches detected).
              </p>
            </div>
          </div>
        )}

        {summary?.submissionReason === "timer_expired" && (
          <div className="proctor-validation-box warn" style={{ marginTop: "12px" }}>
            <Clock size={17} />
            <div>
              <strong>Exam Auto-Submitted on Timer Expiry</strong>
              <p style={{ margin: "2px 0 0", fontSize: "12.5px" }}>
                Your answers saved up to 00:00 were submitted automatically.
              </p>
            </div>
          </div>
        )}

        {/* Summary Metric Tiles */}
        <div className="proctor-result-kpis">
          <div className="proctor-kpi-box">
            <span>Score</span>
            <strong>
              {summary?.showMarks ? `${summary.score} / ${summary.maxScore}` : "Hidden"}
            </strong>
            <small>
              {summary?.showMarks && reviewList.length > 0
                ? `${correctCount} of ${reviewList.length} correct`
                : "Pending instructor release"}
            </small>
          </div>

          <div className="proctor-kpi-box">
            <span>Percentage</span>
            <strong>{summary?.showMarks ? `${summary.percentage}%` : "—"}</strong>
            <small>Pass mark: {summary?.passingPercentage}%</small>
          </div>

          <div
            className={`proctor-kpi-box ${
              !summary?.showMarks ? "" : summary.passed ? "pass" : "fail"
            }`}
          >
            <span>Status</span>
            <strong>
              {!summary?.showMarks ? (
                "Submitted"
              ) : summary.passed ? (
                <>
                  <Award size={18} style={{ verticalAlign: "-3px", marginRight: "4px" }} />
                  PASSED
                </>
              ) : (
                <>
                  <XCircle size={18} style={{ verticalAlign: "-3px", marginRight: "4px" }} />
                  FAILED
                </>
              )}
            </strong>
            <small>
              {!summary?.showMarks
                ? "Result withheld by Admin"
                : summary.passed
                ? "Met passing criteria"
                : `Required ${summary.passingPercentage}%`}
            </small>
          </div>

          <div className="proctor-kpi-box">
            <span>Time Taken</span>
            <strong>{formatSeconds(summary?.timeTakenSeconds)}</strong>
            <small>Submitted {summary?.submittedAt ? new Date(summary.submittedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "Just now"}</small>
          </div>
        </div>
      </article>

      {/* Proctoring Log Panel */}
      <article className="card proctor-log-card">
        <div className="proctor-section-head" style={{ marginBottom: "12px" }}>
          <div>
            <h4>
              <ShieldCheck size={16} />
              <span>Proctoring Log &amp; Telemetry</span>
            </h4>
            <p>Recorded integrity signals during the examination session.</p>
          </div>
        </div>

        <div className="proctor-telemetry-strip">
          <div className="proctor-telemetry-item">
            <Monitor size={15} />
            <div>
              <small>Screen / Tab Switches</small>
              <strong>
                {summary?.trackTabSwitches
                  ? `${summary.tabSwitchCount} / ${summary.maxTabSwitches}`
                  : "Tracking Disabled"}
              </strong>
            </div>
          </div>

          <div className="proctor-telemetry-item">
            <Camera size={15} />
            <div>
              <small>Camera Status</small>
              <strong>{summary?.cameraStatus || "Not Required"}</strong>
            </div>
          </div>

          <div className="proctor-telemetry-item">
            <Clock size={15} />
            <div>
              <small>Total Time</small>
              <strong>{formatSeconds(summary?.timeTakenSeconds)}</strong>
            </div>
          </div>
        </div>

        {Array.isArray(summary?.proctoringLog) && summary.proctoringLog.length > 0 && (
          <div className="proctor-timeline">
            {summary.proctoringLog.map((entry, idx) => (
              <div className="proctor-timeline-row" key={idx}>
                <span className="proctor-timeline-time">{entry.timestamp}</span>
                <div>
                  <strong>{entry.event}</strong>
                  {entry.detail && <small>{entry.detail}</small>}
                </div>
              </div>
            ))}
          </div>
        )}
      </article>

      {/* Full Answer Review Section */}
      {summary?.showMarks ? (
        <article className="card proctor-review-card">
          <div className="proctor-section-head">
            <div>
              <h4>
                <Download size={16} style={{ display: "none" }} />
                <CheckCircle2 size={16} />
                <span>Full Answer Review ({reviewList.length} Questions)</span>
              </h4>
              <p>Inspect your selected answer, the verified correct answer, and explanations.</p>
            </div>
            <div className="proctor-review-filters">
              <button
                type="button"
                className={`button compact ${reviewFilter === "all" ? "primary" : ""}`}
                onClick={() => setReviewFilter("all")}
              >
                All ({reviewList.length})
              </button>
              <button
                type="button"
                className={`button compact ${reviewFilter === "correct" ? "primary" : ""}`}
                onClick={() => setReviewFilter("correct")}
              >
                Correct ({correctCount})
              </button>
              <button
                type="button"
                className={`button compact ${reviewFilter === "incorrect" ? "primary" : ""}`}
                onClick={() => setReviewFilter("incorrect")}
              >
                Incorrect ({incorrectCount})
              </button>
              {unansweredCount > 0 && (
                <button
                  type="button"
                  className={`button compact ${reviewFilter === "unanswered" ? "primary" : ""}`}
                  onClick={() => setReviewFilter("unanswered")}
                >
                  Unanswered ({unansweredCount})
                </button>
              )}
            </div>
          </div>

          <div className="proctor-review-list">
            {filteredReview.map((item) => (
              <div
                key={item.id || item.index}
                className={`proctor-review-item ${
                  item.isCorrect ? "correct" : item.isUnanswered ? "unanswered" : "incorrect"
                }`}
              >
                <div className="proctor-review-item-head">
                  <span className="proctor-q-num">Q{item.index + 1}</span>
                  <strong>{item.question}</strong>
                  <span
                    className={`proctor-review-pill ${
                      item.isCorrect ? "correct" : item.isUnanswered ? "unanswered" : "incorrect"
                    }`}
                  >
                    {item.isCorrect
                      ? `Correct (+${item.pointsEarned} pt)`
                      : item.isUnanswered
                      ? `Unanswered (0/${item.points})`
                      : `Incorrect (0/${item.points})`}
                  </span>
                </div>

                <div className="proctor-review-options">
                  {item.options.map((opt, optIdx) => {
                    const isCorrectOpt = optIdx === item.correctIndex;
                    const isStudentOpt = optIdx === item.selectedIndex;
                    return (
                      <div
                        key={optIdx}
                        className={`proctor-review-opt ${isCorrectOpt ? "is-correct" : ""} ${
                          isStudentOpt && !isCorrectOpt ? "is-wrong" : ""
                        }`}
                      >
                        <span className="proctor-opt-letter">{String.fromCharCode(65 + optIdx)}</span>
                        <span>{opt}</span>
                        <div className="proctor-opt-tags">
                          {isStudentOpt && <span className="tag-student">Your Answer</span>}
                          {isCorrectOpt && <span className="tag-correct">Correct Answer</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {item.explanation && (
                  <div className="proctor-review-explanation">
                    <strong>Explanation:</strong> {item.explanation}
                  </div>
                )}
              </div>
            ))}
          </div>
        </article>
      ) : (
        <div className="card portal-empty">
          <Lock size={22} />
          <strong>Marks &amp; Answer Review Withheld</strong>
          <span>Your instructor has temporarily hidden scores and answer keys for this assessment. Check back once marks are released.</span>
        </div>
      )}
    </section>
  );
}
