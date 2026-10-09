import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";

import authRoutes from "./routes/authRoutes.js";
import catalogRoutes from "./routes/catalogRoutes.js";
import progressRoutes from "./routes/progressRoutes.js";
import bookmarkRoutes from "./routes/bookmarkRoutes.js";
import noteRoutes from "./routes/noteRoutes.js";
import adminApprovalRoutes from "./routes/adminApprovalRoutes.js";

import { errorHandler, notFound } from "./middleware/error.js";

const app = express();

app.set("trust proxy", 1);

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: {
      policy: "cross-origin",
    },
  }),
);

const allowedOrigins = [
  process.env.CLIENT_URL,
  ...(process.env.CLIENT_URLS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
  "http://localhost:5173",
].filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      // Allows non-browser tools and Render health checks.
      if (!origin) {
        return callback(null, true);
      }

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      console.error("Blocked CORS origin:", origin);
      return callback(new Error(`CORS blocked for origin: ${origin}`));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);

app.use(
  express.json({
    limit: "1mb",
  }),
);
app.use(
  express.urlencoded({
    extended: true,
  }),
);
app.use(cookieParser());

if (process.env.NODE_ENV !== "test") {
  app.use(morgan("dev"));
}

if (process.env.DEBUG_AUTH === "true") {
  app.use((req, res, next) => {
    console.log("Request:", req.method, req.originalUrl);
    console.log("Origin:", req.headers.origin);
    console.log("Cookie header:", req.headers.cookie ? "FOUND" : "NOT FOUND");
    console.log(
      "Parsed auth cookie:",
      req.cookies?.learnflow_token ? "FOUND" : "NOT FOUND",
    );
    next();
  });
}

app.get("/", (req, res) => {
  return res.json({
    success: true,
    message: "LearnFlow API is running",
  });
});

app.get("/api/health", (req, res) => {
  return res.json({
    status: "ok",
  });
});

app.use("/api/auth", authRoutes);
app.use("/api/catalog", catalogRoutes);
app.use("/api/progress", progressRoutes);
app.use("/api/bookmarks", bookmarkRoutes);
app.use("/api/notes", noteRoutes);
app.use("/api/admin", adminApprovalRoutes);

app.use(notFound);
app.use(errorHandler);

export default app;
