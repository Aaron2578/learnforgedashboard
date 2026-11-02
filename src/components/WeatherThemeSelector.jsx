import { useState, useRef, useEffect } from "react";
import {
  Sun,
  CloudRain,
  Cloud,
  Snowflake,
  Sunset,
  Moon,
  Compass,
  RefreshCw,
  Check,
  Sparkles,
  MapPin,
  ChevronDown,
} from "lucide-react";
import { useTheme } from "../context/ThemeContext";

const ICON_MAP = {
  Sun,
  CloudRain,
  Cloud,
  Snowflake,
  Sunset,
  Moon,
  Compass,
};

export default function WeatherThemeSelector() {
  const {
    themeMode,
    activeTheme,
    activePreset,
    weatherData,
    loadingWeather,
    setThemeMode,
    refreshWeather,
    presets,
  } = useTheme();

  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  // Close on outside click or Escape
  useEffect(() => {
    function handleClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setOpen(false);
      }
    }
    function handleKeyDown(event) {
      if (event.key === "Escape") setOpen(false);
    }

    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const ActiveIcon = ICON_MAP[activePreset.icon] || Sun;

  return (
    <div className="weather-selector-wrap" ref={containerRef}>
      {/* Topbar Pill Button */}
      <button
        type="button"
        className={`weather-topbar-pill theme-${activeTheme} ${open ? "active" : ""}`}
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-label={`Current weather theme: ${activePreset.name}. Click to change theme.`}
        title={`Weather: ${weatherData.condition} (${weatherData.temp}°C). Click to switch themes.`}
      >
        <span className="weather-pill-icon-wrap">
          <ActiveIcon className="weather-pill-icon animate-weather" size={16} />
        </span>
        <span className="weather-pill-temp">{weatherData.temp}°C</span>
        <span className="weather-pill-name">{activePreset.name}</span>
        <ChevronDown size={13} className={`weather-pill-arrow ${open ? "rotated" : ""}`} />
      </button>

      {/* Popover Dropdown Panel */}
      {open && (
        <div className="weather-popover-panel card" role="dialog" aria-modal="true">
          {/* Header */}
          <div className="weather-panel-header">
            <div>
              <div className="weather-panel-eyebrow">
                <Sparkles size={12} />
                <span>Atmospheric Themes</span>
              </div>
              <h3 className="weather-panel-title">Weather & Theme Mood</h3>
            </div>
            {themeMode === "auto" && (
              <button
                type="button"
                className={`weather-refresh-btn ${loadingWeather ? "spinning" : ""}`}
                onClick={refreshWeather}
                title="Sync with current outside weather"
                disabled={loadingWeather}
              >
                <RefreshCw size={13} />
                <span>{loadingWeather ? "Detecting…" : "Sync"}</span>
              </button>
            )}
          </div>

          {/* Current Live Weather Hero */}
          <div className={`weather-hero-card theme-${activeTheme}`}>
            <div className="weather-hero-left">
              <span className="weather-hero-icon-wrap">
                <ActiveIcon size={26} className="animate-weather" />
              </span>
              <div>
                <div className="weather-hero-temp">
                  <strong>{weatherData.temp}°C</strong>
                  <span>{weatherData.condition}</span>
                </div>
                <div className="weather-hero-location">
                  <MapPin size={11} />
                  <span>
                    {themeMode === "auto"
                      ? `${weatherData.city} (Live Weather)`
                      : "Preset Simulation Mode"}
                  </span>
                </div>
              </div>
            </div>
            <div className="weather-hero-tag">
              {themeMode === "auto" ? "⚡ Live Sync" : "🎨 Custom"}
            </div>
          </div>

          {/* Quick Toggle for Auto Weather Mode */}
          <div className="weather-auto-section">
            <button
              type="button"
              className={`weather-auto-toggle ${themeMode === "auto" ? "active" : ""}`}
              onClick={() => setThemeMode("auto")}
            >
              <div className="auto-toggle-left">
                <span className="auto-icon-wrap">
                  <Compass size={16} />
                </span>
                <div>
                  <strong>Auto Weather Mode (Live)</strong>
                  <small>Automatically changes colors & icons to match your sky</small>
                </div>
              </div>
              {themeMode === "auto" && <span className="auto-active-badge"><Check size={12} /> Active</span>}
            </button>
          </div>

          {/* Theme Presets Grid */}
          <div className="weather-presets-label">
            <span>Manual Theme Presets</span>
          </div>
          <div className="weather-presets-grid">
            {presets
              .filter((p) => p.id !== "auto")
              .map((preset) => {
                const IconComponent = ICON_MAP[preset.icon] || Sun;
                const isCurrent = themeMode === preset.id;

                return (
                  <button
                    key={preset.id}
                    type="button"
                    className={`weather-preset-card theme-${preset.id} ${isCurrent ? "selected" : ""}`}
                    onClick={() => setThemeMode(preset.id)}
                  >
                    <div className="preset-card-top">
                      <span className="preset-icon-badge">
                        <IconComponent size={16} />
                      </span>
                      <span className="preset-temp-badge">{preset.temp}°C</span>
                    </div>
                    <div className="preset-card-info">
                      <strong>{preset.name}</strong>
                      <small>{preset.condition}</small>
                    </div>
                    {isCurrent && (
                      <span className="preset-check">
                        <Check size={12} />
                      </span>
                    )}
                  </button>
                );
              })}
          </div>

          <div className="weather-panel-footer">
            <small>Ambient colors, card gradients, and status moods adapt dynamically</small>
          </div>
        </div>
      )}
    </div>
  );
}

