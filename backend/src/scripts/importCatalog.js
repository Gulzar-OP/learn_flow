import "dotenv/config";

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mongoose from "mongoose";
import { parse } from "csv-parse/sync";

import { connectDatabase } from "../config/db.js";
import Course from "../models/Course.js";
import Lesson from "../models/Lesson.js";
import PdfResource from "../models/PdfResource.js";
import { slugify } from "../utils/slugify.js";

// ======================================================
// PATH SETUP
// ======================================================

// Current file path
const __filename = fileURLToPath(import.meta.url);

// Current directory
const __dirname = path.dirname(__filename);

// Example:
//
// backend/
// ├── data/
// │   ├── videos_final.csv
// │   └── pdfs_final.csv
// └── src/
//     └── scripts/
//         └── importCatalog.js
//
// __dirname = backend/src/scripts
// ../..      = backend

const backendRoot = path.resolve(__dirname, "../..");

console.log("====================================");
console.log("📦 LearnFlow Catalog Import");
console.log("====================================");
console.log("Backend Root:", backendRoot);

// ======================================================
// RESOLVE CSV PATH
// ======================================================

function resolveSource(source, fallback) {
  const selectedSource = source || fallback;

  if (path.isAbsolute(selectedSource)) {
    return selectedSource;
  }

  return path.resolve(backendRoot, selectedSource);
}

// ======================================================
// READ CSV
// ======================================================

function readCsv(source) {
  console.log(`\n📄 Reading CSV: ${source}`);

  if (!source) {
    throw new Error("CSV path is not configured.");
  }

  if (!fs.existsSync(source)) {
    throw new Error(`CSV file not found: ${source}`);
  }

  const content = fs.readFileSync(source, "utf8");

  const rows = parse(content, {
    columns: true,
    skip_empty_lines: true,
    bom: true,
    relax_quotes: true,
    trim: true,
  });

  console.log(`✅ Loaded ${rows.length} rows`);

  return rows;
}

// ======================================================
// MAIN IMPORT
// ======================================================

