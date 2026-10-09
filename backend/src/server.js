import "dotenv/config";
import app from "./app.js";
import { connectDatabase } from "./config/db.js";
import { startExpiredUserCleanup } from "./services/expiredUserCleanup.js";

const port = Number(process.env.PORT) || 3000;

async function start() {
  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI is required");
  }

  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET is required");
  }

  await connectDatabase();
  startExpiredUserCleanup();

  app.listen(port, () => {
    console.log(`LearnFlow API running on port ${port}`);
  });
}

start().catch((error) => {
  console.error("SERVER START ERROR:", error);
  process.exit(1);
});
