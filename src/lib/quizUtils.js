export const SAMPLE_QUIZ_QUESTIONS = [
  {
    id: 1,
    question: "Which HTTP status code indicates that a new resource was successfully created on the server?",
    options: ["200 OK", "201 Created", "204 No Content", "400 Bad Request"],
    correctAnswer: "201 Created",
    explanation: "HTTP 201 Created means the request succeeded and resulted in one or more new resources being created.",
  },
  {
    id: 2,
    question: "In SQL, which clause is used to filter grouped rows after an aggregate function such as COUNT() or SUM()?",
    options: ["WHERE", "HAVING", "ORDER BY", "DISTINCT"],
    correctAnswer: "HAVING",
    explanation: "WHERE filters individual rows before grouping, whereas HAVING filters groups created by GROUP BY.",
  },
  {
    id: 3,
    question: "Which React hook is primarily used to synchronize a component with browser events or timers?",
    options: ["useState", "useMemo", "useEffect", "useReducer"],
    correctAnswer: "useEffect",
    explanation: "useEffect runs side effects after render and lets you subscribe to and clean up browser events, streams, and timers.",
  },
  {
    id: 4,
    question: "What is the time complexity of binary search on a sorted array of n elements?",
    options: ["O(n)", "O(n log n)", "O(log n)", "O(1)"],
    correctAnswer: "O(log n)",
    explanation: "Binary search halves the remaining search interval on every comparison, yielding O(log n) worst-case complexity.",
  },
  {
    id: 5,
    question: "Which DOM property becomes true when the user switches to a different browser tab or minimizes the window?",
    options: ["document.hidden", "window.closed", "navigator.onLine", "screen.locked"],
    correctAnswer: "document.hidden",
    explanation: "The Page Visibility API sets document.hidden to true and fires the visibilitychange event when the page is no longer visible.",
  },
];

export function getSampleQuizJsonText() {
  return JSON.stringify(SAMPLE_QUIZ_QUESTIONS, null, 2);
}

