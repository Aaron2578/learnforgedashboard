import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { python } from "@codemirror/lang-python";
import { java } from "@codemirror/lang-java";
import { cpp } from "@codemirror/lang-cpp";
import { sql as sqlLang } from "@codemirror/lang-sql";
import { javascript } from "@codemirror/lang-javascript";
import { html as htmlLang } from "@codemirror/lang-html";
import { css as cssLang } from "@codemirror/lang-css";
import { oneDark } from "@codemirror/theme-one-dark";
import {
  Check,
  CheckCircle2,
  Code2,
  Copy,
  Database,
  Download,
  FileCode2,
  Moon,
  Play,
  RefreshCw,
  RotateCcw,
  Sparkles,
  Sun,
  Terminal,
  Upload,
  XCircle,
} from "lucide-react";
import BiDashboardStudio from "./BiDashboardStudio.jsx";
import {
  LAB_MODES,
  SAMPLE_SALES_CSV,
  buildJsSandboxHtml,
  buildReactPreviewHtml,
  buildWebPreviewHtml,
  getSqlSchemaSnapshot,
  resetSqlDatabase,
  runCppBrowser,
  runJavaBrowser,
  runPythonBrowser,
  runSqlBrowser,
  tryCloudCompiler,
} from "../lib/compilerRuntimes.js";

function getCodeMirrorExtension(langKey) {
  switch (langKey) {
    case "python":
      return [python()];
    case "java":
      return [java()];
    case "cpp":
    case "c":
      return [cpp()];
    case "sql":
      return [sqlLang()];
    case "html":
      return [htmlLang()];
    case "css":
      return [cssLang()];
    case "jsx":
    case "javascript":
    default:
      return [javascript({ jsx: true })];
  }
}

