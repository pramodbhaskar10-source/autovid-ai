console.log("ENV CHECK:", process.env.OPENAI_API_KEY ? "FOUND" : "MISSING")
import OpenAI from "openai"

let openai: any = null

if (process.env.OPENAI_API_KEY) {
  openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  })
} else {
  console.log("⚠️ OpenAI API key missing")
}

async function generateScript(topic: string) {
  if (!openai) {
    return "OpenAI not configured"
  }

  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: "You are a YouTube script writer" },
      { role: "user", content: `Write a 5 minute YouTube script about ${topic}` }
    ]
  })

  return res.choices[0].message.content
}
import express from 'express'
import { exec } from 'child_process'
import ffmpegPath from 'ffmpeg-static'

const app = express()
app.use(express.json())

let jobs: any = {}

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
    jobs[job_id] = { status: 'failed' }
  }
})

app.get('/api/job/:id', (req, res) => {
  const job = jobs[req.params.id]

  if (!job) {
    return res.status(404).json({ error: "Job not found" })
  }

  res.json(job)
})