async function run() {
  try {
    // --------------------------------------------------
    // CSV PATHS
    // --------------------------------------------------

    const videosPath = resolveSource(
      process.env.VIDEOS_CSV,
      "data/videos_final.csv"
    );

    const pdfsPath = resolveSource(
      process.env.PDFS_CSV,
      "data/pdfs_final.csv"
    );

    console.log("\n====================================");
    console.log("📁 CSV PATH CHECK");
    console.log("====================================");

    console.log("Videos path:", videosPath);
    console.log(
      "Videos exists:",
      fs.existsSync(videosPath)
    );

    console.log("PDF path:", pdfsPath);
    console.log(
      "PDF exists:",
      fs.existsSync(pdfsPath)
    );

    // --------------------------------------------------
    // READ CSV DATA
    // --------------------------------------------------

    const videos = readCsv(videosPath);
    const pdfs = readCsv(pdfsPath);

    console.log("\n====================================");
    console.log("🗄️ CONNECTING DATABASE");
    console.log("====================================");

    await connectDatabase();

    console.log("✅ Database connected");

    // --------------------------------------------------
    // BUILD COURSE CATALOG
    // --------------------------------------------------

    const catalog = new Map();

    const allRows = [...videos, ...pdfs];

    for (const row of allRows) {
      const name = row.course?.trim();

      if (!name) {
        continue;
      }

      if (!catalog.has(name)) {
        catalog.set(name, {
          name,
          slug: slugify(name),
          videoCount: 0,
          pdfCount: 0,
          totalDurationSec: 0,
        });
      }
    }

    // --------------------------------------------------
    // COUNT VIDEOS
    // --------------------------------------------------

    for (const row of videos) {
      const courseName = row.course?.trim();

      if (!courseName) {
        continue;
      }

      const item = catalog.get(courseName);

      if (!item) {
        continue;
      }

      item.videoCount += 1;

      item.totalDurationSec +=
        Number(row.duration_sec) || 0;
    }

    // --------------------------------------------------
    // COUNT PDFS
    // --------------------------------------------------

    for (const row of pdfs) {
      const courseName = row.course?.trim();

      if (!courseName) {
        continue;
      }

      const item = catalog.get(courseName);

      if (!item) {
        continue;
      }

      item.pdfCount += 1;
    }

    console.log("\n====================================");
    console.log("📚 IMPORTING COURSES");
    console.log("====================================");

    // --------------------------------------------------
    // UPSERT COURSES
    // --------------------------------------------------

    for (const item of catalog.values()) {
      await Course.findOneAndUpdate(
        {
          name: item.name,
        },
        {
          $set: item,
        },
        {
          upsert: true,
          new: true,
        }
      );
    }

    console.log(
      `✅ ${catalog.size} courses processed`
    );

    // --------------------------------------------------
    // FETCH COURSE DOCUMENTS
    // --------------------------------------------------

    const courseNames = [...catalog.keys()];

    const courses = await Course.find({
      name: {
        $in: courseNames,
      },
    });

    const courseByName = new Map(
      courses.map((course) => [
        course.name,
        course,
      ])
    );

    // --------------------------------------------------
    // BUILD LESSON OPERATIONS
    // --------------------------------------------------

    const lessonOps = videos
      .filter((row) => {
        const courseName = row.course?.trim();

        return (
          row.video_id &&
          courseName &&
          courseByName.has(courseName)
        );
      })
      .map((row) => {
        const courseName =
          row.course.trim();

        const course =
          courseByName.get(courseName);

        return {
          updateOne: {
            filter: {
              videoId: row.video_id,
            },

            update: {
              $set: {
                course: course._id,

                courseName:
                  course.name,

                courseSlug:
                  course.slug,

                section:
                  row.section?.trim() ||
                  "General",

                title:
                  row.title?.trim() ||
                  "Untitled lesson",

                sourceId:
                  row.source_id || "",

                durationSec:
                  Number(
                    row.duration_sec
                  ) || 0,

                hlsUrl:
                  row.m3u8_url || "",

                mp4Url:
                  row.mp4_url || "",

                sourceType:
                  row.type || "video",
              },
            },

            upsert: true,
          },
        };
      });

    // --------------------------------------------------
    // BUILD PDF OPERATIONS
    // --------------------------------------------------

    const pdfOps = pdfs
      .filter((row) => {
        const courseName =
          row.course?.trim();

        return (
          row.object_id &&
          row.pdf_url &&
          courseName &&
          courseByName.has(
            courseName
          )
        );
      })
      .map((row) => {
        const courseName =
          row.course.trim();

        const course =
          courseByName.get(
            courseName
          );

        return {
          updateOne: {
            filter: {
              objectId:
                row.object_id,
            },

            update: {
              $set: {
                course:
                  course._id,

                courseName:
                  course.name,

                courseSlug:
                  course.slug,

                title:
                  row.title?.trim() ||
                  "Untitled resource",

                pdfUrl:
                  row.pdf_url,
              },
            },

            upsert: true,
          },
        };
      });

    // --------------------------------------------------
    // IMPORT LESSONS
    // --------------------------------------------------

    console.log("\n====================================");
    console.log("🎥 IMPORTING VIDEOS");
    console.log("====================================");

    if (lessonOps.length > 0) {
      const lessonResult =
        await Lesson.bulkWrite(
          lessonOps,
          {
            ordered: false,
          }
        );

      console.log(
        `✅ ${lessonOps.length} videos processed`
      );

      console.log(
        "Video bulk result:",
        {
          matched:
            lessonResult.matchedCount,
          modified:
            lessonResult.modifiedCount,
          upserted:
            lessonResult.upsertedCount,
        }
      );
    } else {
      console.log(
        "⚠️ No videos found to import"
      );
    }

    // --------------------------------------------------
    // IMPORT PDFS
    // --------------------------------------------------

    console.log("\n====================================");
    console.log("📕 IMPORTING PDFS");
    console.log("====================================");

    if (pdfOps.length > 0) {
      const pdfResult =
        await PdfResource.bulkWrite(
          pdfOps,
          {
            ordered: false,
          }
        );

      console.log(
        `✅ ${pdfOps.length} PDFs processed`
      );

      console.log(
        "PDF bulk result:",
        {
          matched:
            pdfResult.matchedCount,
          modified:
            pdfResult.modifiedCount,
          upserted:
            pdfResult.upsertedCount,
        }
      );
    } else {
      console.log(
        "⚠️ No PDFs found to import"
      );
    }

    // --------------------------------------------------
    // FINAL SUMMARY
    // --------------------------------------------------

    console.log("\n====================================");
    console.log("🎉 IMPORT COMPLETED");
    console.log("====================================");

    console.log(
      `Courses: ${catalog.size}`
    );

    console.log(
      `Videos: ${lessonOps.length}`
    );

    console.log(
      `PDFs: ${pdfOps.length}`
    );

    await mongoose.disconnect();

    console.log(
      "\n✅ MongoDB disconnected"
    );

    process.exit(0);
  } catch (error) {
    console.error(
      "\n❌ CATALOG IMPORT ERROR"
    );

    console.error(error);

    try {
      await mongoose.disconnect();
    } catch {
      // ignore disconnect error
    }

    process.exit(1);
  }
}

run();