import winston from "winston";
import DailyRotateFile from "winston-daily-rotate-file";

const { createLogger, format, transports } = winston;

const logger = createLogger({
    level: "info",
    format: format.combine(
        format.timestamp(),
        format.json()
    ),
    transports: [
        new DailyRotateFile({
            dirname: "logs",
            filename: "audit-%DATE%.log",
            datePattern: "YYYY-MM-DD",
            zippedArchive: true,
            maxSize: "20m",
            maxFiles: "90d"
        })
    ]
});

export default logger;
