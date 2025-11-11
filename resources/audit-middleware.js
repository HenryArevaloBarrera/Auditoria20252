import os from "os";
import { appendToDailyLog } from "./audit-storage.js";

const auditMiddleware = (req, res, next) => {
  const start = Date.now();

  res.on("finish", async () => {
    try {
      const user = req.session?.user || null;

      // ========= Sanitizar body =========
      const safeBody = { ...req.body };
      if (safeBody.password) safeBody.password = "[PROTECTED]";
      if (safeBody.password2) safeBody.password2 = "[PROTECTED]";
      if (safeBody.pass) safeBody.pass = "[PROTECTED]";

      // ========= Construir log completo =========
      const logEntry = {
        timestamp: new Date().toISOString(),
        event_type: "REQUEST",

        user: user
          ? {
              id: user.id,
              email: user.email,
              role: user.role || null
            }
          : "anonymous",

        request: {
          method: req.method,
          path: req.originalUrl,
          full_url: req.protocol + "://" + req.get("host") + req.originalUrl,
          ip: req.headers["x-forwarded-for"] || req.ip,
          user_agent: req.headers["user-agent"],
          headers: req.headers,
          params: req.params,
          query: req.query,
          body: safeBody
        },

        response: {
          status_code: res.statusCode,
          duration_ms: Date.now() - start
        },

        server: {
          hostname: os.hostname(),
          environment: process.env.NODE_ENV || "development",
          process_id: process.pid,
          uptime_seconds: process.uptime()
        }
      };

      // ========= Enviar al manejador de logs diarios =========
      await appendToDailyLog(logEntry);

    } catch (err) {
      console.error("❌ Error en auditMiddleware:", err.message);
    }
  });

  next();
};

export default auditMiddleware;
