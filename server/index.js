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

// ===== JSON2VIDEO =====
const JSON2VIDEO_API = "https://api.json2video.com/v2/movies"
const JSON2VIDEO_KEY = process.env.JSON2VIDEO_API_KEY

// ===== Storage =====
let jobs = {}

// ===== Root =====
app.get("/", (req, res) => {
  res.send("🚀 Autovid Backend Running")
})

// ===== Generate Script =====
async function generateScript(topic) {
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: "You are a YouTube script writer" },
      { role: "user", content: `Write a short engaging video script about ${topic}` }
    ]
  })

  return res.choices[0].message.content
}

// ===== Create Video (JSON2Video) =====
async function createVideo(script) {
  const response = await axios.post(
    JSON2VIDEO_API,
    {
      scenes: [
        {
          elements: [
            {
              type: "text",
              text: script.substring(0, 200),
              style: {
                fontSize: 48,
                color: "#ffffff"
              }
            }
          ]
        }
      ]
    },
    {
      headers: {
        "x-api-key": JSON2VIDEO_KEY,
        "Content-Type": "application/json"
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
    const script = await generateScript(topic || "Motivation")

    const video = await createVideo(script)

    jobs[job_id] = {
      status: "completed",
      script,
      video
    }

  } catch (e) {
    jobs[job_id] = {
      status: "failed",
      error: e.message
    }
  }
})

// ===== CHECK =====
app.get("/api/job/:id", (req, res) => {
  res.json(jobs[req.params.id] || { error: "Not found" })
})

// ===== START =====
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`)
})
