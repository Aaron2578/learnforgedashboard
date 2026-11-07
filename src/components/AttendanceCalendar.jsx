import React, { useState, useMemo } from "react";
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Clock3,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Plus,
  Pencil,
  Trash2,
  Users,
  GraduationCap,
  Filter,
  List,
  Sparkles,
} from "lucide-react";
import { isHolidayRecord, normalizeAttendanceStatus, cleanAttendanceNote } from "../lib/attendanceUtils.js";

const DAYS_OF_WEEK = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

function padZero(num) {
  return String(num).padStart(2, "0");
}

function formatDateString(year, month, day) {
  return `${year}-${padZero(month + 1)}-${padZero(day)}`;
}

export default function AttendanceCalendar({
  records = [],
  students = [],
  courses = [],
  isAdmin = false,
  onEditRecord,
  onDeleteRecord,
  onAddRecord,
}) {
  const today = useMemo(() => new Date(), []);
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(today.getMonth()); // 0-indexed
  const [selectedDate, setSelectedDate] = useState(() =>
    formatDateString(today.getFullYear(), today.getMonth(), today.getDate())
  );
  const [viewMode, setViewMode] = useState("calendar"); // 'calendar' | 'list'
  const [selectedStudentFilter, setSelectedStudentFilter] = useState("all");
  const [selectedCourseFilter, setSelectedCourseFilter] = useState("all");

  const studentsById = useMemo(
    () => Object.fromEntries(students.map((s) => [s.id, s])),
    [students]
  );
  const coursesById = useMemo(
    () => Object.fromEntries(courses.map((c) => [c.id, c])),
    [courses]
  );

  // Month navigation
  function handlePrevMonth() {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear((y) => y - 1);
    } else {
      setCurrentMonth((m) => m - 1);
    }
  }

  function handleNextMonth() {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear((y) => y + 1);
    } else {
      setCurrentMonth((m) => m + 1);
    }
  }

  function handleToday() {
    const now = new Date();
    setCurrentYear(now.getFullYear());
    setCurrentMonth(now.getMonth());
    setSelectedDate(formatDateString(now.getFullYear(), now.getMonth(), now.getDate()));
  }

  // Filter records by student and course
  const filteredRecords = useMemo(() => {
    return records.filter((r) => {
      if (selectedStudentFilter !== "all" && r.student_id !== selectedStudentFilter) {
        return false;
      }
      if (selectedCourseFilter !== "all" && r.course_id !== selectedCourseFilter) {
        return false;
      }
      return true;
    });
  }, [records, selectedStudentFilter, selectedCourseFilter]);

  // Map of records by 'YYYY-MM-DD'
  const recordsByDate = useMemo(() => {
    const map = new Map();
    filteredRecords.forEach((record) => {
      const dateKey = record.attendance_date;
      if (!map.has(dateKey)) {
        map.set(dateKey, []);
      }
      map.get(dateKey).push(record);
    });
    return map;
  }, [filteredRecords]);

  // Attendance metrics for the active filter
  const metrics = useMemo(() => {
    let present = 0;
    let absent = 0;
    let late = 0;
    let holiday = 0;
    filteredRecords.forEach((r) => {
      const status = normalizeAttendanceStatus(r);
      if (status === "present") present++;
      else if (status === "absent") absent++;
      else if (status === "late") late++;
      else if (status === "holiday") holiday++;
    });
    const totalWorking = present + absent + late;
    const rate = totalWorking > 0 ? Math.round(((present + late * 0.5) / totalWorking) * 100) : 100;
    return { present, absent, late, holiday, total: filteredRecords.length, rate };
  }, [filteredRecords]);

  // Calendar matrix calculation
  const calendarCells = useMemo(() => {
    const firstDayIndex = new Date(currentYear, currentMonth, 1).getDay();
    const daysInCurrentMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const daysInPrevMonth = new Date(currentYear, currentMonth, 0).getDate();

    const cells = [];

    // Prev month overflow days
    for (let i = firstDayIndex - 1; i >= 0; i--) {
      const day = daysInPrevMonth - i;
      const prevMonth = currentMonth === 0 ? 11 : currentMonth - 1;
      const prevYear = currentMonth === 0 ? currentYear - 1 : currentYear;
      cells.push({
        day,
        dateKey: formatDateString(prevYear, prevMonth, day),
        isCurrentMonth: false,
      });
    }

    // Current month days
    for (let day = 1; day <= daysInCurrentMonth; day++) {
      cells.push({
        day,
        dateKey: formatDateString(currentYear, currentMonth, day),
        isCurrentMonth: true,
      });
    }

    // Next month overflow days to complete 35 or 42 grid cells
    const remaining = 7 - (cells.length % 7);
    if (remaining < 7) {
      for (let day = 1; day <= remaining; day++) {
        const nextMonth = currentMonth === 11 ? 0 : currentMonth + 1;
        const nextYear = currentMonth === 11 ? currentYear + 1 : currentYear;
        cells.push({
          day,
          dateKey: formatDateString(nextYear, nextMonth, day),
          isCurrentMonth: false,
        });
      }
    }

    return cells;
  }, [currentYear, currentMonth]);

  const selectedDateRecords = recordsByDate.get(selectedDate) || [];
  const todayKey = formatDateString(today.getFullYear(), today.getMonth(), today.getDate());

  function renderDayRecordBadge(record) {
    const st = normalizeAttendanceStatus(record);
    const student = studentsById[record.student_id];
    const name = student?.full_name || student?.email?.split("@")[0] || "Student";
    const course = coursesById[record.course_id];
    const displayNote = cleanAttendanceNote(record.note);

    return (
      <div
        key={record.id}
        className={`cal-status-chip ${st}`}
        title={`${name} - ${st.toUpperCase()}${course ? ` (${course.code})` : ""}${displayNote ? `: ${displayNote}` : ""}`}
      >
        <span className="cal-chip-dot" />
        <span className="cal-chip-label">
          {st === "holiday" ? "HOLIDAY" : (isAdmin ? `${name.split(" ")[0]}: ${st}` : st)}
        </span>
      </div>
    );
  }

  return (
    <div className="attendance-calendar-root">
      {/* Top Controls & Filter Bar */}
      <div className="attendance-cal-toolbar card">
        <div className="cal-month-nav">
          <button
            type="button"
            className="button compact icon-button"
            onClick={handlePrevMonth}
            aria-label="Previous month"
          >
            <ChevronLeft size={16} />
          </button>
          <h2 className="cal-month-title">
            {MONTH_NAMES[currentMonth]} {currentYear}
          </h2>
          <button
            type="button"
            className="button compact icon-button"
            onClick={handleNextMonth}
            aria-label="Next month"
          >
            <ChevronRight size={16} />
          </button>
          <button
            type="button"
            className="button compact"
            onClick={handleToday}
            style={{ marginLeft: "6px" }}
          >
            Today
          </button>
        </div>

        {/* Filters */}
        <div className="cal-filter-group">
          {isAdmin && students.length > 0 && (
            <div className="cal-select-wrap">
              <Users size={13} className="select-icon" />
              <select
                value={selectedStudentFilter}
                onChange={(e) => setSelectedStudentFilter(e.target.value)}
                className="cal-select"
                aria-label="Filter by student"
              >
                <option value="all">All Students ({students.length})</option>
                {students.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.full_name || s.email}
                  </option>
                ))}
              </select>
            </div>
          )}

          {courses.length > 0 && (
            <div className="cal-select-wrap">
              <GraduationCap size={13} className="select-icon" />
              <select
                value={selectedCourseFilter}
                onChange={(e) => setSelectedCourseFilter(e.target.value)}
                className="cal-select"
                aria-label="Filter by course"
              >
                <option value="all">All Courses ({courses.length})</option>
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code} · {c.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* View Mode Toggle */}
          <div className="cal-view-toggle">
            <button
              type="button"
              className={`toggle-btn ${viewMode === "calendar" ? "active" : ""}`}
              onClick={() => setViewMode("calendar")}
              title="Calendar Grid View"
            >
              <CalendarIcon size={14} />
              <span>Calendar</span>
            </button>
            <button
              type="button"
              className={`toggle-btn ${viewMode === "list" ? "active" : ""}`}
              onClick={() => setViewMode("list")}
              title="List View"
            >
              <List size={14} />
              <span>List</span>
            </button>
          </div>
        </div>
      </div>

      {/* Metrics Summary Strip */}
      <div className="attendance-cal-metrics">
        <div className="cal-metric-chip present">
          <CheckCircle2 size={15} />
          <span>Present: <strong>{metrics.present}</strong></span>
        </div>
        <div className="cal-metric-chip absent">
          <XCircle size={15} />
          <span>Absent: <strong>{metrics.absent}</strong></span>
        </div>
        <div className="cal-metric-chip late">
          <AlertCircle size={15} />
          <span>Late: <strong>{metrics.late}</strong></span>
        </div>
        <div className="cal-metric-chip holiday">
          <Sparkles size={15} />
          <span>Holiday: <strong>{metrics.holiday}</strong></span>
        </div>
        <div className="cal-metric-chip rate">
          <Clock3 size={15} />
          <span>Attendance Rate: <strong>{metrics.rate}%</strong></span>
        </div>
      </div>

      {viewMode === "calendar" ? (
        <>
          {/* Main Calendar Grid */}
          <div className="attendance-cal-card card">
            {/* Days Header */}
            <div className="cal-grid-header">
              {DAYS_OF_WEEK.map((day) => (
                <div key={day} className="cal-header-cell">
                  {day}
                </div>
              ))}
            </div>

            {/* Days Body */}
            <div className="cal-grid-body">
              {calendarCells.map((cell) => {
                const dayRecords = recordsByDate.get(cell.dateKey) || [];
                const isSelected = selectedDate === cell.dateKey;
                const isToday = todayKey === cell.dateKey;

                return (
                  <div
                    key={cell.dateKey}
                    className={`cal-day-cell ${cell.isCurrentMonth ? "" : "other-month"} ${isSelected ? "selected" : ""} ${isToday ? "today" : ""}`}
                    onClick={() => setSelectedDate(cell.dateKey)}
                    tabIndex={0}
                    role="button"
                    aria-label={`${cell.dateKey}, ${dayRecords.length} attendance records`}
                  >
                    <div className="cal-day-header">
                      <span className={`cal-day-num ${isToday ? "today-badge" : ""}`}>
                        {cell.day}
                      </span>
                      {dayRecords.length > 0 && (
                        <span className="cal-records-count">
                          {dayRecords.length}
                        </span>
                      )}
                    </div>

                    <div className="cal-day-content">
                      {dayRecords.slice(0, 3).map(renderDayRecordBadge)}
                      {dayRecords.length > 3 && (
                        <div className="cal-more-chip">
                          +{dayRecords.length - 3} more
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Day Inspector Sheet */}
          <div className="cal-day-inspector card">
            <div className="panel-heading">
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span className="portal-item-icon test">
                  <CalendarIcon size={16} />
                </span>
                <div>
                  <h3>
                    Attendance for {new Intl.DateTimeFormat("en", { dateStyle: "full" }).format(new Date(`${selectedDate}T12:00:00`))}
                  </h3>
                  <small style={{ color: "var(--muted)" }}>
                    {selectedDateRecords.length} student record{selectedDateRecords.length === 1 ? "" : "s"} on this date
                  </small>
                </div>
              </div>

              {isAdmin && onAddRecord && (
                <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                  <button
                    type="button"
                    className="button compact"
                    style={{ background: "#ede9fe", color: "#6d28d9", borderColor: "#ddd6fe", fontWeight: 600 }}
                    onClick={() => onAddRecord(selectedDate, "holiday")}
                    title="Mark this date as a Holiday"
                  >
                    <Sparkles size={13} />
                    <span>Declare Holiday</span>
                  </button>
                  <button
                    type="button"
                    className="button primary compact"
                    onClick={() => onAddRecord(selectedDate)}
                  >
                    <Plus size={13} />
                    <span>Mark Attendance</span>
                  </button>
                </div>
              )}
            </div>

            {selectedDateRecords.length > 0 ? (
              <div className="cal-inspector-list">
                {selectedDateRecords.map((record) => {
                  const student = studentsById[record.student_id];
                  const course = coursesById[record.course_id];
                  const st = normalizeAttendanceStatus(record);
                  const displayNote = cleanAttendanceNote(record.note);

                  return (
                    <div className="cal-inspector-row" key={record.id}>
                      <div className="inspector-student">
                        <span className="student-avatar">
                          {(student?.full_name || student?.email || "ST")
                            .split(/\s+/)
                            .slice(0, 2)
                            .map((p) => p[0])
                            .join("")
                            .toUpperCase()}
                        </span>
                        <div>
                          <strong>{student?.full_name || student?.email || "Student"}</strong>
                          <small>{student?.email || ""}</small>
                        </div>
                      </div>

                      <div className="inspector-course">
                        <span className="course-code-badge">
                          {course ? course.code : "Campus-wide"}
                        </span>
                        <span>{course ? course.name : "General Class"}</span>
                      </div>

                      <div className="inspector-status">
                        <span
                          className={`cohort-status-pill ${st}`}
                          style={
                            st === "holiday"
                              ? { background: "#f5f3ff", color: "#6d28d9", borderColor: "#ddd6fe" }
                              : st === "absent"
                              ? { background: "#fee2e2", color: "#b91c1c", borderColor: "#fecaca" }
                              : st === "late"
                              ? { background: "#fef3c7", color: "#b45309", borderColor: "#fde68a" }
                              : { background: "#dcfce7", color: "#15803d", borderColor: "#bbf7d0" }
                          }
                        >
                          {st === "present" ? <CheckCircle2 size={13} /> : st === "absent" ? <XCircle size={13} /> : st === "holiday" ? <Sparkles size={13} /> : <AlertCircle size={13} />}
                          <span>{st === "holiday" ? "HOLIDAY" : st.toUpperCase()}</span>
                        </span>
                      </div>

                      {displayNote && (
                        <div className="inspector-note" title={displayNote}>
                          <small>Note: {displayNote}</small>
                        </div>
                      )}

                      {isAdmin && (
                        <div className="inspector-actions">
                          {onEditRecord && (
                            <button
                              type="button"
                              className="button compact"
                              onClick={() => onEditRecord(record)}
                              title="Edit record"
                            >
                              <Pencil size={12} />
                              <span>Edit</span>
                            </button>
                          )}
                          {onDeleteRecord && (
                            <button
                              type="button"
                              className="quiet-icon danger-icon"
                              onClick={() => onDeleteRecord(record)}
                              title="Delete record"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="cal-inspector-empty">
                <Clock3 size={20} />
                <span>No attendance records logged for this date.</span>
                {isAdmin && onAddRecord && (
                  <button
                    type="button"
                    className="button compact"
                    onClick={() => onAddRecord(selectedDate)}
                    style={{ marginTop: "8px" }}
                  >
                    <Plus size={12} /> Record Attendance for {selectedDate}
                  </button>
                )}
              </div>
            )}
          </div>
        </>
      ) : (
        /* Tabular List View */
        <div className="card" style={{ padding: "16px" }}>
          {filteredRecords.length > 0 ? (
            <div className="cal-inspector-list">
              {filteredRecords.map((record) => {
                const student = studentsById[record.student_id];
                const course = coursesById[record.course_id];
                const st = normalizeAttendanceStatus(record);
                const displayNote = cleanAttendanceNote(record.note);

                return (
                  <div className="cal-inspector-row" key={record.id}>
                    <div style={{ minWidth: "120px", fontWeight: 600, fontSize: "12.5px" }}>
                      {record.attendance_date}
                    </div>

                    <div className="inspector-student">
                      <span className="student-avatar">
                        {(student?.full_name || student?.email || "ST")
                          .split(/\s+/)
                          .slice(0, 2)
                          .map((p) => p[0])
                          .join("")
                          .toUpperCase()}
                      </span>
                      <div>
                        <strong>{student?.full_name || student?.email || "Student"}</strong>
                        <small>{student?.email || ""}</small>
                      </div>
                    </div>

                    <div className="inspector-course">
                      <span className="course-code-badge">
                        {course ? course.code : "General"}
                      </span>
                      <span>{course ? course.name : "Campus-wide"}</span>
                    </div>

                    <div className="inspector-status">
                      <span
                        className={`cohort-status-pill ${st === "present" ? "completed" : st === "holiday" ? "holiday" : "pending"}`}
                        style={
                          st === "absent"
                            ? { background: "#fee2e2", color: "#b91c1c", borderColor: "#fecaca" }
                            : st === "holiday"
                            ? { background: "#ede9fe", color: "#6d28d9", borderColor: "#ddd6fe" }
                            : {}
                        }
                      >
                        {st === "present" ? <CheckCircle2 size={13} /> : st === "holiday" ? <Sparkles size={13} /> : st === "absent" ? <XCircle size={13} /> : <AlertCircle size={13} />}
                        <span>{st.toUpperCase()}</span>
                      </span>
                    </div>

                    {displayNote && (
                      <div className="inspector-note">
                        <small>{displayNote}</small>
                      </div>
                    )}

                    {isAdmin && (
                      <div className="inspector-actions">
                        {onEditRecord && (
                          <button
                            type="button"
                            className="button compact"
                            onClick={() => onEditRecord(record)}
                          >
                            <Pencil size={12} />
                            <span>Edit</span>
                          </button>
                        )}
                        {onDeleteRecord && (
                          <button
                            type="button"
                            className="quiet-icon danger-icon"
                            onClick={() => onDeleteRecord(record)}
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="admin-no-submissions">
              <Clock3 size={18} />
              <span>No attendance records found matching filters.</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

