import { useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  Clock,
  Download,
  Eye,
  FileJson,
  ListChecks,
  Monitor,
  ShieldCheck,
  Sparkles,
  Upload,
} from "lucide-react";
import {
  downloadSampleQuizJson,
  getSampleQuizJsonText,
  validateAndNormalizeQuizJson,
} from "../lib/quizUtils.js";

export default function ProctoredQuizConfigPanel({
  rawJson,
  onRawJsonChange,
  settings,
  onSettingsChange,
  compact = false,
}) {
  const fileInputRef = useRef(null);
  const [entryMode, setEntryMode] = useState("json"); // "json" | "quick"
  const [showPreviewList, setShowPreviewList] = useState(false);
  const [fileError, setFileError] = useState("");

  // Quick 1-question builder state (synced when user converts to JSON)
  const [quickPrompt, setQuickPrompt] = useState("");
  const [quickOptions, setQuickOptions] = useState(["", "", "", ""]);
  const [quickCorrectIdx, setQuickCorrectIdx] = useState(0);
  const [quickExplanation, setQuickExplanation] = useState("");

  const validation = useMemo(() => validateAndNormalizeQuizJson(rawJson), [rawJson]);

  function updateSetting(key, value) {
    onSettingsChange({
      ...settings,
      [key]: value,
    });
  }

  function handleFileUpload(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setFileError("");

    if (!file.name.toLowerCase().endsWith(".json") && file.type && !file.type.includes("json")) {
      setFileError("Please select a valid .json file.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const content = typeof reader.result === "string" ? reader.result : "";
      setEntryMode("json");
      onRawJsonChange(content);
    };
    reader.onerror = () => {
      setFileError("Could not read the selected JSON file.");
    };
    reader.readAsText(file);
  }

  function handleLoadSample() {
    setFileError("");
    setEntryMode("json");
    onRawJsonChange(getSampleQuizJsonText());
  }

  function applyQuickQuestionToJson() {
    const cleanPrompt = quickPrompt.trim();
    const cleanOpts = quickOptions.map((o) => o.trim()).filter(Boolean);
    if (!cleanPrompt) {
      setFileError("Enter a question prompt first.");
      return;
    }
    if (cleanOpts.length < 2) {
      setFileError("Enter at least 2 answer choices before adding the question.");
      return;
    }
    const chosenText =
      quickOptions[quickCorrectIdx]?.trim() || cleanOpts[0];

    let existing = [];
    if (validation.valid) {
      existing = validation.questions.map((q, idx) => ({
        id: q.external_id || idx + 1,
        question: q.prompt,
        options: q.options,
        correctAnswer: q.options[q.correct_index] || q.options[0],
        ...(q.explanation ? { explanation: q.explanation } : {}),
      }));
    }

    const nextQuestion = {
      id: existing.length + 1,
      question: cleanPrompt,
      options: cleanOpts,
      correctAnswer: chosenText,
      ...(quickExplanation.trim() ? { explanation: quickExplanation.trim() } : {}),
    };

    const nextJson = JSON.stringify([...existing, nextQuestion], null, 2);
    setFileError("");
    onRawJsonChange(nextJson);
    setQuickPrompt("");
    setQuickOptions(["", "", "", ""]);
    setQuickCorrectIdx(0);
    setQuickExplanation("");
    setEntryMode("json");
  }

  return (
    <div className={`proctor-config-wrap ${compact ? "compact" : ""}`}>
      {/* 1. JSON Question Uploader Section */}
      <section className="proctor-config-section">
        <div className="proctor-section-head">
          <div>
            <h4>
              <FileJson size={16} />
              <span>Question Bank (JSON Uploader)</span>
            </h4>
            <p>
              Upload a <code>.json</code> file or paste a JSON array of questions (<code>id</code>,{" "}
              <code>question</code>, <code>options</code>, <code>correctAnswer</code>, and optional{" "}
              <code>explanation</code>).
            </p>
          </div>
          <div className="proctor-head-actions">
            <button
              type="button"
              className="button compact"
              onClick={downloadSampleQuizJson}
              title="Download sample quiz JSON file"
            >
              <Download size={13} /> Download Sample JSON
            </button>
            <button
              type="button"
              className="button compact"
              onClick={handleLoadSample}
              title="Fill editor with sample questions"
            >
              <Sparkles size={13} /> Load Sample
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              style={{ display: "none" }}
              onChange={handleFileUpload}
            />
            <button
              type="button"
              className="button primary compact"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload size={13} /> Upload .json
            </button>
          </div>
        </div>

        <div className="proctor-mode-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={entryMode === "json"}
            className={`proctor-mode-tab ${entryMode === "json" ? "active" : ""}`}
            onClick={() => setEntryMode("json")}
          >
            JSON Upload / Raw Editor
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={entryMode === "quick"}
            className={`proctor-mode-tab ${entryMode === "quick" ? "active" : ""}`}
            onClick={() => {
              setFileError("");
              setEntryMode("quick");
            }}
          >
            + Quick Question Builder
          </button>
        </div>

        {fileError && (
          <div className="proctor-validation-box error" style={{ marginBottom: "10px" }}>
            <AlertTriangle size={15} />
            <div>{fileError}</div>
          </div>
        )}

        {entryMode === "json" ? (
          <>
            <textarea
              className="proctor-json-textarea"
              rows={compact ? 7 : 9}
              spellCheck={false}
              value={rawJson}
              onChange={(e) => {
                setFileError("");
                onRawJsonChange(e.target.value);
              }}
              placeholder={`[\n  {\n    "id": 1,\n    "question": "Which language runs natively in the browser?",\n    "options": ["Python", "JavaScript", "Java", "C++"],\n    "correctAnswer": "JavaScript",\n    "explanation": "Browsers execute JavaScript natively via engines like V8 and SpiderMonkey."\n  }\n]`}
            />

            {validation.valid ? (
              <div className="proctor-validation-box valid">
                <div className="proctor-validation-summary">
                  <CheckCircle2 size={16} />
                  <span>
                    <strong>{validation.questions.length}</strong> valid question
                    {validation.questions.length === 1 ? "" : "s"} parsed ·{" "}
                    <strong>{validation.totalPoints}</strong> total point
                    {validation.totalPoints === 1 ? "" : "s"}
                  </span>
                </div>
                <button
                  type="button"
                  className="button compact"
                  onClick={() => setShowPreviewList((v) => !v)}
                >
                  <Eye size={13} />
                  <span>{showPreviewList ? "Hide Preview" : "Preview Questions"}</span>
                </button>
              </div>
            ) : (
              <div className="proctor-validation-box error">
                <AlertTriangle size={16} />
                <div>
                  <strong>JSON Validation Error</strong>
                  <ul className="proctor-error-list">
                    {validation.errors.slice(0, 5).map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                    {validation.errors.length > 5 && (
                      <li>…and {validation.errors.length - 5} more issue(s).</li>
                    )}
                  </ul>
                </div>
              </div>
            )}

            {validation.valid && showPreviewList && (
              <div className="proctor-question-preview-list">
                {validation.questions.map((q, idx) => (
                  <div className="proctor-preview-item" key={`${q.external_id}-${idx}`}>
                    <div className="proctor-preview-title">
                      <span className="proctor-q-num">Q{idx + 1}</span>
                      <strong>{q.prompt}</strong>
                    </div>
                    <div className="proctor-preview-meta">
                      <span>Options: {q.options.join(" | ")}</span>
                      <span className="proctor-correct-tag">
                        Correct: {q.options[q.correct_index]}
                      </span>
                    </div>
                    {q.explanation && (
                      <small className="proctor-preview-expl">
                        Explanation: {q.explanation}
                      </small>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="proctor-quick-builder">
            <label className="form-field">
              <span>Question Prompt *</span>
              <textarea
                rows={2}
                value={quickPrompt}
                onChange={(e) => setQuickPrompt(e.target.value)}
                placeholder="Write a multiple-choice question..."
              />
            </label>
            <fieldset className="admin-options" style={{ marginTop: "8px" }}>
              <legend>
                Answer Options <small>(select the correct answer)</small>
              </legend>
              {quickOptions.map((opt, idx) => (
                <label className="admin-option" key={idx}>
                  <input
                    type="radio"
                    name="quick-correct-answer"
                    checked={quickCorrectIdx === idx}
                    onChange={() => setQuickCorrectIdx(idx)}
                  />
                  <span>{String.fromCharCode(65 + idx)}</span>
                  <input
                    value={opt}
                    onChange={(e) =>
                      setQuickOptions((cur) => cur.map((v, i) => (i === idx ? e.target.value : v)))
                    }
                    placeholder={`Choice ${idx + 1}${idx < 2 ? " *" : " (optional)"}`}
                  />
                </label>
              ))}
            </fieldset>
            <label className="form-field" style={{ marginTop: "8px" }}>
              <span>Explanation (Optional — shown in post-exam review)</span>
              <input
                type="text"
                value={quickExplanation}
                onChange={(e) => setQuickExplanation(e.target.value)}
                placeholder="Why is this option correct?"
              />
            </label>
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "10px" }}>
              <button
                type="button"
                className="button primary compact"
                onClick={applyQuickQuestionToJson}
              >
                <ListChecks size={14} /> Add Question to Quiz JSON
              </button>
            </div>
          </div>
        )}
      </section>

      {/* 2. Proctoring & Exam Settings Section */}
      <section className="proctor-config-section">
        <div className="proctor-section-head">
          <div>
            <h4>
              <ShieldCheck size={16} />
              <span>Proctoring &amp; Exam Settings</span>
            </h4>
            <p>Configure webcam enforcement, screen-switch limits, countdown timer, and instant grading.</p>
          </div>
        </div>

        <div className="proctor-settings-grid">
          <label className="form-field">
            <span>
              <Clock size={13} style={{ verticalAlign: "-2px", marginRight: "4px" }} />
              Exam Timer (Minutes)
            </span>
            <input
              type="number"
              min={1}
              max={360}
              value={settings.durationMinutes}
              onChange={(e) => updateSetting("durationMinutes", Math.max(1, Math.min(360, Number(e.target.value) || 1)))}
            />
          </label>

          <label className="form-field">
            <span>Passing Score (%)</span>
            <input
              type="number"
              min={1}
              max={100}
              value={settings.passingPercentage}
              onChange={(e) => updateSetting("passingPercentage", Math.max(1, Math.min(100, Number(e.target.value) || 50)))}
            />
          </label>
        </div>

        <div className="proctor-toggles-stack">
          {/* Webcam Requirement Toggle */}
          <div className="proctor-toggle-card">
            <label className="proctor-toggle-row">
              <input
                type="checkbox"
                checked={Boolean(settings.requireCamera)}
                onChange={(e) => {
                  const nextRequire = e.target.checked;
                  onSettingsChange({
                    ...settings,
                    requireCamera: nextRequire,
                    allowCameraOff: nextRequire ? settings.allowCameraOff : false,
                  });
                }}
              />
              <div>
                <strong>
                  <Camera size={14} /> Require Webcam During Exam
                </strong>
                <small>
                  Students must grant webcam permission during Pre-Exam Check and keep a live preview running.
                </small>
              </div>
            </label>

            {/* Admin Camera-Off Permission */}
            <label className={`proctor-toggle-row nested ${!settings.requireCamera ? "disabled" : ""}`}>
              <input
                type="checkbox"
                disabled={!settings.requireCamera}
                checked={Boolean(settings.requireCamera && settings.allowCameraOff)}
                onChange={(e) => updateSetting("allowCameraOff", e.target.checked)}
              />
              <div>
                <strong>Grant Permission for Students to Turn Off Camera</strong>
                <small>
                  {settings.requireCamera
                    ? "If disabled, students will NOT see a Turn Off Camera button once the exam begins."
                    : "Enable webcam requirement above to configure student camera-off permission."}
                </small>
              </div>
            </label>
          </div>

          {/* Screen / Tab Switch Tracking & Max Warnings */}
          <div className="proctor-toggle-card">
            <label className="proctor-toggle-row">
              <input
                type="checkbox"
                checked={Boolean(settings.trackTabSwitches)}
                onChange={(e) => updateSetting("trackTabSwitches", e.target.checked)}
              />
              <div>
                <strong>
                  <Monitor size={14} /> Enable Screen / Tab Switch Tracking
                </strong>
                <small>
                  Detects tab switches, window minimization, and focus changes using browser visibility &amp; blur events.
                </small>
              </div>
            </label>

            {settings.trackTabSwitches && (
              <label className="form-field proctor-nested-limit">
                <span>Maximum Allowed Switches Before Auto-Submit</span>
                <div className="proctor-limit-input-row">
                  <input
                    type="number"
                    min={1}
                    max={50}
                    value={settings.maxTabSwitches}
                    onChange={(e) =>
                      updateSetting("maxTabSwitches", Math.max(1, Math.min(50, Number(e.target.value) || 3)))
                    }
                  />
                  <small>
                    Students receive warnings up to {settings.maxTabSwitches}/{settings.maxTabSwitches}; exceeding {settings.maxTabSwitches} triggers automatic submission.
                  </small>
                </div>
              </label>
            )}
          </div>

          {/* Instant Score & Answer Review */}
          <div className="proctor-toggle-card">
            <label className="proctor-toggle-row">
              <input
                type="checkbox"
                checked={Boolean(settings.showMarks)}
                onChange={(e) => updateSetting("showMarks", e.target.checked)}
              />
              <div>
                <strong>Show Instant Result, Score &amp; Answer Review Upon Submission</strong>
                <small>
                  Immediately displays Score, Percentage, Pass/Fail, Proctoring Log, and Answer Review to students when they finish.
                </small>
              </div>
            </label>
          </div>
        </div>
      </section>
    </div>
  );
}
