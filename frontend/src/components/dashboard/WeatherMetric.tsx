import { useEffect, useState } from "react";
import { Cloud, CloudRain, Sun, CloudSun, Wind, Droplets } from "lucide-react";

import { getCurrentWeather } from "../../services/weather/weatherService";
import type { CurrentWeather } from "../../services/weather/weatherService";

export function getWeatherDescription(code: number) {
  if (code === 0) return "Céu limpo";
  if (code === 1) return "Predominantemente limpo";
  if (code === 2) return "Parcialmente nublado";
  if (code === 3) return "Nublado";
  if ([45, 48].includes(code)) return "Neblina";
  if ([51, 53, 55, 56, 57].includes(code)) return "Garoa";
  if ([61, 63, 65, 66, 67].includes(code)) return "Chuva";
  if ([71, 73, 75, 77].includes(code)) return "Neve";
  if ([80, 81, 82].includes(code)) return "Chuva passageira";
  if ([85, 86].includes(code)) return "Neve passageira";
  if ([95, 96, 99].includes(code)) return "Tempestade";

  return "Condição desconhecida";
}

export function getWeatherIcon(code: number, isDay: number) {
  if ([61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99].includes(code)) {
    return CloudRain;
  }

  if ([45, 48, 51, 53, 55, 56, 57, 71, 73, 75, 77, 85, 86].includes(code)) {
    return Cloud;
  }

  if (code === 0) {
    return isDay ? Sun : Cloud;
  }

  if ([1, 2].includes(code)) {
    return CloudSun;
  }

  return Cloud;
}

interface WeatherMetricProps {
  weather?: CurrentWeather | null;
  loading?: boolean;
  error?: boolean;
}

export function WeatherMetric({
  weather: externalWeather,
  loading: externalLoading,
  error: externalError,
}: WeatherMetricProps) {
  const isControlled =
    externalWeather !== undefined || externalLoading !== undefined;

  const [internalWeather, setInternalWeather] = useState<CurrentWeather | null>(
    null,
  );
  const [internalLoading, setInternalLoading] = useState(true);
  const [internalError, setInternalError] = useState(false);

  useEffect(() => {
    if (isControlled) return;

    let cancelled = false;

    async function loadWeather() {
      try {
        const data = await getCurrentWeather();

        if (!cancelled) {
          setInternalWeather(data);
          setInternalError(false);
        }
      } catch (err) {
        console.error("Erro ao carregar meteorologia:", err);

        if (!cancelled) {
          setInternalError(true);
        }
      } finally {
        if (!cancelled) {
          setInternalLoading(false);
        }
      }
    }

    loadWeather();

    const interval = window.setInterval(loadWeather, 15 * 60 * 1000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [isControlled]);

  const weather = isControlled ? (externalWeather ?? null) : internalWeather;
  const loading = isControlled ? Boolean(externalLoading) : internalLoading;
  const error = isControlled ? Boolean(externalError) : internalError;

  if (loading) {
    return (
      <article className="metric-card dashboard-custom-card">
        <div className="custom-card-header">
          <div>
            <span className="metric-title">Meteorologia · Curitiba</span>
            <div className="custom-card-value">--°</div>
          </div>

          <div className="metric-icon metric-icon-default">
            <CloudSun size={18} strokeWidth={1.8} />
          </div>
        </div>

        <div className="custom-card-loading">
          Carregando dados meteorológicos...
        </div>

        <div className="custom-card-footer">
          <span>Fonte: Open-Meteo</span>
          <span className="custom-card-footer-dot realtime" />
        </div>
      </article>
    );
  }

  if (error || !weather) {
    return (
      <article className="metric-card dashboard-custom-card">
        <div className="custom-card-header">
          <div>
            <span className="metric-title">Meteorologia · Curitiba</span>
            <div className="custom-card-value">--</div>
          </div>

          <div className="metric-icon metric-icon-default">
            <Cloud size={18} strokeWidth={1.8} />
          </div>
        </div>

        <div className="custom-card-loading">
          Não foi possível conectar à fonte meteorológica.
        </div>

        <div className="custom-card-footer">
          <span>Fonte: Open-Meteo</span>
        </div>
      </article>
    );
  }

  const WeatherIcon = getWeatherIcon(weather.weatherCode, weather.isDay);
  const formattedTime = weather.time.includes("T")
    ? weather.time.split("T")[1]
    : weather.time;

  return (
    <article className="metric-card dashboard-custom-card">
      <div className="custom-card-header">
        <div>
          <span className="metric-title">Meteorologia · Curitiba</span>

          <div className="custom-card-value">
            {Math.round(weather.temperature)}°
          </div>
        </div>

        <div className="metric-icon metric-icon-default">
          <WeatherIcon size={18} strokeWidth={1.8} />
        </div>
      </div>

      <div className="metric-description">
        <span className="metric-status metric-status-default" />
        <span>
          {getWeatherDescription(weather.weatherCode)} · Sensação{" "}
          {Math.round(weather.apparentTemperature)}°
        </span>
      </div>

      <div className="card-metrics-breakdown">
        <div className="card-metric-item">
          <div className="card-metric-value-row">
            <Droplets size={14} />
            <strong>{weather.relativeHumidity}%</strong>
          </div>
          <span>Umidade</span>
        </div>

        <div className="card-metric-item">
          <div className="card-metric-value-row">
            <CloudRain size={14} />
            <strong>{weather.precipitation} mm</strong>
          </div>
          <span>Precipitação</span>
        </div>

        <div className="card-metric-item">
          <div className="card-metric-value-row">
            <Wind size={14} />
            <strong>{Math.round(weather.windSpeed)} km/h</strong>
          </div>
          <span>Vento</span>
        </div>
      </div>

      <div className="custom-card-footer">
        <span>Open-Meteo · {formattedTime}</span>
        <span className="custom-card-footer-dot realtime" />
      </div>
    </article>
  );
}
