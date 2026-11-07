/**
 * Clean & purge attached file storage from Supabase Storage and DB tables
 */
export async function cleanAllFileStorage(supabase) {
  if (!supabase) throw new Error("Supabase client is not available.");

  let removedFilesCount = 0;
  let clearedMaterialsCount = 0;
  let clearedSubmissionsCount = 0;

  // 1. Remove specific files referenced in course_materials
  try {
    const { data: mats } = await supabase
      .from("course_materials")
      .select("id, file_path")
      .not("file_path", "is", null);

    if (mats && mats.length > 0) {
      for (const mat of mats) {
        if (!mat.file_path || mat.file_path.startsWith("data:") || mat.file_path.startsWith("http")) continue;
        let bucket = "course-materials";
        let cleanPath = mat.file_path.replace(/^course-materials:|^assignment-files:/, "");
        if (mat.file_path.startsWith("assignment-files:")) bucket = "assignment-files";
        try {
          const { error: remErr } = await supabase.storage.from(bucket).remove([cleanPath]);
          if (!remErr) removedFilesCount++;
        } catch (e) {
          console.warn("Storage removal warning for material file:", cleanPath, e);
        }
      }
    }
  } catch (err) {
    console.warn("Table scan for course_materials files:", err);
  }

  // 2. Remove specific files referenced in assignment_submissions
  try {
    const { data: subs } = await supabase
      .from("assignment_submissions")
      .select("id, file_path")
      .not("file_path", "is", null);

    if (subs && subs.length > 0) {
      for (const sub of subs) {
        if (!sub.file_path || sub.file_path.startsWith("data:") || sub.file_path.startsWith("http")) continue;
        let bucket = "assignment-files";
        let cleanPath = sub.file_path.replace(/^course-materials:|^assignment-files:/, "");
        if (sub.file_path.startsWith("course-materials:")) bucket = "course-materials";
        try {
          const { error: remErr } = await supabase.storage.from(bucket).remove([cleanPath]);
          if (!remErr) removedFilesCount++;
        } catch (e) {
          console.warn("Storage removal warning for submission file:", cleanPath, e);
        }
      }
    }
  } catch (err) {
    console.warn("Table scan for assignment_submissions files:", err);
  }

  // 3. Helper to recursively list and purge all files inside a bucket
  async function purgeBucketRecursively(bucketName, folder = "") {
    try {
      const { data: items, error } = await supabase.storage.from(bucketName).list(folder, { limit: 1000 });
      if (error || !items) return;

      for (const item of items) {
        const itemPath = folder ? `${folder}/${item.name}` : item.name;
        if (item.id === null || !item.metadata) {
          // Folder: recurse into subfolder
          await purgeBucketRecursively(bucketName, itemPath);
        } else {
          // File: delete
          const { error: delErr } = await supabase.storage.from(bucketName).remove([itemPath]);
          if (!delErr) removedFilesCount++;
        }
      }

      // Also batch-remove top-level items if any remain
      const topLevelPaths = items.map((i) => (folder ? `${folder}/${i.name}` : i.name));
      if (topLevelPaths.length > 0) {
        await supabase.storage.from(bucketName).remove(topLevelPaths);
      }
    } catch (e) {
      console.warn(`Purge bucket ${bucketName} error:`, e);
    }
  }

  await purgeBucketRecursively("course-materials");
  await purgeBucketRecursively("assignment-files");

  // 4. Nullify file_path and reset file_size in course_materials
  try {
    const { data, error } = await supabase
      .from("course_materials")
      .update({ file_path: null, file_size: 0 })
      .not("file_path", "is", null);

    if (!error) clearedMaterialsCount = data?.length ?? 1;
  } catch (err) {
    console.warn("Table cleanup for course_materials:", err);
  }

  // 5. Nullify file_path in assignment_submissions
  try {
    const { data, error } = await supabase
      .from("assignment_submissions")
      .update({ file_path: null })
      .not("file_path", "is", null);

    if (!error) clearedSubmissionsCount = data?.length ?? 1;
  } catch (err) {
    console.warn("Table cleanup for assignment_submissions:", err);
  }

  // 6. Invoke SQL RPC if configured in Supabase
  try {
    await supabase.rpc("clean_database_file_storage");
  } catch (rpcErr) {
    console.warn("RPC clean_database_file_storage not found or failed:", rpcErr);
  }

  return {
    success: true,
    removedFilesCount,
    clearedMaterialsCount,
    clearedSubmissionsCount,
  };
}
