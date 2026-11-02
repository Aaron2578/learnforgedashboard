import { useState, useEffect } from "react";
import { ClipboardList, X } from "lucide-react";

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
  const [prompt, setPrompt] = useState("");
  const [options, setOptions] = useState(["", "", "", ""]);
  const [correctIndex, setCorrectIndex] = useState(0);
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
  const [showMarks, setShowMarks] = useState(Boolean(test.show_marks));
  const [saving, setSaving] = useState(false);
  const [loadingQuestions, setLoadingQuestions] = useState(!isExternalInitial);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isExternalInitial && test.id && supabase) {
      supabase
        .from("assessment_questions")
        .select("id, prompt, options, correct_index")
        .eq("assessment_id", test.id)
        .order("sort_order")
        .limit(1)
        .then(({ data, error: qErr }) => {
          if (!qErr && data && data.length > 0) {
            setPrompt(data[0].prompt || "");
            if (Array.isArray(data[0].options)) setOptions(data[0].options);
            setCorrectIndex(data[0].correct_index ?? 0);
          }
          setLoadingQuestions(false);
        });
    }
  }, [test.id, isExternalInitial, supabase]);

  function changeOption(index, value) {
    setOptions((current) =>
      current.map((opt, i) => (i === index ? value : opt))
    );
  }

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
    if (!recipientIds.length) {
      setError("Please select at least one student recipient.");
      return;
    }
    if (testType === "external" && !externalUrl.trim()) {
      setError("Please enter a valid external test URL.");
      return;
    }
    setSaving(true);
    setError("");

    try {
      await onSave(test.id, {
        title: title.trim(),
        description: description.trim(),
        testType,
        externalUrl: externalUrl.trim(),
        prompt: prompt.trim(),
        options: options.map((o) => o.trim()),
        correctIndex,
        due,
        recipientIds,
        showMarks,
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
      <div className="modal edit-course-modal" role="dialog" aria-modal="true">
        <div className="modal-heading">
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span className="portal-item-icon assignment" style={{ width: "38px", height: "38px" }}>
              <ClipboardList size={18} />
            </span>
            <div>
              <h2>Edit Test / Assessment</h2>
              <p>Update questions, test link, due date, and student enrollment.</p>
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
              placeholder="e.g. Biology Midterm Quiz"
            />
          </label>

          <label className="form-field" style={{ marginTop: "12px" }}>
            <span>Instructions</span>
            <textarea
              rows={2}
              maxLength={2000}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional guidance or time limits..."
            />
          </label>

          <label className="form-field" style={{ marginTop: "12px" }}>
            <span>Test Delivery Method</span>
            <select
              value={testType}
              onChange={(e) => setTestType(e.target.value)}
              className="status-select"
            >
              <option value="built_in">Built-in multiple choice question</option>
              <option value="external">External secure test link (Google Forms / Microsoft Forms / LMS)</option>
            </select>
          </label>

          {testType === "external" ? (
            <label className="form-field" style={{ marginTop: "12px" }}>
              <span>External Test URL *</span>
              <input
                type="url"
                required
                pattern="https://.*"
                value={externalUrl}
                onChange={(e) => setExternalUrl(e.target.value)}
                placeholder="https://forms.google.com/..."
              />
            </label>
          ) : (
            <div style={{ marginTop: "14px" }}>
              <label className="form-field">
                <span>Question Prompt</span>
                <textarea
                  required
                  rows={2}
                  maxLength={1000}
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Enter the multiple-choice question..."
                />
              </label>

              <fieldset className="admin-options" style={{ marginTop: "10px" }}>
                <legend>Answer Choices (Select the correct radio option)</legend>
                {options.map((option, index) => (
                  <label className="admin-option" key={index}>
                    <input
                      type="radio"
                      name="edit-correct-answer"
                      checked={correctIndex === index}
                      onChange={() => setCorrectIndex(index)}
                      aria-label={`Mark choice ${index + 1} correct`}
                    />
                    <span>{String.fromCharCode(65 + index)}</span>
                    <input
                      required
                      maxLength={500}
                      value={option}
                      onChange={(e) => changeOption(index, e.target.value)}
                      placeholder={`Choice ${index + 1}`}
                    />
                  </label>
                ))}
              </fieldset>
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

          <div style={{ marginTop: "14px", padding: "12px 14px", background: "#f8fafc", borderRadius: "8px", border: "1px solid var(--line)" }}>
            <label style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer", fontWeight: 600, fontSize: "13px" }}>
              <input
                type="checkbox"
                checked={showMarks}
                onChange={(e) => setShowMarks(e.target.checked)}
                style={{ width: "16px", height: "16px", cursor: "pointer" }}
              />
              <span>Permit Students to View Marks / Scores</span>
            </label>
            <small style={{ display: "block", marginTop: "4px", color: "var(--muted)", fontSize: "12px", marginLeft: "26px" }}>
              When unchecked, students will only see <strong>&quot;Completed&quot;</strong> on their dashboard. Check to release actual marks.
            </small>
          </div>

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
                style={{ color: "var(--red)", borderColor: "rgba(239, 68, 68, 0.3)" }}
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

