import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import type { HistoryResult, MeteoReading } from "./types";
import { createMqttClient } from "./mqttClient";
import { writePoint, queryHistory } from "./influx";
import { toNumber } from "./helpers";

const PORT = Number(process.env.BACKEND_PORT ?? 4000);
const MAX_HISTORY_MINUTES = 12 * 60;

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

async function main(): Promise<void> {
    await fastify.register(websocket);
    // CORS only development
    await fastify.register(cors, {
        // allow 5173 frontend dev server
        origin: ['http://localhost:5173'],
    });

    fastify.get("/ws", { websocket: true }, (socket: any) => {
        wsClients.add(socket);

        socket.on("close", () => {
            wsClients.delete(socket);
        });
    });

    fastify.get("/health", async () => ({ status: "ok" }));

    fastify.get("/api/history", async (request, reply) => {
        const query = request.query as { minutes?: string; deviceId?: string };

        const minutesRaw = query.minutes ?? "15";
        const minutesNum = Number(minutesRaw);

        if (!Number.isFinite(minutesNum) || minutesNum <= 0) {
            reply.status(400);
            return { error: "Invalid 'minutes' query parameter" };
        }

        const rangeMinutes = Math.min(Math.floor(minutesNum), MAX_HISTORY_MINUTES);

        const history: HistoryResult = await queryHistory({
            rangeMinutes,
            deviceId: query.deviceId,
        });

        return {
            rangeMinutes,
            deviceId: query.deviceId ?? null,
            points: history,
        };
    });

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