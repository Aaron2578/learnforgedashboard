import { useState, useMemo } from "react";
import { Check, CheckCircle2, GraduationCap, Search, Users, X } from "lucide-react";

export default function AssignTrainerStudentsModal({
  trainer,
  students = [],
  assignedStudentIds = [],
  onSave,
  onClose,
}) {
  const [selectedIds, setSelectedIds] = useState(() => new Set(assignedStudentIds));
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const filteredStudents = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return students;
    return students.filter((s) => {
      const name = (s.full_name || "").toLowerCase();
      const email = (s.email || "").toLowerCase();
      const timing = (s.timing || "").toLowerCase();
      return name.includes(term) || email.includes(term) || timing.includes(term);
    });
  }, [students, search]);

  function toggleStudent(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleSelectAll() {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      filteredStudents.forEach((s) => next.add(s.id));
      return next;
    });
  }

  function handleClearAll() {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      filteredStudents.forEach((s) => next.delete(s.id));
      return next;
    });
  }

  async function handleSave() {
    setSaving(true);
    setError("");
    try {
      await onSave(trainer.id, Array.from(selectedIds));
      onClose();
    } catch (err) {
      setError(err.message || "Failed to save student assignments.");
      setSaving(false);
    }
  }

  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget && !saving) onClose();
      }}
    >
      <div className="modal" role="dialog" aria-modal="true" style={{ maxWidth: "640px", maxHeight: "90vh", display: "flex", flexDirection: "column" }}>
        <div className="modal-heading">
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <span
              className="portal-item-icon assignment"
              style={{
                width: "42px",
                height: "42px",
                background: "rgba(37, 99, 235, 0.1)",
                color: "#2563eb",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: "10px",
              }}
            >
              <Users size={22} />
            </span>
            <div>
              <h2 style={{ margin: 0, fontSize: "19px" }}>Assign Students to Trainer</h2>
              <p style={{ margin: "3px 0 0", fontSize: "13px", color: "var(--muted)" }}>
                Select students to be supervised and managed by this trainer.
              </p>
            </div>
          </div>
          <button
            type="button"
            className="quiet-icon"
            onClick={onClose}
            aria-label="Close modal"
            disabled={saving}
          >
            <X size={18} />
          </button>
        </div>

        {/* Trainer Summary Pill */}
        <div
          style={{
            background: "#eff6ff",
            border: "1px solid #bfdbfe",
            borderRadius: "10px",
            padding: "10px 14px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "10px",
            margin: "12px 0 14px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span
              className="student-avatar"
              style={{
                width: "32px",
                height: "32px",
                background: "#2563eb",
                color: "#ffffff",
                fontSize: "13px",
              }}
            >
              {(trainer.full_name || trainer.email).slice(0, 1).toUpperCase()}
            </span>
            <div>
              <strong style={{ fontSize: "14px", color: "#1e3a8a" }}>
                {trainer.full_name || "Trainer"}
              </strong>
              <div style={{ fontSize: "12px", color: "#3b82f6" }}>{trainer.email}</div>
            </div>
          </div>
          {trainer.timing && (
            <span
              className="badge"
              style={{
                background: "#ffffff",
                color: "#1e40af",
                border: "1px solid #93c5fd",
                fontSize: "11.5px",
                fontWeight: 600,
              }}
            >
              Shift: {trainer.timing}
            </span>
          )}
        </div>

        {error && (
          <div className="portal-alert error" style={{ marginBottom: "14px" }}>
            {error}
            <button type="button" onClick={() => setError("")}>Dismiss</button>
          </div>
        )}

        {/* Search & Bulk Selection Toolbar */}
        <div style={{ display: "flex", gap: "10px", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", marginBottom: "12px" }}>
          <div className="search-box" style={{ flex: 1, minWidth: "220px" }}>
            <Search size={15} />
            <input
              type="search"
              placeholder="Filter students by name or email…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              disabled={saving}
            />
          </div>
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <button
              type="button"
              className="button compact"
              onClick={handleSelectAll}
              disabled={saving || filteredStudents.length === 0}
              style={{ fontSize: "12px" }}
            >
              Select All ({filteredStudents.length})
            </button>
            <button
              type="button"
              className="button compact"
              onClick={handleClearAll}
              disabled={saving || selectedIds.size === 0}
              style={{ fontSize: "12px" }}
            >
              Clear All
            </button>
          </div>
        </div>

        {/* Selected Count Indicator */}
        <div style={{ fontSize: "12.5px", color: "var(--muted)", marginBottom: "8px", display: "flex", justifyContent: "space-between" }}>
          <span>
            Showing {filteredStudents.length} of {students.length} students
          </span>
          <strong style={{ color: selectedIds.size > 0 ? "#16a34a" : "inherit" }}>
            {selectedIds.size} student{selectedIds.size === 1 ? "" : "s"} selected
          </strong>
        </div>

        {/* Students Checkbox List */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            border: "1px solid var(--line)",
            borderRadius: "10px",
            padding: "8px",
            display: "grid",
            gap: "6px",
            minHeight: "180px",
            maxHeight: "360px",
            background: "#fafafa",
          }}
        >
          {filteredStudents.map((s) => {
            const isChecked = selectedIds.has(s.id);
            return (
              <label
                key={s.id}
                onClick={() => toggleStudent(s.id)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "10px 12px",
                  borderRadius: "8px",
                  background: isChecked ? "#f0fdf4" : "#ffffff",
                  border: isChecked ? "1px solid #86efac" : "1px solid var(--line)",
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => {}} // handled by parent label onClick
                    style={{ width: "16px", height: "16px", cursor: "pointer" }}
                  />
                  <span
                    className="student-avatar"
                    style={{
                      width: "32px",
                      height: "32px",
                      fontSize: "12px",
                      background: isChecked ? "#16a34a" : undefined,
                      color: isChecked ? "#ffffff" : undefined,
                    }}
                  >
                    {(s.full_name || s.email).slice(0, 1).toUpperCase()}
                  </span>
                  <div>
                    <strong style={{ fontSize: "13.5px", display: "block" }}>
                      {s.full_name || "Student"}
                    </strong>
                    <span style={{ fontSize: "12px", color: "var(--muted)" }}>
                      {s.email}
                    </span>
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  {s.timing && (
                    <span
                      className="badge"
                      style={{
                        fontSize: "11px",
                        background: "#f1f5f9",
                        color: "#475569",
                      }}
                    >
                      {s.timing}
                    </span>
                  )}
                  {isChecked ? (
                    <span
                      className="badge green"
                      style={{ fontSize: "11px", display: "flex", alignItems: "center", gap: "3px" }}
                    >
                      <Check size={11} /> Assigned
                    </span>
                  ) : (
                    <span className="badge" style={{ fontSize: "11px", color: "var(--muted)" }}>
                      Available
                    </span>
                  )}
                </div>
              </label>
            );
          })}

          {filteredStudents.length === 0 && (
            <div style={{ textAlign: "center", padding: "30px", color: "var(--muted)" }}>
              No students match your filter.
            </div>
          )}
        </div>

        {/* Modal Actions */}
        <div
          style={{
            marginTop: "16px",
            paddingTop: "14px",
            borderTop: "1px solid var(--line)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span style={{ fontSize: "13px", color: "var(--muted)" }}>
            Assigned students will appear in this trainer's dashboard.
          </span>
          <div style={{ display: "flex", gap: "10px" }}>
            <button type="button" className="button" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button
              type="button"
              className="button primary"
              onClick={handleSave}
              disabled={saving}
              style={{ display: "flex", alignItems: "center", gap: "6px" }}
            >
              <CheckCircle2 size={15} />
              <span>{saving ? "Saving Assignments…" : `Save Assignments (${selectedIds.size})`}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

