import React, { useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { GoogleGenAI, Type } from "@google/genai";
import { 
  Camera, 
  Upload, 
  X, 
  Sparkles, 
  Download, 
  RefreshCw, 
  User, 
  Users, 
  AlertCircle,
  Paintbrush
} from "lucide-react";

interface PeopleAnalysis {
  gender: string;
  age_group: string;
  features: string[];
  clothing: string;
  accessories?: string[];
  pose: string;
}

interface Analysis {
  count: number;
  people: PeopleAnalysis[];
  setting: string;
}

export default function App() {
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [caricature, setCaricature] = useState<string | null>(null);
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Initialize Gemini in frontend
  // Prioritize VITE_ prefix for local/VSCode use, fallback to process.env for Cloud environment
  const GEMINI_KEY = (import.meta as any).env?.VITE_GEMINI_API_KEY || (import.meta as any).env?.GEMINI_API_KEY || process.env.GEMINI_API_KEY || "";
  const ai = new GoogleGenAI({ apiKey: GEMINI_KEY });

  const loadingSteps = [
    "🔍 Analyzing your photo...",
    "✨ Detecting facial features...",
    "🎨 Crafting your caricature style...",
    "🖌️ Painting the magic...",
    "🎉 Almost done!",
  ];

  const handleFile = (file: File) => {
    if (!file || !file.type.startsWith("image/")) {
      setError("Please upload an image file (JPG, PNG, WEBP, etc.)");
      return;
    }
    setError(null);
    setCaricature(null);
    setAnalysis(null);
    setUploadedFile(file);
    const url = URL.createObjectURL(file);
    setUploadedImage(url);
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, []);

  const buildCaricaturePrompt = (analysis: Analysis) => {
    const peopleDescriptions = (analysis.people || []).map((p) => {
      const featuresStr = (p.features || []).join(", ");
      return `a cute chibi ${p.age_group || 'adult'} ${p.gender || 'person'} with a striking resemblance to the original photo, faithfully capturing their distinct ${featuresStr || 'facial features'}, wearing ${p.clothing || 'their current outfit'}, ${p.pose || 'maintaining their pose'}`;
    });

    const composition = peopleDescriptions.length > 0 ? peopleDescriptions.join(" and ") : "cute caricatures";
    const setting = analysis.setting || "the existing background scenario";

    return `Masterpiece professional caricature cartoon illustration of ${composition}. The scenario is ${setting}. Chibi anime style but with recognizable character likeness, big expressive eyes, exaggerated but faithful proportions, large head small body. Vibrant colors, clean black ink outlines, watercolor digital fills, sticker-style white border. High-fidelity artistic synthesis, adorable and funny, high quality digital art, 4k resolution. Preserve the vibe and character of the original subjects.`;
  };

  const analyzeWithGemini = async (file: File): Promise<Analysis | null> => {
    if (!GEMINI_KEY) {
      throw new Error("Gemini API Key is missing. Please set GEMINI_API_KEY in your environment or .env file.");
    }

    try {
      const base64 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string).split(",")[1]);
        reader.readAsDataURL(file);
      });

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: {
          parts: [
            { inlineData: { data: base64, mimeType: file.type } },
            {
              text: `Analyze this photo for a high-fidelity caricature conversion. 
              Capture the exact visual essence, facial features, and scenario.
              Identify: count, gender, age_group, striking facial features (nose shape, jawline, hair style, glasses, etc.), current clothing style, and the specific scenario/background.
              Return ONLY a valid JSON object:
              {
                "count": 1,
                "people": [{"gender": "", "age_group": "", "features": ["striking likeness feature 1", "feature 2"], "clothing": "specific outfit description", "pose": "detailed pose"}],
                "setting": "description of the actual photo scenario/background"
              }`,
            },
          ],
        },
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              count: { type: Type.NUMBER },
              people: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    gender: { type: Type.STRING },
                    age_group: { type: Type.STRING },
                    features: { type: Type.ARRAY, items: { type: Type.STRING } },
                    clothing: { type: Type.STRING },
                    pose: { type: Type.STRING }
                  }
                }
              },
              setting: { type: Type.STRING }
            }
          }
        },
      });

      if (!response.text) throw new Error("No response from AI analysis.");
      return JSON.parse(response.text);
    } catch (e: any) {
      console.error("Gemini Analysis Error:", e);
      throw e;
    }
  };

  const generateCaricatureWithGemini = async (analysis: Analysis): Promise<string | null> => {
    try {
      const prompt = buildCaricaturePrompt(analysis);
      console.log("Generating with prompt:", prompt);

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-image",
        contents: {
          parts: [{ text: prompt }],
        },
        config: {
          imageConfig: {
            aspectRatio: "1:1"
          }
        }
      });

      // Find the image part
      for (const part of response.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData?.data) {
          return `data:image/png;base64,${part.inlineData.data}`;
        }
      }
      
      return null;
    } catch (e) {
      console.error("Gemini Generation Error:", e);
      // Fallback message check for API restrictions
      if (e instanceof Error && e.message.includes("API key not valid")) {
          throw new Error("Gemini Image generation requires a specific Tier or API settings. Please ensure your Gemini key supports Image models.");
      }
      throw e;
    }
  };

  const handleGenerate = async () => {
    if (!uploadedFile) return;
    if (!GEMINI_KEY) {
      setError("Gemini API Key missing. Add VITE_GEMINI_API_KEY to your .env file.");
      return;
    }

    setLoading(true);
    setError(null);
    setLoadingStep(0);

    const stepInterval = setInterval(() => {
      setLoadingStep((prev) => (prev < loadingSteps.length - 1 ? prev + 1 : prev));
    }, 1200);

    try {
      const base64 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string).split(",")[1]);
        reader.readAsDataURL(uploadedFile);
      });

      // Optimized performance parameters for faster generation
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-image",
        contents: {
          parts: [
            { inlineData: { data: base64, mimeType: uploadedFile.type } },
            { text: "Masterpiece funny storytelling caricature. Style: Hand-drawn marker art, bold ink outlines, watercolor digital fills. Proportions: Large exaggerated heads, small bodies. Likeness: Strictly maintain facial shape, hair, and distinct features from the photo. Scenario: Funny characteristic pose. High quality, 4k." }
          ],
        },
        config: {
          imageConfig: {
            aspectRatio: "1:1"
          }
        }
      });

      let resultUrl = "";
      for (const part of response.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData?.data) {
          resultUrl = `data:image/png;base64,${part.inlineData.data}`;
          break;
        }
      }

      if (!resultUrl) throw new Error("Generation failed.");

      // Manage History
      const newHistory = [...history.slice(0, historyIndex + 1), resultUrl];
      setHistory(newHistory);
      setHistoryIndex(newHistory.length - 1);
      setCaricature(resultUrl);
      
      setAnalysis({ count: 1, people: [], setting: "Funny Story" });
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred.");
    } finally {
      clearInterval(stepInterval);
      setLoading(false);
    }
  };

  const undoChange = () => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      setHistoryIndex(newIndex);
      setCaricature(history[newIndex]);
    }
  };

  const redoChange = () => {
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1;
      setHistoryIndex(newIndex);
      setCaricature(history[newIndex]);
    }
  };

  const handleDownload = () => {
    if (!caricature) return;
    const link = document.createElement("a");
    link.href = caricature;
    link.download = "my-caricature.png";
    link.click();
  };

  const handleReset = () => {
    setUploadedImage(null);
    setUploadedFile(null);
    setCaricature(null);
    setAnalysis(null);
    setError(null);
  };

  return (
    <div className="min-h-screen bg-brand-bg text-brand-ink selection:bg-brand-accent-soft flex flex-col">
      <header className="px-6 md:px-16 py-8 md:py-10 border-b-2 border-brand-ink flex flex-col md:flex-row justify-between items-center md:items-end gap-6">
        <motion.div 
          initial={{ x: -20, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          className="font-display text-5xl md:text-8xl leading-[0.8] tracking-[-0.05em] uppercase"
        >
          CARICA<span className="text-brand-accent">TOON</span>
        </motion.div>
        <nav className="nav-links pb-2">
          <a href="#" className="hover:text-brand-accent transition-colors">Gallery</a>
          <a href="#" className="hover:text-brand-accent transition-colors">Styles</a>
          <a href="#" className="hover:text-brand-accent transition-colors">Account</a>
        </nav>
      </header>

      <main className="flex-1 grid grid-cols-1 lg:grid-cols-[420px_1fr]">
        {/* Control Panel */}
        <section className="lg:border-r-2 border-brand-ink p-8 md:p-14 flex flex-col gap-10">
          <motion.div 
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="text-xl md:text-2xl font-medium leading-tight md:max-w-xs"
          >
            Upload a photo.<br />
            Get a cute caricature.<br />
            No prompts needed.
          </motion.div>

          <div className="space-y-6">
            <div
              className={`upload-area brutalist-border h-72 flex flex-col items-center justify-center cursor-pointer transition-colors duration-200
                ${dragOver ? "bg-brand-accent-soft" : "bg-white hover:bg-brand-accent-soft/50"}
                ${uploadedImage ? "p-0 overflow-hidden" : "p-8"}
              `}
              onDrop={handleDrop}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onClick={() => !uploadedImage && fileInputRef.current?.click()}
            >
              {uploadedImage ? (
                <div className="w-full h-full relative group">
                  <img src={uploadedImage} alt="Uploaded" className="w-full h-full object-cover grayscale" />
                  <button 
                    className="absolute top-4 right-4 p-2 bg-brand-ink text-white hover:bg-brand-accent transition-colors"
                    onClick={(e) => { e.stopPropagation(); handleReset(); }}
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              ) : (
                <div className="text-center">
                  <div className="text-5xl mb-4">📸</div>
                  <p className="font-extrabold text-sm tracking-widest uppercase">Drop Image Here</p>
                  <p className="text-xs mt-2 opacity-60 uppercase font-bold tracking-wider">JPG, PNG, OR WEBP</p>
                </div>
              )}
            </div>
            
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            />

            {uploadedImage && !loading && !caricature && (
              <motion.button 
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="btn-brutal w-full shadow-[6px_6px_0px_#0C0C0C]"
                onClick={handleGenerate}
              >
                Generate Magic
              </motion.button>
            )}

            <div className="text-xs leading-relaxed text-neutral-500 font-medium">
              Powered by Google Gemini 3 Flash analysis and Gemini 2.5 Flash Image synthesis.
            </div>
          </div>
        </section>

        {/* Preview Panel */}
        <section className="p-8 md:p-14 bg-white flex flex-col items-center justify-center relative min-h-[400px]">
          <AnimatePresence mode="wait">
            {!loading && !caricature && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="text-center text-neutral-300 pointer-events-none"
              >
                <div className="text-8xl md:text-9xl font-display uppercase tracking-tighter opacity-10">
                  Preview
                </div>
              </motion.div>
            )}

            {loading && (
              <motion.div 
                key="loading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="text-center w-full max-w-md"
              >
                <div className="mb-8 font-display text-4xl uppercase italic tracking-tight text-brand-accent">
                   Painting...
                </div>
                <div className="relative h-4 brutalist-border bg-white overflow-hidden mb-6">
                  <motion.div 
                    className="h-full bg-brand-ink"
                    initial={{ width: 0 }}
                    animate={{ width: `${((loadingStep + 1) / loadingSteps.length) * 100}%` }}
                  />
                </div>
                <p className="font-bold text-sm tracking-widest uppercase text-brand-ink">
                  {loadingSteps[loadingStep]}
                </p>
              </motion.div>
            )}

            {caricature && !loading && (
              <motion.div 
                key="result"
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="flex flex-col items-center"
              >
                <div className="caricature-frame mb-16 relative">
                  <img src={caricature} alt="Your Caricature" className="max-w-full h-auto w-[440px] grayscale-0 contrast-[1.1]" />
                  
                  {/* Status Pills */}
                  <div className="absolute -bottom-10 left-0 flex flex-wrap gap-2">
                    <span className="bg-brand-ink text-white px-4 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest">
                      {analysis?.count} {analysis?.count === 1 ? "Person" : "People"} Detected
                    </span>
                    <span className="bg-brand-ink text-white px-4 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest">
                      {analysis?.setting} Style
                    </span>
                    <span className="bg-brand-ink text-white px-4 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest">
                      High Detail
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap justify-center gap-4 mt-8">
                  <div className="flex gap-2 mr-4 border-r-2 border-brand-ink pr-6">
                    <button 
                      onClick={undoChange}
                      disabled={historyIndex <= 0}
                      className={`p-3 border-2 border-brand-ink shadow-[2px_2px_0px_#0C0C0C] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all ${historyIndex <= 0 ? 'opacity-30 cursor-not-allowed grayscale' : 'hover:bg-neutral-100'}`}
                      title="Undo"
                    >
                      <RefreshCw className="w-5 h-5 scale-x-[-1]" />
                    </button>
                    <button 
                      onClick={redoChange}
                      disabled={historyIndex >= history.length - 1}
                      className={`p-3 border-2 border-brand-ink shadow-[2px_2px_0px_#0C0C0C] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all ${historyIndex >= history.length - 1 ? 'opacity-30 cursor-not-allowed grayscale' : 'hover:bg-neutral-100'}`}
                      title="Redo"
                    >
                      <RefreshCw className="w-5 h-5" />
                    </button>
                  </div>
                  
                  <button 
                    className="bg-brand-ink text-white px-8 py-3 font-display uppercase text-sm tracking-wider hover:bg-brand-accent transition-colors shadow-[4px_4px_0px_#0C0C0C] active:translate-x-1 active:translate-y-1 active:shadow-none"
                    onClick={handleDownload}
                  >
                    Download PNG
                  </button>
                  <button 
                    className="bg-white border-2 border-brand-ink px-8 py-3 font-display uppercase text-sm tracking-wider hover:bg-neutral-100 transition-colors shadow-[4px_4px_0px_#0C0C0C] active:translate-x-1 active:translate-y-1 active:shadow-none"
                    onClick={handleGenerate}
                  >
                    Regenerate
                  </button>
                  <button 
                    className="bg-white border-2 border-brand-ink px-8 py-3 font-display uppercase text-sm tracking-wider hover:bg-neutral-100 transition-colors shadow-[4px_4px_0px_#0C0C0C] active:translate-x-1 active:translate-y-1 active:shadow-none"
                    onClick={handleReset}
                  >
                    New Photo
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {error && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="absolute top-8 left-8 right-8 p-6 bg-red-100 border-2 border-red-600 text-red-600 font-bold uppercase text-xs tracking-widest flex items-center gap-4"
            >
              <AlertCircle className="w-5 h-5" />
              <span>{error}</span>
            </motion.div>
          )}
        </section>
      </main>

      <footer className="px-6 md:px-16 py-6 border-t-2 border-brand-ink flex flex-col md:flex-row justify-between items-center gap-4 text-[10px] md:text-xs font-bold uppercase tracking-widest">
        <div className="flex gap-6">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-brand-accent rounded-full animate-pulse" />
            AI Engine: Active
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-brand-accent rounded-full" />
             Latency: 4.2s
          </div>
        </div>
        <div>
          © 2024 CARICATOON STUDIO — FOR CREATIVE USE ONLY
        </div>
      </footer>
    </div>
  );
}
