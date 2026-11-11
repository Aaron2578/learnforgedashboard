import React, { useState, useEffect, useMemo, useCallback, useId } from "react";
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
  Users,
  GraduationCap,
  Copy,
  ShieldCheck,
} from "lucide-react";
import SecureDocumentViewer from "../components/SecureDocumentViewer";
import EditMaterialModal from "../components/EditMaterialModal";
import AssignMaterialModal from "../components/AssignMaterialModal";
import { getDriveDocTypeLabel } from "../lib/driveUtils.js";
import { cleanAllFileStorage } from "../lib/storageCleanup.js";

export default function AdminDriveView({ supabase, user, query = "", onToast }) {
  const [activeTab, setActiveTab] = useState("materials"); // 'materials' | 'student_uploads' | 'requests'
  const [materials, setMaterials] = useState([]);
  const [studentUploads, setStudentUploads] = useState([]);
  const [assignmentsList, setAssignmentsList] = useState([]);
  const [courses, setCourses] = useState([]);
  const [downloadRequests, setDownloadRequests] = useState([]);
  const [students, setStudents] = useState({});
  const [enrollments, setEnrollments] = useState([]);
  const [materialRecipients, setMaterialRecipients] = useState([]);
  const [studentNotes, setStudentNotes] = useState([]);
  const [studentsList, setStudentsList] = useState([]);
  const [formSelectedStudentIds, setFormSelectedStudentIds] = useState([]);
  const [formStudentSearch, setFormStudentSearch] = useState("");
  const [recipientOption, setRecipientOption] = useState("all_enrolled");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingMaterial, setEditingMaterial] = useState(null);
  const [assigningMaterial, setAssigningMaterial] = useState(null);
  const [selectedSubjectFilter, setSelectedSubjectFilter] = useState("all");
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState("all");
  const [requestFilter, setRequestFilter] = useState("all"); // 'all' | 'pending' | 'approved' | 'revoked'

  // Secure viewer state
  const [viewingMaterial, setViewingMaterial] = useState(null);

  // New Material Form
  const [formSource, setFormSource] = useState("upload"); // 'upload' | 'drive'
  const [formTitle, setFormTitle] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formCategory, setFormCategory] = useState("Class Notes");
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
      .on("postgres_changes", { event: "*", schema: "public", table: "material_recipients" }, () => loadData(false))
      .on("postgres_changes", { event: "*", schema: "public", table: "student_notes" }, () => loadData(false))
      .on("postgres_changes", { event: "*", schema: "public", table: "course_enrollments" }, () => loadData(false))
      .on("postgres_changes", { event: "*", schema: "public", table: "assignment_submissions" }, () => loadData(false))
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
      const [materialsRes, coursesRes, requestsRes, profilesRes, enrollmentsRes, materialRecipientsRes, studentNotesRes, studentUploadsRes, assignmentsRes] = await Promise.all([
        supabase
          .from("course_materials")
          .select("*")
          .order("created_at", { ascending: false }),
        supabase
          .from("courses")
          .select("id, name, code, department")
          .order("code"),
        supabase
          .from("download_requests")
          .select("*")
          .order("requested_at", { ascending: false }),
        supabase
          .from("profiles")
          .select("id, full_name, email, role, is_approved, timing")
          .order("full_name"),
        supabase
          .from("course_enrollments")
          .select("id, course_id, student_id"),
        supabase
          .from("material_recipients")
          .select("material_id, student_id")
          .then((r) => r.error ? { data: [] } : r),
        supabase
          .from("student_notes")
          .select("id, student_id, course_id, title, body, material_id, drive_url")
          .then(async (r) => {
            if (r.error && (r.error.message?.includes("drive_url") || r.error.message?.includes("material_id") || r.error.code === "PGRST204" || r.error.code === "42703")) {
              const fb = await supabase.from("student_notes").select("id, student_id, course_id, title, body");
              return fb.error ? { data: [] } : fb;
            }
            return r.error ? { data: [] } : r;
          }),
        supabase
          .from("assignment_submissions")
          .select("id, assignment_id, student_id, file_path, submission_type, submission_link, submitted_at, grade, answer_text")
          .not("file_path", "is", null)
          .order("submitted_at", { ascending: false })
          .then((r) => r.error ? { data: [] } : r),
        supabase
          .from("assignments")
          .select("id, title, course_id")
          .then((r) => r.error ? { data: [] } : r),
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
      const approvedStudents = (profilesRes.data || []).filter((p) => p.role === "student" && p.is_approved !== false);
      setStudentsList(approvedStudents);
      setEnrollments(enrollmentsRes?.data || []);
      setMaterialRecipients(materialRecipientsRes?.data || []);
      setStudentNotes(studentNotesRes?.data || []);
      setStudentUploads(studentUploadsRes?.data || []);
      setAssignmentsList(assignmentsRes?.data || []);
    } catch (err) {
      console.error("Error loading drive materials:", err);
      setError(err.message || "Could not load drive files.");
    } finally {
      setLoading(false);
    }
  }

  function readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error("Failed to read file into memory."));
      reader.readAsDataURL(file);
    });
  }

  async function uploadFileToSupabase(file) {
    const cleanName = file.name.replace(/[^a-zA-Z0-9.-]/g, "_");
    const path = `materials/${Date.now()}_${cleanName}`;
    const contentType = file.type || "application/pdf";

    // 1. Try uploading to 'course-materials' bucket
    try {
      const { error: err1 } = await supabase.storage
        .from("course-materials")
        .upload(path, file, { contentType, upsert: false });
      if (!err1) {
        return { path: `course-materials:${path}`, size: file.size, type: contentType, name: file.name };
      }
      console.warn("Storage upload to 'course-materials' failed, trying fallback:", err1.message);
    } catch (e) {
      console.warn("course-materials bucket error:", e);
    }

    // 2. Try uploading to 'assignment-files' bucket
    try {
      const { error: err2 } = await supabase.storage
        .from("assignment-files")
        .upload(path, file, { contentType, upsert: false });
      if (!err2) {
        return { path: `assignment-files:${path}`, size: file.size, type: contentType, name: file.name };
      }
      console.warn("Storage upload to 'assignment-files' failed:", err2.message);
    } catch (e) {
      console.warn("assignment-files bucket error:", e);
    }

    // 3. Fallback: If file <= 12MB, store directly as Base64 Data URL so upload never fails
    if (file.size <= 12 * 1024 * 1024) {
      const dataUrl = await readFileAsDataURL(file);
      return { path: dataUrl, size: file.size, type: contentType, name: file.name };
    }

    throw new Error("File could not be uploaded to cloud storage. Please ensure the 'course-materials' storage bucket is enabled or use a Google Drive link.");
  }

  async function resolveMaterialUrl(filePath) {
    if (!filePath) return null;
    if (filePath.startsWith("data:") || filePath.startsWith("http")) {
      return filePath;
    }

    let bucket = "course-materials";
    let cleanPath = filePath;
    if (filePath.startsWith("course-materials:")) {
      cleanPath = filePath.replace("course-materials:", "");
    } else if (filePath.startsWith("assignment-files:")) {
      bucket = "assignment-files";
      cleanPath = filePath.replace("assignment-files:", "");
    }

    try {
      const { data, error } = await supabase.storage.from(bucket).createSignedUrl(cleanPath, 3600);
      if (!error && data?.signedUrl) return data.signedUrl;
    } catch {}

    const otherBucket = bucket === "course-materials" ? "assignment-files" : "course-materials";
    try {
      const { data, error } = await supabase.storage.from(otherBucket).createSignedUrl(cleanPath, 3600);
      if (!error && data?.signedUrl) return data.signedUrl;
    } catch {}

    return null;
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
      let cleanDriveUrl = null;

      if (formSource === "upload") {
        if (!selectedFile) {
          setError("Please select a file to upload.");
          setBusy(false);
          return;
        }

        const uploaded = await uploadFileToSupabase(selectedFile);
        uploadedFilePath = uploaded.path;
        originalFileName = uploaded.name;
        fileSize = uploaded.size;
        fileType = uploaded.type;
      } else {
        let rawUrl = formDriveUrl.trim();
        if (!rawUrl) {
          setError("Please provide a Google Drive or document link.");
          setBusy(false);
          return;
        }

        // Auto-fix URL if missing protocol
        if (!/^https?:\/\//i.test(rawUrl)) {
          rawUrl = `https://${rawUrl}`;
        }

        try {
          new URL(rawUrl);
        } catch {
          setError("Please provide a valid web link or Google Drive URL.");
          setBusy(false);
          return;
        }

        cleanDriveUrl = rawUrl;
      }

      const { data: insertedMat, error: insertError } = await supabase.from("course_materials").insert({
        title: formTitle.trim(),
        description: formDescription.trim(),
        category: formCategory,
        course_id: formCourseId || null,
        file_path: uploadedFilePath,
        file_name: originalFileName,
        file_size: fileSize,
        file_type: fileType,
        drive_url: cleanDriveUrl,
        created_by: user?.id || null,
      }).select().single();

      if (insertError) throw insertError;

      const courseObj = courses.find((c) => c.id === formCourseId);
      const subjectLabel = courseObj ? `${courseObj.code}` : "Campus-wide";

      onToast(`"${formTitle.trim()}" uploaded once for ${subjectLabel}! You can now assign it to students separately.`);
      setShowAddModal(false);
      resetForm();
      await loadData();

      // Immediately open student assignment modal so admin can pick students one by one
      if (insertedMat) {
        setAssigningMaterial(insertedMat);
      }
    } catch (err) {
      console.error("Failed to add material:", err);
      setError(err.message || "Failed to add material.");
    } finally {
      setBusy(false);
    }
  }

  const getAssignedStudentsForMaterial = useCallback((mat) => {
    if (!mat?.id) return [];
    const studentIdSet = new Set();
    const cleanTitle = (mat.title || "").trim().toLowerCase();
    const cleanDrive = (mat.drive_url || "").trim().toLowerCase();

    // 1. From materialRecipients table
    for (const mr of (materialRecipients || [])) {
      if (mr?.material_id === mat.id && mr?.student_id) {
        studentIdSet.add(mr.student_id);
      }
    }

    // 2. From studentNotes table
    for (const sn of (studentNotes || [])) {
      if (!sn?.student_id) continue;
      const snTitle = (sn.title || "").trim().toLowerCase();
      const snDrive = (sn.drive_url || "").trim().toLowerCase();
      const snBody = (sn.body || "").toLowerCase();

      const matchesMaterialId = sn.material_id && sn.material_id === mat.id;
      const matchesTitle = cleanTitle && snTitle === cleanTitle;
      const matchesDriveUrl = cleanDrive && (snDrive === cleanDrive || snBody.includes(cleanDrive));

      if (matchesMaterialId || matchesTitle || matchesDriveUrl) {
        studentIdSet.add(sn.student_id);
      }
    }

    return Array.from(studentIdSet)
      .map((sid) => students[sid])
      .filter(Boolean);
  }, [materialRecipients, studentNotes, students]);

  async function handleAssignStudent(material, studentId) {
    try {
      // 1. Optimistically update local state immediately so UI updates with 0 lag
      setMaterialRecipients((prev) => [
        ...prev.filter((mr) => !(mr.material_id === material.id && mr.student_id === studentId)),
        { material_id: material.id, student_id: studentId },
      ]);
      setStudentNotes((prev) => [
        ...prev.filter((sn) => !(sn.material_id === material.id && sn.student_id === studentId)),
        {
          id: `temp-${Date.now()}`,
          student_id: studentId,
          course_id: material.course_id || null,
          title: material.title,
          material_id: material.id,
          drive_url: material.drive_url || null,
        },
      ]);

      // 2. Insert into material_recipients (safely, won't break if table doesn't exist)
      try {
        await supabase.from("material_recipients").upsert(
          { material_id: material.id, student_id: studentId },
          { onConflict: "material_id,student_id" }
        );
      } catch (mrErr) {
        console.warn("material_recipients upsert note:", mrErr);
      }

      // 3. Always mirror to student_notes so student sees it in their portal
      try {
        const bodyWithDrive = material.drive_url
          ? `${material.description || ""}\n\nDrive Link: ${material.drive_url}`.trim()
          : (material.description || `Course study material: ${material.title}`);

        let { error: insertErr } = await supabase.from("student_notes").insert({
          student_id: studentId,
          course_id: material.course_id || null,
          title: material.title,
          body: bodyWithDrive,
          drive_url: material.drive_url || null,
          material_id: material.id,
          created_by: user?.id || null,
        });

        if (insertErr) {
          await supabase.from("student_notes").insert({
            student_id: studentId,
            course_id: material.course_id || null,
            title: material.title,
            body: bodyWithDrive,
            created_by: user?.id || null,
          });
        }
      } catch (snErr) {
        console.warn("student_notes insert note:", snErr);
      }

      const studentName = students[studentId]?.full_name || students[studentId]?.email || "Student";
      onToast(`✓ Assigned: Access to "${material.title}" granted to ${studentName}!`);
      await loadData(false);
    } catch (err) {
      console.error("Assign error:", err);
      setError(`Could not assign material: ${err.message}`);
    }
  }

  async function handleRevokeStudent(material, studentId) {
    try {
      // 1. Optimistically update local state immediately
      setMaterialRecipients((prev) =>
        prev.filter((mr) => !(mr.material_id === material.id && mr.student_id === studentId))
      );
      setStudentNotes((prev) =>
        prev.filter(
          (sn) =>
            !(
              sn.student_id === studentId &&
              (sn.material_id === material.id ||
                sn.title?.trim().toLowerCase() === material.title?.trim().toLowerCase())
            )
        )
      );

      // 2. Delete from material_recipients
      try {
        await supabase
          .from("material_recipients")
          .delete()
          .eq("material_id", material.id)
          .eq("student_id", studentId);
      } catch (mrErr) {
        console.warn("material_recipients delete note:", mrErr);
      }

      // 3. Delete from student_notes by material_id and by title
      try {
        await supabase
          .from("student_notes")
          .delete()
          .eq("student_id", studentId)
          .eq("material_id", material.id);
      } catch (snErr) {
        console.warn("student_notes delete note:", snErr);
      }

      try {
        await supabase
          .from("student_notes")
          .delete()
          .eq("student_id", studentId)
          .eq("title", material.title);
      } catch (snErr2) {
        console.warn("student_notes delete by title note:", snErr2);
      }

      const studentName = students[studentId]?.full_name || students[studentId]?.email || "Student";
      onToast(`Access revoked from ${studentName}.`);
      await loadData(false);
    } catch (err) {
      console.error("Revoke error:", err);
      setError(`Could not revoke material: ${err.message}`);
    }
  }

  function resetForm() {
    setFormTitle("");
    setFormDescription("");
    setFormCategory("Class Notes");
    setFormCourseId("");
    setFormDriveUrl("");
    setSelectedFile(null);
    setFormSource("upload");
    setFormSelectedStudentIds([]);
    setFormStudentSearch("");
    setRecipientOption("all_enrolled");
  }

  async function handleDeleteMaterial(material) {
    if (!window.confirm(`Delete “${material.title}”? This will remove student access and cannot be undone.`)) {
      return;
    }

    setBusy(true);
    setError("");

    try {
      if (material.file_path && !material.file_path.startsWith("data:")) {
        let bucket = "course-materials";
        let cleanPath = material.file_path;
        if (material.file_path.startsWith("course-materials:")) {
          cleanPath = material.file_path.replace("course-materials:", "");
        } else if (material.file_path.startsWith("assignment-files:")) {
          bucket = "assignment-files";
          cleanPath = material.file_path.replace("assignment-files:", "");
        }
        await supabase.storage.from(bucket).remove([cleanPath]);
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

  async function handleCleanFileStorage() {
    if (!window.confirm("Are you sure you want to clear and purge all attached files from database storage? This will delete stored files from cloud storage and reset attached file paths to 0 bytes.")) {
      return;
    }
    setBusy(true);
    setError("");
    try {
      await cleanAllFileStorage(supabase);
      onToast("Database file storage cleaned successfully! File attached storage is now 0 bytes.");
      await loadData();
    } catch (err) {
      setError("Failed to clean file storage: " + err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteStudentUpload(submission) {
    if (!submission?.file_path) return;
    if (!window.confirm("Manually delete this student's uploaded file? The file will be permanently removed from cloud storage.")) {
      return;
    }
    setBusy(true);
    setError("");
    try {
      let cleanPath = submission.file_path;
      if (cleanPath.startsWith("assignment-files:")) {
        cleanPath = cleanPath.replace("assignment-files:", "");
      }
      try {
        await supabase.storage.from("assignment-files").remove([cleanPath]);
      } catch (stErr) {
        console.warn("Storage removal warning:", stErr);
      }
      const { error: dbErr } = await supabase
        .from("assignment_submissions")
        .update({ file_path: null })
        .eq("id", submission.id);

      if (dbErr) throw dbErr;
      onToast("Student uploaded file deleted manually.");
      await loadData(false);
    } catch (err) {
      setError("Could not delete student file: " + err.message);
    } finally {
      setBusy(false);
    }
  }

  async function updateMaterial(materialId, data) {
    setBusy(true);
    setError("");
    try {
      let cleanDriveUrl = data.driveUrl?.trim() || null;
      if (cleanDriveUrl && !/^https?:\/\//i.test(cleanDriveUrl)) {
        cleanDriveUrl = `https://${cleanDriveUrl}`;
      }

      let updatePayload = {
        title: data.title.trim(),
        description: data.description.trim(),
        category: data.category,
        course_id: data.courseId || null,
        drive_url: cleanDriveUrl,
      };

      if (data.replacementFile) {
        const uploaded = await uploadFileToSupabase(data.replacementFile);
        updatePayload.file_path = uploaded.path;
        updatePayload.file_name = uploaded.name;
        updatePayload.file_size = uploaded.size;
        updatePayload.file_type = uploaded.type;
      }

      const { error: updateError } = await supabase
        .from("course_materials")
        .update(updatePayload)
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
      let downloadUrl = material.drive_url;

      if (material.file_path) {
        const resolved = await resolveMaterialUrl(material.file_path);
        if (resolved) {
          previewUrl = resolved;
          downloadUrl = resolved;
        }
      }

      if (!previewUrl) {
        throw new Error("No preview URL could be generated for this material.");
      }

      setViewingMaterial({
        title: material.title,
        subtitle: material.category + (material.course_id ? ` · ${courses.find((c) => c.id === material.course_id)?.code || ""}` : " · Campus-wide"),
        url: previewUrl,
        directDownloadUrl: downloadUrl,
        fileName: material.file_name || material.file_path || "",
        fileType: material.file_type || "",
      });
    } catch (err) {
      setError(`Could not open file preview: ${err.message}`);
    }
  }

  // Filtered materials
  const term = query.trim().toLowerCase();
  const filteredMaterials = materials.filter((m) => {
    if (selectedCategoryFilter !== "all" && m.category !== selectedCategoryFilter) {
      return false;
    }
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

  // Filtered student uploaded files
  const filteredStudentUploads = useMemo(() => {
    return studentUploads.filter((sub) => {
      if (!term) return true;
      const student = students[sub.student_id];
      const assignment = assignmentsList.find((a) => a.id === sub.assignment_id);
      const course = courses.find((c) => c.id === assignment?.course_id);
      const rawFileName = sub.file_path || "";
      const haystack = `${student?.full_name || ""} ${student?.email || ""} ${assignment?.title || ""} ${course?.code || ""} ${course?.name || ""} ${rawFileName}`.toLowerCase();
      return haystack.includes(term);
    });
  }, [studentUploads, students, assignmentsList, courses, term]);

  // Distinct courses with materials or matching subject filter
  const displayedCourseGroups = useMemo(() => {
    const groups = [];

    courses.forEach((course) => {
      if (selectedSubjectFilter !== "all" && selectedSubjectFilter !== course.id) {
        return;
      }
      const items = filteredMaterials.filter((m) => m.course_id === course.id);
      if (items.length > 0 || selectedSubjectFilter === course.id) {
        const enrolledCount = enrollments.filter((e) => e.course_id === course.id).length;
        groups.push({ course, items, enrolledCount });
      }
    });

    // Campus-wide / General materials
    if (selectedSubjectFilter === "all" || selectedSubjectFilter === "campus") {
      const campusItems = filteredMaterials.filter((m) => !m.course_id);
      if (campusItems.length > 0 || selectedSubjectFilter === "campus") {
        groups.push({ course: null, items: campusItems, enrolledCount: studentsList.length });
      }
    }

    return groups;
  }, [courses, filteredMaterials, selectedSubjectFilter, enrollments, studentsList]);

  return (
    <div className="admin-drive-view">
      <div className="page-heading">
        <div>
          <div className="eyebrow">Cloud Drive &amp; Files</div>
          <h1>Drive Materials &amp; Subject Notes</h1>
          <p>
            Upload study materials and Drive links once per Subject Code. Assign and permit access to each student separately.
          </p>
        </div>
        <div className="heading-actions">
          <button
            className="button"
            type="button"
            style={{ background: "#fee2e2", borderColor: "#fca5a5", color: "#991b1b" }}
            onClick={handleCleanFileStorage}
            disabled={busy}
            title="Purge all attached files from database storage"
          >
            <Trash2 size={14} />
            <span>Clear DB File Storage</span>
          </button>
          <button
            className="button primary"
            type="button"
            onClick={() => setShowAddModal(true)}
          >
            <Plus size={15} />
            <span>Upload Note / Drive Material</span>
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
          <span>Materials by Subject Code ({materials.length})</span>
        </button>

        <button
          className={`portal-tab ${activeTab === "student_uploads" ? "active" : ""}`}
          type="button"
          role="tab"
          aria-selected={activeTab === "student_uploads"}
          onClick={() => setActiveTab("student_uploads")}
        >
          <Upload size={15} />
          <span>Student Uploaded Files ({studentUploads.length})</span>
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
          {/* Workflow Callout Banner */}
          <div
            style={{
              padding: "12px 16px",
              background: "#f0fdf4",
              border: "1px solid #bbf7d0",
              borderRadius: "10px",
              display: "flex",
              alignItems: "center",
              gap: "12px",
              marginBottom: "18px",
            }}
          >
            <ShieldCheck size={20} style={{ color: "#166534", flexShrink: 0 }} />
            <div style={{ fontSize: "13px", color: "#166534", lineHeight: 1.4 }}>
              <strong>Organized by Subject Code:</strong> Upload each note once under its Subject Code. Use the <strong>"Assign to Students"</strong> button on any note to grant or revoke access for each student separately.
            </div>
          </div>

          {/* Subject Code Filter Bar */}
          <div className="course-session-tabs" style={{ marginBottom: "20px" }}>
            <button
              type="button"
              className={`course-session-tab ${selectedSubjectFilter === "all" ? "active" : ""}`}
              onClick={() => setSelectedSubjectFilter("all")}
            >
              All Subject Codes ({filteredMaterials.length})
            </button>
            {courses.map((course) => {
              const count = materials.filter((m) => m.course_id === course.id).length;
              return (
                <button
                  key={course.id}
                  type="button"
                  className={`course-session-tab ${selectedSubjectFilter === course.id ? "active" : ""}`}
                  onClick={() => setSelectedSubjectFilter(course.id)}
                >
                  <span style={{ fontWeight: 700 }}>{course.code}</span>
                  <span className="course-session-pill" style={{ marginLeft: "6px" }}>{count}</span>
                </button>
              );
            })}
            {materials.some((m) => !m.course_id) && (
              <button
                type="button"
                className={`course-session-tab ${selectedSubjectFilter === "campus" ? "active" : ""}`}
                onClick={() => setSelectedSubjectFilter("campus")}
              >
                <span>Campus-wide</span>
                <span className="course-session-pill" style={{ marginLeft: "6px" }}>
                  {materials.filter((m) => !m.course_id).length}
                </span>
              </button>
            )}
          </div>

          {/* File Type / Category Filter Bar */}
          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "18px", alignItems: "center" }}>
            <span style={{ fontSize: "12px", fontWeight: 650, color: "var(--muted)", marginRight: "4px" }}>
              <Filter size={13} style={{ display: "inline", verticalAlign: "middle", marginRight: "4px" }} />
              File Type:
            </span>
            {["all", "Class Notes", "Materials", "Practice Data Sets", "Projects", "Task", "Syllabus", "Study Guide", "Other"].map((cat) => {
              const label = cat === "all" ? "All Types" : cat;
              const count = cat === "all" ? materials.length : materials.filter((m) => m.category === cat).length;
              if (cat !== "all" && count === 0) return null;
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedCategoryFilter(cat)}
                  style={{
                    fontSize: "11.5px",
                    fontWeight: selectedCategoryFilter === cat ? 700 : 500,
                    padding: "3px 10px",
                    borderRadius: "20px",
                    border: selectedCategoryFilter === cat ? "1px solid #4f46e5" : "1px solid var(--line)",
                    background: selectedCategoryFilter === cat ? "#eef2ff" : "#ffffff",
                    color: selectedCategoryFilter === cat ? "#4f46e5" : "var(--ink)",
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                  }}
                >
                  {label} ({count})
                </button>
              );
            })}
          </div>

          {displayedCourseGroups.length ? (
            <div className="subject-materials-container" style={{ display: "grid", gap: "24px" }}>
              {displayedCourseGroups.map(({ course, items, enrolledCount }) => (
                <div
                  key={course?.id || "campus"}
                  className="subject-code-group"
                  style={{
                    background: "#ffffff",
                    border: "1px solid var(--line)",
                    borderRadius: "12px",
                    padding: "20px",
                    boxShadow: "0 1px 3px rgba(0, 0, 0, 0.04)",
                  }}
                >
                  {/* Subject Code Header */}
                  <div
                    className="subject-group-header"
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: "16px",
                      paddingBottom: "12px",
                      borderBottom: "1px solid var(--line)",
                      flexWrap: "wrap",
                      gap: "10px",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                      {course ? (
                        <span className="course-code-badge" style={{ fontSize: "14px", fontWeight: 700, padding: "4px 10px" }}>
                          {course.code}
                        </span>
                      ) : (
                        <span className="badge green" style={{ fontSize: "13px", padding: "4px 10px" }}>
                          Campus-wide / General
                        </span>
                      )}
                      <h2 style={{ margin: 0, fontSize: "17px", fontWeight: 700, color: "var(--ink)" }}>
                        {course ? course.name : "General Study Materials"}
                      </h2>
                      {course?.department && (
                        <span className="course-dept-badge">{course.department}</span>
                      )}
                      <span className="course-session-pill" style={{ background: "#eef2ff", color: "#4f46e5", fontWeight: 600 }}>
                        {items.length} Note{items.length === 1 ? "" : "s"}
                      </span>
                      {course && (
                        <small style={{ color: "var(--muted)", fontSize: "12.5px" }}>
                          · {enrolledCount} Students Enrolled
                        </small>
                      )}
                    </div>

                    <button
                      type="button"
                      className="button compact primary subject-group-upload-btn"
                      style={{ fontSize: "12px" }}
                      onClick={() => {
                        setFormCourseId(course?.id || "");
                        setShowAddModal(true);
                      }}
                    >
                      <Plus size={13} /> Upload for {course ? course.code : "General"}
                    </button>
                  </div>

                  {/* Grid of Materials for this Subject Code */}
                  {items.length > 0 ? (
                    <div className="materials-grid">
                      {items.map((item) => {
                        const isDrive = !!item.drive_url;
                        const assignedStudentsForThisMat = getAssignedStudentsForMaterial(item);
                        const assignedCount = assignedStudentsForThisMat.length;
                        const docType = item.drive_url ? getDriveDocTypeLabel(item.drive_url) : "PDF File";
                        const requestCount = downloadRequests.filter((r) => r.material_id === item.id).length;

                        return (
                          <article
                            className="card material-card"
                            key={item.id}
                            style={{
                              display: "flex",
                              flexDirection: "column",
                              justifyContent: "space-between",
                            }}
                          >
                            <div>
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

                              <div className="material-meta" style={{ marginTop: "10px" }}>
                                <span>
                                  <Shield size={12} /> View-only in dashboard
                                </span>
                                {item.file_size > 0 && (
                                  <span>{(item.file_size / (1024 * 1024)).toFixed(1)} MB</span>
                                )}
                                {isDrive && (
                                  <span className="badge-view-only" style={{ background: "#eef2ff", color: "#4f46e5", fontSize: "10.5px" }}>
                                    <HardDrive size={11} /> {docType}
                                  </span>
                                )}
                                {requestCount > 0 && (
                                  <span className="material-requests-pill">
                                    <Lock size={12} /> {requestCount} download request{requestCount === 1 ? "" : "s"}
                                  </span>
                                )}
                              </div>

                              {/* Assigned Students & Status Section */}
                              {assignedStudentsForThisMat.length > 0 ? (
                                <div
                                  style={{
                                    marginTop: "12px",
                                    padding: "10px 12px",
                                    background: "#f0fdf4",
                                    border: "1px solid #bbf7d0",
                                    borderRadius: "8px",
                                  }}
                                >
                                  <div
                                    style={{
                                      display: "flex",
                                      alignItems: "center",
                                      justifyContent: "space-between",
                                      marginBottom: "8px",
                                    }}
                                  >
                                    <span
                                      style={{
                                        fontSize: "12px",
                                        color: "#166534",
                                        display: "flex",
                                        alignItems: "center",
                                        gap: "6px",
                                        fontWeight: 700,
                                      }}
                                    >
                                      <Users size={13} />
                                      Assigned Students ({assignedStudentsForThisMat.length})
                                    </span>
                                    <span
                                      style={{
                                        fontSize: "10.5px",
                                        fontWeight: 700,
                                        padding: "2px 7px",
                                        borderRadius: "10px",
                                        background: "#dcfce7",
                                        color: "#15803d",
                                        border: "1px solid #86efac",
                                        display: "inline-flex",
                                        alignItems: "center",
                                        gap: "3px",
                                      }}
                                    >
                                      <Check size={11} strokeWidth={3} /> Status: Assigned
                                    </span>
                                  </div>

                                  {/* List of Assigned Student Names and Status */}
                                  <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
                                    {assignedStudentsForThisMat.slice(0, 4).map((stud) => (
                                      <div
                                        key={stud.id}
                                        style={{
                                          display: "flex",
                                          alignItems: "center",
                                          justifyContent: "space-between",
                                          background: "#ffffff",
                                          padding: "5px 8px",
                                          borderRadius: "6px",
                                          border: "1px solid #dcfce7",
                                          fontSize: "12px",
                                          gap: "6px",
                                        }}
                                      >
                                        <div style={{ display: "flex", alignItems: "center", gap: "6px", minWidth: 0, flex: 1 }}>
                                          <span
                                            style={{
                                              width: "20px",
                                              height: "20px",
                                              borderRadius: "50%",
                                              background: "#dcfce7",
                                              color: "#15803d",
                                              fontSize: "10px",
                                              fontWeight: 700,
                                              display: "grid",
                                              placeItems: "center",
                                              flexShrink: 0,
                                            }}
                                          >
                                            {(stud.full_name || stud.email).slice(0, 1).toUpperCase()}
                                          </span>
                                          <strong
                                            style={{
                                              color: "var(--ink)",
                                              overflow: "hidden",
                                              textOverflow: "ellipsis",
                                              whiteSpace: "nowrap",
                                              fontSize: "12px",
                                            }}
                                            title={stud.full_name || stud.email}
                                          >
                                            {stud.full_name || stud.email}
                                          </strong>
                                        </div>
                                        <span
                                          style={{
                                            fontSize: "10px",
                                            fontWeight: 700,
                                            color: "#15803d",
                                            background: "#dcfce7",
                                            padding: "2px 6px",
                                            borderRadius: "4px",
                                            flexShrink: 0,
                                            border: "1px solid #86efac",
                                            display: "inline-flex",
                                            alignItems: "center",
                                            gap: "2px",
                                          }}
                                        >
                                          ✓ Assigned
                                        </span>
                                      </div>
                                    ))}

                                    {assignedStudentsForThisMat.length > 4 && (
                                      <button
                                        type="button"
                                        onClick={() => setAssigningMaterial(item)}
                                        style={{
                                          background: "none",
                                          border: "none",
                                          color: "#166534",
                                          fontSize: "11px",
                                          fontWeight: 600,
                                          cursor: "pointer",
                                          textAlign: "left",
                                          padding: "2px 2px",
                                          display: "flex",
                                          alignItems: "center",
                                          gap: "4px",
                                        }}
                                      >
                                        <span>+{assignedStudentsForThisMat.length - 4} more assigned student(s)</span>
                                        <span style={{ textDecoration: "underline" }}>(View all)</span>
                                      </button>
                                    )}
                                  </div>
                                </div>
                              ) : (
                                <div
                                  style={{
                                    marginTop: "12px",
                                    padding: "8px 12px",
                                    background: "#f8fafc",
                                    border: "1px solid #e2e8f0",
                                    borderRadius: "8px",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "space-between",
                                  }}
                                >
                                  <span
                                    style={{
                                      fontSize: "12px",
                                      color: "#64748b",
                                      display: "flex",
                                      alignItems: "center",
                                      gap: "6px",
                                      fontWeight: 500,
                                    }}
                                  >
                                    <Users size={13} />
                                    No students assigned yet
                                  </span>
                                  <span
                                    style={{
                                      fontSize: "10.5px",
                                      fontWeight: 600,
                                      color: "#64748b",
                                      background: "#f1f5f9",
                                      padding: "2px 6px",
                                      borderRadius: "6px",
                                      border: "1px solid #e2e8f0",
                                    }}
                                  >
                                    Status: Not Assigned
                                  </span>
                                </div>
                              )}
                            </div>

                            {/* Actions Toolbar */}
                            <div className="material-actions" style={{ display: "grid", gap: "8px", marginTop: "16px" }}>
                              {/* Primary Action Button: Assign to Students */}
                              <button
                                className="button primary"
                                type="button"
                                style={{
                                  width: "100%",
                                  justifyContent: "center",
                                  fontWeight: 600,
                                  padding: "9px 12px",
                                  background: assignedCount > 0 ? "#15803d" : "#2563eb",
                                }}
                                onClick={() => setAssigningMaterial(item)}
                                title={`Assign "${item.title}" to students separately`}
                              >
                                <Users size={14} />
                                <span>
                                  {assignedCount > 0
                                    ? `Manage Assigned Students (${assignedCount})`
                                    : `Assign to Students`}
                                </span>
                              </button>

                              <div className="material-sub-actions" style={{ display: "flex", gap: "6px", flexWrap: "wrap", alignItems: "center" }}>
                                <button
                                  className="button compact"
                                  type="button"
                                  style={{ flex: 1, minWidth: "85px", justifyContent: "center" }}
                                  onClick={() => handleOpenViewer(item)}
                                  title="Preview note in dashboard viewer"
                                >
                                  <Eye size={13} /> Preview
                                </button>

                                {item.drive_url && (
                                  <a
                                    className="button compact"
                                    href={item.drive_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    style={{ flex: 1, minWidth: "85px", justifyContent: "center" }}
                                    title="Open directly in Google Drive"
                                  >
                                    <ExternalLink size={13} /> Drive
                                  </a>
                                )}

                                <button
                                  className="button compact"
                                  type="button"
                                  onClick={() => setEditingMaterial(item)}
                                  title="Edit material details"
                                >
                                  <Pencil size={13} />
                                </button>

                                <button
                                  className="quiet-icon danger-icon"
                                  type="button"
                                  aria-label={`Delete ${item.title}`}
                                  title="Delete material"
                                  disabled={busy}
                                  onClick={() => handleDeleteMaterial(item)}
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  ) : (
                    <div style={{ padding: "28px 16px", textAlign: "center", background: "#f8fafc", borderRadius: "8px", border: "1px dashed #cbd5e1" }}>
                      <FileText size={24} style={{ color: "var(--muted)", margin: "0 auto 6px" }} />
                      <p style={{ margin: 0, fontSize: "13px", color: "var(--muted)" }}>
                        No notes or materials uploaded yet for <strong>{course?.code}</strong>.
                      </p>
                      <button
                        type="button"
                        className="button compact primary"
                        style={{ marginTop: "10px" }}
                        onClick={() => {
                          setFormCourseId(course?.id || "");
                          setShowAddModal(true);
                        }}
                      >
                        <Plus size={12} /> Upload First Note for {course?.code}
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="card portal-empty">
              <HardDrive size={24} />
              <strong>No materials found</strong>
              <span>
                {materials.length
                  ? "Try a different search term or subject code filter."
                  : "Upload a PDF or add a Google Drive link to make it securely viewable in the student dashboard."}
              </span>
            </div>
          )}
        </section>
      ) : activeTab === "student_uploads" ? (
        /* Student Uploaded Files Tab */
        <section className="admin-student-uploads-section">
          <div className="student-admin-toolbar" style={{ marginBottom: "16px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
            <div>
              <h2 style={{ fontSize: "16px", fontWeight: 700, margin: 0 }}>Student Uploaded Files ({studentUploads.length})</h2>
              <p style={{ margin: "2px 0 0", fontSize: "12.5px", color: "var(--muted)" }}>
                View coursework files uploaded by students. Admins can view documents and delete them manually from cloud storage.
              </p>
            </div>
          </div>

          {filteredStudentUploads.length ? (
            <div className="requests-table-container">
              <table className="requests-table">
                <thead>
                  <tr>
                    <th>STUDENT</th>
                    <th>ASSIGNMENT / COURSE</th>
                    <th>UPLOADED FILE</th>
                    <th>SUBMISSION DATE</th>
                    <th>STATUS / GRADE</th>
                    <th style={{ textAlign: "right" }}>ACTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStudentUploads.map((sub) => {
                    const student = students[sub.student_id];
                    const assignment = assignmentsList.find((a) => a.id === sub.assignment_id);
                    const course = courses.find((c) => c.id === assignment?.course_id);
                    const rawFileName = sub.file_path ? sub.file_path.split("/").pop() : "File";
                    const cleanFileName = rawFileName.replace(/^[a-f0-9-]{36}_?/, "");
                    const studentInitial = (student?.full_name || student?.email || "S").slice(0, 1).toUpperCase();

                    return (
                      <tr key={sub.id}>
                        <td>
                          <div className="request-student-cell">
                            <span className="student-avatar">{studentInitial}</span>
                            <div>
                              <strong>{student?.full_name || "Student"}</strong>
                              <small>{student?.email || "No email"}</small>
                            </div>
                          </div>
                        </td>
                        <td>
                          <strong style={{ fontSize: "13px" }}>{assignment?.title || "Coursework Assignment"}</strong>
                          {course && (
                            <small style={{ display: "block", color: "var(--muted)" }}>
                              {course.code} · {course.name}
                            </small>
                          )}
                        </td>
                        <td>
                          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                            <FileText size={15} style={{ color: "var(--blue)" }} />
                            <span style={{ fontSize: "13px", fontWeight: 600 }}>{cleanFileName}</span>
                          </div>
                          <small style={{ color: "var(--muted)", fontSize: "11px" }}>{sub.submission_type || "File Upload"}</small>
                        </td>
                        <td>
                          <small style={{ color: "var(--muted)" }}>
                            {new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(sub.submitted_at))}
                          </small>
                        </td>
                        <td>
                          {sub.grade !== null && sub.grade !== undefined ? (
                            <span className="badge green" style={{ fontSize: "11px", fontWeight: 700 }}>
                              Grade: {sub.grade} pts
                            </span>
                          ) : (
                            <span className="badge amber" style={{ fontSize: "11px" }}>
                              Pending Grade
                            </span>
                          )}
                        </td>
                        <td style={{ textAlign: "right" }}>
                          <div style={{ display: "inline-flex", gap: "6px", alignItems: "center" }}>
                            <button
                              className="button compact"
                              type="button"
                              onClick={() => handleOpenViewer({
                                title: cleanFileName,
                                subtitle: `${student?.full_name || "Student"} · ${assignment?.title || "Submission"}`,
                                file_path: sub.file_path,
                              })}
                              title="Preview student document"
                            >
                              <Eye size={12} /> View
                            </button>
                            <button
                              className="button compact"
                              type="button"
                              style={{ background: "#fee2e2", borderColor: "#fca5a5", color: "#991b1b" }}
                              onClick={() => handleDeleteStudentUpload(sub)}
                              disabled={busy}
                              title="Manually delete student uploaded file"
                            >
                              <Trash2 size={12} /> Delete Manually
                            </button>
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
              <Upload size={24} />
              <strong>No student uploaded files</strong>
              <span>
                {studentUploads.length
                  ? "No files match your search filter."
                  : "When students upload files for assignments or coursework, they will appear here and can be deleted manually."}
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
                    <option value="Class Notes">Class Notes</option>
                    <option value="Materials">Materials</option>
                    <option value="Practice Data Sets">Practice Data Sets</option>
                    <option value="Projects">Projects</option>
                    <option value="Task">Task</option>
                    <option value="Syllabus">Syllabus</option>
                    <option value="Study Guide">Study Guide</option>
                    <option value="Other">Other</option>
                  </select>
                </label>

                <label className="form-field">
                  <span>Subject / Course Code</span>
                  <select
                    value={formCourseId}
                    onChange={(e) => setFormCourseId(e.target.value)}
                  >
                    <option value="">General / Campus-wide</option>
                    {courses.map((course) => (
                      <option key={course.id} value={course.id}>
                        [{course.code}] {course.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div
                style={{
                  padding: "10px 14px",
                  background: "#f0fdf4",
                  border: "1px solid #bbf7d0",
                  borderRadius: "8px",
                  marginBottom: "14px",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                }}
              >
                <ShieldCheck size={16} style={{ color: "#166534", flexShrink: 0 }} />
                <span style={{ fontSize: "12px", color: "#166534" }}>
                  <strong>Upload Once, Assign Separately:</strong> Upload your note or Drive link once under this Subject Code. After saving, you will immediately be able to assign it to each student separately.
                </span>
              </div>

              {formSource === "upload" ? (
                <div className="form-field">
                  <span>Upload PDF or Document File *</span>
                  <label
                    className="file-drop"
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      padding: "24px 16px",
                      textAlign: "center",
                      border: selectedFile ? "2px solid #6366f1" : "2px dashed #cbd5e1",
                      background: selectedFile ? "#f5f3ff" : "#f8fafc",
                      borderRadius: "12px",
                      cursor: "pointer",
                      transition: "all 0.2s ease",
                    }}
                  >
                    <Upload size={28} style={{ color: selectedFile ? "#6366f1" : "#94a3b8", marginBottom: "8px" }} />
                    {selectedFile ? (
                      <div>
                        <strong style={{ display: "block", color: "#1e1b4b", fontSize: "14px" }}>
                          ✓ {selectedFile.name}
                        </strong>
                        <span style={{ fontSize: "12px", color: "#6366f1", marginTop: "4px", display: "inline-block" }}>
                          {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB · Click to choose a different file
                        </span>
                      </div>
                    ) : (
                      <div>
                        <strong style={{ display: "block", color: "#334155", fontSize: "14px" }}>
                          Click to browse or drag &amp; drop a file here
                        </strong>
                        <span style={{ fontSize: "12px", color: "#64748b", marginTop: "4px", display: "inline-block" }}>
                          Supports PDF, DOC, DOCX, XLS, PPT, TXT (up to 50 MB)
                        </span>
                      </div>
                    )}
                    <input
                      type="file"
                      accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt"
                      style={{ display: "none" }}
                      onChange={(e) => {
                        const file = e.target.files?.[0] || null;
                        setSelectedFile(file);
                        if (file && !formTitle.trim()) {
                          const cleanTitle = file.name
                            .replace(/\.[^/.]+$/, "")
                            .replace(/[-_]/g, " ")
                            .replace(/\b\w/g, (c) => c.toUpperCase());
                          setFormTitle(cleanTitle);
                        }
                      }}
                    />
                  </label>
                  {selectedFile && (
                    <button
                      type="button"
                      style={{
                        alignSelf: "flex-end",
                        background: "none",
                        border: "none",
                        color: "#ef4444",
                        fontSize: "12px",
                        cursor: "pointer",
                        padding: "4px 0",
                        marginTop: "4px",
                      }}
                      onClick={() => setSelectedFile(null)}
                    >
                      Clear selected file
                    </button>
                  )}
                  <small className="muted" style={{ display: "block", marginTop: "6px" }}>
                    Files are stored securely with in-dashboard protected preview.
                  </small>
                </div>
              ) : (
                <label className="form-field">
                  <span>Google Drive / Cloud Document Link *</span>
                  <input
                    type="url"
                    required
                    placeholder="https://drive.google.com/file/d/... or https://docs.google.com/..."
                    value={formDriveUrl}
                    onChange={(e) => setFormDriveUrl(e.target.value)}
                  />
                  <small className="muted" style={{ display: "block", marginTop: "6px" }}>
                    Paste any Google Drive file link, Google Doc, Sheet, Slide, or Google Forms test link. LearnForge automatically converts it into a protected in-dashboard embed!
                  </small>
                  <div style={{ marginTop: "8px", padding: "10px 14px", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "8px", fontSize: "12px", color: "#166534", lineHeight: "1.5" }}>
                    💡 <strong>Sharing tip:</strong> In Google Drive, right-click your file → <strong>Share</strong> → set <em>General access</em> to <strong>"Anyone with the link" (Viewer)</strong>. This allows students to view it seamlessly without Google's sign-in barrier.
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
          fileName={viewingMaterial.fileName}
          fileType={viewingMaterial.fileType}
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

      {assigningMaterial && (
        <AssignMaterialModal
          material={assigningMaterial}
          courses={courses}
          students={studentsList}
          enrollments={enrollments}
          materialRecipients={materialRecipients}
          studentNotes={studentNotes}
          onClose={() => setAssigningMaterial(null)}
          onAssignStudent={handleAssignStudent}
          onRevokeStudent={handleRevokeStudent}
          onPreviewDoc={handleOpenViewer}
        />
      )}
    </div>
  );
}

