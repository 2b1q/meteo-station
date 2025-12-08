// Shared types between MQTT, Influx, WS

export interface MeteoReading {
    deviceId: number | string;
    bmp_t: number | null;
    bmp_p: number | null;
    bmp_qnh: number | null;
    aht_t: number | null;
    aht_h: number | null;
    mq135: number | null;
    mq3: number | null;
    ts: string; // ISO timestamp
}

// Metrics list used in Influx and history API
export const METRIC_FIELDS = [
    "bmp_t",
    "bmp_p",
    "bmp_qnh",
    "aht_t",
    "aht_h",
    "mq135",
    "mq3",
] as const;

export type MetricField = (typeof METRIC_FIELDS)[number];

export interface HistoryPoint {
    ts: number;   // unix ms
    value: number;
}

export type HistoryResult = Record<MetricField, HistoryPoint[]>;