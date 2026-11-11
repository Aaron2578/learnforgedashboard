import { useMemo, useState } from "react";
import { BarChart3, ExternalLink, FileSpreadsheet, PieChart, TrendingUp, Upload } from "lucide-react";
import { SAMPLE_SALES_CSV } from "../lib/compilerRuntimes.js";

function parseCsvRows(text) {
  const lines = text.replace(/\r\n/g, "\n").split("\n").filter((line) => line.trim() !== "");
  if (lines.length < 2) return { headers: [], rows: [] };

  function splitCsvLine(line) {
    const cells = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === "," && !inQuotes) {
        cells.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }
    cells.push(current.trim());
    return cells;
  }

  const headers = splitCsvLine(lines[0]);
  const rows = lines.slice(1).map((line) => {
    const vals = splitCsvLine(line);
    const obj = {};
    headers.forEach((h, idx) => {
      obj[h] = vals[idx] ?? "";
    });
    return obj;
  });
  return { headers, rows };
}

const CHART_COLORS = ["#4f46e5", "#0ea5e9", "#10b981", "#f59e0b", "#ec4899", "#8b5cf6", "#06b6d4", "#ef4444"];

function formatMetric(value) {
  if (!Number.isFinite(value)) return "0";
  return Number.isInteger(value)
    ? value.toLocaleString("en")
    : value.toLocaleString("en", { maximumFractionDigits: 2 });
}

