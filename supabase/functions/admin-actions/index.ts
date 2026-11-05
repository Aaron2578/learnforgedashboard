// @ts-nocheck
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function response(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;",
  })[character] ?? character);
}

async function sendEmail(to: string, subject: string, text: string, html: string) {
  const apiKey = Deno.env.get("SENDGRID_API_KEY");
  const from = Deno.env.get("SENDGRID_FROM_EMAIL");
  if (!apiKey || !from) throw new Error("Email is not configured. Set SENDGRID_API_KEY and SENDGRID_FROM_EMAIL as Supabase function secrets.");
  const result = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: to }] }],
      from: { email: from, name: "LearnForge" },
      subject,
      content: [
        { type: "text/plain", value: text },
        { type: "text/html", value: html },
      ],
    }),
  });
  if (!result.ok) {
    const detail = await result.text();
    throw new Error(`SendGrid rejected an email (${result.status}): ${detail}`);
  }
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return response({ error: "Method not allowed." }, 405);

  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) return response({ error: "Sign in as an administrator." }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return response({ error: "Supabase function credentials are not configured." }, 500);
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: authError } = await userClient.auth.getUser();
  if (authError || !userData.user) return response({ error: "Your session is invalid or expired." }, 401);

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: adminProfile, error: profileError } = await adminClient
    .from("profiles")
    .select("id, role")
    .eq("id", userData.user.id)
    .single();
  if (profileError) return response({ error: `Could not verify administrator access: ${profileError.message}` }, 500);
  if (adminProfile.role !== "superuser") return response({ error: "Administrator access is required." }, 403);

  let payload: Record<string, unknown>;
  try {
    payload = await request.json();
  } catch {
    return response({ error: "Request body must be valid JSON." }, 400);
  }

  if (payload.action === "delete_student") {
    if (typeof payload.studentId !== "string") return response({ error: "A student account ID is required." }, 400);
    const { data: student, error: studentError } = await adminClient
      .from("profiles")
      .select("id, role")
      .eq("id", payload.studentId)
      .single();
    if (studentError) return response({ error: `Could not find the student: ${studentError.message}` }, 404);
    if (student.role !== "student" && student.role !== "trainer") return response({ error: "Only student and trainer accounts can be deleted here." }, 403);
    const filePaths: string[] = [];
    async function collectFiles(path: string) {
      const { data: entries, error: listError } = await adminClient.storage.from("assignment-files").list(path, { limit: 1000 });
      if (listError) throw new Error(`Could not inspect student files: ${listError.message}`);
      for (const entry of entries ?? []) {
        const entryPath = path ? `${path}/${entry.name}` : entry.name;
        if (entry.id) filePaths.push(entryPath);
        else await collectFiles(entryPath);
      }
    }
    try {
      await collectFiles(student.id);
      if (filePaths.length) {
        const { error: fileDeleteError } = await adminClient.storage.from("assignment-files").remove(filePaths);
        if (fileDeleteError) throw new Error(`Could not delete student files: ${fileDeleteError.message}`);
      }
    } catch (error) {
      return response({ error: error instanceof Error ? error.message : String(error) }, 500);
    }
    const { error: deleteError } = await adminClient.auth.admin.deleteUser(student.id);
    if (deleteError) return response({ error: `Could not delete the student account: ${deleteError.message}` }, 500);
    return response({ success: true });
  }

  if (payload.action === "get_invite_link") {
    if (typeof payload.email !== "string" || !payload.email.includes("@")) {
      return response({ error: "A valid student email is required." }, 400);
    }
    const clientAppUrl = typeof payload.appUrl === "string" && payload.appUrl.startsWith("http") ? payload.appUrl : null;
    const appUrl = clientAppUrl || Deno.env.get("APP_URL") || "https://tmdashboard-two.vercel.app";
    const normalizedEmail = payload.email.trim().toLowerCase();

    const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
      type: "magiclink",
      email: normalizedEmail,
      options: { redirectTo: appUrl },
    });
    if (linkError) {
      return response({ error: `Could not generate invitation link: ${linkError.message}` }, 500);
    }

    return response({
      success: true,
      email: normalizedEmail,
      actionLink: linkData?.properties?.action_link,
    });
  }

  if (payload.action === "invite_students") {
    const invitees = Array.isArray(payload.students) ? payload.students : [];
    if (!invitees.length || invitees.length > 25) return response({ error: "Choose between 1 and 25 students to invite." }, 400);
    const normalized = invitees.map((item) => ({
      email: typeof item?.email === "string" ? item.email.trim().toLowerCase() : "",
      fullName: typeof item?.fullName === "string" ? item.fullName.trim() : "",
    }));
    const invalid = normalized.find((item) =>
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(item.email)
      || item.fullName.length > 100
    );
    if (invalid) return response({ error: "Every row must contain a valid email address and an optional name up to 100 characters." }, 400);
    if (new Set(normalized.map((item) => item.email)).size !== normalized.length) {
      return response({ error: "Remove duplicate email addresses before sending invitations." }, 400);
    }

    const clientAppUrl = typeof payload.appUrl === "string" && payload.appUrl.startsWith("http") ? payload.appUrl : null;
    const appUrl = clientAppUrl || Deno.env.get("APP_URL") || "https://tmdashboard-two.vercel.app";
    const apiKey = Deno.env.get("SENDGRID_API_KEY");
    const from = Deno.env.get("SENDGRID_FROM_EMAIL");
    const hasSendGrid = Boolean(apiKey && from);

    const sent: string[] = [];
    const failed: Array<{ email: string; error: string }> = [];
    const inviteLinks: Array<{ email: string; actionLink: string }> = [];

    for (const invitee of normalized) {
      const fullName = invitee.fullName || invitee.email.split("@")[0];
      let actionLink = "";

      const { data: inviteData, error: inviteError } = await adminClient.auth.admin.generateLink({
        type: "invite",
        email: invitee.email,
        options: { redirectTo: appUrl, data: { full_name: fullName } },
      });

      if (!inviteError && inviteData?.properties?.action_link) {
        actionLink = inviteData.properties.action_link;
      } else if (inviteError?.code === "email_exists" || inviteError?.message?.toLowerCase().includes("already been registered")) {
        const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
          type: "magiclink",
          email: invitee.email,
          options: { redirectTo: appUrl },
        });
        if (linkError) {
          failed.push({ email: invitee.email, error: `Account exists, but could not create sign-in link: ${linkError.message}` });
          continue;
        }
        actionLink = linkData?.properties?.action_link || "";
      } else {
        const { error: directInviteError } = await adminClient.auth.admin.inviteUserByEmail(
          invitee.email,
          { data: { full_name: fullName }, redirectTo: appUrl },
        );
        if (directInviteError) {
          failed.push({ email: invitee.email, error: directInviteError.message });
          continue;
        }
      }

      if (actionLink) {
        inviteLinks.push({ email: invitee.email, actionLink });
      }

      if (hasSendGrid && actionLink) {
        try {
          await sendEmail(
            invitee.email,
            "Your LearnForge student invitation",
            `Hello ${fullName},\n\nUse this secure link to sign in: ${actionLink}\n\nAn administrator will activate your courses and resources once approved.`,
            `<p>Hello ${escapeHtml(fullName)},</p><p>Use this secure link to sign in to your student portal:</p><p><a href="${escapeHtml(actionLink)}">Open your student portal</a></p><p>An administrator will activate your courses and resources once approved.</p>`,
          );
        } catch (emailErr) {
          console.warn(`SendGrid email to ${invitee.email} failed:`, emailErr);
        }
      }

      sent.push(invitee.email);
    }

    return response({
      success: failed.length === 0,
      sent: sent.length,
      failed,
      inviteLinks,
      emailSent: hasSendGrid,
    });
  }

  if (payload.action === "notify_students") {
    const studentIds = Array.isArray(payload.studentIds) ? payload.studentIds : [];
    const subject = typeof payload.subject === "string" ? payload.subject.trim() : "";
    const body = typeof payload.body === "string" ? payload.body.trim() : "";
    if (!studentIds.length || studentIds.length > 100 || studentIds.some((id) => typeof id !== "string")) {
      return response({ error: "Choose between 1 and 100 students to notify." }, 400);
    }
    if (subject.length < 1 || subject.length > 150 || body.length < 1 || body.length > 2000) {
      return response({ error: "Notification subject or message is outside the allowed length." }, 400);
    }
    const { data: recipients, error: recipientError } = await adminClient
      .from("profiles")
      .select("id, email")
      .eq("role", "student")
      .eq("is_approved", true)
      .in("id", studentIds);
    if (recipientError) return response({ error: `Could not load approved recipients: ${recipientError.message}` }, 500);
    if (recipients.length !== new Set(studentIds).size) {
      return response({ error: "One or more selected students are no longer approved." }, 400);
    }

    const notificationRows = recipients.map((recipient) => ({
      student_id: recipient.id,
      title: subject,
      body,
    }));
    const { error: notificationError } = await adminClient.from("student_notifications").insert(notificationRows);
    if (notificationError) return response({ error: `Could not save in-app notifications: ${notificationError.message}` }, 500);

    const hasSendGrid = Boolean(Deno.env.get("SENDGRID_API_KEY") && Deno.env.get("SENDGRID_FROM_EMAIL"));
    const failures: string[] = [];

    if (hasSendGrid) {
      for (const recipient of recipients) {
        try {
          await sendEmail(recipient.email, subject, body, `<p>${escapeHtml(body).replace(/\n/g, "<br>")}</p>`);
        } catch (error) {
          failures.push(`${recipient.email}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }

    if (failures.length) {
      return response({
        success: false,
        inAppSent: recipients.length,
        emailSent: recipients.length - failures.length,
        emailFailures: failures,
      });
    }

    return response({
      success: true,
      sent: recipients.length,
      inAppSent: recipients.length,
      emailSent: hasSendGrid ? recipients.length : 0,
    });
  }

  if (payload.action === "create_trainer") {
    const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
    const password = typeof payload.password === "string" ? payload.password : "";
    const fullName = typeof payload.fullName === "string" ? payload.fullName.trim() : "";
    const timing = typeof payload.timing === "string" ? payload.timing.trim() : "";

    if (!email || !email.includes("@")) {
      return response({ error: "A valid trainer email is required." }, 400);
    }
    if (!password || password.length < 8) {
      return response({ error: "Password must be at least 8 characters long." }, 400);
    }

    let userId = "";

    // 1. Try to create the user in Auth
    const { data: userData, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName || "Trainer", role: "trainer" },
    });

    if (createError) {
      // If user already registered, update their credentials and role
      if (createError.code === "email_exists" || createError.message?.toLowerCase().includes("already been registered")) {
        const { data: userList } = await adminClient.auth.admin.listUsers();
        const existing = userList?.users?.find((u) => u.email?.toLowerCase() === email);
        if (!existing) {
          return response({ error: `Account exists in Auth, but user record could not be retrieved: ${createError.message}` }, 400);
        }
        userId = existing.id;
        const { error: updateAuthErr } = await adminClient.auth.admin.updateUserById(userId, {
          password,
          email_confirm: true,
          user_metadata: { full_name: fullName || existing.user_metadata?.full_name || "Trainer", role: "trainer" },
        });
        if (updateAuthErr) {
          return response({ error: `Failed to update credentials for existing user: ${updateAuthErr.message}` }, 400);
        }
      } else {
        return response({ error: `Could not create trainer account: ${createError.message}` }, 400);
      }
    } else if (userData?.user) {
      userId = userData.user.id;
    }

    // 2. Upsert profile with role = 'trainer' and is_approved = true
    const { error: profileUpsertError } = await adminClient.from("profiles").upsert({
      id: userId,
      email,
      full_name: fullName || "Trainer",
      role: "trainer",
      is_approved: true,
      timing: timing || null,
    }, { onConflict: "id" });

    if (profileUpsertError) {
      return response({ error: `User created, but profile update failed: ${profileUpsertError.message}` }, 500);
    }

    return response({
      success: true,
      trainer: {
        id: userId,
        email,
        fullName: fullName || "Trainer",
        role: "trainer",
        is_approved: true,
      },
    });
  }

  if (payload.action === "update_user_role") {
    const userId = typeof payload.userId === "string" ? payload.userId : "";
    const newRole = typeof payload.role === "string" ? payload.role : "student";
    if (!userId) return response({ error: "User ID required." }, 400);

    const { error: updateErr } = await adminClient.from("profiles").update({
      role: newRole,
      is_approved: true,
    }).eq("id", userId);

    if (updateErr) return response({ error: updateErr.message }, 500);
    return response({ success: true, userId, role: newRole });
  }

  return response({ error: "Unsupported admin action." }, 400);
});
