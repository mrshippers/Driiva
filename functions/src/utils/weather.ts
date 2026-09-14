/**
 * WEATHER ENRICHMENT
 * ==================
 * Fetches weather conditions for a trip using the Open-Meteo free API.
 * No API key required. Maps WMO weather codes to simple condition strings.
 *
 * Open-Meteo archive API: https://open-meteo.com/en/docs/historical-weather-api
 */

import * as functions from 'firebase-functions/v1';

export type WeatherCondition = 'clear' | 'cloudy' | 'rain' | 'snow' | 'fog' | 'storm';

const WMO_CODE_MAP: Record<number, WeatherCondition> = {
  0: 'clear',       // Clear sky
  1: 'clear',       // Mainly clear
  2: 'cloudy',      // Partly cloudy
  3: 'cloudy',      // Overcast
  45: 'fog',        // Fog
  48: 'fog',        // Depositing rime fog
  51: 'rain',       // Light drizzle
  53: 'rain',       // Moderate drizzle
  55: 'rain',       // Dense drizzle
  56: 'rain',       // Light freezing drizzle
  57: 'rain',       // Dense freezing drizzle
  61: 'rain',       // Slight rain
  63: 'rain',       // Moderate rain
  65: 'rain',       // Heavy rain
  66: 'rain',       // Light freezing rain
  67: 'rain',       // Heavy freezing rain
  71: 'snow',       // Slight snow fall
  73: 'snow',       // Moderate snow fall
  75: 'snow',       // Heavy snow fall
  77: 'snow',       // Snow grains
  80: 'rain',       // Slight rain showers
  81: 'rain',       // Moderate rain showers
  82: 'rain',       // Violent rain showers
  85: 'snow',       // Slight snow showers
  86: 'snow',       // Heavy snow showers
  95: 'storm',      // Thunderstorm
  96: 'storm',      // Thunderstorm with slight hail
  99: 'storm',      // Thunderstorm with heavy hail
};

function wmoCodeToCondition(code: number): WeatherCondition {
  return WMO_CODE_MAP[code] ?? 'cloudy';
}

/**
 * Get the weather condition at a given location and time.
 * Uses Open-Meteo's historical archive API (free, no key).
 *
 * Falls back to null on any error (network, parsing, timeout).
 */
export async function getWeatherForTrip(
  lat: number,
  lng: number,
  timestamp: Date,
): Promise<WeatherCondition | null> {
  try {
    const dateStr = timestamp.toISOString().split('T')[0]; // "2026-02-25"
    const hour = timestamp.getUTCHours();

    const url = new URL('https://archive-api.open-meteo.com/v1/archive');
    url.searchParams.set('latitude', lat.toFixed(4));
    url.searchParams.set('longitude', lng.toFixed(4));
    url.searchParams.set('start_date', dateStr);
    url.searchParams.set('end_date', dateStr);
    url.searchParams.set('hourly', 'weather_code');
    url.searchParams.set('timezone', 'UTC');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    const response = await fetch(url.toString(), { signal: controller.signal });
    clearTimeout(timeout);

    if (!response.ok) {
      functions.logger.warn('[weather] Open-Meteo returned non-OK status:', response.status);
      return null;
    }

    // @types/node 26.4 types response.json() as {} rather than any, so the
    // shape this reads is declared here instead of being implicitly any.
    const data = (await response.json()) as { hourly?: { weather_code?: number[] } } | null;
    const weatherCodes: number[] | undefined = data?.hourly?.weather_code;

    if (!weatherCodes || weatherCodes.length === 0) {
      return null;
    }

    const hourIndex = Math.min(hour, weatherCodes.length - 1);
    const code = weatherCodes[hourIndex];

    if (typeof code !== 'number') {
      return null;
    }

    return wmoCodeToCondition(code);
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      functions.logger.warn('[weather] Open-Meteo request timed out (3s)');
    } else {
      functions.logger.warn('[weather] Failed to fetch weather:', err instanceof Error ? err.message : err);
    }
    return null;
  }
}