export default function BiDashboardStudio({ csvText, onCsvChange, csvFileName }) {
  const [subTab, setSubTab] = useState("builder");
  const [chartType, setChartType] = useState("bar");
  const [aggType, setAggType] = useState("sum");
  const [selectedDim, setSelectedDim] = useState("");
  const [selectedMeasure, setSelectedMeasure] = useState("");
  const [embedUrl, setEmbedUrl] = useState("");
  const [loadedEmbedUrl, setLoadedEmbedUrl] = useState("");
  const [embedError, setEmbedError] = useState("");

  const parsed = useMemo(() => parseCsvRows(csvText || SAMPLE_SALES_CSV), [csvText]);

  const { dimensionCols, measureCols } = useMemo(() => {
    const dims = [];
    const measures = [];
    for (const h of parsed.headers) {
      const sample = parsed.rows.slice(0, 20).map((r) => r[h]).filter((v) => v !== "");
      const numericCount = sample.filter((v) => v !== "" && !Number.isNaN(Number(v))).length;
      if (sample.length > 0 && numericCount / sample.length >= 0.8 && !/id$/i.test(h)) {
        measures.push(h);
      } else {
        dims.push(h);
      }
    }
    return {
      dimensionCols: dims.length ? dims : parsed.headers,
      measureCols: measures.length ? measures : parsed.headers,
    };
  }, [parsed]);

  const activeDim = dimensionCols.includes(selectedDim)
    ? selectedDim
    : (dimensionCols.includes("category") ? "category" : dimensionCols[0] || "");
  const activeMeasure = measureCols.includes(selectedMeasure)
    ? selectedMeasure
    : (measureCols.includes("revenue") ? "revenue" : measureCols[0] || "");

  const aggregated = useMemo(() => {
    if (!activeDim || !parsed.rows.length) return [];
    const groups = new Map();
    for (const row of parsed.rows) {
      const key = String(row[activeDim] || "(Blank)");
      const rawVal = Number(row[activeMeasure]);
      const val = Number.isFinite(rawVal) ? rawVal : 0;
      if (!groups.has(key)) {
        groups.set(key, { key, count: 0, sum: 0, max: -Infinity });
      }
      const g = groups.get(key);
      g.count += 1;
      g.sum += val;
      if (val > g.max) g.max = val;
    }

    return Array.from(groups.values())
      .map((g) => ({
        label: g.key,
        value: aggType === "count" ? g.count : aggType === "avg" ? g.sum / g.count : aggType === "max" ? g.max : g.sum,
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 12);
  }, [parsed, activeDim, activeMeasure, aggType]);

  const kpis = useMemo(() => {
    const totalRows = parsed.rows.length;
    const nums = parsed.rows.map((r) => Number(r[activeMeasure])).filter((n) => Number.isFinite(n));
    const totalSum = nums.reduce((acc, n) => acc + n, 0);
    const avg = nums.length ? totalSum / nums.length : 0;
    const topGroup = aggregated[0];
    return { totalRows, totalSum, avg, topGroup };
  }, [parsed, activeMeasure, aggregated]);

  function handleCsvUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      if (typeof ev.target?.result === "string") {
        onCsvChange(ev.target.result, file.name);
      }
    };
    reader.readAsText(file);
    event.target.value = "";
  }

  function handleLoadEmbed(e) {
    e.preventDefault();
    setEmbedError("");
    const trimmed = embedUrl.trim();
    if (!trimmed.startsWith("https://")) {
      setEmbedError("Enter a valid https:// URL from Tableau Public or Power BI Publish-to-Web.");
      return;
    }
    setLoadedEmbedUrl(trimmed);
  }

  const maxChartVal = Math.max(...aggregated.map((d) => d.value), 1);

  return (
    <div className="bi-studio">
      <div className="bi-studio-note">
        <BarChart3 size={16} style={{ color: "var(--blue)", flexShrink: 0 }} />
        <span>
          <strong>Power BI &amp; Tableau Practice Studio:</strong> Proprietary desktop BI tools aren&apos;t text compilers — practice interactive CSV dashboards &amp; KPI aggregations here, or preview published Tableau Public / Power BI web embeds.
        </span>
      </div>

      <div className="bi-subtabs">
        <button
          type="button"
          className={`button compact ${subTab === "builder" ? "primary" : ""}`}
          onClick={() => setSubTab("builder")}
        >
          <PieChart size={14} /> Interactive CSV Visual Builder
        </button>
        <button
          type="button"
          className={`button compact ${subTab === "embed" ? "primary" : ""}`}
          onClick={() => setSubTab("embed")}
        >
          <ExternalLink size={14} /> Preview Tableau / Power BI Link
        </button>
      </div>

      {subTab === "builder" ? (
        <>
          <div className="bi-controls-card">
            <label className="bi-control">
              <span>Group By (Axis)</span>
              <select value={activeDim} onChange={(e) => setSelectedDim(e.target.value)}>
                {dimensionCols.map((col) => (
                  <option key={col} value={col}>{col}</option>
                ))}
              </select>
            </label>

            <label className="bi-control">
              <span>Measure (Value)</span>
              <select value={activeMeasure} onChange={(e) => setSelectedMeasure(e.target.value)}>
                {measureCols.map((col) => (
                  <option key={col} value={col}>{col}</option>
                ))}
              </select>
            </label>

            <label className="bi-control">
              <span>Aggregation</span>
              <select value={aggType} onChange={(e) => setAggType(e.target.value)}>
                <option value="sum">SUM</option>
                <option value="avg">AVERAGE</option>
                <option value="count">COUNT</option>
                <option value="max">MAX</option>
              </select>
            </label>

            <label className="bi-control">
              <span>Chart Visual</span>
              <select value={chartType} onChange={(e) => setChartType(e.target.value)}>
                <option value="bar">Bar Chart</option>
                <option value="line">Line Trend</option>
                <option value="donut">Donut Share</option>
              </select>
            </label>

            <div className="bi-upload-wrap">
              <label className="button compact" style={{ cursor: "pointer" }}>
                <Upload size={13} /> Upload CSV
                <input type="file" accept=".csv,text/csv" onChange={handleCsvUpload} style={{ display: "none" }} />
              </label>
              <small style={{ color: "var(--muted)", fontSize: "11px" }}>Dataset: {csvFileName}</small>
            </div>
          </div>

          <div className="bi-kpi-grid">
            <div className="bi-kpi-card">
              <span>Total Records</span>
              <strong>{kpis.totalRows}</strong>
            </div>
            <div className="bi-kpi-card">
              <span>Total ({activeMeasure || "Metric"})</span>
              <strong>{formatMetric(kpis.totalSum)}</strong>
            </div>
            <div className="bi-kpi-card">
              <span>Average / Record</span>
              <strong>{formatMetric(kpis.avg)}</strong>
            </div>
            <div className="bi-kpi-card">
              <span>Top {activeDim}</span>
              <strong>{kpis.topGroup ? `${kpis.topGroup.label} (${formatMetric(kpis.topGroup.value)})` : "—"}</strong>
            </div>
          </div>

          <div className="bi-visual-grid">
            <div className="bi-chart-panel">
              <div className="bi-panel-title">
                <TrendingUp size={15} />
                <span>{aggType.toUpperCase()} of {activeMeasure} by {activeDim}</span>
              </div>

              {chartType === "bar" && (
                <div className="bi-bar-list">
                  {aggregated.map((item, idx) => {
                    const pct = Math.max(4, Math.round((item.value / maxChartVal) * 100));
                    return (
                      <div className="bi-bar-row" key={item.label}>
                        <span className="bi-bar-label" title={item.label}>{item.label}</span>
                        <div className="bi-bar-track">
                          <div
                            className="bi-bar-fill"
                            style={{ width: `${pct}%`, background: CHART_COLORS[idx % CHART_COLORS.length] }}
                          />
                        </div>
                        <span className="bi-bar-val">{formatMetric(item.value)}</span>
                      </div>
                    );
                  })}
                </div>
              )}

              {chartType === "line" && aggregated.length > 0 && (() => {
                const W = 540;
                const H = 220;
                const padX = 36;
                const padY = 24;
                const spanX = aggregated.length > 1 ? (W - padX * 2) / (aggregated.length - 1) : 0;
                const pts = aggregated.map((d, idx) => {
                  const x = padX + idx * spanX;
                  const y = H - padY - ((d.value / maxChartVal) * (H - padY * 2));
                  return { ...d, x, y };
                });
                const pathD = pts.map((p, idx) => `${idx === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
                return (
                  <svg viewBox={`0 0 ${W} ${H}`} className="bi-line-svg" role="img" aria-label="Trend line chart">
                    <line x1={padX} y1={H - padY} x2={W - padX} y2={H - padY} stroke="#cbd5e1" strokeWidth="1" />
                    <path d={pathD} fill="none" stroke="#4f46e5" strokeWidth="2.5" strokeLinejoin="round" />
                    {pts.map((p) => (
                      <g key={p.label}>
                        <circle cx={p.x} cy={p.y} r="4.5" fill="#4f46e5" stroke="#fff" strokeWidth="1.5" />
                        <text x={p.x} y={H - 6} textAnchor="middle" fontSize="10" fill="#64748b">
                          {p.label.slice(0, 10)}
                        </text>
                        <text x={p.x} y={p.y - 9} textAnchor="middle" fontSize="10" fontWeight="600" fill="#1e293b">
                          {formatMetric(p.value)}
                        </text>
                      </g>
                    ))}
                  </svg>
                );
              })()}

              {chartType === "donut" && aggregated.length > 0 && (() => {
                const total = aggregated.reduce((s, d) => s + Math.max(0, d.value), 0) || 1;
                let cumulative = 0;
                const R = 70;
                const C = 2 * Math.PI * R;
                return (
                  <div className="bi-donut-wrap">
                    <svg viewBox="0 0 200 200" width="190" height="190" role="img" aria-label="Donut share chart">
                      {aggregated.map((d, idx) => {
                        const fraction = Math.max(0, d.value) / total;
                        const dash = fraction * C;
                        const offset = -cumulative * C;
                        cumulative += fraction;
                        return (
                          <circle
                            key={d.label}
                            cx="100"
                            cy="100"
                            r={R}
                            fill="transparent"
                            stroke={CHART_COLORS[idx % CHART_COLORS.length]}
                            strokeWidth="26"
                            strokeDasharray={`${dash} ${C - dash}`}
                            strokeDashoffset={offset}
                            transform="rotate(-90 100 100)"
                          />
                        );
                      })}
                      <text x="100" y="96" textAnchor="middle" fontSize="11" fill="#64748b">Total</text>
                      <text x="100" y="114" textAnchor="middle" fontSize="14" fontWeight="700" fill="#0f172a">
                        {formatMetric(total)}
                      </text>
                    </svg>
                    <div className="bi-donut-legend">
                      {aggregated.map((d, idx) => (
                        <div key={d.label} className="bi-legend-item">
                          <span className="bi-legend-dot" style={{ background: CHART_COLORS[idx % CHART_COLORS.length] }} />
                          <span>{d.label}</span>
                          <strong>{Math.round((d.value / total) * 100)}%</strong>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>

            <div className="bi-table-panel">
              <div className="bi-panel-title">
                <FileSpreadsheet size={15} />
                <span>Source Data Preview (First {Math.min(10, parsed.rows.length)} of {parsed.rows.length} rows)</span>
              </div>
              <div className="compiler-table-scroll">
                <table className="compiler-sql-table">
                  <thead>
                    <tr>
                      {parsed.headers.map((h) => <th key={h}>{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {parsed.rows.slice(0, 10).map((row, idx) => (
                      <tr key={idx}>
                        {parsed.headers.map((h) => <td key={h}>{row[h]}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className="bi-embed-card">
          <form onSubmit={handleLoadEmbed} className="bi-embed-form">
            <label className="form-field" style={{ flex: 1 }}>
              <span>Tableau Public or Power BI Publish-to-Web URL</span>
              <input
                type="url"
                placeholder="https://public.tableau.com/views/... or https://app.powerbi.com/view?r=..."
                value={embedUrl}
                onChange={(e) => setEmbedUrl(e.target.value)}
              />
            </label>
            <button type="submit" className="button primary">Load Preview</button>
          </form>
          {embedError && <div className="portal-alert error">{embedError}</div>}
          {loadedEmbedUrl ? (
            <div style={{ marginTop: "14px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                <small style={{ color: "var(--muted)" }}>If the host blocks iframe framing, open directly in a new tab:</small>
                <a className="button compact" href={loadedEmbedUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink size={13} /> Open Report Tab
                </a>
              </div>
              <iframe
                title="BI Dashboard Preview"
                src={loadedEmbedUrl}
                sandbox="allow-scripts allow-same-origin allow-popups"
                style={{ width: "100%", height: "460px", border: "1px solid var(--line)", borderRadius: "10px", background: "#fff" }}
              />
            </div>
          ) : (
            <div className="portal-empty compact" style={{ marginTop: "14px" }}>
              <BarChart3 size={20} />
              <span>Publish your dashboard in Power BI Service or Tableau Public and paste its embed URL above to verify before submitting.</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
