import logger from "./logger.js";

export function auditEvent(action, data = {}, user = null) {
    logger.info({
        type: "EVENT",
        action,
        userId: user?.id || null,
        userEmail: user?.email || null,
        timestamp: new Date().toISOString(),
        ...data
    });
}
