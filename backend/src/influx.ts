import { InfluxDB, Point, WriteApi } from "@influxdata/influxdb-client";
import type { MeteoReading } from "./types";

const url = process.env.INFLUX_URL ?? "http://influxdb:8086";
const token = process.env.INFLUX_TOKEN ?? "";
const org = process.env.INFLUX_ORG ?? "meteo";
const bucket = process.env.INFLUX_BUCKET ?? "meteo";

let writeApi: WriteApi | null = null;

if (token) {
    const client = new InfluxDB({ url, token });
    writeApi = client.getWriteApi(org, bucket, "ms");
    console.log("[INFLUX] write API initialized");
} else {
    console.warn("[INFLUX] no token provided, writes are disabled");
}

function addField(p: Point, name: string, value: number | null): void {
    if (value === null) return;
    if (!Number.isFinite(value)) return;
    p.floatField(name, value);
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

// flush on exit
process.on("beforeExit", () => {
    if (writeApi) {
        writeApi.flush().catch((err) => {
            console.error("[INFLUX] flush error", err);
        });
    }
});