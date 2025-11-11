import { appendToDailyLog } from "./audit-storage.js";

const auditMiddleware = (req, res, next) => {
  const start = Date.now();

  res.on("finish", async () => {
    const user = req.session?.user || null;

    const safeBody = { ...req.body };
    if (safeBody.password) safeBody.password = "[PROTECTED]";
    if (safeBody.password2) safeBody.password2 = "[PROTECTED]";

    await appendToDailyLog({
      type: "REQUEST",
      method: req.method,
      path: req.originalUrl,
      ip: req.ip,
      statusCode: res.statusCode,
      durationMs: Date.now() - start,
      userId: user?.id || null,
      userEmail: user?.email || null,
      userAgent: req.headers["user-agent"],
      params: req.params,
      body: safeBody
    });
  });

  next();
};

export default auditMiddleware;
