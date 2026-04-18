import express from "express";
import multer from "multer";
import cors from "cors";
import path from "path";
import { createServer as createViteServer } from "vite";
import Anthropic from "@anthropic-ai/sdk";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

app.use(cors());
app.use(express.json());

// Initialize AI Clients
const anthropic = process.env.ANTHROPIC_API_KEY ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }) : null;

async function analyzePhoto(buffer: Buffer, mimeType: string) {
  const base64 = buffer.toString("base64");

  if (anthropic) {
    try {
      const response = await anthropic.messages.create({
        model: "claude-3-5-sonnet-20240620",
        max_tokens: 1000,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: { type: "base64", media_type: mimeType as any, data: base64 },
              },
              {
                type: "text",
                text: `Analyze this photo and describe the person(s) for a cute Indian wedding-style caricature. 
                Identify: count, gender, age_group, notable features to exaggerate, clothing, and pose.
                Return ONLY a valid JSON object:
                {
                  "count": 1,
                  "people": [{"gender": "", "age_group": "", "features": [], "clothing": "", "accessories": [], "pose": ""}],
                  "setting": "wedding/celebration"
                }`,
              },
            ],
          },
        ],
      });
      const content = response.content[0];
      if ('text' in content) {
        const jsonMatch = content.text.match(/\{[\s\S]*\}/);
        if (jsonMatch) return JSON.parse(jsonMatch[0]);
      }
    } catch (e) {
      console.error("Anthropic Error:", e);
    }
  }

  return null;
}

function buildCaricaturePrompt(analysis: any) {
  const peopleDescriptions = (analysis.people || []).map((p: any) => {
    return `a cute chibi ${p.age_group || 'adult'} ${p.gender || 'person'} with exaggerated ${ (p.features || []).join(", ") || 'facial features'}, wearing ${p.clothing || 'festive attire'}, ${p.pose || 'smiling'}`;
  });

  const composition = peopleDescriptions.length > 0 ? peopleDescriptions.join(" and ") : "cute caricatures";
  const setting = analysis.setting || "festive";

  return `Masterpiece, cute Indian wedding caricature cartoon illustration of ${composition}, Indian ${setting} celebration theme, chibi anime style, big expressive eyes, exaggerated proportions, large head small body, warm vibrant colors, hand-drawn marker style, black ink outlines, watercolor fills, festive decorative border, professional caricature art, adorable and funny, white background, high quality digital art, 4k`;
}

app.post("/api/generate", upload.single("photo"), async (req, res) => {
  try {
    if (!process.env.TOGETHER_API_KEY) return res.status(500).json({ error: "Together API key missing" });

    let analysis: any = null;

    // 1. Try to use analysis from frontend if provided
    if (req.body.analysis) {
        try {
            analysis = JSON.parse(req.body.analysis);
            console.log("Using analysis from frontend");
        } catch (e) {
            console.error("Failed to parse frontend analysis:", e);
        }
    }

    // 2. If no analysis, try Claude in backend
    if (!analysis && req.file) {
        console.log("Analyzing photo with Claude...");
        analysis = await analyzePhoto(req.file.buffer, req.file.mimetype);
    }

    // 3. If still no analysis, return fallback instruction
    if (!analysis) {
        return res.json({ success: false, fallback: true });
    }

    console.log("Analysis result:", analysis);

    const prompt = buildCaricaturePrompt(analysis);
    console.log("Generated Prompt:", prompt);

    const togetherResponse = await fetch("https://api.together.xyz/v1/images/generations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.TOGETHER_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "black-forest-labs/FLUX.1-schnell-Free",
        prompt: prompt,
        width: 1024,
        height: 1024,
        steps: 4,
        n: 1,
        response_format: "b64_json",
      }),
    });

    const data: any = await togetherResponse.json();
    
    if (data.error) {
        throw new Error(data.error.message || "Together AI Error");
    }

    if (!data.data || !data.data[0]) {
        console.error("Full Together Response:", data);
        throw new Error("Image generation failed - no data returned");
    }

    res.json({
      success: true,
      caricature: `data:image/png;base64,${data.data[0].b64_json}`,
      analysis: analysis
    });
  } catch (error: any) {
    console.error("Generation Error:", error);
    res.status(500).json({ error: error.message || "Internal server error" });
  }
});

// Middleware for Vite in dev / Static files in prod
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
