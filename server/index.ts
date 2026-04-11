import express from 'express'
import OpenAI from "openai"
import { exec } from 'child_process'
import ffmpegPath from 'ffmpeg-static'

// ✅ ENV CHECK
console.log("ENV CHECK:", process.env.OPENAI_API_KEY ? "FOUND" : "MISSING")

// ✅ OpenAI Setup
let openai: OpenAI | null = null

if (process.env.OPENAI_API_KEY) {
  openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  })
} else {
  console.log("⚠️ OpenAI API key missing")
}

// ✅ Generate Script Function
async function generateScript(topic: string) {
  if (!openai) {
    return "OpenAI not configured"
  }

  try {
    const res = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are a YouTube script writer" },
        { role: "user", content: `Write a 5 minute YouTube script about ${topic}` }
      ]
    })

    return res.choices?.[0]?.message?.content || "No script generated"

  } catch (error) {
    console.error("OpenAI Error:", error)
    return "Error generating script"
  }
}

// ✅ Express App
const app = express()

app.use(express.json())

// ✅ Root Route (for browser test)
app.get('/', (req, res) => {
  res.send('Autovid AI Backend Running 🚀')
})

// ✅ Job Storage (temporary memory)
let jobs: any = {}

// ✅ Autopilot API
app.post('/api/autopilot', async (req, res) => {
  const { topic } = req.body

  const job_id = Date.now().toString()
  jobs[job_id] = { status: 'processing' }

  res.json({ job_id })

  try {
    const script = await generateScript(topic || "Motivation")

    jobs[job_id] = {
      status: 'completed',
      script
    }
  } catch (e) {
    console.error("ERROR:", e)
    jobs[job_id] = { status: 'failed' }
  }
})

// ✅ Job Status API
app.get('/api/job/:id', (req, res) => {
  const job = jobs[req.params.id]

  if (!job) {
    return res.status(404).json({ error: "Job not found" })
  }

  res.json(job)
})

// ✅ Start Server
const PORT = process.env.PORT || 3000

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`)
  console.log("ENV KEY:", process.env.OPENAI_API_KEY ? "OK" : "MISSING")
})
