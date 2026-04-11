import express from "express"
import OpenAI from "openai"
import axios from "axios"

const app = express()
app.use(express.json())

const PORT = process.env.PORT || 10000

// ===== OpenAI =====
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

// ===== Storage =====
let jobs: any = {}

// ===== Root =====
app.get("/", (req, res) => {
  res.send("🚀 Autovid Backend Running")
})

// ===== Generate Script =====
async function generateScript(topic: string) {
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: "You are a YouTube script writer" },
      { role: "user", content: `Write a short engaging script about ${topic}` }
    ]
  })

  return res.choices[0].message.content
}

// ===== Generate Video (JSON2Video API) =====
async function generateVideo(script: string) {
  const response = await axios.post(
    "https://api.json2video.com/v2/movies",
    {
      scenes: [
        {
          elements: [
            {
              type: "text",
              text: script,
              style: {
                fontSize: 40,
                color: "#ffffff",
                textAlign: "center"
              }
            }
          ]
        }
      ]
    },
    {
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.JSON2VIDEO_API_KEY
      }
    }
  )

  return response.data
}

// ===== AUTOPILOT =====
app.post("/api/autopilot", async (req, res) => {
  const { topic } = req.body

  const job_id = Date.now().toString()
  jobs[job_id] = { status: "processing" }

  res.json({ job_id })

  try {
    console.log("🚀 Job started:", job_id)

    const script = await generateScript(topic || "Motivation")
    console.log("✅ Script ready")

    const video = await generateVideo(script)
    console.log("🎬 Video created")

    jobs[job_id] = {
      status: "completed",
      script,
      video
    }

  } catch (err: any) {
    console.error("❌ ERROR:", err.message)

    jobs[job_id] = {
      status: "failed",
      error: err.message
    }
  }
})

// ===== JOB STATUS =====
app.get("/api/job/:id", (req, res) => {
  res.json(jobs[req.params.id] || { error: "Not found" })
})

// ===== START SERVER =====
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`)
})
