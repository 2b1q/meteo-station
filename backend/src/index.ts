import "dotenv/config";
import Fastify from "fastify";
import websocket from "@fastify/websocket";
import type { MeteoReading } from "./types";
import { createMqttClient } from "./mqttClient";
import { writePoint } from "./influx";

const PORT = Number(process.env.BACKEND_PORT ?? 4000);

const fastify = Fastify({
    logger: true,
});

const wsClients = new Set<any>();

function broadcast(reading: MeteoReading): void {
    const payload = JSON.stringify(reading);
    for (const client of wsClients) {
        try {
            if (client.readyState === client.OPEN) {
                client.send(payload);
            }
        } catch (err) {
            fastify.log.error({ err }, "WS broadcast error");
        }
    }
}

// helper: normalize to number | null
function toNumber(value: unknown): number | null {
    if (!value) return null;
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
}

async function main(): Promise<void> {
    await fastify.register(websocket);

    fastify.get("/ws", { websocket: true }, (socket: any, _req) => {
        wsClients.add(socket);

        socket.on("close", () => {
            wsClients.delete(socket);
        });
    }
    );

    fastify.get("/health", async () => ({ status: "ok" }));

    // MQTT => Influx + WS
    createMqttClient((_topic: string, message: Buffer) => {
        try {
            const raw = JSON.parse(message.toString());

            const reading: MeteoReading = {
                deviceId: raw.deviceId,
                bmp_t: toNumber(raw.bmp_t),
                bmp_p: toNumber(raw.bmp_p),
                bmp_qnh: toNumber(raw.bmp_qnh),
                aht_t: toNumber(raw.aht_t),
                aht_h: toNumber(raw.aht_h),
                mq135: toNumber(raw.mq135),
                mq3: toNumber(raw.mq3),
                ts: new Date().toISOString(),
            };

            writePoint(reading);
            broadcast(reading);
        } catch (err) {
            fastify.log.error({ err }, "[MQTT] failed to process message");
        }
    });

    await fastify.listen({ port: PORT, host: "0.0.0.0" });
    fastify.log.info(`Server listening on ${PORT}`);
}

main().catch((err) => {
    fastify.log.error(err);
    process.exit(1);
});