import express from "express"
import OpenAI from "openai"

const app = express()
app.use(express.json())

const PORT = process.env.PORT || 3000

// ===== OpenAI Setup =====
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

// ===== Root Route =====
app.get("/", (req, res) => {
  res.send("🚀 Autovid Backend Running")
})

// ===== Storage =====
let jobs: any = {}

// ===== Generate Script =====
async function generateScript(topic: string) {
  try {
    const res = await openai.chat.completions.create({
      model: "gpt-5.4-mini",
      messages: [
        { role: "system", content: "You are a YouTube script writer" },
        { role: "user", content: `Write a 5 minute YouTube script about ${topic}` }
      ]
    })

    return res.choices[0].message.content

  } catch (err: any) {
    console.error("🔥 FULL OPENAI ERROR:", err)
    throw new Error(err?.message || "Unknown OpenAI error")
  }
}

// ===== AUTOPILOT API =====
app.post("/api/autopilot", async (req, res) => {
  const { topic } = req.body

  const job_id = Date.now().toString()
  jobs[job_id] = { status: "processing" }

  res.json({ job_id })

  try {
    console.log("Starting job:", job_id)

    const script = await generateScript(topic || "Motivation")

    jobs[job_id] = {
      status: "completed",
      script
    }

  } catch (e: any) {
    jobs[job_id] = {
      status: "failed",
      error: e.message
    }
  }
})

// ===== CHECK JOB =====
app.get("/api/job/:id", (req, res) => {
  const job = jobs[req.params.id]

  if (!job) {
    return res.status(404).json({ error: "Job not found" })
  }

  res.json(job)
})

// ===== START SERVER =====
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`)
})
