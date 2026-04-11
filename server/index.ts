import express from "express"
import OpenAI from "openai"
import axios from "axios"

const app = express()
app.use(express.json())

const PORT = process.env.PORT || 3000

// 🔥 CHANGE THIS AFTER WORKER DEPLOY
const WORKER_URL = "https://your-worker-url.onrender.com"

// ===== OpenAI Setup =====
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

// ===== Root Route =====
app.get("/", (req, res) => {
  res.send("🚀 Autovid Backend Running")
})

// ===== In-memory storage =====
let jobs: any = {}

// ===== Generate Script =====
async function generateScript(topic: string) {
  try {
    const res = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are a YouTube script writer" },
        { role: "user", content: `Write a YouTube video script about ${topic}` }
      ]
    })

    return res.choices[0].message.content || "No script generated"
  } catch (err: any) {
    console.error("OpenAI Error:", err.message)
    throw new Error("Script generation failed")
  }
}

// ===== AUTOPILOT API =====
app.post("/api/autopilot", async (req, res) => {
  const { topic } = req.body

  const job_id = Date.now().toString()
  jobs[job_id] = { status: "processing" }

  res.json({ job_id })

  try {
    console.log("🚀 Starting job:", job_id)

    const script = await generateScript(topic || "Motivation")

    const workerRes = await axios.post(
      "https://autovid-ai-6.onrender.com/create-video",
      {
        script,
        job_id
      }
    )

    jobs[job_id] = {
      status: "completed",
      script,
      video_url: workerRes.data.video_url
    }

  } catch (e: any) {
    console.error("🔥 ERROR:", e.message)

    jobs[job_id] = {
      status: "failed",
      error: e.message
    }
  }
})

// ===== CHECK JOB =====
app.get("/api/job/:id", (req, res) => {
  res.json(jobs[req.params.id] || { error: "Not found" })
})

// ===== START SERVER =====
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`)
})
