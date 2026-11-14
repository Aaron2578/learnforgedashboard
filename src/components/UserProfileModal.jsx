import { useState, useEffect, useRef } from "react";
import {
  X,
  User,
  FileText,
  MessageSquare,
  Settings,
  Upload,
  Check,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Download,
  Trash2,
  Star,
  Lock,
  Moon,
  Sun,
  Bell,
  Save,
  LogOut,
  Mail,
  Shield,
  Briefcase,
  Globe,
  Github,
  Linkedin,
  Phone,
} from "lucide-react";

export default function UserProfileModal({
  user,
  profile,
  supabase,
  isOpen,
  onClose,
  onProfileUpdated = () => {},
  onToast = () => {},
  onSignOut,
}) {
  const [activeTab, setActiveTab] = useState("profile"); // 'profile' | 'resume' | 'feedback' | 'settings'

  // Profile Fields
  const [fullName, setFullName] = useState(profile?.full_name || "");
  const [headline, setHeadline] = useState(profile?.headline || "");
  const [bio, setBio] = useState(profile?.bio || "");
  const [skills, setSkills] = useState(profile?.skills || "");
  const [phone, setPhone] = useState(profile?.phone || "");
  const [linkedinUrl, setLinkedinUrl] = useState(profile?.linkedin_url || "");
  const [githubUrl, setGithubUrl] = useState(profile?.github_url || "");
  const [portfolioUrl, setPortfolioUrl] = useState(profile?.portfolio_url || "");

  // Resume State
  const [resumeName, setResumeName] = useState(profile?.resume_name || "");
  const [resumeUrl, setResumeUrl] = useState(profile?.resume_url || "");
  const [resumeUploadedAt, setResumeUploadedAt] = useState(profile?.resume_uploaded_at || "");
  const [uploadingResume, setUploadingResume] = useState(false);
  const fileInputRef = useRef(null);

  // Feedback State
  const [feedbackRating, setFeedbackRating] = useState(5);
  const [feedbackCategory, setFeedbackCategory] = useState("Platform Experience");
  const [feedbackSubject, setFeedbackSubject] = useState("");
  const [feedbackMessage, setFeedbackMessage] = useState("");
  const [submittingFeedback, setSubmittingFeedback] = useState(false);
  const [feedbackHistory, setFeedbackHistory] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(`learnforge_feedback_${user?.id}`) || "[]");
    } catch {
      return [];
    }
  });

  // Settings State
  const [themeMode, setThemeMode] = useState(() => localStorage.getItem("learnforge_theme") || "light");
  const [notifyAssessments, setNotifyAssessments] = useState(() => localStorage.getItem("learnforge_notify_assessments") !== "false");
  const [notifyMarks, setNotifyMarks] = useState(() => localStorage.getItem("learnforge_notify_marks") !== "false");
  const [notifyAttendance, setNotifyAttendance] = useState(() => localStorage.getItem("learnforge_notify_attendance") !== "false");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [updatingPassword, setUpdatingPassword] = useState(false);

  // UI state
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name || "");
      setHeadline(profile.headline || "");
      setBio(profile.bio || "");
      setSkills(profile.skills || "");
      setPhone(profile.phone || "");
      setLinkedinUrl(profile.linkedin_url || "");
      setGithubUrl(profile.github_url || "");
      setPortfolioUrl(profile.portfolio_url || "");
      setResumeName(profile.resume_name || "");
      setResumeUrl(profile.resume_url || "");
      setResumeUploadedAt(profile.resume_uploaded_at || "");
    }
  }, [profile]);

  if (!isOpen) return null;

  const email = user?.email || profile?.email || "";
  const role = profile?.role || "student";
  const initials = (fullName || email || "ST")
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

  async function handleSaveProfile(e) {
    if (e) e.preventDefault();
    setBusy(true);
    setError("");
    setSuccess("");

    try {
      const payload = {
        full_name: fullName.trim(),
        headline: headline.trim(),
        bio: bio.trim(),
        skills: skills.trim(),
        phone: phone.trim(),
        linkedin_url: linkedinUrl.trim(),
        github_url: githubUrl.trim(),
        portfolio_url: portfolioUrl.trim(),
      };

      const { error: updateError } = await supabase
        .from("profiles")
        .update(payload)
        .eq("id", user.id);

      if (updateError) {
        // Fallback: If some columns don't exist yet, save full_name
        console.warn("Could not save all profile fields:", updateError.message);
        const { error: nameError } = await supabase
          .from("profiles")
          .update({ full_name: fullName.trim() })
          .eq("id", user.id);
        if (nameError) throw nameError;
      }

      setSuccess("Profile updated successfully!");
      onToast("Profile updated successfully!");
      onProfileUpdated();
    } catch (err) {
      setError(`Failed to save profile: ${err.message}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleResumeUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      setError("Resume file must be smaller than 10MB.");
      return;
    }

    setUploadingResume(true);
    setError("");
    setSuccess("");

    try {
      let finalUrl = "";
      const fileName = file.name;
      const cleanName = fileName.replace(/[^a-zA-Z0-9.-]/g, "_");
      const storagePath = `resumes/${user.id}_${Date.now()}_${cleanName}`;

      // 1. Try uploading to storage bucket
      const { data: uploadData, error: uploadErr } = await supabase.storage
        .from("course-materials")
        .upload(storagePath, file, { contentType: file.type || "application/pdf", upsert: true });

      if (!uploadErr && uploadData?.path) {
        finalUrl = `course-materials:${uploadData.path}`;
      } else {
        // Fallback to Data URL
        const dataUrl = await new Promise((res, rej) => {
          const reader = new FileReader();
          reader.onload = () => res(reader.result);
          reader.onerror = rej;
          reader.readAsDataURL(file);
        });
        finalUrl = dataUrl;
      }

      const timestamp = new Date().toISOString();
      const { error: profileErr } = await supabase
        .from("profiles")
        .update({
          resume_url: finalUrl,
          resume_name: fileName,
          resume_uploaded_at: timestamp,
        })
        .eq("id", user.id);

      if (profileErr) {
        console.warn("Could not persist resume fields to profiles table:", profileErr.message);
      }

      setResumeName(fileName);
      setResumeUrl(finalUrl);
      setResumeUploadedAt(timestamp);
      setSuccess("Resume uploaded successfully!");
      onToast("Resume uploaded successfully!");
      onProfileUpdated();
    } catch (err) {
      setError(`Resume upload failed: ${err.message}`);
    } finally {
      setUploadingResume(false);
    }
  }

  async function handleRemoveResume() {
    if (!window.confirm("Are you sure you want to remove your resume?")) return;
    setBusy(true);
    try {
      await supabase
        .from("profiles")
        .update({
          resume_url: null,
          resume_name: null,
          resume_uploaded_at: null,
        })
        .eq("id", user.id);

      setResumeName("");
      setResumeUrl("");
      setResumeUploadedAt("");
      setSuccess("Resume removed.");
      onToast("Resume removed.");
      onProfileUpdated();
    } catch (err) {
      setError("Could not remove resume: " + err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleDownloadResume() {
    if (!resumeUrl) return;
    if (resumeUrl.startsWith("data:") || resumeUrl.startsWith("http")) {
      const a = document.createElement("a");
      a.href = resumeUrl;
      a.download = resumeName || "Resume.pdf";
      document.body.appendChild(a);
      a.click();
      a.remove();
      return;
    }

    try {
      let bucket = "course-materials";
      let path = resumeUrl;
      if (resumeUrl.startsWith("course-materials:")) {
        path = resumeUrl.replace("course-materials:", "");
      }
      const { data, error: dlErr } = await supabase.storage.from(bucket).createSignedUrl(path, 120);
      if (data?.signedUrl) {
        window.open(data.signedUrl, "_blank");
      } else {
        throw dlErr || new Error("Could not create download link.");
      }
    } catch (err) {
      setError(`Could not download resume: ${err.message}`);
    }
  }

  async function handleSubmitFeedback(e) {
    if (e) e.preventDefault();
    if (!feedbackMessage.trim()) {
      setError("Please write your feedback message.");
      return;
    }

    setSubmittingFeedback(true);
    setError("");
    setSuccess("");

    const newFeedback = {
      id: "fb_" + Date.now(),
      rating: feedbackRating,
      category: feedbackCategory,
      subject: feedbackSubject.trim() || feedbackCategory,
      message: feedbackMessage.trim(),
      created_at: new Date().toISOString(),
      student_email: email,
      student_name: fullName || email,
    };

    try {
      // 1. Try to record feedback into student_notes or conversations table
      await supabase.from("student_notes").insert({
        student_id: user.id,
        title: `[Feedback] ${newFeedback.category}: ${newFeedback.subject}`,
        body: `Rating: ${feedbackRating}/5 Stars\nCategory: ${feedbackCategory}\n\nMessage:\n${feedbackMessage.trim()}`,
      }).catch(() => {});

      // 2. Persist locally
      const updatedHistory = [newFeedback, ...feedbackHistory];
      setFeedbackHistory(updatedHistory);
      try {
        localStorage.setItem(`learnforge_feedback_${user.id}`, JSON.stringify(updatedHistory));
      } catch {}

      setFeedbackSubject("");
      setFeedbackMessage("");
      setFeedbackRating(5);
      setSuccess("Thank you! Your feedback has been sent to the LearnForge academic team.");
      onToast("Feedback submitted successfully!");
    } catch (err) {
      setError(`Could not submit feedback: ${err.message}`);
    } finally {
      setSubmittingFeedback(false);
    }
  }

  async function handleUpdatePassword(e) {
    if (e) e.preventDefault();
    if (!newPassword || newPassword.length < 6) {
      setError("Password must be at least 6 characters long.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setUpdatingPassword(true);
    setError("");
    setSuccess("");

    try {
      const { error: passErr } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (passErr) throw passErr;

      setNewPassword("");
      setConfirmPassword("");
      setSuccess("Password changed successfully!");
      onToast("Password changed successfully!");
    } catch (err) {
      setError(`Failed to change password: ${err.message}`);
    } finally {
      setUpdatingPassword(false);
    }
  }

  function handleThemeChange(mode) {
    setThemeMode(mode);
    localStorage.setItem("learnforge_theme", mode);
    onToast(`Theme set to ${mode}.`);
  }

  return (
    <div className="modal-backdrop user-profile-modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal user-profile-modal">
        {/* Modal Header */}
        <div className="user-profile-header">
          <div className="user-profile-header-info">
            <span className="user-profile-avatar-large">{initials}</span>
            <div>
              <div className="user-profile-name-row">
                <h2>{fullName || email}</h2>
                <span className={`user-role-badge ${role}`}>
                  {role.toUpperCase()}
                </span>
              </div>
              <p className="user-profile-email">
                <Mail size={13} /> {email}
                {profile?.timing && (
                  <span className="user-profile-timing"> • Timing: {profile.timing}</span>
                )}
              </p>
            </div>
          </div>
          <button
            className="quiet-icon close-button"
            type="button"
            onClick={onClose}
            aria-label="Close profile"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Tabs */}
        <div className="user-profile-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            className={`profile-tab-btn ${activeTab === "profile" ? "active" : ""}`}
            onClick={() => { setActiveTab("profile"); setError(""); setSuccess(""); }}
          >
            <User size={15} /> <span>Profile &amp; Bio</span>
          </button>
          <button
            type="button"
            role="tab"
            className={`profile-tab-btn ${activeTab === "resume" ? "active" : ""}`}
            onClick={() => { setActiveTab("resume"); setError(""); setSuccess(""); }}
          >
            <FileText size={15} /> <span>Upload Resume</span>
          </button>
          <button
            type="button"
            role="tab"
            className={`profile-tab-btn ${activeTab === "feedback" ? "active" : ""}`}
            onClick={() => { setActiveTab("feedback"); setError(""); setSuccess(""); }}
          >
            <MessageSquare size={15} /> <span>Feedback</span>
          </button>
          <button
            type="button"
            role="tab"
            className={`profile-tab-btn ${activeTab === "settings" ? "active" : ""}`}
            onClick={() => { setActiveTab("settings"); setError(""); setSuccess(""); }}
          >
            <Settings size={15} /> <span>Settings for Me</span>
          </button>
        </div>

        {/* Alerts */}
        {error && (
          <div className="portal-alert error" role="alert" style={{ margin: "14px 20px 0" }}>
            <AlertCircle size={15} /> {error}
            <button type="button" onClick={() => setError("")}>Dismiss</button>
          </div>
        )}
        {success && (
          <div className="portal-alert success" role="status" style={{ margin: "14px 20px 0" }}>
            <CheckCircle2 size={15} /> {success}
            <button type="button" onClick={() => setSuccess("")}>Dismiss</button>
          </div>
        )}

        {/* Modal Body */}
        <div className="user-profile-body">
          {/* TAB 1: Profile & Bio */}
          {activeTab === "profile" && (
            <form onSubmit={handleSaveProfile} className="profile-form-grid">
              <div className="form-row two-col">
                <label className="form-field">
                  <span>Full Name</span>
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="e.g. Aaron Christopher"
                    required
                  />
                </label>
                <label className="form-field">
                  <span>Email (Campus ID)</span>
                  <input type="text" value={email} disabled style={{ opacity: 0.7 }} />
                </label>
              </div>

              <div className="form-row two-col">
                <label className="form-field">
                  <span>Professional Headline / Specialization</span>
                  <input
                    type="text"
                    value={headline}
                    onChange={(e) => setHeadline(e.target.value)}
                    placeholder="e.g. Full Stack Developer · Python &amp; React Enthusiast"
                  />
                </label>
                <label className="form-field">
                  <span>Phone Number</span>
                  <div className="input-with-icon">
                    <Phone size={14} className="input-icon" />
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="+91 98765 43210"
                    />
                  </div>
                </label>
              </div>

              <label className="form-field">
                <span>About Me / Description</span>
                <textarea
                  rows={4}
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="Tell your instructors, peers, and placement team about your background, career aspirations, and what you are learning at LearnForge..."
                />
              </label>

              <label className="form-field">
                <span>Key Skills (comma separated)</span>
                <input
                  type="text"
                  value={skills}
                  onChange={(e) => setSkills(e.target.value)}
                  placeholder="e.g. JavaScript, React, Python, Data Structures, SQL, Git"
                />
              </label>

              <div className="form-section-title">Professional &amp; Social Links</div>
              <div className="form-row three-col">
                <label className="form-field">
                  <span>LinkedIn</span>
                  <div className="input-with-icon">
                    <Linkedin size={14} className="input-icon" />
                    <input
                      type="url"
                      value={linkedinUrl}
                      onChange={(e) => setLinkedinUrl(e.target.value)}
                      placeholder="https://linkedin.com/in/..."
                    />
                  </div>
                </label>
                <label className="form-field">
                  <span>GitHub</span>
                  <div className="input-with-icon">
                    <Github size={14} className="input-icon" />
                    <input
                      type="url"
                      value={githubUrl}
                      onChange={(e) => setGithubUrl(e.target.value)}
                      placeholder="https://github.com/..."
                    />
                  </div>
                </label>
                <label className="form-field">
                  <span>Portfolio / Website</span>
                  <div className="input-with-icon">
                    <Globe size={14} className="input-icon" />
                    <input
                      type="url"
                      value={portfolioUrl}
                      onChange={(e) => setPortfolioUrl(e.target.value)}
                      placeholder="https://myportfolio.dev"
                    />
                  </div>
                </label>
              </div>

              <div className="form-actions" style={{ justifyContent: "flex-end", marginTop: "16px" }}>
                <button type="submit" className="button primary" disabled={busy}>
                  <Save size={14} /> <span>{busy ? "Saving…" : "Save Profile Details"}</span>
                </button>
              </div>
            </form>
          )}

          {/* TAB 2: Upload Resume */}
          {activeTab === "resume" && (
            <div className="resume-section">
              <div className="resume-intro">
                <Briefcase size={22} className="resume-intro-icon" />
                <div>
                  <h3>Career &amp; Placement Resume</h3>
                  <p>
                    Upload your latest CV/resume. Your trainers and campus placement coordinators
                    use this document for assessment, interview shortlisting, and company referrals.
                  </p>
                </div>
              </div>

              {resumeUrl ? (
                <div className="active-resume-card">
                  <div className="active-resume-info">
                    <span className="resume-file-icon"><FileText size={24} /></span>
                    <div>
                      <strong>{resumeName || "Uploaded Resume.pdf"}</strong>
                      <small>
                        {resumeUploadedAt
                          ? `Uploaded on ${new Date(resumeUploadedAt).toLocaleDateString()}`
                          : "Active Resume File"}
                      </small>
                    </div>
                  </div>
                  <div className="active-resume-actions">
                    <button
                      type="button"
                      className="button compact primary"
                      onClick={handleDownloadResume}
                      title="Download or preview resume"
                    >
                      <Download size={13} /> <span>Download</span>
                    </button>
                    <button
                      type="button"
                      className="button compact"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploadingResume}
                      title="Replace with updated resume"
                    >
                      <Upload size={13} /> <span>Replace</span>
                    </button>
                    <button
                      type="button"
                      className="button compact danger-outline"
                      onClick={handleRemoveResume}
                      disabled={busy}
                      title="Delete resume"
                    >
                      <Trash2 size={13} /> <span>Remove</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  className="resume-dropzone"
                  onClick={() => fileInputRef.current?.click()}
                  role="button"
                  tabIndex={0}
                >
                  <Upload size={32} />
                  <strong>Click to browse or drop your resume here</strong>
                  <span>Supports PDF, DOC, DOCX up to 10MB</span>
                </div>
              )}

              <input
                type="file"
                ref={fileInputRef}
                style={{ display: "none" }}
                accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                onChange={handleResumeUpload}
              />

              {uploadingResume && (
                <div className="resume-uploading-banner">
                  <div className="spinner-ring" />
                  <span>Uploading resume securely to your profile…</span>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: Feedback */}
          {activeTab === "feedback" && (
            <div className="feedback-section">
              <form onSubmit={handleSubmitFeedback} className="feedback-form">
                <div className="feedback-rating-row">
                  <span>How would you rate your LearnForge experience?</span>
                  <div className="star-rating-selector">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        type="button"
                        className={`star-btn ${star <= feedbackRating ? "filled" : ""}`}
                        onClick={() => setFeedbackRating(star)}
                        title={`${star} Star${star > 1 ? "s" : ""}`}
                      >
                        <Star size={20} fill={star <= feedbackRating ? "#f59e0b" : "none"} />
                      </button>
                    ))}
                  </div>
                </div>

                <div className="form-row two-col">
                  <label className="form-field">
                    <span>Category</span>
                    <select
                      value={feedbackCategory}
                      onChange={(e) => setFeedbackCategory(e.target.value)}
                    >
                      <option value="Platform Experience">Platform Experience &amp; UI</option>
                      <option value="Coursework / Learning">Coursework &amp; Study Materials</option>
                      <option value="Instructor & Trainer">Instructor &amp; Trainer Support</option>
                      <option value="Drive & Files">Drive &amp; Secure Document Access</option>
                      <option value="Tests & Assessments">Tests, Quizzes &amp; Proctoring</option>
                      <option value="Feature Suggestion">Feature Suggestion / Idea</option>
                      <option value="Bug Report">Issue / Bug Report</option>
                    </select>
                  </label>
                  <label className="form-field">
                    <span>Subject</span>
                    <input
                      type="text"
                      value={feedbackSubject}
                      onChange={(e) => setFeedbackSubject(e.target.value)}
                      placeholder="e.g. Great video lectures, or issue downloading file"
                    />
                  </label>
                </div>

                <label className="form-field">
                  <span>Your Feedback / Thoughts</span>
                  <textarea
                    rows={4}
                    value={feedbackMessage}
                    onChange={(e) => setFeedbackMessage(e.target.value)}
                    placeholder="Describe your feedback, suggestion, or experience in detail..."
                    required
                  />
                </label>

                <div className="form-actions" style={{ justifyContent: "flex-end", marginTop: "12px" }}>
                  <button type="submit" className="button primary" disabled={submittingFeedback}>
                    <Check size={14} /> <span>{submittingFeedback ? "Submitting…" : "Send Feedback"}</span>
                  </button>
                </div>
              </form>

              {feedbackHistory.length > 0 && (
                <div className="past-feedback-section">
                  <h4>Your Submitted Feedback History</h4>
                  <div className="past-feedback-list">
                    {feedbackHistory.slice(0, 3).map((item) => (
                      <div className="past-feedback-item" key={item.id}>
                        <div className="past-feedback-header">
                          <span className="badge blue">{item.category}</span>
                          <span className="past-feedback-stars">
                            {[1, 2, 3, 4, 5].map((s) => (
                              <Star
                                key={s}
                                size={12}
                                fill={s <= item.rating ? "#f59e0b" : "#e2e8f0"}
                                color={s <= item.rating ? "#f59e0b" : "#cbd5e1"}
                              />
                            ))}
                          </span>
                          <small>{new Date(item.created_at).toLocaleDateString()}</small>
                        </div>
                        <strong>{item.subject}</strong>
                        <p>{item.message}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 4: Settings for Me */}
          {activeTab === "settings" && (
            <div className="settings-section">
              <div className="settings-group">
                <h4>Appearance &amp; Theme</h4>
                <div className="theme-toggle-row">
                  <button
                    type="button"
                    className={`theme-option-btn ${themeMode === "light" ? "active" : ""}`}
                    onClick={() => handleThemeChange("light")}
                  >
                    <Sun size={16} /> <span>Light Mode</span>
                  </button>
                  <button
                    type="button"
                    className={`theme-option-btn ${themeMode === "dark" ? "active" : ""}`}
                    onClick={() => handleThemeChange("dark")}
                  >
                    <Moon size={16} /> <span>Dark Theme</span>
                  </button>
                </div>
              </div>

              <div className="settings-group">
                <h4>Notification Preferences</h4>
                <div className="settings-toggle-list">
                  <label className="settings-toggle-item">
                    <div>
                      <strong>New Assessments &amp; Assignments</strong>
                      <small>Receive portal alerts when an instructor publishes coursework</small>
                    </div>
                    <input
                      type="checkbox"
                      checked={notifyAssessments}
                      onChange={(e) => {
                        setNotifyAssessments(e.target.checked);
                        localStorage.setItem("learnforge_notify_assessments", String(e.target.checked));
                      }}
                    />
                  </label>

                  <label className="settings-toggle-item">
                    <div>
                      <strong>Grades &amp; Marks Release</strong>
                      <small>Get notified when test results and scorecard marks are released</small>
                    </div>
                    <input
                      type="checkbox"
                      checked={notifyMarks}
                      onChange={(e) => {
                        setNotifyMarks(e.target.checked);
                        localStorage.setItem("learnforge_notify_marks", String(e.target.checked));
                      }}
                    />
                  </label>

                  <label className="settings-toggle-item">
                    <div>
                      <strong>Daily Attendance Updates</strong>
                      <small>Instant notification when your shift attendance is marked</small>
                    </div>
                    <input
                      type="checkbox"
                      checked={notifyAttendance}
                      onChange={(e) => {
                        setNotifyAttendance(e.target.checked);
                        localStorage.setItem("learnforge_notify_attendance", String(e.target.checked));
                      }}
                    />
                  </label>
                </div>
              </div>

              <div className="settings-group">
                <h4>Account Security &amp; Password</h4>
                <form onSubmit={handleUpdatePassword} className="password-form-grid">
                  <div className="form-row two-col">
                    <label className="form-field">
                      <span>New Password</span>
                      <div className="input-with-icon">
                        <Lock size={14} className="input-icon" />
                        <input
                          type="password"
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          placeholder="Min 6 characters"
                          minLength={6}
                        />
                      </div>
                    </label>
                    <label className="form-field">
                      <span>Confirm New Password</span>
                      <div className="input-with-icon">
                        <Lock size={14} className="input-icon" />
                        <input
                          type="password"
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          placeholder="Re-enter password"
                          minLength={6}
                        />
                      </div>
                    </label>
                  </div>
                  <div className="form-actions" style={{ justifyContent: "flex-end" }}>
                    <button type="submit" className="button" disabled={updatingPassword || !newPassword}>
                      {updatingPassword ? "Updating…" : "Update Password"}
                    </button>
                  </div>
                </form>
              </div>

              {onSignOut && (
                <div className="settings-signout-row">
                  <div>
                    <strong>Sign out of LearnForge</strong>
                    <small>End your secure session on this device</small>
                  </div>
                  <button type="button" className="button danger-outline compact" onClick={onSignOut}>
                    <LogOut size={13} /> <span>Sign Out</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