function triggerBlobDownload(filename, content, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadSampleQuizJson() {
  triggerBlobDownload("sample-quiz-questions.json", getSampleQuizJsonText(), "application/json;charset=utf-8");
}

export function validateAndNormalizeQuizJson(rawText) {
  const text = String(rawText ?? "").trim();
  if (!text) {
    return {
      valid: false,
      questions: [],
      errors: ["Please upload a .json file or paste a JSON array of questions."],
      totalPoints: 0,
    };
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    return {
      valid: false,
      questions: [],
      errors: [`Invalid JSON syntax: ${err.message}`],
      totalPoints: 0,
    };
  }

  if (parsed && !Array.isArray(parsed) && Array.isArray(parsed.questions)) {
    parsed = parsed.questions;
  }

  if (!Array.isArray(parsed)) {
    return {
      valid: false,
      questions: [],
      errors: [
        'JSON root must be an array of question objects, e.g. [{ "id": 1, "question": "...", "options": ["A", "B"], "correctAnswer": "A" }].',
      ],
      totalPoints: 0,
    };
  }

  if (parsed.length === 0) {
    return {
      valid: false,
      questions: [],
      errors: ["Questions array cannot be empty. Add at least 1 multiple-choice question."],
      totalPoints: 0,
    };
  }

  const errors = [];
  const normalized = [];
  const seenIds = new Set();

  parsed.forEach((item, idx) => {
    const label = `Question #${idx + 1}`;
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      errors.push(`${label}: Each entry must be a JSON object.`);
      return;
    }

    const rawId = item.id;
    const hasId = rawId !== undefined && rawId !== null && String(rawId).trim() !== "";
    if (!hasId) {
      errors.push(`${label}: Missing required "id" field (string or number).`);
    } else {
      const idKey = String(rawId).trim();
      if (seenIds.has(idKey)) {
        errors.push(`${label}: Duplicate question id "${idKey}". Every question must have a unique id.`);
      } else {
        seenIds.add(idKey);
      }
    }

    const rawPrompt = item.question !== undefined ? item.question : item.prompt;
    const prompt = typeof rawPrompt === "string" ? rawPrompt.trim() : "";
    if (!prompt) {
      errors.push(`${label}: Missing or empty "question" text.`);
    } else if (prompt.length > 4000) {
      errors.push(`${label}: "question" exceeds maximum length of 4000 characters.`);
    }

    let cleanOptions = [];
    if (!Array.isArray(item.options)) {
      errors.push(`${label}: "options" must be an array of 2 to 6 answer choices.`);
    } else {
      if (item.options.length < 2 || item.options.length > 6) {
        errors.push(`${label}: "options" must contain between 2 and 6 choices (found ${item.options.length}).`);
      }
      cleanOptions = item.options.map((opt) => (opt === null || opt === undefined ? "" : String(opt).trim()));
      if (cleanOptions.some((opt) => !opt)) {
        errors.push(`${label}: All items inside "options" must be non-empty strings.`);
      }
    }

    let correctIndex = -1;
    if (cleanOptions.length >= 2) {
      if (item.correctAnswer === undefined || item.correctAnswer === null || String(item.correctAnswer).trim() === "") {
        if (Number.isInteger(item.correct_index) && item.correct_index >= 0 && item.correct_index < cleanOptions.length) {
          correctIndex = item.correct_index;
        } else {
          errors.push(`${label}: Missing required "correctAnswer" field.`);
        }
      } else if (typeof item.correctAnswer === "number") {
        if (Number.isInteger(item.correctAnswer) && item.correctAnswer >= 0 && item.correctAnswer < cleanOptions.length) {
          correctIndex = item.correctAnswer;
        } else {
          errors.push(`${label}: Numeric "correctAnswer" (${item.correctAnswer}) is out of range for ${cleanOptions.length} options (0-${cleanOptions.length - 1}).`);
        }
      } else if (typeof item.correctAnswer === "string") {
        const answerTrimmed = item.correctAnswer.trim();
        correctIndex = cleanOptions.findIndex((opt) => opt === answerTrimmed);
        if (correctIndex === -1) {
          const ciIndex = cleanOptions.findIndex((opt) => opt.toLowerCase() === answerTrimmed.toLowerCase());
          if (ciIndex !== -1) {
            correctIndex = ciIndex;
          } else {
            errors.push(`${label}: "correctAnswer" ("${answerTrimmed}") does not match any item in "options".`);
          }
        }
      } else {
        errors.push(`${label}: "correctAnswer" must be a string matching an option (or a 0-based numeric option index).`);
      }
    }

    let explanation = "";
    if (item.explanation !== undefined && item.explanation !== null) {
      if (typeof item.explanation !== "string") {
        errors.push(`${label}: "explanation" must be a text string when provided.`);
      } else {
        explanation = item.explanation.trim();
      }
    }

    let points = 1;
    if (item.points !== undefined && item.points !== null) {
      const parsedPoints = Number(item.points);
      if (!Number.isInteger(parsedPoints) || parsedPoints < 1 || parsedPoints > 100) {
        errors.push(`${label}: "points" must be an integer between 1 and 100.`);
      } else {
        points = parsedPoints;
      }
    }

    if (errors.length === 0 || (prompt && cleanOptions.length >= 2 && correctIndex >= 0)) {
      normalized.push({
        external_id: hasId ? String(rawId).trim() : String(idx + 1),
        prompt,
        options: cleanOptions,
        correct_index: correctIndex,
        explanation,
        points,
        sort_order: idx,
      });
    }
  });

  const totalPoints = errors.length === 0 ? normalized.reduce((sum, q) => sum + (q.points || 1), 0) : 0;

  return {
    valid: errors.length === 0,
    questions: errors.length === 0 ? normalized : [],
    errors,
    totalPoints,
  };
}

