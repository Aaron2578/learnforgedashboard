import { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";

const ThemeContext = createContext(null);

export const THEME_PRESETS = [
  {
    id: "auto",
    name: "Auto Weather",
    desc: "Syncs with outside weather in real-time",
    icon: "Compass",
    badge: "Auto",
  },
  {
    id: "sunny",
    name: "Sunny Sky",
    desc: "Warm amber & sky blue radiant daylight",
    icon: "Sun",
    temp: 28,
    condition: "Clear Sky",
    emoji: "☀️",
    greeting: "Bright & sunny outside — Perfect day for learning!",
  },
  {
    id: "rainy",
    name: "Rainy Showers",
    desc: "Oceanic rain mist & calming blues",
    icon: "CloudRain",
    temp: 20,
    condition: "Passing Rain",
    emoji: "🌧️",
    greeting: "Rainy day outside — Stay cozy and focused!",
  },
  {
    id: "cloudy",
    name: "Overcast",
    desc: "Soft slate clouds & low-glare shadows",
    icon: "Cloud",
    temp: 22,
    condition: "Mostly Cloudy",
    emoji: "☁️",
    greeting: "Calm overcast skies — Great day to get work done!",
  },
  {
    id: "snowy",
    name: "Winter Frost",
    desc: "Crisp glacial icy cyan & frosty hues",
    icon: "Snowflake",
    temp: 1,
    condition: "Light Snow",
    emoji: "❄️",
    greeting: "Crisp frosty weather — Keep warm and study on!",
  },
  {
    id: "sunset",
    name: "Golden Hour",
    desc: "Vibrant coral, rose & warm peach twilight",
    icon: "Sunset",
    temp: 25,
    condition: "Sunset Glow",
    emoji: "🌅",
    greeting: "Golden hour glow — Great time to review achievements!",
  },
  {
    id: "night",
    name: "Midnight Stars",
    desc: "Obsidian dark mode & starlight violet",
    icon: "Moon",
    temp: 18,
    condition: "Starry Night",
    emoji: "🌙",
    greeting: "Peaceful starry night — Rest well or enjoy deep study!",
  },
];

function getTimeFallbackTheme() {
  const hour = new Date().getHours();
  if (hour >= 6 && hour < 17) return "sunny";
  if (hour >= 17 && hour < 19) return "sunset";
  return "night";
}

function mapWmoCodeToTheme(code, isDay) {
  // WMO Weather interpretation codes (WW)
  // 0, 1: Clear sky / Mainly clear
  if (code === 0 || code === 1) {
    if (!isDay) return { theme: "night", condition: "Clear Starry Sky" };
    const hour = new Date().getHours();
    if (hour >= 17 && hour <= 19) return { theme: "sunset", condition: "Golden Sunset" };
    return { theme: "sunny", condition: "Clear Sunny Sky" };
  }
  // 2, 3: Partly cloudy, overcast
  if (code === 2 || code === 3) {
    return { theme: "cloudy", condition: code === 2 ? "Partly Cloudy" : "Overcast" };
  }
  // 45, 48: Fog
  if (code === 45 || code === 48) {
    return { theme: "cloudy", condition: "Foggy Mist" };
  }
  // 51-67, 80-82: Drizzle & Rain
  if (
    (code >= 51 && code <= 67) ||
    (code >= 80 && code <= 82)
  ) {
    return { theme: "rainy", condition: "Showers & Rain" };
  }
  // 71-77, 85-86: Snow
  if (
    (code >= 71 && code <= 77) ||
    (code >= 85 && code <= 86)
  ) {
    return { theme: "snowy", condition: "Snow Flurries" };
  }
  // 95, 96, 99: Thunderstorm
  if (code >= 95) {
    return { theme: "rainy", condition: "Thunderstorm" };
  }
  return { theme: isDay ? "sunny" : "night", condition: "Mild Weather" };
}

export function ThemeProvider({ children }) {
  const [themeMode, setThemeModeState] = useState(() => {
    return localStorage.getItem("tm_theme_mode") || "auto";
  });

  const [weatherData, setWeatherData] = useState(() => {
    const fallback = getTimeFallbackTheme();
    const preset = THEME_PRESETS.find((p) => p.id === fallback) || THEME_PRESETS[1];
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const city = tz ? tz.split("/")[1]?.replace(/_/g, " ") : "Local";
    return {
      type: fallback,
      temp: preset.temp,
      condition: preset.condition,
      icon: preset.icon,
      emoji: preset.emoji,
      greeting: preset.greeting,
      city: city || "Campus",
      isLive: false,
    };
  });

  const [loadingWeather, setLoadingWeather] = useState(false);

  // Active theme resolved from mode or weather
  const activeTheme = useMemo(() => {
    if (themeMode === "auto") {
      return weatherData.type || "sunny";
    }
    return themeMode;
  }, [themeMode, weatherData.type]);

  const activePreset = useMemo(() => {
    return THEME_PRESETS.find((p) => p.id === activeTheme) || THEME_PRESETS[1];
  }, [activeTheme]);

  const setThemeMode = useCallback((mode) => {
    setThemeModeState(mode);
    localStorage.setItem("tm_theme_mode", mode);
  }, []);

  // Fetch real weather from Open-Meteo API
  const fetchLiveWeather = useCallback(async () => {
    if (!navigator.geolocation) return;
    setLoadingWeather(true);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const { latitude, longitude } = position.coords;
          const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude.toFixed(2)}&longitude=${longitude.toFixed(2)}&current=temperature_2m,relative_humidity_2m,weather_code,is_day,wind_speed_10m`;
          const res = await fetch(url, { signal: controller.signal });
          clearTimeout(timeoutId);

          if (!res.ok) throw new Error("Weather request failed");
          const json = await res.json();
          const current = json.current;

          if (current) {
            const mapped = mapWmoCodeToTheme(current.weather_code, Boolean(current.is_day));
            const preset = THEME_PRESETS.find((p) => p.id === mapped.theme) || THEME_PRESETS[1];
            const tz = json.timezone ? json.timezone.split("/")[1]?.replace(/_/g, " ") : "";

            setWeatherData({
              type: mapped.theme,
              temp: Math.round(current.temperature_2m),
              condition: mapped.condition,
              icon: preset.icon,
              emoji: preset.emoji,
              greeting: preset.greeting,
              city: tz || "Your Location",
              isLive: true,
            });
          }
        } catch (err) {
          // If network / API fails, gracefully keep existing time-based fallback
        } finally {
          setLoadingWeather(false);
        }
      },
      () => {
        // Location denied or unavailable: keep time-based fallback
        setLoadingWeather(false);
      },
      { timeout: 5000, maximumAge: 600000 },
    );
  }, []);

  // On mount and when auto is enabled, try live weather
  useEffect(() => {
    if (themeMode === "auto") {
      fetchLiveWeather();
    }
  }, [themeMode, fetchLiveWeather]);

  // Apply data-theme and data-weather attributes to <html> root
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-theme", activeTheme);
    root.setAttribute("data-weather", weatherData.type);
    root.style.colorScheme = activeTheme === "night" ? "dark" : "light";
  }, [activeTheme, weatherData.type]);

  const value = useMemo(
    () => ({
      themeMode,
      activeTheme,
      activePreset,
      weatherData,
      loadingWeather,
      setThemeMode,
      refreshWeather: fetchLiveWeather,
      presets: THEME_PRESETS,
    }),
    [themeMode, activeTheme, activePreset, weatherData, loadingWeather, setThemeMode, fetchLiveWeather],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}
