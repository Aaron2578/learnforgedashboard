import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { existsSync } from "node:fs";

if (existsSync(".env.local")) {
  const { error } = config({ path: ".env.local" });
  if (error) {
    console.error(`Could not read .env.local: ${error.message}`);
    process.exitCode = 1;
  }
}

const email = "Aaronchrist2578@gmail.com";
const projectUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!projectUrl || !serviceRoleKey) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before provisioning the superuser.");
  process.exitCode = 1;
} else {
  const supabase = createClient(projectUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: userPage, error: listError } = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });

  if (listError) {
    console.error(`Could not check the existing account: ${listError.message}`);
    process.exitCode = 1;
  } else {
    const existing = userPage.users.find((user) => user.email?.toLowerCase() === email.toLowerCase());
    let user = existing;

    if (existing && !existing.email_confirmed_at) {
      console.error(`An unverified auth account already uses ${email}. Verify that email address before granting it superuser access.`);
      process.exitCode = 1;
      user = undefined;
    }

    if (!existing && process.exitCode !== 1) {
      const password = process.env.SUPERUSER_PASSWORD;
      if (!password || password.length < 12) {
        console.error("Set SUPERUSER_PASSWORD to a new password of at least 12 characters.");
        process.exitCode = 1;
      } else {
        const { data, error } = await supabase.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { full_name: "Aaronchrist2578" },
        });

        if (error) {
          console.error(`Could not create the superuser: ${error.message}`);
          process.exitCode = 1;
        } else {
          user = data.user;
        }
      }
    }

    if (user && process.exitCode !== 1) {
      const { error } = await supabase.from("profiles").upsert({
        id: user.id,
        email,
        full_name: user.user_metadata?.full_name || "Aaronchrist2578",
        role: "superuser",
      }, { onConflict: "id" });

      if (error) {
        console.error(`The auth user exists, but its superuser profile could not be saved: ${error.message}`);
        process.exitCode = 1;
      } else {
        console.log(`${email} is provisioned as a superuser.`);
        if (!existing) console.log("The password was read from SUPERUSER_PASSWORD; store it securely and do not commit it.");
        else console.log("The existing password was not changed.");
      }
    }
  }
}
