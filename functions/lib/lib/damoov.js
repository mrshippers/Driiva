"use strict";
/**
 * DAMOOV API CLIENT
 * =================
 * Server-side client for Damoov DataHub / User APIs.
 * Damoov is the telematics data collection layer - it feeds Driiva's XGBoost
 * risk model. Credentials come from Firebase Secret Manager, never hardcoded.
 *
 * API docs: https://docs.damoov.com/
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createDamoovUser = createDamoovUser;
exports.fetchDamoovTrips = fetchDamoovTrips;
exports.fetchDamoovDailyStats = fetchDamoovDailyStats;
const functions = __importStar(require("firebase-functions"));
const node_fetch_1 = __importDefault(require("node-fetch"));
const DAMOOV_USER_API = 'https://user.telematicssdk.com/v1';
const DAMOOV_DATAHUB_API = 'https://api.telematicssdk.com/indicators/v2';
function getCredentials() {
    const instanceId = process.env.DAMOOV_INSTANCE_ID;
    const instanceKey = process.env.DAMOOV_INSTANCE_KEY;
    if (!instanceId || !instanceKey) {
        throw new Error('Damoov credentials not available - check Secret Manager');
    }
    return { instanceId, instanceKey };
}
/**
 * Register a new user with Damoov. Returns deviceToken on success, null on failure.
 * Called silently during Firebase Auth registration - must never throw.
 */
async function createDamoovUser(uid, email) {
    try {
        const { instanceId, instanceKey } = getCredentials();
        const res = await (0, node_fetch_1.default)(`${DAMOOV_USER_API}/registration`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'InstanceId': instanceId,
                'InstanceKey': instanceKey,
            },
            body: JSON.stringify({
                Email: email,
                ClientId: uid,
                FirstName: '',
                LastName: '',
            }),
            timeout: 10000,
        });
        if (!res.ok) {
            functions.logger.warn(`Damoov user creation HTTP ${res.status} for ${uid}`);
            return null;
        }
        const data = (await res.json());
        if (!data.Result?.IsSuccess) {
            functions.logger.warn('Damoov user creation failed', {
                uid,
                error: data.Result?.ErrorMessage,
            });
            return null;
        }
        functions.logger.info(`Damoov user created for ${uid}`, {
            deviceToken: data.DeviceToken?.substring(0, 8) + '...',
        });
        return data.DeviceToken;
    }
    catch (error) {
        functions.logger.error('Damoov user creation exception', { uid, error });
        return null;
    }
}
/**
 * Fetch trips from Damoov DataHub for a given device token and date range.
 * Returns array of trip data or empty array on failure.
 */
async function fetchDamoovTrips(deviceToken, startDate, endDate) {
    try {
        const { instanceId, instanceKey } = getCredentials();
        const res = await (0, node_fetch_1.default)(`${DAMOOV_DATAHUB_API}/Scores/trips?` +
            `StartDate=${encodeURIComponent(startDate)}&` +
            `EndDate=${encodeURIComponent(endDate)}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'DeviceToken': deviceToken,
                'InstanceId': instanceId,
                'InstanceKey': instanceKey,
            },
            timeout: 30000,
        });
        if (!res.ok) {
            functions.logger.warn(`Damoov trips fetch HTTP ${res.status}`, {
                deviceToken: deviceToken.substring(0, 8) + '...',
            });
            return [];
        }
        const data = (await res.json());
        if (!data.Result?.IsSuccess) {
            functions.logger.warn('Damoov trips fetch failed', {
                error: data.Result?.ErrorMessage,
            });
            return [];
        }
        return data.Trips ?? [];
    }
    catch (error) {
        functions.logger.error('Damoov trips fetch exception', { error });
        return [];
    }
}
/**
 * Fetch daily driving statistics from Damoov for sparkline/trend data.
 * Returns array of daily score objects.
 */
async function fetchDamoovDailyStats(deviceToken, startDate, endDate) {
    try {
        const { instanceId, instanceKey } = getCredentials();
        const res = await (0, node_fetch_1.default)(`${DAMOOV_DATAHUB_API}/Scores/daily?` +
            `StartDate=${encodeURIComponent(startDate)}&` +
            `EndDate=${encodeURIComponent(endDate)}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'DeviceToken': deviceToken,
                'InstanceId': instanceId,
                'InstanceKey': instanceKey,
            },
            timeout: 15000,
        });
        if (!res.ok)
            return [];
        const data = await res.json();
        if (!data.Result?.IsSuccess)
            return [];
        return data.DailyScores ?? [];
    }
    catch (error) {
        functions.logger.error('Damoov daily stats fetch exception', { error });
        return [];
    }
}
//# sourceMappingURL=damoov.js.map