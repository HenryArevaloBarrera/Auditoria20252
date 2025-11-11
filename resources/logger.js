// resources/logger.js
import { createLogger, format, transports } from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';

const { combine, timestamp, json } = format;

const logger = createLogger({
  level: 'info',
  format: combine(timestamp(), json()),
  transports: [
    new transports.Console(), // útil en Render/Vercel logs
    new DailyRotateFile({
      filename: 'logs/audit-%DATE%.log', // carpeta logs/
      datePattern: 'YYYY-MM-DD',
      maxFiles: '100d', // mantener 14 días
      dirname: '.', // ruta relativa al proyecto; en serverless no persiste
      zippedArchive: false
    })
  ],
  exitOnError: false
});

export default logger;
