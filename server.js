require("dotenv").config();

const express = require("express");
const path = require("node:path");
const multer = require("multer");
const OpenAI = require("openai");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");

const app = express();
const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, "public");

// OpenAI client is created only when an API key is configured.
const apiKey = process.env.OPENAI_API_KEY;
const openai = apiKey ? new OpenAI({ apiKey }) : null;
const MODEL = process.env.OPENAI_MODEL || "gpt-4.1-mini";

app.disable("x-powered-by");
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.static(PUBLIC_DIR));

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many requests. Please try again later." },
});

app.use("/api", apiLimiter);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 1,
  },
  fileFilter: (_req, file, callback) => {
    const allowed = ["image/jpeg", "image/png", "image/webp"];

    if (allowed.includes(file.mimetype)) {
      callback(null, true);
    } else {
      callback(new Error("Please upload a JPG, PNG, or WebP image."));
    }
  },
});

// Check whether the server is running.
app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "Odin TechFix",
    aiConfigured: Boolean(openai),
  });
});

// Serve the homepage explicitly.
app.get("/", (_req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, "index.html"), (error) => {
    if (error && !res.headersSent) {
      res
        .status(404)
        .send("Homepage not found. Make sure public/index.html exists.");
    }
  });
});

// Odin The AI chat endpoint.
app.post("/api/odin", upload.single("image"), async (req, res) => {
  try {
    if (!openai) {
      return res.status(503).json({
        error:
          "Odin AI is not configured. Check OPENAI_API_KEY in your .env file.",
      });
    }

    const message = String(req.body.message || "").trim();

    if (!message && !req.file) {
      return res.status(400).json({
        error: "Please enter a message or attach an image.",
      });
    }

    const content = [];

    content.push({
      type: "input_text",
      text: [
        "You are Odin, the AI assistant for Odin TechFix.",
        "Help users troubleshoot computers, laptops, software, and common technical problems.",
        "Give clear, practical step-by-step instructions.",
        "Ask clarifying questions when needed. Never claim to have physically repaired a device.",
        "",
        "User message:",
        message ||
          "Please inspect the attached image and help me understand it.",
      ].join("\n"),
    });

    if (req.file) {
      const base64 = req.file.buffer.toString("base64");
      const dataUrl = `data:${req.file.mimetype};base64,${base64}`;

      content.push({
        type: "input_image",
        image_url: dataUrl,
        detail: "auto",
      });
    }

    const response = await openai.responses.create({
      model: MODEL,
      instructions:
        "Be helpful, accurate, friendly, and concise. You are Odin The AI for Odin TechFix.",
      input: [
        {
          role: "user",
          content,
        },
      ],
    });

    res.json({
      reply:
        response.output_text ||
        "Sorry, I couldn't generate a reply. Please try again.",
    });
  } catch (error) {
    console.error("Odin AI request failed:", error.message);

    if (error.status === 401) {
      return res.status(502).json({
        error: "OpenAI rejected the API key. Check your .env file.",
      });
    }

    if (error.status === 429) {
      return res.status(429).json({
        error:
          "The AI request was rate-limited or your API quota may be exhausted. Check your API usage and billing.",
      });
    }

    res.status(500).json({
      error: "Odin AI couldn't complete that request. Please try again.",
    });
  }
});

// Handle unsupported API endpoints.
app.use("/api", (_req, res) => {
  res.status(404).json({ error: "API endpoint not found." });
});

// Handle upload errors and unexpected request errors.
app.use((error, _req, res, _next) => {
  console.error("Server error:", error.message);

  if (error instanceof multer.MulterError) {
    return res.status(400).json({
      error:
        error.code === "LIMIT_FILE_SIZE"
          ? "Image must be 5 MB or smaller."
          : "The uploaded file could not be processed.",
    });
  }

  res.status(400).json({
    error: error.message || "Something went wrong.",
  });
});

app.listen(PORT, () => {
  console.log(`Odin TechFix is running at http://localhost:${PORT}`);
  console.log(`Homepage folder: ${PUBLIC_DIR}`);
  console.log(`Odin AI configured: ${Boolean(openai)}`);
});
