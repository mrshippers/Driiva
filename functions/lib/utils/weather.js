"use strict";
/**
 * WEATHER ENRICHMENT
 * ==================
 * Fetches weather conditions for a trip using the Open-Meteo free API.
 * No API key required. Maps WMO weather codes to simple condition strings.
 *
 * Open-Meteo archive API: https://open-meteo.com/en/docs/historical-weather-api
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.getWeatherForTrip = getWeatherForTrip;
const functions = __importStar(require("firebase-functions"));
const WMO_CODE_MAP = {
    0: 'clear', // Clear sky
    1: 'clear', // Mainly clear
    2: 'cloudy', // Partly cloudy
    3: 'cloudy', // Overcast
    45: 'fog', // Fog
    48: 'fog', // Depositing rime fog
    51: 'rain', // Light drizzle
    53: 'rain', // Moderate drizzle
    55: 'rain', // Dense drizzle
    56: 'rain', // Light freezing drizzle
    57: 'rain', // Dense freezing drizzle
    61: 'rain', // Slight rain
    63: 'rain', // Moderate rain
    65: 'rain', // Heavy rain
    66: 'rain', // Light freezing rain
    67: 'rain', // Heavy freezing rain
    71: 'snow', // Slight snow fall
    73: 'snow', // Moderate snow fall
    75: 'snow', // Heavy snow fall
    77: 'snow', // Snow grains
    80: 'rain', // Slight rain showers
    81: 'rain', // Moderate rain showers
    82: 'rain', // Violent rain showers
    85: 'snow', // Slight snow showers
    86: 'snow', // Heavy snow showers
    95: 'storm', // Thunderstorm
    96: 'storm', // Thunderstorm with slight hail
    99: 'storm', // Thunderstorm with heavy hail
};
function wmoCodeToCondition(code) {
    return WMO_CODE_MAP[code] ?? 'cloudy';
}
/**
 * Get the weather condition at a given location and time.
 * Uses Open-Meteo's historical archive API (free, no key).
 *
 * Falls back to null on any error (network, parsing, timeout).
 */
async function getWeatherForTrip(lat, lng, timestamp) {
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
        const data = (await response.json());
        const weatherCodes = data?.hourly?.weather_code;
        if (!weatherCodes || weatherCodes.length === 0) {
            return null;
        }
        const hourIndex = Math.min(hour, weatherCodes.length - 1);
        const code = weatherCodes[hourIndex];
        if (typeof code !== 'number') {
            return null;
        }
        return wmoCodeToCondition(code);
    }
    catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
            functions.logger.warn('[weather] Open-Meteo request timed out (3s)');
        }
        else {
            functions.logger.warn('[weather] Failed to fetch weather:', err instanceof Error ? err.message : err);
        }
        return null;
    }
}
//# sourceMappingURL=weather.js.map