import { InfluxDB, Point, QueryApi, WriteApi } from "@influxdata/influxdb-client";
import type { HistoryResult, MeteoReading, MetricField } from "./types";
import { METRIC_FIELDS } from "./types";
import { addField } from "./helpers";

const url = process.env.INFLUX_URL ?? "http://influxdb:8086";
const token = process.env.INFLUX_TOKEN ?? "";
const org = process.env.INFLUX_ORG ?? "meteo";
const bucket = process.env.INFLUX_BUCKET ?? "meteo";

let writeApi: WriteApi | null = null;
let queryApi: QueryApi | null = null;

function createEmptyHistory(): HistoryResult {
    return METRIC_FIELDS.reduce((acc, key) => {
        acc[key] = [];
        return acc;
    }, {} as HistoryResult);
}

if (token) {
    const client = new InfluxDB({ url, token });
    writeApi = client.getWriteApi(org, bucket, "ms");
    queryApi = client.getQueryApi(org);
    console.log("[INFLUX] write/query API initialized");
} else {
    console.warn("[INFLUX] no token provided, InfluxDB I/O is disabled");
}

export function writePoint(reading: MeteoReading): void {
    if (!writeApi) return;

    const point = new Point("reading").tag("deviceId", String(reading.deviceId));

    addField(point, "bmp_t", reading.bmp_t);
    addField(point, "bmp_p", reading.bmp_p);
    addField(point, "bmp_qnh", reading.bmp_qnh);
    addField(point, "aht_t", reading.aht_t);
    addField(point, "aht_h", reading.aht_h);
    addField(point, "mq135", reading.mq135);
    addField(point, "mq3", reading.mq3);

    writeApi.writePoint(point);
}

type QueryHistoryParams = {
    rangeMinutes: number;
    deviceId?: string | number;
};

/**
 * Read historical data from InfluxDB for given time range.
 * Returns arrays of points per metric.
 */
export async function queryHistory(params: QueryHistoryParams): Promise<HistoryResult> {
    if (!queryApi) {
        console.warn("[INFLUX] query API is not initialized");
        return createEmptyHistory();
    }

    const rangeMinutes = Math.max(1, Math.floor(params.rangeMinutes));
    const deviceId = params.deviceId ? String(params.deviceId) : null;

    const fieldFilter = METRIC_FIELDS
        .map((f) => `r._field == "${f}"`)
        .join(" or ");

    const deviceFilter = deviceId
        ? `|> filter(fn: (r) => r.deviceId == "${deviceId}")`
        : "";

    const flux = `
        from(bucket: "${bucket}")
        |> range(start: -${rangeMinutes}m)
        |> filter(fn: (r) => r._measurement == "reading")
        ${deviceFilter}
        |> filter(fn: (r) => ${fieldFilter})
        |> keep(columns: ["_time", "_value", "_field"])
        |> sort(columns: ["_time"])
    `;

    const history = createEmptyHistory();

    try {
        const rows = await queryApi.collectRows(flux);
        for (const row of rows as any[]) {
            const field = row._field as string;
            if (!METRIC_FIELDS.includes(field as MetricField)) continue;

            const timeStr = row._time as string | undefined;
            const valueNum = Number(row._value);

            if (!timeStr || !Number.isFinite(valueNum)) continue;

            const ts = Date.parse(timeStr);
            if (!Number.isFinite(ts)) continue;

            history[field as MetricField].push({ ts, value: valueNum });
        }
    } catch (err) {
        console.error("[INFLUX] query error", err);
    }

    return history;
}

// flush on exit
process.on("beforeExit", () => {
    if (writeApi) {
        writeApi.flush().catch((err) => {
            console.error("[INFLUX] flush error", err);
        });
    }
});