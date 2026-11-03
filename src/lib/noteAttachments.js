/**
 * Helpers for parsing, formatting, and uploading note attachments (PDFs and Google Drive links).
 */

export function parseNoteAttachment(rawBody) {
  if (!rawBody || typeof rawBody !== "string") {
    return { text: "", attachmentUrl: null, attachmentName: null, isDrive: false, isPdf: false };
  }

  let text = rawBody;
  let attachmentUrl = null;
  let attachmentName = null;

  // Match [Attachment: url | name] or [Attachment: url]
  const bracketMatch = text.match(/\[Attachment:\s*([^\s\]|]+)(?:\s*\|\s*([^\]]+))?\]/i);
  if (bracketMatch) {
    attachmentUrl = bracketMatch[1].trim();
    attachmentName = bracketMatch[2]?.trim() || null;
    text = text.replace(bracketMatch[0], "").trim();
  } else {
    // Check if rawBody ends with a drive or pdf link
    const urlMatches = text.match(/https?:\/\/[^\s]+/gi);
    if (urlMatches && urlMatches.length > 0) {
      const lastUrl = urlMatches[urlMatches.length - 1];
      if (/drive\.google\.com|docs\.google\.com|\.pdf/i.test(lastUrl)) {
        attachmentUrl = lastUrl;
        text = text.replace(lastUrl, "").trim();
      }
    }
  }

  const isDrive = Boolean(attachmentUrl && /drive\.google\.com|docs\.google\.com/i.test(attachmentUrl));
  const isPdf = Boolean(
    attachmentUrl &&
      (attachmentUrl.toLowerCase().endsWith(".pdf") ||
        attachmentUrl.includes("application/pdf") ||
        attachmentUrl.includes(".pdf?") ||
        (!isDrive && !attachmentUrl.includes("docs.google.com")))
  );

  if (attachmentUrl && !attachmentName) {
    if (isDrive) {
      attachmentName = "Google Drive Document";
    } else {
      try {
        const urlObj = new URL(attachmentUrl);
        const segments = urlObj.pathname.split("/").filter(Boolean);
        attachmentName = decodeURIComponent(segments.pop() || "Attached Document (PDF)");
      } catch {
        attachmentName = "Attached Document (PDF)";
      }
    }
  }

  return { text, attachmentUrl, attachmentName, isDrive, isPdf };
}

export function formatNoteBodyWithAttachment(bodyText, url, name) {
  const cleanBody = (bodyText || "").trim();
  if (!url) return cleanBody;
  const cleanUrl = url.trim();
  const cleanName = (name || "").trim();
  return cleanName
    ? `${cleanBody}\n\n[Attachment: ${cleanUrl} | ${cleanName}]`
    : `${cleanBody}\n\n[Attachment: ${cleanUrl}]`;
}

export function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Failed to read file into memory."));
    reader.readAsDataURL(file);
  });
}

/**
 * Resilient upload of a PDF file to Supabase storage with multi-bucket fallback and Base64 fallback.
 */
export async function uploadNotePdfToStorage(supabase, file) {
  if (!file) throw new Error("No file provided for upload.");
  const cleanName = file.name.replace(/[^a-zA-Z0-9.-]/g, "_");
  const path = `notes/${Date.now()}_${cleanName}`;
  const contentType = file.type || "application/pdf";

  // 1. Try uploading to 'course-materials' bucket
  try {
    const { error: err1 } = await supabase.storage
      .from("course-materials")
      .upload(path, file, { contentType, upsert: false });
    if (!err1) {
      const { data: pubData } = supabase.storage.from("course-materials").getPublicUrl(path);
      const url = pubData?.publicUrl || `course-materials:${path}`;
      return { url, fileName: file.name, fileSize: file.size, storagePath: `course-materials:${path}` };
    }
  } catch (e) {
    console.warn("course-materials upload failed for note:", e);
  }

  // 2. Try uploading to 'assignment-files' bucket
  try {
    const { error: err2 } = await supabase.storage
      .from("assignment-files")
      .upload(path, file, { contentType, upsert: false });
    if (!err2) {
      const { data: pubData } = supabase.storage.from("assignment-files").getPublicUrl(path);
      const url = pubData?.publicUrl || `assignment-files:${path}`;
      return { url, fileName: file.name, fileSize: file.size, storagePath: `assignment-files:${path}` };
    }
  } catch (e) {
    console.warn("assignment-files upload failed for note:", e);
  }

  // 3. Fallback: If file <= 12MB, store directly as Base64 Data URL so upload never fails
  if (file.size <= 12 * 1024 * 1024) {
    const dataUrl = await readFileAsDataURL(file);
    return { url: dataUrl, fileName: file.name, fileSize: file.size, storagePath: dataUrl };
  }

  throw new Error("File could not be uploaded to storage. Please use a file smaller than 12 MB or attach a Google Drive link.");
}