export default function OnlineCompiler({
  enrolledItCourses = [],
  recommendedModes = [],
  roleLabel = "Student",
  supabase = null,
}) {
  const recommendedSet = useMemo(() => new Set(recommendedModes), [recommendedModes]);
  const initialModeId = useMemo(() => {
    if (recommendedModes.length > 0 && LAB_MODES.some((m) => m.id === recommendedModes[0])) {
      return recommendedModes[0];
    }
    return "python";
  }, [recommendedModes]);

  const [modeId, setModeId] = useState(initialModeId);
  const [templateIdx, setTemplateIdx] = useState(0);

  // Code buffers
  const [code, setCode] = useState(() => LAB_MODES.find((m) => m.id === initialModeId)?.templates[0]?.code || "");
  const [webHtml, setWebHtml] = useState(() => LAB_MODES.find((m) => m.id === "web")?.templates[0]?.html || "");
  const [webCss, setWebCss] = useState(() => LAB_MODES.find((m) => m.id === "web")?.templates[0]?.css || "");
  const [webJs, setWebJs] = useState(() => LAB_MODES.find((m) => m.id === "web")?.templates[0]?.js || "");
  const [webActiveTab, setWebActiveTab] = useState("html");
  const [reactCss, setReactCss] = useState(() => LAB_MODES.find((m) => m.id === "react")?.templates[0]?.css || "");
  const [reactActiveTab, setReactActiveTab] = useState("jsx");
  const [stdin, setStdin] = useState(() => LAB_MODES.find((m) => m.id === initialModeId)?.templates[0]?.stdin || "");

  // Editor preferences
  const [darkEditor, setDarkEditor] = useState(true);
  const [fontSize, setFontSize] = useState(14);
  const [copied, setCopied] = useState(false);

  // Analytics CSV & SQL schema state
  const [csvText, setCsvText] = useState(SAMPLE_SALES_CSV);
  const [csvFileName, setCsvFileName] = useState("sample_sales.csv");
  const [sqlSchema, setSqlSchema] = useState([]);

  // Execution & Output state
  const [running, setRunning] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [outputTab, setOutputTab] = useState("output");
  const [execResult, setExecResult] = useState(null);
  const [sandboxFrame, setSandboxFrame] = useState(null); // { runId, srcDoc, mode }
  const activeRunIdRef = useRef(null);

  const activeMode = useMemo(() => LAB_MODES.find((m) => m.id === modeId) || LAB_MODES[0], [modeId]);

  // Apply template whenever switching modes or template preset
  const applyModeTemplate = useCallback((targetModeId, idx = 0) => {
    const modeObj = LAB_MODES.find((m) => m.id === targetModeId);
    if (!modeObj) return;
    const tpl = modeObj.templates[idx] || modeObj.templates[0];
    setModeId(targetModeId);
    setTemplateIdx(idx);
    setExecResult(null);
    setSandboxFrame(null);
    setStatusMessage("");
    setOutputTab("output");

    if (targetModeId === "web" && tpl) {
      setWebHtml(tpl.html || "");
      setWebCss(tpl.css || "");
      setWebJs(tpl.js || "");
      setWebActiveTab("html");
    } else if (targetModeId === "react" && tpl) {
      setCode(tpl.code || "");
      setReactCss(tpl.css || "");
      setReactActiveTab("jsx");
    } else if (tpl) {
      setCode(tpl.code || "");
      setStdin(tpl.stdin || "");
    }
  }, []);

  // Load SQL schema cleanly when switching to SQL Studio
  useEffect(() => {
    if (modeId !== "sql") return;
    let mounted = true;
    getSqlSchemaSnapshot()
      .then((schema) => {
        if (mounted) setSqlSchema(schema);
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, [modeId]);

  // Receive console & completion events from opaque sandboxed iframes
  useEffect(() => {
    function handleSandboxMessage(event) {
      const payload = event?.data;
      if (!payload || payload.source !== "learnforge-sandbox") return;
      if (!activeRunIdRef.current || payload.runId !== activeRunIdRef.current) return;

      if (payload.type === "stdout" || payload.type === "warn") {
        setExecResult((prev) => {
          const base = prev || { ok: true, stdout: "", stderr: "", engine: activeMode.runtimeBadge };
          const prefix = payload.type === "warn" ? "[warn] " : "";
          return {
            ...base,
            stdout: base.stdout ? `${base.stdout}\n${prefix}${payload.text}` : `${prefix}${payload.text}`,
          };
        });
      } else if (payload.type === "stderr") {
        setExecResult((prev) => {
          const base = prev || { ok: false, stdout: "", stderr: "", engine: activeMode.runtimeBadge };
          return {
            ...base,
            ok: false,
            stderr: base.stderr ? `${base.stderr}\n${payload.text}` : payload.text,
          };
        });
      } else if (payload.type === "done") {
        setRunning(false);
        setStatusMessage("");
        if (payload.meta && typeof payload.meta.failed === "number") {
          setExecResult((prev) => ({
            ...(prev || { stdout: "", stderr: "" }),
            ok: payload.meta.failed === 0 && !(prev?.stderr),
            testSummary: payload.meta,
            engine: activeMode.runtimeBadge,
          }));
        }
      }
    }
    window.addEventListener("message", handleSandboxMessage);
    return () => window.removeEventListener("message", handleSandboxMessage);
  }, [activeMode.runtimeBadge]);

  const handleRun = useCallback(async () => {
    if (modeId === "bi-studio" || running) return;
    setRunning(true);
    setOutputTab("output");
    setStatusMessage("Preparing runtime...");
    setExecResult(null);

    try {
      // 1. Web Dev Preview
      if (modeId === "web") {
        const { runId, srcDoc } = buildWebPreviewHtml({ html: webHtml, css: webCss, js: webJs });
        activeRunIdRef.current = runId;
        setSandboxFrame({ runId, srcDoc, mode: "visual" });
        setExecResult({ ok: true, stdout: "", stderr: "", engine: activeMode.runtimeBadge });
        setRunning(false);
        setStatusMessage("");
        return;
      }

      // 2. React JSX Preview
      if (modeId === "react") {
        setStatusMessage("Compiling React JSX...");
        const { runId, srcDoc } = await buildReactPreviewHtml({ jsx: code, css: reactCss });
        activeRunIdRef.current = runId;
        setSandboxFrame({ runId, srcDoc, mode: "visual" });
        setExecResult({ ok: true, stdout: "", stderr: "", engine: activeMode.runtimeBadge });
        setRunning(false);
        setStatusMessage("");
        return;
      }

      // 3. JavaScript & Unit Testing Sandbox
      if (modeId === "javascript" || modeId === "testing") {
        const started = performance.now();
        const { runId, srcDoc } = buildJsSandboxHtml(code, { testingMode: modeId === "testing" });
        activeRunIdRef.current = runId;
        setExecResult({
          ok: true,
          stdout: "",
          stderr: "",
          runMs: Math.round(performance.now() - started),
          engine: activeMode.runtimeBadge,
        });
        setSandboxFrame({ runId, srcDoc, mode: "headless" });
        return;
      }

      // 4. SQL Studio
      if (modeId === "sql") {
        setStatusMessage("Executing SQL query...");
        const res = await runSqlBrowser(code);
        if (res.schema) setSqlSchema(res.schema);
        setExecResult(res);
        setRunning(false);
        setStatusMessage("");
        return;
      }

      // 5. Try optional Cloud Edge Function for Java / C / C++ / Python if configured by Admin
      if (["java", "c", "cpp", "python"].includes(modeId)) {
        const cloud = await tryCloudCompiler({ supabase, language: modeId, source: code, stdin });
        if (cloud?.configured) {
          setExecResult(cloud);
          setRunning(false);
          setStatusMessage("");
          return;
        }
      }

      // 6. Browser Java (javac + TeaVM WASM)
      if (modeId === "java") {
        const res = await runJavaBrowser(code, stdin, setStatusMessage);
        setExecResult(res);
        setRunning(false);
        setStatusMessage("");
        return;
      }

      // 7. Browser Python & Data Analytics (Pyodide WASM)
      if (modeId === "python" || modeId === "data-analytics") {
        const res = await runPythonBrowser(code, stdin, {
          analyticsMode: modeId === "data-analytics",
          csvText,
          onStatus: setStatusMessage,
        });
        setExecResult(res);
        setRunning(false);
        setStatusMessage("");
        return;
      }

      // 8. Browser C / C++ (JSCPP)
      if (modeId === "c" || modeId === "cpp") {
        setStatusMessage(`Running ${activeMode.label} program...`);
        const res = await runCppBrowser(code, stdin, activeMode.label);
        setExecResult(res);
        setRunning(false);
        setStatusMessage("");
        return;
      }
    } catch (err) {
      setExecResult({
        ok: false,
        stdout: "",
        stderr: err?.message || String(err),
        engine: activeMode.runtimeBadge,
      });
      setRunning(false);
      setStatusMessage("");
    }
  }, [modeId, running, webHtml, webCss, webJs, code, reactCss, activeMode, supabase, stdin, csvText]);

  // Ctrl+Enter / Cmd+Enter keyboard shortcut
  useEffect(() => {
    function onKeyDown(e) {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        handleRun();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleRun]);

  async function handleResetSql() {
    setStatusMessage("Resetting SQL sample tables...");
    await resetSqlDatabase();
    const schema = await getSqlSchemaSnapshot();
    setSqlSchema(schema);
    setExecResult({
      ok: true,
      sqlResults: [],
      stdout: "Training database reset cleanly to initial state.",
      stderr: "",
      engine: "SQLite 3 WASM (Browser)",
    });
    setStatusMessage("");
  }

  function handleCsvFileUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      if (typeof ev.target?.result === "string") {
        setCsvText(ev.target.result);
        setCsvFileName(file.name);
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  function handleCopyCode() {
    const content =
      modeId === "web"
        ? `<!-- HTML -->\n${webHtml}\n\n/* CSS */\n${webCss}\n\n// JS\n${webJs}`
        : code;
    navigator.clipboard?.writeText(content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  }

  function handleDownloadSource() {
    const content =
      modeId === "web"
        ? buildWebPreviewHtml({ html: webHtml, css: webCss, js: webJs }).srcDoc
        : code;
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = activeMode.fileExt || "snippet.txt";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const groupedModes = useMemo(() => {
    const groups = new Map();
    for (const m of LAB_MODES) {
      if (!groups.has(m.group)) groups.set(m.group, []);
      groups.get(m.group).push(m);
    }
    return Array.from(groups.entries());
  }, []);

  const currentEditorLang =
    modeId === "web"
      ? webActiveTab === "html"
        ? "html"
        : webActiveTab === "css"
        ? "css"
        : "javascript"
      : modeId === "react"
      ? reactActiveTab === "css"
        ? "css"
        : "jsx"
      : activeMode.editorLang;

  const currentEditorValue =
    modeId === "web"
      ? webActiveTab === "html"
        ? webHtml
        : webActiveTab === "css"
        ? webCss
        : webJs
      : modeId === "react"
      ? reactActiveTab === "css"
        ? reactCss
        : code
      : code;

  function handleEditorChange(val) {
    if (modeId === "web") {
      if (webActiveTab === "html") setWebHtml(val);
      else if (webActiveTab === "css") setWebCss(val);
      else setWebJs(val);
    } else if (modeId === "react") {
      if (reactActiveTab === "css") setReactCss(val);
      else setCode(val);
    } else {
      setCode(val);
    }
  }

  return (
    <div className="compiler-shell">
      {/* Course Context & Runtime Header */}
      <div className="card compiler-header-card">
        <div className="compiler-header-left">
          <span className="compiler-brand-icon">
            <Code2 size={20} />
          </span>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
              <strong style={{ fontSize: "16px", color: "var(--ink)" }}>LearnForge IT Code Lab</strong>
              <span className="badge blue" style={{ fontSize: "11px" }}>
                {roleLabel} Workspace
              </span>
              {enrolledItCourses.map((c) => (
                <span key={c.id} className="course-code-badge" style={{ fontSize: "11px" }}>
                  {c.code} · {c.name}
                </span>
              ))}
            </div>
            <p style={{ margin: "3px 0 0", fontSize: "12.5px", color: "var(--muted)" }}>
              {activeMode.description}
            </p>
          </div>
        </div>

        <div className="compiler-header-actions">
          <button
            type="button"
            className="button compact"
            onClick={() => setDarkEditor((d) => !d)}
            title="Toggle editor color theme"
          >
            {darkEditor ? <Sun size={13} /> : <Moon size={13} />}
            <span>{darkEditor ? "Light Editor" : "Dark Editor"}</span>
          </button>
          <select
            aria-label="Editor font size"
            className="compiler-select"
            value={fontSize}
            onChange={(e) => setFontSize(Number(e.target.value))}
          >
            <option value={13}>13 px</option>
            <option value={14}>14 px</option>
            <option value={16}>16 px</option>
          </select>
        </div>
      </div>

      {/* Mode Groups Selector */}
      <div className="card compiler-modes-bar">
        {groupedModes.map(([groupName, items]) => (
          <div className="compiler-mode-group" key={groupName}>
            <span className="compiler-group-label">{groupName}</span>
            <div className="compiler-mode-pills">
              {items.map((item) => {
                const isSelected = modeId === item.id;
                const isRecommended = recommendedSet.has(item.id);
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`compiler-pill ${isSelected ? "active" : ""} ${isRecommended ? "recommended" : ""}`}
                    onClick={() => applyModeTemplate(item.id, 0)}
                    title={isRecommended ? `${item.label} (Matches your enrolled IT track)` : item.label}
                  >
                    <span>{item.label}</span>
                    {isRecommended && <Sparkles size={11} className="compiler-rec-icon" />}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Main Lab Workspace */}
      {modeId === "bi-studio" ? (
        <BiDashboardStudio
          csvText={csvText}
          csvFileName={csvFileName}
          onCsvChange={(txt, name) => {
            setCsvText(txt);
            setCsvFileName(name);
          }}
        />
      ) : (
        <div className="compiler-workbench">
          {/* Top Action Toolbar */}
          <div className="compiler-toolbar">
            <div className="compiler-toolbar-left">
              {activeMode.templates.length > 0 && (
                <label className="compiler-preset-wrap">
                  <span>Preset:</span>
                  <select
                    className="compiler-select"
                    value={templateIdx}
                    onChange={(e) => applyModeTemplate(modeId, Number(e.target.value))}
                  >
                    {activeMode.templates.map((t, idx) => (
                      <option key={t.name} value={idx}>{t.name}</option>
                    ))}
                  </select>
                </label>
              )}

              {modeId === "data-analytics" && (
                <label className="button compact" style={{ cursor: "pointer" }} title="Load CSV into data.csv">
                  <Upload size={13} />
                  <span>Upload data.csv ({csvFileName})</span>
                  <input type="file" accept=".csv,text/csv" onChange={handleCsvFileUpload} style={{ display: "none" }} />
                </label>
              )}

              {modeId === "sql" && (
                <button type="button" className="button compact" onClick={handleResetSql} title="Restore default training tables">
                  <RefreshCw size={13} /> Reset DB
                </button>
              )}
            </div>

            <div className="compiler-toolbar-right">
              <button
                type="button"
                className="button compact"
                onClick={() => applyModeTemplate(modeId, templateIdx)}
                title="Reset current editor to starter code"
              >
                <RotateCcw size={13} /> Reset
              </button>
              <button type="button" className="button compact" onClick={handleCopyCode} title="Copy code">
                {copied ? <Check size={13} /> : <Copy size={13} />}
                <span>{copied ? "Copied" : "Copy"}</span>
              </button>
              <button type="button" className="button compact" onClick={handleDownloadSource} title="Download source file">
                <Download size={13} />
              </button>
              <button
                type="button"
                className="button primary compiler-run-btn"
                onClick={handleRun}
                disabled={running}
                title="Run Code (Ctrl+Enter)"
              >
                <Play size={14} />
                <span>{running ? "Running…" : "Run Code"}</span>
              </button>
            </div>
          </div>

          {/* SQL Schema Strip */}
          {modeId === "sql" && sqlSchema.length > 0 && (
            <div className="compiler-schema-bar">
              <span className="compiler-schema-title">
                <Database size={13} /> Tables:
              </span>
              {sqlSchema.map((tbl) => (
                <button
                  key={tbl.table}
                  type="button"
                  className="compiler-schema-pill"
                  title={`Click to preview ${tbl.table} (${tbl.columns.map((c) => c.name).join(", ")})`}
                  onClick={() => setCode(`SELECT * FROM ${tbl.table} LIMIT 20;\n`)}
                >
                  <strong>{tbl.table}</strong>
                  <small>({tbl.columns.map((c) => c.name).slice(0, 4).join(", ")}{tbl.columns.length > 4 ? "…" : ""})</small>
                </button>
              ))}
            </div>
          )}

          {/* Split IDE Grid */}
          <div className="compiler-split-grid">
            {/* Left: Editor Pane */}
            <div className="compiler-editor-pane">
              <div className="compiler-pane-header">
                <div className="compiler-file-tabs">
                  {modeId === "web" ? (
                    <>
                      <button type="button" className={`compiler-file-tab ${webActiveTab === "html" ? "active" : ""}`} onClick={() => setWebActiveTab("html")}>index.html</button>
                      <button type="button" className={`compiler-file-tab ${webActiveTab === "css" ? "active" : ""}`} onClick={() => setWebActiveTab("css")}>styles.css</button>
                      <button type="button" className={`compiler-file-tab ${webActiveTab === "js" ? "active" : ""}`} onClick={() => setWebActiveTab("js")}>app.js</button>
                    </>
                  ) : modeId === "react" ? (
                    <>
                      <button type="button" className={`compiler-file-tab ${reactActiveTab === "jsx" ? "active" : ""}`} onClick={() => setReactActiveTab("jsx")}>App.jsx</button>
                      <button type="button" className={`compiler-file-tab ${reactActiveTab === "css" ? "active" : ""}`} onClick={() => setReactActiveTab("css")}>styles.css</button>
                    </>
                  ) : (
                    <span className="compiler-file-tab active">
                      <FileCode2 size={13} /> {activeMode.fileExt}
                    </span>
                  )}
                </div>
                <span className="compiler-engine-tag">{activeMode.runtimeBadge}</span>
              </div>

              <div className="compiler-codemirror-wrap" style={{ fontSize: `${fontSize}px` }}>
                <CodeMirror
                  value={currentEditorValue}
                  height="430px"
                  theme={darkEditor ? oneDark : "light"}
                  extensions={getCodeMirrorExtension(currentEditorLang)}
                  onChange={handleEditorChange}
                  basicSetup={{
                    lineNumbers: true,
                    highlightActiveLineGutter: true,
                    foldGutter: true,
                    autocompletion: true,
                    bracketMatching: true,
                    closeBrackets: true,
                  }}
                />
              </div>
            </div>

            {/* Right: Output & Stdin Pane */}
            <div className="compiler-output-pane">
              <div className="compiler-pane-header">
                <div className="compiler-file-tabs">
                  <button
                    type="button"
                    className={`compiler-file-tab ${outputTab === "output" ? "active" : ""}`}
                    onClick={() => setOutputTab("output")}
                  >
                    <Terminal size={13} />
                    <span>{(modeId === "web" || modeId === "react") ? "Live Preview & Console" : "Output"}</span>
                  </button>
                  {activeMode.supportsStdin && (
                    <button
                      type="button"
                      className={`compiler-file-tab ${outputTab === "stdin" ? "active" : ""}`}
                      onClick={() => setOutputTab("stdin")}
                    >
                      <span>Stdin Input</span>
                      {stdin.trim() && <span className="compiler-dot" />}
                    </button>
                  )}
                </div>

                {execResult && (
                  <div className="compiler-status-badges">
                    {typeof execResult.runMs === "number" && (
                      <span className="compiler-time-pill">{execResult.runMs} ms</span>
                    )}
                    <span className={`compiler-result-pill ${execResult.ok ? "ok" : "err"}`}>
                      {execResult.ok ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
                      <span>{execResult.ok ? "Executed" : "Error"}</span>
                    </span>
                  </div>
                )}
              </div>

              {outputTab === "stdin" && activeMode.supportsStdin ? (
                <div className="compiler-stdin-wrap">
                  <p style={{ margin: "0 0 8px", fontSize: "12.5px", color: "var(--muted)" }}>
                    Provide standard input lines read by <code>input()</code>, <code>Scanner</code>, <code>cin</code>, or <code>scanf()</code>:
                  </p>
                  <textarea
                    className="compiler-stdin-box"
                    rows={12}
                    placeholder="Enter each input on a new line..."
                    value={stdin}
                    onChange={(e) => setStdin(e.target.value)}
                  />
                </div>
              ) : (
                <div className="compiler-output-body">
                  {running && statusMessage && (
                    <div className="compiler-loading-banner">
                      <span className="compiler-spinner" />
                      <span>{statusMessage}</span>
                    </div>
                  )}

                  {/* Isolated Iframe Preview (visible for Web/React, hidden headless for JS/Testing) */}
                  {sandboxFrame && sandboxFrame.mode === "visual" && (
                    <div className="compiler-visual-frame-wrap">
                      <iframe
                        key={sandboxFrame.runId}
                        title="Live Web Preview"
                        srcDoc={sandboxFrame.srcDoc}
                        sandbox="allow-scripts"
                        className="compiler-visual-iframe"
                      />
                    </div>
                  )}
                  {sandboxFrame && sandboxFrame.mode === "headless" && (
                    <iframe
                      key={sandboxFrame.runId}
                      title="Isolated JS Sandbox"
                      srcDoc={sandboxFrame.srcDoc}
                      sandbox="allow-scripts"
                      style={{ width: 0, height: 0, border: 0, position: "absolute", visibility: "hidden" }}
                    />
                  )}

                  {/* Testing Suite Summary Badge */}
                  {execResult?.testSummary && (
                    <div className={`compiler-test-banner ${execResult.testSummary.failed === 0 ? "pass" : "fail"}`}>
                      <strong>
                        {execResult.testSummary.passed} Passed · {execResult.testSummary.failed} Failed
                      </strong>
                    </div>
                  )}

                  {/* SQL Result Tables */}
                  {modeId === "sql" && execResult?.sqlResults?.length > 0 && (
                    <div className="compiler-sql-results">
                      {execResult.sqlResults.map((tbl, idx) => (
                        <div key={idx} className="compiler-sql-result-block">
                          <div className="compiler-sql-result-meta">
                            Result Set {idx + 1} · {tbl.values.length} row(s)
                          </div>
                          <div className="compiler-table-scroll">
                            <table className="compiler-sql-table">
                              <thead>
                                <tr>
                                  {tbl.columns.map((col) => <th key={col}>{col}</th>)}
                                </tr>
                              </thead>
                              <tbody>
                                {tbl.values.map((row, rIdx) => (
                                  <tr key={rIdx}>
                                    {row.map((cell, cIdx) => (
                                      <td key={cIdx}>
                                        {cell === null ? <span className="sql-null">NULL</span> : String(cell)}
                                      </td>
                                    ))}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Stdout & Stderr Console */}
                  {execResult && (execResult.stdout || execResult.stderr) && (
                    <div className="compiler-console">
                      {execResult.stdout && (
                        <pre className="compiler-stdout">{execResult.stdout}</pre>
                      )}
                      {execResult.stderr && (
                        <pre className="compiler-stderr">{execResult.stderr}</pre>
                      )}
                    </div>
                  )}

                  {/* Matplotlib Charts Rendered Inline */}
                  {execResult?.charts?.length > 0 && (
                    <div className="compiler-charts-wrap">
                      {execResult.charts.map((src, idx) => (
                        <div className="compiler-chart-card" key={idx}>
                          <img src={src} alt={`Analytics Plot ${idx + 1}`} />
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Empty Prompt Before First Run */}
                  {!execResult && !running && (
                    <div className="compiler-empty-output">
                      <Terminal size={24} />
                      <strong>Ready to execute</strong>
                      <span>Click <strong>Run Code</strong> (or press <code>Ctrl+Enter</code>) to compile and view results here.</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
