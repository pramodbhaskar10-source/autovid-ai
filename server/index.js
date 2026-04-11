import express from "express"
import OpenAI from "openai"
import axios from "axios"

const app = express()
app.use(express.json())

const PORT = process.env.PORT || 10000

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

let jobs: any = {}

// ROOT
app.get("/", (req, res) => {
  res.send("Backend running")
})

// SCRIPT
async function generateScript(topic: string) {
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: "You write viral short video scripts" },
      { role: "user", content: `Write a short script about ${topic}` }
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
    const script = await generateScript(topic)

    await axios.post(process.env.WORKER_URL + "/generate", {
      job_id,
      script
    })

    jobs[job_id] = {
      status: "sent to worker"
    }

  } catch (e: any) {
    jobs[job_id] = {
      status: "failed",
      error: e.message
    }
  }
})

// CHECK
app.get("/api/job/:id", (req, res) => {
  res.json(jobs[req.params.id] || {})
})

app.listen(PORT, () => {
  console.log("Running on port " + PORT)
})
