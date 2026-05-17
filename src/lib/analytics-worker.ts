import { env } from "@/env";

export type WorkerEvent = {
    distinctId: string;
    event: string;
    properties: Record<string, unknown>;
    timestamp: string;
};

export type WorkerPayload = {
    events: WorkerEvent[];
};

const REQUEST_TIMEOUT_MS = 5000;

async function postEvent(event: WorkerEvent): Promise<void> {
    try {
        await fetch(`${env.POSTHOG_HOST}/i/v0/e/`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                api_key: env.POSTHOG_API_KEY,
                distinct_id: event.distinctId,
                event: event.event,
                properties: event.properties,
                timestamp: event.timestamp,
            }),
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
    } catch {
        // Best-effort — never throw from the analytics worker
    }
}

export async function runAnalyticsWorker(): Promise<void> {
    try {
        const raw = process.env.EK_ANALYTICS_PAYLOAD;
        if (!raw) return;

        const payload = JSON.parse(raw) as WorkerPayload;
        if (!Array.isArray(payload.events) || payload.events.length === 0) return;

        await Promise.allSettled(payload.events.map(postEvent));
    } catch {
        // Worker must never crash visibly
    }
}
