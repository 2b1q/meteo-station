// Domain: metrics & readings

export type MetricKey =
    | "aht_t"
    | "aht_h"
    | "bmp_t"
    | "bmp_p"
    | "mq135"
    | "mq3";

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

// Time-series primitives

export interface TimePoint {
    ts: number;   // unix ms
    value: number;
}

export interface SeriesStats {
    min: number;
    max: number;
    avg: number;
}

export type MetricSeriesMap = Record<MetricKey, TimePoint[]>;

// Live / transport payloads

export type LiveValues = Partial<Record<MetricKey, number>> & {
    deviceId?: number | string;
    ts?: number;
};

export interface WsPayload {
    ts?: string;
    deviceId?: number | string;
    aht_t?: number | null;
    aht_h?: number | null;
    bmp_t?: number | null;
    bmp_p?: number | null;
    mq135?: number | null;
    mq3?: number | null;
};

export interface HistoryResponse {
    rangeMinutes: number;
    deviceId: string | number | null;
    points: Record<MetricKey, { ts: number; value: number }[]>;
}

// Chart types for TimeSeriesChart / ChartCard

export interface ChartSeries {
    id: string;
    label: string;
    points: TimePoint[];
}

export interface HoverPayload {
    ts: number;
    values: Record<string, number | null>;
}

export interface TimeSeriesChartProps {
    series: ChartSeries[];
    height?: number;
    showBaselineForId?: string;
    onHoverChange?: (payload: HoverPayload | null) => void;
}

export interface ChartCardProps {
    title: string;
    yLabel: string;
    unitLabel?: string;
    lastUpdatedLabel?: string;
    series: ChartSeries[];
    primarySeriesId: string;
}