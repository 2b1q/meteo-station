import mqtt, { MqttClient } from "mqtt";

export function createMqttClient(
    onMessage: (topic: string, payload: Buffer) => void
): MqttClient {
    const url = process.env.MQTT_URL ?? "mqtt://mosquitto:1883";
    const clientId = `meteo-backend-${Math.random().toString(16).slice(2)}`;

    const client = mqtt.connect(url, {
        clientId,
        username: process.env.MQTT_USERNAME || undefined,
        password: process.env.MQTT_PASSWORD || undefined,
    });

    const topic = process.env.MQTT_TOPIC ?? "meteo/+/reading";

    client.on("connect", () => {
        console.log("[MQTT] connected to", url);
        client.subscribe(topic, (err) => {
            if (err) {
                console.error("[MQTT] subscribe error", err);
            } else {
                console.log("[MQTT] subscribed to", topic);
            }
        });
    });

    client.on("message", (t: string, payload: Buffer) => {
        onMessage(t, payload);
    });

    client.on("error", (err) => {
        console.error("[MQTT] error", err);
    });

    client.on("close", () => {
        console.log("[MQTT] connection closed");
    });

    return client;
}