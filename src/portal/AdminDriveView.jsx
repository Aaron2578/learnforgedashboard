import React, { useState, useEffect, useId } from "react";
import {
  HardDrive,
  Plus,
  Search,
  FileText,
  Upload,
  Link2,
  Lock,
  Unlock,
  Check,
  X,
  Trash2,
  Clock,
  Shield,
  Eye,
  Download,
  AlertCircle,
  ExternalLink,
  BookOpen,
  Filter,
  CheckCircle2,
  Pencil,
} from "lucide-react";
import SecureDocumentViewer from "../components/SecureDocumentViewer";
import EditMaterialModal from "../components/EditMaterialModal";

export default function AdminDriveView({ supabase, user, query = "", onToast }) {
  const [activeTab, setActiveTab] = useState("materials"); // 'materials' | 'requests'
  const [materials, setMaterials] = useState([]);
  const [courses, setCourses] = useState([]);
  const [downloadRequests, setDownloadRequests] = useState([]);
  const [students, setStudents] = useState({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingMaterial, setEditingMaterial] = useState(null);
  const [requestFilter, setRequestFilter] = useState("all"); // 'all' | 'pending' | 'approved' | 'revoked'

  // Secure viewer state
  const [viewingMaterial, setViewingMaterial] = useState(null);

  // New Material Form
  const [formSource, setFormSource] = useState("upload"); // 'upload' | 'drive'
  const [formTitle, setFormTitle] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formCategory, setFormCategory] = useState("PDF");
  const [formCourseId, setFormCourseId] = useState("");
  const [formDriveUrl, setFormDriveUrl] = useState("");
  const [selectedFile, setSelectedFile] = useState(null);

  useEffect(() => {
    loadData(true);
  }, []);

  useEffect(() => {
    if (!supabase) return;
    const channel = supabase
      .channel("admin-drive-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "download_requests" }, () => loadData(false))
      .on("postgres_changes", { event: "*", schema: "public", table: "course_materials" }, () => loadData(false))
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase]);

  async function loadData(forceLoading = false) {
    if (forceLoading || (!materials.length && !downloadRequests.length)) {
      setLoading(true);
    }
    setError("");

    try {
      const [materialsRes, coursesRes, requestsRes, profilesRes] = await Promise.all([
        supabase
          .from("course_materials")
          .select("*")
          .order("created_at", { ascending: false }),
        supabase
          .from("courses")
          .select("id, name, code")
          .order("name"),
        supabase
          .from("download_requests")
          .select("*")
          .order("requested_at", { ascending: false }),
        supabase
          .from("profiles")
          .select("id, full_name, email"),
      ]);

      if (materialsRes.error) throw materialsRes.error;
      if (coursesRes.error) throw coursesRes.error;
      if (requestsRes.error) throw requestsRes.error;
      if (profilesRes.error) throw profilesRes.error;

      setMaterials(materialsRes.data || []);
      setCourses(coursesRes.data || []);
      setDownloadRequests(requestsRes.data || []);
      setStudents(
        Object.fromEntries((profilesRes.data || []).map((p) => [p.id, p]))
      );
    } catch (err) {
      console.error("Error loading drive materials:", err);
      setError(err.message || "Could not load drive files.");
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateMaterial(e) {
    e.preventDefault();
    if (!formTitle.trim()) {
      setError("Please enter a title for the material.");
      return;
    }

    setBusy(true);
    setError("");

    try {
      let uploadedFilePath = null;
      let originalFileName = null;
      let fileSize = 0;
      let fileType = "application/pdf";

      if (formSource === "upload") {
        if (!selectedFile) {
          setError("Please select a file to upload.");
          setBusy(false);
          return;
        }

        originalFileName = selectedFile.name;
        fileSize = selectedFile.size;
        fileType = selectedFile.type || "application/pdf";
        const cleanName = selectedFile.name.replace(/[^a-zA-Z0-9.-]/g, "_");
        const path = `materials/${Date.now()}_${cleanName}`;

        const { error: uploadError } = await supabase.storage
          .from("course-materials")
          .upload(path, selectedFile, {
            contentType: fileType,
            upsert: false,
          });

        if (uploadError) {
          throw new Error(`Storage upload failed: ${uploadError.message}`);
        }

        uploadedFilePath = path;
      } else {
        if (!formDriveUrl.trim() || !/^https?:\/\//i.test(formDriveUrl.trim())) {
          setError("Please provide a valid Google Drive or document URL (starting with https://).");
          setBusy(false);
          return;
        }
      }

      const { error: insertError } = await supabase.from("course_materials").insert({
        title: formTitle.trim(),
        description: formDescription.trim(),
        category: formCategory,
        course_id: formCourseId || null,
        file_path: uploadedFilePath,
        file_name: originalFileName,
        file_size: fileSize,
        file_type: fileType,
        drive_url: formSource === "drive" ? formDriveUrl.trim() : null,
        created_by: user.id,
      });

      if (insertError) throw insertError;

      onToast("Material added successfully.");
      setShowAddModal(false);
      resetForm();
      await loadData();
    } catch (err) {
      console.error("Failed to add material:", err);
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function resetForm() {
    setFormTitle("");
    setFormDescription("");
    setFormCategory("PDF");
    setFormCourseId("");
    setFormDriveUrl("");
    setSelectedFile(null);
    setFormSource("upload");
  }

  async function handleDeleteMaterial(material) {
    if (!window.confirm(`Delete “${material.title}”? This will remove student access and cannot be undone.`)) {
      return;
    }

    setBusy(true);
    setError("");

    try {
      if (material.file_path) {
        await supabase.storage.from("course-materials").remove([material.file_path]);
      }

      const { error: deleteError } = await supabase
        .from("course_materials")
        .delete()
        .eq("id", material.id);

      if (deleteError) throw deleteError;

      onToast("Material deleted.");
      await loadData();
    } catch (err) {
      console.error("Delete error:", err);
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function updateMaterial(materialId, data) {
    setBusy(true);
    setError("");
    try {
      const { error: updateError } = await supabase
        .from("course_materials")
        .update({
          title: data.title.trim(),
          description: data.description.trim(),
          file_category: data.category,
          course_id: data.courseId || null,
          drive_url: data.driveUrl?.trim() || null,
        })
        .eq("id", materialId);

      if (updateError) throw updateError;

      onToast(`Material “${data.title}” updated successfully.`);
      setEditingMaterial(null);
      await loadData();
    } catch (err) {
      setError(`Could not update material: ${err.message}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleReviewRequest(requestId, newStatus, studentName) {
    setBusy(true);
    setError("");

    try {
      const { error: reviewError } = await supabase.rpc("review_download_request", {
        p_request_id: requestId,
        p_status: newStatus,
        p_notes: `Status set to ${newStatus} by admin on ${new Date().toLocaleDateString()}`,
      });

      if (reviewError) throw reviewError;

      const actionLabel =
        newStatus === "approved"
          ? `Download approved for ${studentName}.`
          : newStatus === "revoked"
          ? `Download access revoked for ${studentName}.`
          : `Request declined.`;

      onToast(actionLabel);
      await loadData();
    } catch (err) {
      console.error("Review request error:", err);
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleOpenViewer(material) {
    try {
      let previewUrl = material.drive_url;
      let downloadUrl = null;

      if (material.file_path) {
        const { data, error: signedUrlError } = await supabase.storage
          .from("course-materials")
          .createSignedUrl(material.file_path, 3600); // 1 hour

        if (signedUrlError) throw signedUrlError;
        previewUrl = data.signedUrl;
        downloadUrl = data.signedUrl;
      }

      setViewingMaterial({
        title: material.title,
        subtitle: material.category + (material.course_id ? ` · ${courses.find((c) => c.id === material.course_id)?.code || ""}` : " · Campus-wide"),
        url: previewUrl,
        directDownloadUrl: downloadUrl,
      });
    } catch (err) {
      setError(`Could not open file preview: ${err.message}`);
    }
  }

  // Filtered materials
  const term = query.trim().toLowerCase();
  const filteredMaterials = materials.filter((m) => {
    if (!term) return true;
    const course = courses.find((c) => c.id === m.course_id);
    return (
      m.title.toLowerCase().includes(term) ||
      m.description?.toLowerCase().includes(term) ||
      m.category.toLowerCase().includes(term) ||
      course?.name.toLowerCase().includes(term) ||
      course?.code.toLowerCase().includes(term)
    );
  });

  // Filtered requests
  const pendingRequestsCount = downloadRequests.filter((r) => r.status === "pending").length;
  const filteredRequests = downloadRequests.filter((r) => {
    if (requestFilter !== "all" && r.status !== requestFilter) return false;
    if (!term) return true;
    const student = students[r.student_id];
    const material = materials.find((m) => m.id === r.material_id);
    return (
      student?.full_name?.toLowerCase().includes(term) ||
      student?.email?.toLowerCase().includes(term) ||
      material?.title.toLowerCase().includes(term) ||
      r.reason?.toLowerCase().includes(term)
    );
  });

  return (
    <div className="admin-drive-view">
      <div className="page-heading">
        <div>
          <div className="eyebrow">Cloud Drive &amp; Files</div>
          <h1>Drive Materials &amp; Download Control</h1>
          <p>
            Upload PDFs, tests, and Google Drive links. By default, students can only view documents inside the dashboard. Approve or revoke per-student download requests at any time.
          </p>
        </div>
        <div className="heading-actions">
          <button
            className="button primary"
            type="button"
            onClick={() => setShowAddModal(true)}
          >
            <Plus size={15} />
            <span>Add PDF / Drive Material</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="portal-alert error" role="alert">
          {error}
          <button type="button" onClick={() => setError("")}>Dismiss</button>
        </div>
      )}

      {/* Tabs navigation */}
      <div className="portal-tabs" role="tablist">
        <button
          className={`portal-tab ${activeTab === "materials" ? "active" : ""}`}
          type="button"
          role="tab"
          aria-selected={activeTab === "materials"}
          onClick={() => setActiveTab("materials")}
        >
          <HardDrive size={15} />
          <span>Files &amp; Drive Materials ({materials.length})</span>
        </button>

        <button
          className={`portal-tab ${activeTab === "requests" ? "active" : ""}`}
          type="button"
          role="tab"
          aria-selected={activeTab === "requests"}
          onClick={() => setActiveTab("requests")}
        >
          <Lock size={15} />
          <span>Student Download Requests</span>
          {pendingRequestsCount > 0 && (
            <span className="nav-count">{pendingRequestsCount}</span>
          )}
        </button>
      </div>

      {loading ? (
        <div className="card portal-loading">Loading secure drive materials…</div>
      ) : activeTab === "materials" ? (
        <section className="admin-materials-section">
          {filteredMaterials.length ? (
            <div className="materials-grid">
              {filteredMaterials.map((item) => {
                const course = courses.find((c) => c.id === item.course_id);
                const isDrive = !!item.drive_url;
                const requestCount = downloadRequests.filter((r) => r.material_id === item.id).length;

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
                    {item.description && (
                      <p className="material-desc">{item.description}</p>
                    )}

                    <div className="material-meta">
                      <span>
                        <Shield size={12} />
                        View-only in dashboard
                      </span>
                      {item.file_size > 0 && (
                        <span>{(item.file_size / (1024 * 1024)).toFixed(1)} MB</span>
                      )}
                      {requestCount > 0 && (
                        <span className="material-requests-pill">
                          <Lock size={12} /> {requestCount} request{requestCount === 1 ? "" : "s"}
                        </span>
                      )}
                    </div>

                    <div className="material-actions">
                      <button
                        className="button primary material-preview-btn"
                        type="button"
                        onClick={() => handleOpenViewer(item)}
                      >
                        <Eye size={14} />
                        <span>Preview in Dashboard</span>
                      </button>

                      <button
                        className="button compact"
                        type="button"
                        onClick={() => setEditingMaterial(item)}
                        title="Edit material details"
                      >
                        <Pencil size={13} />
                        <span>Edit</span>
                      </button>

                      <button
                        className="quiet-icon danger-icon"
                        type="button"
                        aria-label={`Delete ${item.title}`}
                        title="Delete material"
                        disabled={busy}
                        onClick={() => handleDeleteMaterial(item)}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="card portal-empty">
              <HardDrive size={24} />
              <strong>No materials found</strong>
              <span>
                {materials.length
                  ? "Try a different search term."
                  : "Upload a PDF or add a Google Drive link to make it securely viewable in the student dashboard."}
              </span>
            </div>
          )}
        </section>
      ) : (
        /* Requests Management Tab */
        <section className="admin-requests-section">
          <div className="student-admin-toolbar">
            <div className="form-actions" role="group" aria-label="Filter download requests">
              {[
                ["all", "All Requests"],
                ["pending", "Pending Approval"],
                ["approved", "Approved"],
                ["revoked", "Revoked"],
              ].map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  className={`button ${requestFilter === key ? "primary" : ""}`}
                  onClick={() => setRequestFilter(key)}
                >
                  {label}
                  {key === "pending" && pendingRequestsCount > 0 ? ` (${pendingRequestsCount})` : ""}
                </button>
              ))}
            </div>
          </div>

          {filteredRequests.length ? (
            <div className="requests-table-container">
              <table className="requests-table">
                <thead>
                  <tr>
                    <th>STUDENT</th>
                    <th>MATERIAL / FILE</th>
                    <th>STUDENT REASON</th>
                    <th>DATE REQUESTED</th>
                    <th>STATUS</th>
                    <th>ACTION / ACCESS CONTROL</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRequests.map((req) => {
                    const student = students[req.student_id];
                    const material = materials.find((m) => m.id === req.material_id);
                    const studentInitial = (student?.full_name || student?.email || "S").slice(0, 1).toUpperCase();

                    return (
                      <tr key={req.id}>
                        <td>
                          <div className="admin-student">
                            <span className="student-avatar">{studentInitial}</span>
                            <span>
                              <strong>{student?.full_name || "Student"}</strong>
                              <small>{student?.email}</small>
                            </span>
                          </div>
                        </td>

                        <td>
                          <strong>{material?.title || "Course Material"}</strong>
                          <br />
                          <small className="muted">{material?.category || "File"}</small>
                        </td>

                        <td>
                          <span className="request-reason-text">
                            {req.reason || "—"}
                          </span>
                        </td>

                        <td>
                          <small>
                            {new Intl.DateTimeFormat("en", {
                              dateStyle: "medium",
                              timeStyle: "short",
                            }).format(new Date(req.requested_at))}
                          </small>
                        </td>

                        <td>
                          <span className={`portal-status ${req.status}`}>
                            {req.status === "approved"
                              ? "Approved"
                              : req.status === "revoked"
                              ? "Revoked"
                              : req.status === "rejected"
                              ? "Declined"
                              : "Pending Approval"}
                          </span>
                        </td>

                        <td>
                          <div className="request-action-buttons">
                            {req.status === "pending" ? (
                              <>
                                <button
                                  className="button primary compact"
                                  type="button"
                                  disabled={busy}
                                  onClick={() =>
                                    handleReviewRequest(req.id, "approved", student?.full_name || student?.email)
                                  }
                                >
                                  <Check size={13} /> Approve
                                </button>
                                <button
                                  className="button compact"
                                  type="button"
                                  disabled={busy}
                                  onClick={() =>
                                    handleReviewRequest(req.id, "rejected", student?.full_name || student?.email)
                                  }
                                >
                                  Decline
                                </button>
                              </>
                            ) : req.status === "approved" ? (
                              <button
                                className="button danger-outline compact"
                                type="button"
                                disabled={busy}
                                title="Instantly revoke download permission from this student"
                                onClick={() =>
                                  handleReviewRequest(req.id, "revoked", student?.full_name || student?.email)
                                }
                              >
                                <Lock size={13} /> Revoke Access
                              </button>
                            ) : (
                              <button
                                className="button compact"
                                type="button"
                                disabled={busy}
                                onClick={() =>
                                  handleReviewRequest(req.id, "approved", student?.full_name || student?.email)
                                }
                              >
                                <Unlock size={13} /> Grant Access
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="card portal-empty">
              <Lock size={22} />
              <strong>No download requests match this filter</strong>
              <span>When students request permission to download a file, their request will appear here for your approval.</span>
            </div>
          )}
        </section>
      )}

      {/* Add PDF / Drive Material Modal */}
      {showAddModal && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-card">
            <div className="modal-header">
              <div>
                <h2>Add Material or Drive Link</h2>
                <p>Upload a PDF document or connect a Google Drive / Docs / Test link.</p>
              </div>
              <button
                className="quiet-icon"
                type="button"
                onClick={() => {
                  setShowAddModal(false);
                  resetForm();
                }}
                aria-label="Close modal"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleCreateMaterial}>
              {/* Source Switch: File Upload vs Google Drive URL */}
              <div className="source-toggle-tabs" role="group">
                <button
                  type="button"
                  className={`source-toggle-btn ${formSource === "upload" ? "active" : ""}`}
                  onClick={() => setFormSource("upload")}
                >
                  <Upload size={14} />
                  <span>Upload PDF / File</span>
                </button>
                <button
                  type="button"
                  className={`source-toggle-btn ${formSource === "drive" ? "active" : ""}`}
                  onClick={() => setFormSource("drive")}
                >
                  <Link2 size={14} />
                  <span>Google Drive / Link</span>
                </button>
              </div>

              <label className="form-field">
                <span>Document / Material Title *</span>
                <input
                  type="text"
                  required
                  maxLength={180}
                  placeholder="e.g. Calculus Chapter 4 Notes, Midterm Practice Test"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                />
              </label>

              <div className="form-row-2">
                <label className="form-field">
                  <span>Category</span>
                  <select
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value)}
                  >
                    <option value="PDF">PDF</option>
                    <option value="Document">Document</option>
                    <option value="Test / Assessment">Test / Assessment</option>
                    <option value="Lecture Notes">Lecture Notes</option>
                    <option value="Study Guide">Study Guide</option>
                    <option value="Other">Other</option>
                  </select>
                </label>

                <label className="form-field">
                  <span>Course Enrollment</span>
                  <select
                    value={formCourseId}
                    onChange={(e) => setFormCourseId(e.target.value)}
                  >
                    <option value="">Campus-wide (All Students)</option>
                    {courses.map((course) => (
                      <option key={course.id} value={course.id}>
                        {course.code} — {course.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {formSource === "upload" ? (
                <label className="form-field">
                  <span>Upload PDF or Document File *</span>
                  <input
                    type="file"
                    required
                    accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt"
                    onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                  />
                  <small className="muted">
                    Supports PDFs and Office documents (up to 50 MB). Files are stored securely and protected from unauthorized direct download.
                  </small>
                </label>
              ) : (
                <label className="form-field">
                  <span>Google Drive / Docs / Form Test Link *</span>
                  <input
                    type="url"
                    required
                    placeholder="https://drive.google.com/file/d/.../view or https://docs.google.com/..."
                    value={formDriveUrl}
                    onChange={(e) => setFormDriveUrl(e.target.value)}
                  />
                  <small className="muted" style={{ display: "block", marginTop: "6px" }}>
                    Paste any Google Drive file link, Google Doc, or Google Forms test link. TM Dashboard will automatically convert it into a protected in-dashboard embed!
                  </small>
                  <div style={{ marginTop: "8px", padding: "8px 12px", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "8px", fontSize: "12px", color: "#166534", lineHeight: "1.5" }}>
                    💡 <strong>Important for Google Drive:</strong> In Google Drive, right-click your file → <strong>Share</strong> → set <em>General access</em> to <strong>"Anyone with the link" (Viewer)</strong>. This allows students to view it seamlessly without Google's "Can't access your Google Account" cookie barrier.
                  </div>
                </label>
              )}

              <label className="form-field">
                <span>Description or Study Instructions (optional)</span>
                <textarea
                  rows={3}
                  maxLength={500}
                  placeholder="Instructions for students when reviewing this material..."
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                />
              </label>

              <div className="security-notice-callout">
                <Shield size={15} />
                <span>
                  <strong>Student Protection Active:</strong> Students will only be able to view this file inside the dashboard. To download, students must submit a request and wait for your individual approval.
                </span>
              </div>

              <div className="form-actions">
                <button
                  className="button"
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setShowAddModal(false);
                    resetForm();
                  }}
                >
                  Cancel
                </button>
                <button className="button primary" type="submit" disabled={busy}>
                  {busy ? "Saving to Drive…" : "Save Material"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* In-Dashboard Secure Document Viewer Modal */}
      {viewingMaterial && (
        <SecureDocumentViewer
          title={viewingMaterial.title}
          subtitle={viewingMaterial.subtitle}
          url={viewingMaterial.url}
          directDownloadUrl={viewingMaterial.directDownloadUrl}
          userEmail={user.email}
          isSuperuser={true}
          onDownload={() => {
            if (viewingMaterial.directDownloadUrl) {
              window.open(viewingMaterial.directDownloadUrl, "_blank");
            } else if (viewingMaterial.url) {
              window.open(viewingMaterial.url, "_blank");
            }
          }}
          onClose={() => setViewingMaterial(null)}
        />
      )}

      {editingMaterial && (
        <EditMaterialModal
          material={editingMaterial}
          courses={courses}
          onClose={() => setEditingMaterial(null)}
          onSave={updateMaterial}
          onDelete={handleDeleteMaterial}
        />
      )}
    </div>
  );
}

