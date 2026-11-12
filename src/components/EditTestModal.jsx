import { useState, useEffect } from "react";
import { ClipboardList, X } from "lucide-react";
import ProctoredQuizConfigPanel from "./ProctoredQuizConfigPanel";
import {
  questionsToQuizJsonText,
  validateAndNormalizeQuizJson,
} from "../lib/quizUtils.js";

export default function EditTestModal({
  test,
  students,
  currentRecipients = [],
  supabase,
  onClose,
  onSave,
  onDelete,
}) {
  const isExternalInitial = Boolean(test.external_url);
  const [title, setTitle] = useState(test.title || "");
  const [description, setDescription] = useState(test.description || "");
  const [testType, setTestType] = useState(isExternalInitial ? "external" : "built_in");
  const [externalUrl, setExternalUrl] = useState(test.external_url || "");
  const [rawJson, setRawJson] = useState("");
  const [proctorSettings, setProctorSettings] = useState(() => ({
    durationMinutes: Number(test.duration_minutes) || 30,
    requireCamera: Boolean(test.require_camera),
    allowCameraOff: Boolean(test.allow_camera_off),
    trackTabSwitches: test.track_tab_switches !== false,
    maxTabSwitches: Number(test.max_tab_switches) || 3,
    passingPercentage: Number(test.passing_percentage) || 50,
    showMarks: Boolean(test.show_marks),
  }));
  const [due, setDue] = useState(() => {
    if (!test.due_at) return "";
    try {
      const d = new Date(test.due_at);
      const pad = (n) => String(n).padStart(2, "0");
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    } catch {
      return "";
    }
  });
  const [recipientIds, setRecipientIds] = useState(() => currentRecipients || []);
  const [saving, setSaving] = useState(false);
  const [loadingQuestions, setLoadingQuestions] = useState(!isExternalInitial);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isExternalInitial && test.id && supabase) {
      supabase
        .from("assessment_questions")
        .select("id, external_id, prompt, options, correct_index, explanation, points, sort_order")
        .eq("assessment_id", test.id)
        .order("sort_order")
        .then(({ data, error: qErr }) => {
          if (!qErr && Array.isArray(data) && data.length > 0) {
            setRawJson(questionsToQuizJsonText(data));
          }
          setLoadingQuestions(false);
        });
    } else {
      setLoadingQuestions(false);
    }
  }, [test.id, isExternalInitial, supabase]);

  function toggleRecipient(id) {
    setRecipientIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  }

  function toggleAll() {
    if (recipientIds.length === students.length) {
      setRecipientIds([]);
    } else {
      setRecipientIds(students.map((s) => s.id));
    }
  }

  const allSelected = students.length > 0 && recipientIds.length === students.length;

  async function handleSubmit(event) {
    event.preventDefault();
    if (!title.trim()) {
      setError("Test title is required.");
      return;
    }
    if (students.length > 0 && !recipientIds.length) {
      setError("Please select at least one student recipient.");
      return;
    }

    let validatedQuestions = [];
    if (testType === "external") {
      if (!/^https?:\/\//i.test(externalUrl.trim())) {
        setError("Please enter a valid external test URL starting with https:// or http://.");
        return;
      }
    } else {
      const check = validateAndNormalizeQuizJson(rawJson);
      if (!check.valid) {
        setError(check.errors[0] || "Fix JSON validation errors before saving.");
        return;
      }
      validatedQuestions = check.questions;
    }

    setSaving(true);
    setError("");

    try {
      await onSave(test.id, {
        title: title.trim(),
        description: description.trim(),
        testType,
        externalUrl: externalUrl.trim(),
        questions: validatedQuestions,
        proctoring: proctorSettings,
        due,
        recipientIds,
        showMarks: Boolean(proctorSettings.showMarks),
      });
    } catch (err) {
      setError(err.message || "Failed to update test.");
      setSaving(false);
    }
  }

  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="modal edit-course-modal"
        style={{ maxWidth: testType === "built_in" ? "840px" : "600px" }}
        role="dialog"
        aria-modal="true"
      >
        <div className="modal-heading">
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span className="portal-item-icon assignment" style={{ width: "38px", height: "38px" }}>
              <ClipboardList size={18} />
            </span>
            <div>
              <h2>Edit Test / Proctored Assessment</h2>
              <p>Update question bank JSON, proctoring controls, external link, due date, and recipients.</p>
            </div>
          </div>
          <button type="button" className="quiet-icon" onClick={onClose} aria-label="Close modal">
            <X size={18} />
          </button>
        </div>

        {error && (
          <div className="portal-alert error" style={{ marginBottom: "16px" }}>
            {error}
            <button type="button" onClick={() => setError("")}>Dismiss</button>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <label className="form-field">
            <span>Test Title *</span>
            <input
              type="text"
              required
              maxLength={150}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Biology Midterm Proctored Quiz"
            />
          </label>

          <label className="form-field" style={{ marginTop: "12px" }}>
            <span>Instructions</span>
            <textarea
              rows={2}
              maxLength={2000}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional guidance or exam rules..."
            />
          </label>

          <label className="form-field" style={{ marginTop: "12px" }}>
            <span>Test Delivery Method</span>
            <select
              value={testType}
              onChange={(e) => setTestType(e.target.value)}
              className="status-select"
            >
              <option value="built_in">Proctored Built-in Multiple-Choice Quiz (JSON)</option>
              <option value="external">External secure test link (Google Forms / Microsoft Forms / LMS)</option>
            </select>
          </label>

          {testType === "external" ? (
            <div style={{ marginTop: "12px" }}>
              <label className="form-field">
                <span>External Test URL *</span>
                <input
                  type="url"
                  required
                  pattern="https?://.*"
                  value={externalUrl}
                  onChange={(e) => setExternalUrl(e.target.value)}
                  placeholder="https://forms.google.com/..."
                />
              </label>

              <div style={{ marginTop: "12px", padding: "12px 14px", background: "var(--canvas)", borderRadius: "8px", border: "1px solid var(--line)" }}>
                <label style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer", fontWeight: 600, fontSize: "13px" }}>
                  <input
                    type="checkbox"
                    checked={Boolean(proctorSettings.showMarks)}
                    onChange={(e) => setProctorSettings((s) => ({ ...s, showMarks: e.target.checked }))}
                    style={{ width: "16px", height: "16px", cursor: "pointer" }}
                  />
                  <span>Permit Students to View Marks / Scores</span>
                </label>
                <small style={{ display: "block", marginTop: "4px", color: "var(--muted)", fontSize: "12px", marginLeft: "26px" }}>
                  When unchecked, students will only see &quot;Completed&quot; on their dashboard. Check to release actual marks.
                </small>
              </div>
            </div>
          ) : loadingQuestions ? (
            <div className="portal-loading" style={{ padding: "24px", textAlign: "center", color: "var(--muted)" }}>
              Loading existing questions…
            </div>
          ) : (
            <div style={{ marginTop: "14px" }}>
              <ProctoredQuizConfigPanel
                rawJson={rawJson}
                onRawJsonChange={setRawJson}
                settings={proctorSettings}
                onSettingsChange={setProctorSettings}
                compact={true}
              />
            </div>
          )}

          <label className="form-field" style={{ marginTop: "14px" }}>
            <span>Due Date &amp; Time</span>
            <input
              type="datetime-local"
              value={due}
              onChange={(e) => setDue(e.target.value)}
            />
          </label>

          <fieldset className="admin-options" style={{ marginTop: "16px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
              <legend style={{ margin: 0 }}>
                Assigned Students ({recipientIds.length}/{students.length})
              </legend>
              {students.length > 0 && (
                <button
                  type="button"
                  className="button"
                  style={{ minHeight: "26px", padding: "2px 8px", fontSize: "11px" }}
                  onClick={toggleAll}
                >
                  {allSelected ? "Deselect all" : "Select all students"}
                </button>
              )}
            </div>

            <div style={{ maxHeight: "160px", overflowY: "auto", display: "grid", gap: "6px" }}>
              {students.map((student) => (
                <label className="admin-option" key={student.id}>
                  <input
                    type="checkbox"
                    checked={recipientIds.includes(student.id)}
                    onChange={() => toggleRecipient(student.id)}
                  />
                  <span>{student.full_name || student.email}</span>
                  <small>{student.email}</small>
                </label>
              ))}
              {!students.length && <p>No approved student accounts found.</p>}
            </div>
          </fieldset>

          <div
            className="modal-actions"
            style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "24px" }}
          >
            {onDelete ? (
              <button
                type="button"
                className="button danger-icon"
                style={{ color: "var(--rose)", borderColor: "rgba(239, 68, 68, 0.3)" }}
                onClick={() => {
                  if (window.confirm(`Delete test “${test.title}”?`)) {
                    onDelete(test);
                    onClose();
                  }
                }}
              >
                Delete Test
              </button>
            ) : <div />}

            <div style={{ display: "flex", gap: "10px" }}>
              <button type="button" className="button" onClick={onClose} disabled={saving}>
                Cancel
              </button>
              <button type="submit" className="button primary" disabled={saving}>
                {saving ? "Saving…" : "Save Changes"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