export function questionsToQuizJsonText(dbQuestions = []) {
  if (!Array.isArray(dbQuestions) || dbQuestions.length === 0) return "";
  const formatted = [...dbQuestions]
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map((q, idx) => {
      const opts = Array.isArray(q.options) ? q.options : [];
      const correctAnswer =
        Number.isInteger(q.correct_index) && opts[q.correct_index] !== undefined
          ? opts[q.correct_index]
          : opts[0] || "";
      const obj = {
        id: q.external_id || idx + 1,
        question: q.prompt || "",
        options: opts,
        correctAnswer,
      };
      if (q.explanation) {
        obj.explanation = q.explanation;
      }
      if (q.points && q.points !== 1) {
        obj.points = q.points;
      }
      return obj;
    });
  return JSON.stringify(formatted, null, 2);
}

export function formatSeconds(totalSeconds = 0) {
  const safe = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const hrs = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  if (hrs > 0) {
    return `${hrs}h ${String(mins).padStart(2, "0")}m ${String(secs).padStart(2, "0")}s`;
  }
  return `${String(mins).padStart(2, "0")}m ${String(secs).padStart(2, "0")}s`;
}

export function formatTimerClock(remainingSeconds = 0) {
  const safe = Math.max(0, Math.floor(Number(remainingSeconds) || 0));
  const hrs = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  if (hrs > 0) {
    return `${String(hrs).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

export function buildSubmissionReasonLabel(reason) {
  if (reason === "timer_expired") return "Time Expired (Auto-Submitted)";
  if (reason === "violation_limit_exceeded") return "Max Screen/Tab Switches Exceeded (Auto-Submitted)";
  return "Submitted Manually";
}

function safeFileSlug(text = "exam-result") {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50) || "exam-result";
}

export function exportExamResultJson(summary) {
  const slug = safeFileSlug(`${summary.examTitle}-${summary.studentName || "result"}`);
  triggerBlobDownload(`${slug}-result.json`, JSON.stringify(summary, null, 2), "application/json;charset=utf-8");
}

function escapeCsvCell(value) {
  const str = String(value ?? "");
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function exportExamResultCsv(summary) {
  const lines = [
    ["Exam Result Summary"],
    ["Exam Title", summary.examTitle],
    ["Student Name", summary.studentName || ""],
    ["Submitted At", summary.submittedAt || ""],
    ["Score", summary.showMarks ? `${summary.score} / ${summary.maxScore}` : "Hidden by Admin"],
    ["Percentage", summary.showMarks ? `${summary.percentage}%` : "Hidden by Admin"],
    ["Status", summary.showMarks ? (summary.passed ? "PASSED" : "FAILED") : "Pending Release"],
    ["Passing Threshold", `${summary.passingPercentage}%`],
    ["Time Taken", formatSeconds(summary.timeTakenSeconds)],
    ["Submission Reason", buildSubmissionReasonLabel(summary.submissionReason)],
    ["Screen/Tab Switches", summary.trackTabSwitches ? `${summary.tabSwitchCount} / ${summary.maxTabSwitches}` : "Tracking Disabled"],
    ["Camera Status", summary.cameraStatus || "Not Required"],
    [],
  ];

  if (summary.showMarks && Array.isArray(summary.review) && summary.review.length > 0) {
    lines.push([
      "Q#",
      "Question ID",
      "Question",
      "Student Selected Answer",
      "Correct Answer",
      "Result",
      "Points Earned",
      "Explanation",
    ]);
    summary.review.forEach((item, index) => {
      lines.push([
        index + 1,
        item.externalId || index + 1,
        item.question,
        item.selectedAnswer ?? "Unanswered",
        item.correctAnswer,
        item.isUnanswered ? "Unanswered" : item.isCorrect ? "Correct" : "Incorrect",
        `${item.pointsEarned}/${item.points}`,
        item.explanation || "",
      ]);
    });
  }

  if (Array.isArray(summary.proctoringLog) && summary.proctoringLog.length > 0) {
    lines.push([]);
    lines.push(["Timestamp", "Proctoring Event", "Details"]);
    summary.proctoringLog.forEach((entry) => {
      lines.push([entry.timestamp || "", entry.event || "", entry.detail || ""]);
    });
  }

  const csvContent = lines.map((row) => row.map(escapeCsvCell).join(",")).join("\r\n");
  const slug = safeFileSlug(`${summary.examTitle}-${summary.studentName || "result"}`);
  triggerBlobDownload(`${slug}-result.csv`, csvContent, "text/csv;charset=utf-8");
}

export async function syncAssessmentQuestions(supabase, assessmentId, normalizedQuestions = []) {
  const { data: existingRows, error: fetchErr } = await supabase
    .from("assessment_questions")
    .select("id, sort_order")
    .eq("assessment_id", assessmentId)
    .order("sort_order", { ascending: true });
  if (fetchErr) throw fetchErr;

  const existing = existingRows ?? [];
  const updateCount = Math.min(existing.length, normalizedQuestions.length);

  for (let i = 0; i < updateCount; i++) {
    const q = normalizedQuestions[i];
    const { error: updErr } = await supabase
      .from("assessment_questions")
      .update({
        external_id: q.external_id || null,
        prompt: q.prompt,
        options: q.options,
        correct_index: q.correct_index,
        explanation: q.explanation || "",
        points: q.points || 1,
        sort_order: i,
      })
      .eq("id", existing[i].id);
    if (updErr) throw updErr;
  }

  if (normalizedQuestions.length > existing.length) {
    const toInsert = normalizedQuestions.slice(existing.length).map((q, idx) => ({
      assessment_id: assessmentId,
      external_id: q.external_id || null,
      prompt: q.prompt,
      options: q.options,
      correct_index: q.correct_index,
      explanation: q.explanation || "",
      points: q.points || 1,
      sort_order: existing.length + idx,
    }));
    const { error: insErr } = await supabase.from("assessment_questions").insert(toInsert);
    if (insErr) throw insErr;
  }

  if (existing.length > normalizedQuestions.length) {
    const excessIds = existing.slice(normalizedQuestions.length).map((r) => r.id);
    if (excessIds.length > 0) {
      const { error: delErr } = await supabase
        .from("assessment_questions")
        .delete()
        .in("id", excessIds);
      if (delErr) throw delErr;
    }
  }
}

export async function updateAssessmentRecord(supabase, testId, form) {
  const proctoring = form.proctoring || {};
  const isBuiltIn = form.testType === "built_in";
  const hasQuestions = isBuiltIn && Array.isArray(form.questions) && form.questions.length > 0;
  const totalPoints = hasQuestions
    ? form.questions.reduce((acc, q) => acc + (q.points || 1), 0)
    : Number(form.totalMarks) || 100;

  const { error: updateError } = await supabase
    .from("assessments")
    .update({
      title: form.title.trim(),
      description: form.description.trim(),
      due_at: form.due ? new Date(form.due).toISOString() : null,
      external_url: isBuiltIn ? null : form.externalUrl.trim(),
      duration_minutes: Number(proctoring.durationMinutes) || 30,
      require_camera: isBuiltIn ? Boolean(proctoring.requireCamera) : false,
      allow_camera_off: isBuiltIn ? Boolean(proctoring.requireCamera && proctoring.allowCameraOff) : false,
      track_tab_switches: isBuiltIn ? proctoring.trackTabSwitches !== false : false,
      max_tab_switches: Number(proctoring.maxTabSwitches) || 3,
      passing_percentage: Number(proctoring.passingPercentage) || 50,
      total_marks: totalPoints,
      show_marks: form.showMarks !== undefined ? Boolean(form.showMarks) : false,
    })
    .eq("id", testId);

  if (updateError) throw updateError;

  if (hasQuestions) {
    await syncAssessmentQuestions(supabase, testId, form.questions);
  }
}
