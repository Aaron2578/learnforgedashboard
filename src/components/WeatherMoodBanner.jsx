import {
  Sun,
  CloudRain,
  Cloud,
  Snowflake,
  Sunset,
  Moon,
  Sparkles,
} from "lucide-react";
import { useTheme } from "../context/ThemeContext";

const ICON_MAP = {
  Sun,
  CloudRain,
  Cloud,
  Snowflake,
  Sunset,
  Moon,
};

export default function WeatherMoodBanner({ userName = "Student" }) {
  const { activeTheme, activePreset, weatherData } = useTheme();
  const ActiveIcon = ICON_MAP[activePreset.icon] || Sun;

  return (
    <div className={`weather-mood-banner card theme-${activeTheme}`}>
      <div className="mood-banner-left">
        <span className="mood-icon-container">
          <ActiveIcon size={20} className="animate-weather" />
        </span>
        <div className="mood-text">
          <div className="mood-greeting">
            <strong>{weatherData.greeting}</strong>
          </div>
          <div className="mood-details">
            <span>{weatherData.condition}</span>
            <span className="mood-dot">•</span>
            <span>{weatherData.temp}°C</span>
            <span className="mood-dot">•</span>
            <span>{weatherData.city}</span>
          </div>
        </div>
      </div>
      <div className="mood-badge">
        <Sparkles size={13} />
        <span>{activePreset.name} Atmosphere</span>
      </div>
    </div>
  );
}

