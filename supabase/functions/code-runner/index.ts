// @ts-nocheck
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Standard Judge0 CE language IDs
const JUDGE0_LANG_IDS: Record<string, number> = {
  c: 50,         // C (GCC 9.2.0)
  cpp: 54,       // C++ (GCC 9.2.0)
  java: 62,      // Java (OpenJDK 13.0.1)
  python: 71,    // Python (3.8.1)
  javascript: 63,// JavaScript (Node.js 12.14.0)
  sql: 82,       // SQL (SQLite 3.27.2)
};

// Piston runtime aliases
const PISTON_RUNTIMES: Record<string, { language: string; version: string; file: string }> = {
  c: { language: "c", version: "*", file: "main.c" },
  cpp: { language: "cpp", version: "*", file: "main.cpp" },
  java: { language: "java", version: "*", file: "Main.java" },
  python: { language: "python", version: "*", file: "main.py" },
  javascript: { language: "javascript", version: "*", file: "main.js" },
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405);

  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return jsonResponse({ error: "Authentication required to run code." }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !anonKey) {
    return jsonResponse({ error: "Supabase credentials missing." }, 500);
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: authError } = await userClient.auth.getUser();
  if (authError || !userData.user) {
    return jsonResponse({ error: "Invalid or expired session." }, 401);
  }

  let payload: Record<string, unknown>;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON payload." }, 400);
  }

  const language = typeof payload.language === "string" ? payload.language.toLowerCase() : "";
  const source = typeof payload.source === "string" ? payload.source : "";
  const stdin = typeof payload.stdin === "string" ? payload.stdin : "";

  if (!language || !source.trim()) {
    return jsonResponse({ error: "Language and source code are required." }, 400);
  }
  if (source.length > 100_000) {
    return jsonResponse({ error: "Source code exceeds 100 KB limit." }, 400);
  }

  // Provider 1: Configured Judge0 endpoint (RapidAPI or self-hosted Judge0 CE)
  const judge0Url = Deno.env.get("JUDGE0_API_URL");
  if (judge0Url) {
    const langId = JUDGE0_LANG_IDS[language];
    if (!langId) {
      return jsonResponse({ configured: true, ok: false, error: `Unsupported Judge0 language: ${language}` }, 400);
    }

    const headers: Record<string, string> = { "Content-Type": "application/json" };
    const judge0Key = Deno.env.get("JUDGE0_API_KEY");
    const judge0Host = Deno.env.get("JUDGE0_API_HOST");
    if (judge0Key) headers["X-RapidAPI-Key"] = judge0Key;
    if (judge0Host) headers["X-RapidAPI-Host"] = judge0Host;

    const cleanUrl = `${judge0Url.replace(/\/+$/, "")}/submissions?base64_encoded=false&wait=true`;
    const started = performance.now();
    const res = await fetch(cleanUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        language_id: langId,
        source_code: source,
        stdin,
      }),
    });

    if (!res.ok) {
      const detail = await res.text();
      return jsonResponse({
        configured: true,
        ok: false,
        stdout: "",
        stderr: `Compiler API error (${res.status}): ${detail}`,
        exitCode: 1,
        engine: "Judge0 Cloud",
      });
    }

    const data = await res.json();
    const stderr = [data.compile_output, data.stderr, data.message].filter(Boolean).join("\n");
    return jsonResponse({
      configured: true,
      ok: data.status?.id === 3,
      stdout: data.stdout || "",
      stderr,
      exitCode: data.status?.id === 3 ? 0 : 1,
      runMs: Math.round(performance.now() - started),
      engine: "Judge0 Sandbox",
    });
  }

  // Provider 2: Configured private/self-hosted Piston endpoint
  const pistonUrl = Deno.env.get("PISTON_API_URL");
  if (pistonUrl) {
    const runtime = PISTON_RUNTIMES[language];
    if (!runtime) {
      return jsonResponse({ configured: true, ok: false, error: `Unsupported Piston language: ${language}` }, 400);
    }
    const started = performance.now();
    const res = await fetch(`${pistonUrl.replace(/\/+$/, "")}/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        language: runtime.language,
        version: runtime.version,
        files: [{ name: runtime.file, content: source }],
        stdin,
      }),
    });
    if (!res.ok) {
      const detail = await res.text();
      return jsonResponse({
        configured: true,
        ok: false,
        stdout: "",
        stderr: `Piston API error (${res.status}): ${detail}`,
        exitCode: 1,
        engine: "Piston Sandbox",
      });
    }

    const data = await res.json();
    const compileStderr = data.compile?.stderr || "";
    const runStderr = data.run?.stderr || "";
    const stderr = [compileStderr, runStderr].filter(Boolean).join("\n");
    const code = data.run?.code ?? data.compile?.code ?? 0;

    return jsonResponse({
      configured: true,
      ok: code === 0 && !compileStderr,
      stdout: data.run?.stdout || "",
      stderr,
      exitCode: code,
      runMs: Math.round(performance.now() - started),
      engine: "Piston Sandbox",
    });
  }

  // Neither remote backend is configured; client falls back seamlessly to browser WASM/sandbox
  return jsonResponse({
    configured: false,
    ok: false,
    message: "No external compiler API secret configured; using built-in browser sandbox.",
  });
});
