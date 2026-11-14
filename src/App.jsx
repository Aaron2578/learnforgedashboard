import { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  BarChart3,
  Bell,
  BookOpen,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  ClipboardCheck,
  Clock3,
  Code2,
  Download,
  Database,
  FileSpreadsheet,
  FileText,
  GraduationCap,
  HardDrive,
  LayoutDashboard,
  Mail,
  MapPin,
  Menu,
  MessageSquare,
  LogOut,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import AdminPortalView from "./portal/AdminPortalView.jsx";
import AdminManagementView from "./portal/AdminManagementView.jsx";
import AdminDriveView from "./portal/AdminDriveView.jsx";
import TrainerPortal from "./portal/TrainerPortal.jsx";
import StudentPortal from "./portal/StudentPortal.jsx";
import UserProfileModal from "./components/UserProfileModal.jsx";
import { lazyWithRetry } from "./lib/lazyWithRetry.js";

const OnlineCompiler = lazyWithRetry(() => import("./components/OnlineCompiler.jsx"));

const STORAGE_KEY = "learnforge-dashboard-v1";
const LEGACY_STORAGE_KEY = "northstar-institute-dashboard-v1";

const NAV_ITEMS = [
  { label: "Overview", icon: LayoutDashboard },
  { label: "Students", icon: Users },
  { label: "Trainers", icon: GraduationCap },
  { label: "Courses", icon: BookOpen },
  { label: "Syllabus", icon: FileText },
  { label: "Drive & Files", icon: HardDrive },
  { label: "Attendance", icon: ClipboardCheck },
  { label: "Tasks", icon: CheckCircle2 },
  { label: "Reports", icon: BarChart3 },
  { label: "Assignments", icon: FileSpreadsheet },
  { label: "Tests", icon: CheckCircle2 },
  { group: "Instruction" },
  { label: "Code Lab", icon: Code2 },
  { label: "Trainer Dashboard", icon: GraduationCap },
  { label: "Student Dashboard", icon: BookOpen },
  { group: "Community" },
  { label: "Calendar", icon: CalendarDays },
  { label: "Messages", icon: MessageSquare },
];

const INITIAL_DATA = {
  students: [],
  courses: [],
  events: [],
  messages: [],
  notifications: [],
};

function localDate() {
  const date = new Date();
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 10);
}

