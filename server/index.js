import express from "express"
import OpenAI from "openai"
import axios from "axios"

const app = express()
app.use(express.json())

const PORT = process.env.PORT || 10000

// OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

// Memory storage
let jobs = {}

// Root route
app.get("/", (req, res) => {
  res.send("🚀 Autovid Backend Running")
})

// Generate script
async function generateScript(topic) {
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: "You are a YouTube script writer" },
      { role: "user", content: `Write a 1 minute YouTube script about ${topic}` }
    ]
  })

  return res.choices[0].message.content
}

// AUTOPILOT
app.post("/api/autopilot", async (req, res) => {
  const { topic } = req.body

  const job_id = Date.now().toString()
  jobs[job_id] = { status: "processing" }

  res.json({ job_id })

  try {
    const script = await generateScript(topic || "Motivation")

    // send to worker
    const workerRes = await axios.post(
      `${process.env.WORKER_URL}/create-video`,
      { script }
    )

    jobs[job_id] = {
      status: "completed",
      script,
      video: workerRes.data
    }

  } catch (e) {
    jobs[job_id] = {
      status: "failed",
      error: e.message
    }
  }
})

// check job
app.get("/api/job/:id", (req, res) => {
  res.json(jobs[req.params.id] || { error: "Not found" })
})

// start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`)
})