function makeId(prefix) {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() ?? Date.now().toString(36)}`;
}

function readSavedData() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!saved) return INITIAL_DATA;
    const parsed = JSON.parse(saved);
    return {
      ...INITIAL_DATA,
      ...parsed,
      students: Array.isArray(parsed.students) ? parsed.students.filter((item) => !/^s-\d+$/.test(item.id)) : INITIAL_DATA.students,
      courses: Array.isArray(parsed.courses) ? parsed.courses.filter((item) => !/^c-\d+$/.test(item.id)) : INITIAL_DATA.courses,
      events: Array.isArray(parsed.events) ? parsed.events.filter((item) => !/^e-\d+$/.test(item.id)) : INITIAL_DATA.events,
      messages: Array.isArray(parsed.messages) ? parsed.messages.filter((item) => !/^m-\d+$/.test(item.id)) : INITIAL_DATA.messages,
      notifications: Array.isArray(parsed.notifications) ? parsed.notifications.filter((item) => !/^n-\d+$/.test(item.id)) : INITIAL_DATA.notifications,
    };
  } catch (error) {
    console.error("Could not load the saved dashboard data.", error);
    return INITIAL_DATA;
  }
}

function formatTime(time) {
  if (!time) return "Time TBD";
  const [hours, minutes] = time.split(":").map(Number);
  return new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit" }).format(new Date(2000, 0, 1, hours, minutes));
}

function formatDate(date) {
  if (!date) return "Today";
  if (date === localDate()) return "Today";
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(new Date(`${date}T12:00:00`));
}

function initials(name) {
  return name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

function csvCell(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function downloadCsv(filename, rows) {
  const csv = rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function Toast({ message, onDismiss }) {
  useEffect(() => {
    if (!message) return undefined;
    const timer = window.setTimeout(onDismiss, 3200);
    return () => window.clearTimeout(timer);
  }, [message, onDismiss]);
  if (!message) return null;
  return <div className="toast" role="status" aria-live="polite"><CheckCircle2 size={16} />{message}<button type="button" onClick={onDismiss} aria-label="Dismiss notification"><X size={14} /></button></div>;
}

function Badge({ children, tone = "blue" }) {
  return <span className={`badge ${tone}`}><i />{children}</span>;
}

function PageHeading({ eyebrow, title, description, action }) {
  return (
    <div className="page-heading">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {action && <div className="heading-actions">{action}</div>}
    </div>
  );
}

function StudentTable({ students, onStatusChange, searchable = true }) {
  const tones = { Present: "green", Late: "amber", Absent: "rose" };
  return (
    <div className="table-scroll">
      <table>
        <thead><tr><th>STUDENT</th><th>PROGRAM</th><th>COURSE</th><th>CHECK-IN</th><th>STATUS</th></tr></thead>
        <tbody>
          {students.map((student, index) => (
            <tr key={student.id}>
              <td><div className="student-cell"><span className={`student-avatar avatar-${index % 4}`}>{initials(student.name)}</span><span><strong>{student.name}</strong><small>{student.email}</small></span></div></td>
              <td>{student.program}</td><td>{student.course}</td><td>{student.checkIn}</td>
              <td>{onStatusChange ? <label className="status-select"><span className="sr-only">Attendance for {student.name}</span><select value={student.status} onChange={(event) => onStatusChange(student.id, event.target.value)} className={tones[student.status]}><option>Present</option><option>Late</option><option>Absent</option></select><ChevronDown size={12} /></label> : <Badge tone={tones[student.status]}>{student.status}</Badge>}</td>
            </tr>
          ))}
          {students.length === 0 && <tr><td className="empty-cell" colSpan="5">No students match your search.</td></tr>}
        </tbody>
      </table>
      {!searchable && students.length === 0 && <div className="empty-state"><Users size={20} /><strong>No students yet</strong><span>Add a student to get started.</span></div>}
    </div>
  );
}

function ScheduleList({ events, onCancel, onEdit, limit }) {
  const visibleEvents = limit ? events.slice(0, limit) : events;
  if (!visibleEvents.length) return <div className="empty-state"><CalendarDays size={20} /><strong>No events scheduled</strong><span>Add an event to your campus calendar.</span></div>;
  return <div className="schedule-list">{visibleEvents.map((event, index) => <div className="schedule-item" key={event.id}>
    <span className="schedule-time">{formatTime(event.time)}</span><i className={`schedule-bar bar-${index % 4}`} />
    <div className="schedule-info"><div className="schedule-name">{event.title}</div><div className="schedule-detail"><MapPin size={11} />{event.location || "Location to be announced"}</div></div>
    <div style={{ display: "flex", gap: "4px", alignItems: "center" }}>
      {onEdit && <button className="quiet-icon" type="button" onClick={() => onEdit(event)} aria-label={`Edit ${event.title}`} title="Edit event"><Pencil size={13} /></button>}
      {!limit && onCancel && <button className="quiet-icon" type="button" onClick={() => onCancel(event.id)} aria-label={`Remove ${event.title}`}><X size={14} /></button>}
    </div>
  </div>)}</div>;
}

function AddModal({ type, onTypeChange, onClose, onCreate }) {
  const [form, setForm] = useState({ name: "", detail: "", secondary: "", program: "Undergraduate", date: localDate(), time: "09:00" });
  const nameRef = useRef(null);
  useEffect(() => { nameRef.current?.focus(); }, []);
  useEffect(() => {
    function handleEscape(event) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [onClose]);
  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }
  function changeType(nextType) {
    setForm((current) => ({ ...current, detail: "", secondary: "", program: "Undergraduate", date: localDate(), time: "09:00" }));
    onTypeChange(nextType);
  }
  function submit(event) {
    event.preventDefault();
    onCreate(type, form);
  }
  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <div className="modal-heading"><div><h2 id="modal-title">Add to your institution</h2><p>Dashboard records are saved in this browser and do not create student login accounts.</p></div><button className="icon-button" type="button" onClick={onClose} aria-label="Close dialog"><X size={16} /></button></div>
        <form onSubmit={submit}>
          <div className="form-grid">
            <label className="form-field"><span>What would you like to add?</span><select value={type} onChange={(event) => changeType(event.target.value)}><option>Student</option><option>Course</option><option>Campus event</option></select></label>
            <label className="form-field"><span>{type === "Campus event" ? "Event name" : `${type} name`}</span><input ref={nameRef} required maxLength={100} value={form.name} onChange={(event) => update("name", event.target.value)} placeholder={`Enter a ${type.toLowerCase()} name`} /></label>
            {type === "Student" && <>
              <label className="form-field"><span>Email address</span><input type="email" required value={form.detail} onChange={(event) => update("detail", event.target.value)} placeholder="student@example.com" /></label>
              <label className="form-field"><span>Program</span><select value={form.program} onChange={(event) => update("program", event.target.value)}><option>Undergraduate</option><option>Graduate</option><option>Arts &amp; Design</option><option>Continuing education</option></select></label>
            </>}
            {type === "Course" && <>
              <label className="form-field"><span>Course code</span><input required value={form.detail} onChange={(event) => update("detail", event.target.value)} placeholder="e.g. BIO 205" /></label>
              <label className="form-field"><span>Instructor</span><input value={form.secondary} onChange={(event) => update("secondary", event.target.value)} placeholder="Instructor name" /></label>
            </>}
            {type === "Campus event" && <>
              <label className="form-field"><span>Date</span><input type="date" required value={form.date} onChange={(event) => update("date", event.target.value)} /></label>
              <label className="form-field"><span>Time</span><input type="time" required value={form.time} onChange={(event) => update("time", event.target.value)} /></label>
              <label className="form-field full"><span>Location</span><input value={form.detail} onChange={(event) => update("detail", event.target.value)} placeholder="Building or room" /></label>
            </>}
          </div>
          <div className="modal-actions"><button className="button" type="button" onClick={onClose}>Cancel</button><button className="button primary" type="submit"><Plus size={15} />Create record</button></div>
        </form>
      </section>
    </div>
  );
}

function EditEventModal({ event, onClose, onSave, onDelete }) {
  const [title, setTitle] = useState(event.title || "");
  const [date, setDate] = useState(event.date || localDate());
  const [time, setTime] = useState(event.time || "09:00");
  const [location, setLocation] = useState(event.location || "");
  const [category, setCategory] = useState(event.category || "Campus event");

  function submit(e) {
    e.preventDefault();
    if (!title.trim()) return;
    onSave(event.id, {
      title: title.trim(),
      date,
      time,
      location: location.trim(),
      category,
    });
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <section className="modal" role="dialog" aria-modal="true">
        <div className="modal-heading">
          <div>
            <h2>Edit Campus Event</h2>
            <p>Update title, date, time, location, or category.</p>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Close dialog">
            <X size={16} />
          </button>
        </div>
        <form onSubmit={submit}>
          <div className="form-grid">
            <label className="form-field">
              <span>Event title *</span>
              <input required maxLength={100} value={title} onChange={(e) => setTitle(e.target.value)} />
            </label>
            <div className="form-grid-2">
              <label className="form-field">
                <span>Date</span>
                <input type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
              </label>
              <label className="form-field">
                <span>Time</span>
                <input type="time" required value={time} onChange={(e) => setTime(e.target.value)} />
              </label>
            </div>
            <label className="form-field">
              <span>Location / Venue</span>
              <input maxLength={100} value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Auditorium / Online" />
            </label>
            <label className="form-field">
              <span>Category</span>
              <select value={category} onChange={(e) => setCategory(e.target.value)}>
                <option>Campus event</option>
                <option>Academic deadline</option>
                <option>Faculty meeting</option>
                <option>Workshop / Seminar</option>
              </select>
            </label>
          </div>
          <div className="modal-actions" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "24px" }}>
            {onDelete ? (
              <button
                type="button"
                className="button danger-icon"
                style={{ color: "var(--red)", borderColor: "rgba(239, 68, 68, 0.3)" }}
                onClick={() => {
                  onDelete(event.id);
                  onClose();
                }}
              >
                Delete Event
              </button>
            ) : <div />}
            <div style={{ display: "flex", gap: "10px" }}>
              <button type="button" className="button" onClick={onClose}>Cancel</button>
              <button type="submit" className="button primary">Save Changes</button>
            </div>
          </div>
        </form>
      </section>
    </div>
  );
}

function getInitialAdminView() {
  try {
    const hash = window.location.hash.replace("#", "").toLowerCase();
    if (hash) {
      const match = NAV_ITEMS.find((item) => item.label && item.label.toLowerCase().replace(/[^a-z0-9]/g, "-") === hash);
      if (match) return match.label;
    }
    const saved = localStorage.getItem("admin_active_view");
    if (saved && NAV_ITEMS.some((item) => item.label === saved)) {
      return saved;
    }
  } catch {}
  return "Overview";
}

function App({ user, profile, supabase, onSignOut }) {
  const [data, setData] = useState(readSavedData);
  const [activeView, setActiveView] = useState(getInitialAdminView);
  const [query, setQuery] = useState("");
  const [addType, setAddType] = useState("Student");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState(null);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [toast, setToast] = useState("");
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [storageStats, setStorageStats] = useState(null);
  const [pendingDownloadsCount, setPendingDownloadsCount] = useState(0);
  const notificationRef = useRef(null);

  useEffect(() => {
    if (!supabase) return;
    const fetchTelemetry = () => {
      supabase.rpc("get_database_storage_stats").then(({ data, error }) => {
        if (!error && data) setStorageStats(data);
      });
      supabase
        .from("download_requests")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending")
        .then(({ count, error }) => {
          if (!error && typeof count === "number") setPendingDownloadsCount(count);
        });
    };

    fetchTelemetry();

    const channel = supabase
      .channel("app-telemetry-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "download_requests" }, () => fetchTelemetry())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, activeView]);
  const unreadCount = data.notifications.filter((item) => !item.read).length;
  const today = new Date();
  const dateLabel = new Intl.DateTimeFormat("en", { weekday: "long", year: "numeric", month: "long", day: "numeric" }).format(today);
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (error) {
      console.error("Could not save dashboard changes.", error);
      setToast("Changes could not be saved in this browser.");
    }
  }, [data]);

  useEffect(() => {
    function closePopover(event) {
      if (notificationRef.current && !notificationRef.current.contains(event.target)) setNotificationOpen(false);
    }
    document.addEventListener("mousedown", closePopover);
    return () => document.removeEventListener("mousedown", closePopover);
  }, []);

  const filteredStudents = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return data.students;
    return data.students.filter((student) => [student.name, student.email, student.program, student.course].some((value) => value.toLowerCase().includes(term)));
  }, [data.students, query]);
  const filteredCourses = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return data.courses;
    return data.courses.filter((course) => [course.name, course.code, course.department, course.instructor].some((value) => value.toLowerCase().includes(term)));
  }, [data.courses, query]);
  const filteredEvents = useMemo(() => {
    const term = query.trim().toLowerCase();
    const sorted = [...data.events].sort((a, b) => `${a.date || localDate()}${a.time}`.localeCompare(`${b.date || localDate()}${b.time}`));
    if (!term) return sorted;
    return sorted.filter((event) => [event.title, event.location, event.category].some((value) => value.toLowerCase().includes(term)));
  }, [data.events, query]);
  const searchLabel = {
    Overview: "Search students...",
    Students: "Search students...",
    Trainers: "Search trainers...",
    Courses: "Search courses...",
    Attendance: "Search students...",
    Tasks: "Search tasks...",
    Notes: "Search notes...",
    Reports: "Search reports...",
    Assignments: "Search assignments...",
    Tests: "Search tests...",
    Calendar: "Search events...",
    Messages: "Search student messages...",
  }[activeView];

  function changeView(view) {
    setActiveView(view);
    try {
      localStorage.setItem("admin_active_view", view);
      window.location.hash = view.toLowerCase().replace(/[^a-z0-9]/g, "-");
    } catch {}
    setQuery("");
    setMobileNavOpen(false);
    setNotificationOpen(false);
  }
  function openAdd(type = "Student") {
    setAddType(type);
    setModalOpen(true);
    setMobileNavOpen(false);
  }
  function addRecord(type, form) {
    const name = form.name.trim();
    if (!name) return;
    if (type === "Student") {
      const newStudent = {
        id: makeId("student"),
        createdByAdmin: true,
        createdAt: new Date().toISOString(),
        name,
        email: form.detail.trim(),
        program: form.program,
        course: "Not enrolled",
        checkIn: "—",
        status: "Absent",
      };
      setData((current) => ({ ...current, students: [newStudent, ...current.students] }));
    } else if (type === "Course") {
      setData((current) => ({ ...current, courses: [{ id: makeId("course"), createdByAdmin: true, createdAt: new Date().toISOString(), name, code: form.detail.trim().toUpperCase(), department: "New course", instructor: form.secondary.trim() || "Instructor to be assigned", students: 0, schedule: "Schedule to be announced", room: "Room to be announced" }, ...current.courses] }));
    } else {
      setData((current) => ({ ...current, events: [{ id: makeId("event"), createdByAdmin: true, createdAt: new Date().toISOString(), title: name, date: form.date, time: form.time, location: form.detail.trim() || "Location to be announced", category: "Campus event" }, ...current.events] }));
    }
    setModalOpen(false);
    setToast(`${type} “${name}” added successfully.`);
  }
  function updateAttendance(studentId, status) {
    setData((current) => ({ ...current, students: current.students.map((student) => student.id === studentId ? { ...student, status, checkIn: status === "Absent" ? "—" : student.checkIn === "—" ? formatTime(new Date().toTimeString().slice(0, 5)) : student.checkIn } : student) }));
    setToast("Attendance updated.");
  }
  function removeEvent(eventId) {
    setData((current) => ({ ...current, events: current.events.filter((event) => event.id !== eventId) }));
    setToast("Event removed from your calendar.");
  }
  function updateEvent(eventId, updated) {
    setData((current) => ({
      ...current,
      events: current.events.map((e) => (e.id === eventId ? { ...e, ...updated } : e)),
    }));
    setEditingEvent(null);
    setToast("Event updated successfully.");
  }
  function markAllRead() {
    setData((current) => ({ ...current, notifications: current.notifications.map((item) => ({ ...item, read: true })) }));
  }
  function markMessageRead(messageId) {
    setData((current) => ({ ...current, messages: current.messages.map((message) => message.id === messageId ? { ...message, read: true } : message) }));
  }
  function exportStudents() {
    downloadCsv("learnforge-students.csv", [["Name", "Email", "Program", "Course", "Check-in", "Attendance"], ...data.students.map((student) => [student.name, student.email, student.program, student.course, student.checkIn, student.status])]);
    setToast("Student report downloaded.");
  }
  function exportCourses() {
    downloadCsv("learnforge-courses.csv", [["Course", "Code", "Department", "Instructor", "Students", "Schedule", "Room"], ...data.courses.map((course) => [course.name, course.code, course.department, course.instructor, course.students, course.schedule, course.room])]);
    setToast("Course report downloaded.");
  }
  function exportOverview() {
    downloadCsv("learnforge-dashboard-report.csv", [["Record type", "Count"], ["Students", data.students.length], ["Courses", data.courses.length], ["Events", data.events.length]]);
    setToast("Your overview report has been downloaded.");
  }

  function headingAction(view = activeView) {
    if (view === "Students" || view === "Courses" || view === "Calendar") {
      const type = view === "Calendar" ? "Campus event" : view === "Courses" ? "Course" : "Student";
      return <button className="button primary" onClick={() => openAdd(type)}><Plus size={15} />Add {type === "Campus event" ? "event" : type.toLowerCase()}</button>;
    }
    if (view === "Reports") return <button className="button primary" onClick={exportOverview}><Download size={15} />Export overview</button>;
    if (view === "Attendance") return <button className="button" onClick={exportStudents}><Download size={15} />Export attendance</button>;
    return null;
  }

  function renderOverview() {
      const adminRecords = [
        ...data.students
          .filter((student) => student.createdByAdmin || student.id.startsWith("student-"))
          .map((student) => ({ id: student.id, type: "Student", name: student.name, detail: student.email, createdAt: student.createdAt })),
        ...data.courses
          .filter((course) => course.createdByAdmin || course.id.startsWith("course-"))
          .map((course) => ({ id: course.id, type: "Course", name: course.name, detail: course.code, createdAt: course.createdAt })),
        ...data.events
          .filter((event) => event.createdByAdmin || event.id.startsWith("event-"))
          .map((event) => ({ id: event.id, type: "Event", name: event.title, detail: event.location, createdAt: event.createdAt })),
      ].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
      return <>
        <PageHeading eyebrow={dateLabel} title="Admin overview" description="Only records added by an admin appear here." action={<button className="button primary" onClick={() => openAdd()}><Plus size={15} />Add new</button>} />
        <article className="card panel admin-records-panel">
          <div className="panel-heading"><div><h2>Added by admin</h2><p>{adminRecords.length} records</p></div></div>
          {adminRecords.length ? <div className="admin-record-list">{adminRecords.map((record) => {
            const Icon = record.type === "Student" ? GraduationCap : record.type === "Course" ? BookOpen : CalendarDays;
            return <div className="admin-record-row" key={`${record.type}-${record.id}`}>
              <span className="admin-record-icon"><Icon size={16} /></span>
              <span className="admin-record-copy"><strong>{record.name}</strong><small>{record.detail || "No details provided"}</small></span>
              <Badge tone={record.type === "Student" ? "green" : record.type === "Course" ? "blue" : "amber"}>{record.type}</Badge>
            </div>;
          })}</div> : <div className="empty-state"><Users size={20} /><strong>No admin-added records yet</strong><span>Use Add new to create a student, course, or event.</span></div>}
        </article>
      </>;
    }

  function renderStudents() {
    return <>
      <PageHeading eyebrow="People" title="Students" description={`${filteredStudents.length} students in your directory`} action={headingAction()} />
      <article className="card data-panel full-panel">
        <div className="panel-heading"><div><h2>Student directory</h2><p>Manage student profiles and enrollment details</p></div><button className="button" onClick={exportStudents}><Download size={15} />Export CSV</button></div>
        <StudentTable students={filteredStudents} searchable={false} />
      </article>
    </>;
  }

  function renderAttendance() {
    const presentCount = data.students.filter((student) => student.status === "Present").length;
    const lateCount = data.students.filter((student) => student.status === "Late").length;
    const absentCount = data.students.filter((student) => student.status === "Absent").length;
    return <>
      <PageHeading eyebrow="Academic operations" title="Attendance" description="Review and update today’s student check-ins." action={headingAction()} />
      <div className="attendance-summary">
        <div className="card summary-card"><span>Present</span><strong>{presentCount}</strong><i className="summary-indicator green" /></div>
        <div className="card summary-card"><span>Late</span><strong>{lateCount}</strong><i className="summary-indicator amber" /></div>
        <div className="card summary-card"><span>Absent</span><strong>{absentCount}</strong><i className="summary-indicator rose" /></div>
      </div>
      <article className="card data-panel full-panel">
        <div className="panel-heading"><div><h2>Today’s attendance</h2><p>Use the status menu to update a student’s check-in.</p></div><Badge tone="blue">{dateLabel}</Badge></div>
        <StudentTable students={filteredStudents} onStatusChange={updateAttendance} searchable={false} />
      </article>
    </>;
  }

  function renderCourses() {
    return <>
      <PageHeading eyebrow="Academic programs" title="Courses" description={`${filteredCourses.length} courses shown · Manage course schedules and enrollment.`} action={headingAction()} />
      {filteredCourses.length ? <section className="course-grid">{filteredCourses.map((course) => <article className="card course-card" key={course.id}>
        <div className="course-card-top"><span className="course-symbol"><BookOpen size={17} /></span><span className="course-code">{course.code}</span></div>
        <h2>{course.name}</h2><p className="course-department">{course.department}</p>
        <div className="course-meta"><span><GraduationCap size={14} />{course.instructor}</span><span><Users size={14} />{course.students} students</span><span><Clock3 size={14} />{course.schedule}</span></div>
        <div className="course-bottom"><span><MapPin size={13} />{course.room}</span><Badge tone="green">Active</Badge></div>
      </article>)}</section> : <div className="card empty-state"><BookOpen size={20} /><strong>No courses found</strong><span>Try a different search or add a course.</span></div>}
    </>;
  }

  function renderReports() {
    const reports = [
      { title: "Admin-added records", description: "Counts of student, course, and event records added from this dashboard.", icon: BarChart3, tone: "blue", download: exportOverview },
      { title: "Student directory", description: "Student contact details, program, course, and attendance.", icon: Users, tone: "green", download: exportStudents },
      { title: "Course catalog", description: "Course codes, departments, instructors, and schedules.", icon: BookOpen, tone: "amber", download: exportCourses },
    ].filter((report) => `${report.title} ${report.description}`.toLowerCase().includes(query.trim().toLowerCase()));
    return <>
      <PageHeading eyebrow="Insights & exports" title="Reports" description="Download up-to-date records for your institution." action={headingAction()} />
      {reports.length ? <section className="report-grid">{reports.map(({ title, description, icon: Icon, tone, download }) => <article className="card report-card" key={title}><span className={`report-icon ${tone}`}><Icon size={19} /></span><h2>{title}</h2><p>{description}</p><button className="button" onClick={download}><Download size={14} />Download CSV</button></article>)}</section> : <div className="card empty-state"><BarChart3 size={20} /><strong>No reports match your search</strong><span>Try a different search term.</span></div>}
      <article className="card report-note"><FileSpreadsheet size={19} /><div><strong>Reports are generated from your current dashboard data.</strong><p>New records and attendance updates are included automatically when you export.</p></div></article>
    </>;
  }

  function renderCalendar() {
    return <>
      <PageHeading eyebrow="Campus life" title="Calendar" description={`${filteredEvents.length} campus events and meetings.`} action={headingAction()} />
      <article className="card data-panel full-panel calendar-panel"><div className="panel-heading"><div><h2>Upcoming events</h2><p>Plan and manage what’s happening on campus.</p></div><span className="day-label">{dateLabel}</span></div>
        {filteredEvents.length ? <div className="event-list">{filteredEvents.map((event, index) => <div className="event-row" key={event.id}><div className={`event-date event-${index % 4}`}><strong>{new Date(`${event.date || localDate()}T12:00:00`).getDate()}</strong><span>{new Intl.DateTimeFormat("en", { month: "short" }).format(new Date(`${event.date || localDate()}T12:00:00`))}</span></div><div className="event-main"><h3>{event.title}</h3><span>{event.category}</span></div><div className="event-detail"><Clock3 size={14} />{formatTime(event.time)}</div><div className="event-detail"><MapPin size={14} />{event.location}</div><div style={{ display: "flex", gap: "6px", alignItems: "center" }}><button className="quiet-icon" type="button" onClick={() => setEditingEvent(event)} aria-label={`Edit ${event.title}`} title="Edit event"><Pencil size={14} /></button><button className="quiet-icon" type="button" onClick={() => removeEvent(event.id)} aria-label={`Remove ${event.title}`}><X size={15} /></button></div></div>)}</div> : <div className="empty-state"><CalendarDays size={20} /><strong>No events found</strong><span>Try a different search or add an event.</span></div>}
      </article>
    </>;
  }

  function renderMessages() {
    const term = query.trim().toLowerCase();
    const messages = data.messages.filter((message) => !term || [message.sender, message.subject, message.preview].some((value) => value.toLowerCase().includes(term)));
    return <>
      <PageHeading eyebrow="Community" title="Messages" description={`${data.messages.filter((message) => !message.read).length} unread messages`} />
      <article className="card data-panel full-panel"><div className="panel-heading"><div><h2>Inbox</h2><p>Updates from across your campus community</p></div><span className="day-label">{messages.length} messages</span></div>
        {messages.length ? <div className="message-list">{messages.map((message) => <button className={`message-row ${message.read ? "read" : ""}`} key={message.id} onClick={() => { markMessageRead(message.id); setToast(`Opened message: ${message.subject}`); }}><span className="message-avatar"><Mail size={16} /></span><span className="message-body"><strong>{message.sender}</strong><b>{message.subject}</b><span>{message.preview}</span></span><span className="message-time">{message.time}{!message.read && <i />}</span></button>)}</div> : <div className="empty-state"><Mail size={20} /><strong>No messages found</strong><span>Try a different search term.</span></div>}
      </article>
    </>;
  }

  function renderAdminPortalView() {
    return <AdminPortalView key={activeView} view={activeView} supabase={supabase} user={user} query={query} onToast={setToast} />;
  }
  function renderAdminManagementView() {
    return <AdminManagementView key={activeView} view={activeView} supabase={supabase} user={user} query={query} onToast={setToast} onNavigate={changeView} />;
  }
  function renderAdminDriveView() {
    return <AdminDriveView key={activeView} supabase={supabase} user={user} query={query} onToast={setToast} />;
  }
  function renderCodeLabView() {
    return (
      <>
        <PageHeading
          eyebrow="IT Practice Environment"
          title="Code Lab & Online Compiler"
          description="Practice and demonstrate Python, Java, C/C++, SQL, Data Analytics, React JSX, Web Dev, Unit Testing, and BI Visuals."
        />
        <Suspense fallback={<div className="card portal-loading">Loading IT Code Lab…</div>}>
          <OnlineCompiler roleLabel="Administrator" supabase={supabase} />
        </Suspense>
      </>
    );
  }
  function renderTrainerPortalView() {
    return (
      <TrainerPortal
        user={user}
        profile={profile}
        supabase={supabase}
        onSignOut={() => changeView("Overview")}
        onExitToAdmin={() => changeView("Overview")}
        isAdminPreview={true}
      />
    );
  }
  function renderStudentPortalView() {
    return (
      <StudentPortal
        user={user}
        profile={profile}
        supabase={supabase}
        onSignOut={() => changeView("Overview")}
        onExitToAdmin={() => changeView("Overview")}
        isAdminPreview={true}
      />
    );
  }

  const viewContent = {
    Overview: renderAdminManagementView,
    Students: renderAdminManagementView,
    Trainers: renderAdminManagementView,
    Courses: renderAdminManagementView,
    Syllabus: renderAdminManagementView,
    "Code Lab": renderCodeLabView,
    "Drive & Files": renderAdminDriveView,
    Attendance: renderAdminManagementView,
    Tasks: renderAdminManagementView,
    Notes: renderAdminManagementView,
    "Trainer Dashboard": renderTrainerPortalView,
    "Student Dashboard": renderStudentPortalView,
    Reports: renderReports,
    Calendar: renderCalendar,
    Assignments: renderAdminPortalView,
    Tests: renderAdminPortalView,
    Messages: supabase ? renderAdminPortalView : renderMessages,
  };

  if (activeView === "Trainer Dashboard") {
    return renderTrainerPortalView();
  }
  if (activeView === "Student Dashboard") {
    return renderStudentPortalView();
  }

  return (
    <div className="app-shell">
      {mobileNavOpen && <button className="mobile-backdrop" aria-label="Close navigation" onClick={() => setMobileNavOpen(false)} />}
      <aside className={`sidebar ${mobileNavOpen ? "mobile-open" : ""}`} aria-label="Main navigation">
        {mobileNavOpen && <button className="drawer-close icon-button" type="button" aria-label="Close navigation menu" onClick={() => setMobileNavOpen(false)}><X size={16} /></button>}
        <button className="brand" type="button" onClick={() => changeView("Overview")} aria-label="LearnForge home">
          <span className="brand-mark"><Sparkles size={21} /></span><span className="brand-copy"><strong>LearnForge</strong><small>Learning together</small></span>
        </button>
        <nav className="side-nav">
          {NAV_ITEMS.map((item) => item.group ? <div className="nav-label" key={item.group}>{item.group}</div> : <button className={`nav-link ${activeView === item.label ? "active" : ""}`} type="button" key={item.label} onClick={() => changeView(item.label)} aria-current={activeView === item.label ? "page" : undefined} title={item.label}>
            <item.icon className="nav-icon" size={18} /><span>{item.label}</span>
            {item.label === "Drive & Files" && pendingDownloadsCount > 0 && <span className="nav-count">{pendingDownloadsCount}</span>}
          </button>)}
        </nav>
        <div className="sidebar-spacer" />
        {storageStats && <div className="sidebar-storage-badge" title={`Database: ${storageStats.db_used_pretty} used of ${storageStats.db_quota_pretty}`}>
          <div className="storage-badge-top">
            <span><Database size={13} /> Available space</span>
            <strong>{storageStats.db_available_pretty}</strong>
          </div>
          <div className="storage-meter">
            <div className="storage-meter-fill" style={{ width: `${Math.max(2, storageStats.db_used_percent)}%` }} />
          </div>
        </div>}
        <div className="help-card"><span className="help-icon"><CircleAlert size={16} /></span><strong>Need a hand?</strong><p>Our support team is here to help you make the most of LearnForge.</p><a href="mailto:support@learnforge.example">Contact support <ArrowRight size={12} /></a></div>
        <div
          className="profile clickable"
          onClick={() => setProfileModalOpen(true)}
          role="button"
          tabIndex={0}
          title="Click to view profile, upload resume, feedback & settings"
          style={{ cursor: "pointer" }}
        >
          <span className="profile-avatar">{(profile?.full_name || "AM").split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase()}</span>
          <span className="profile-copy">
            <strong>{profile?.full_name || "Administrator"}</strong>
            <small>Admin · Profile &amp; Settings</small>
          </span>
        </div>
        <button className="signout-button" type="button" onClick={onSignOut} title="Sign out" aria-label="Sign out"><LogOut size={15} /><span>Sign out</span></button>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="topbar-left"><button className="mobile-menu icon-button" onClick={() => setMobileNavOpen((open) => !open)} aria-label="Toggle navigation"><Menu size={18} /></button><div className="breadcrumb">Workspace <span>/</span> <strong>{activeView}</strong></div></div>
          <div className="top-actions">
            <label className="search-box"><Search size={15} /><input type="search" aria-label={searchLabel} placeholder={searchLabel} value={query} onChange={(event) => setQuery(event.target.value)} /><kbd>⌘ K</kbd></label>
            <div className="notification-wrap" ref={notificationRef}>
              <button className="icon-button notification-button" type="button" aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ""}`} aria-expanded={notificationOpen} onClick={() => setNotificationOpen((open) => !open)}><Bell size={16} />{unreadCount > 0 && <span className="notification-dot" />}</button>
              {notificationOpen && <div className="notification-popover"><div className="popover-heading"><strong>Notifications</strong><button type="button" onClick={markAllRead} disabled={!unreadCount}>Mark all read</button></div>
                {data.notifications.map((item) => <div className={`notification-item ${item.read ? "read" : ""}`} key={item.id}><span className="notification-symbol"><Bell size={14} /></span><span><strong>{item.title}</strong><span>{item.body}</span><small>{item.time}</small></span>{!item.read && <i className="unread-dot" />}</div>)}
                {!data.notifications.length && <div className="empty-state">You’re all caught up.</div>}
              </div>}
            </div>
            <button
              type="button"
              className="top-avatar clickable"
              onClick={() => setProfileModalOpen(true)}
              title={`Profile & Settings: ${profile?.full_name || user?.email}`}
              style={{ cursor: "pointer", border: "none", padding: 0 }}
              aria-label="Open profile and settings"
            >
              {(profile?.full_name || "AM").split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase()}
            </button>
          </div>
        </header>

        <div className="content" key={activeView}>{(viewContent[activeView] || renderAdminManagementView)()}</div>
      </main>
      {modalOpen && <AddModal type={addType} onTypeChange={setAddType} onClose={() => setModalOpen(false)} onCreate={addRecord} />}
      {editingEvent && <EditEventModal event={editingEvent} onClose={() => setEditingEvent(null)} onSave={updateEvent} onDelete={removeEvent} />}
      {profileModalOpen && (
        <UserProfileModal
          user={user}
          profile={profile}
          supabase={supabase}
          isOpen={profileModalOpen}
          onClose={() => setProfileModalOpen(false)}
          onToast={setToast}
          onSignOut={onSignOut}
        />
      )}
      <Toast message={toast} onDismiss={() => setToast("")} />
    </div>
  );
}

export default App;
