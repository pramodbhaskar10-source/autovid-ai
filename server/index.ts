import { generateScript } from '../lib/openai.ts'
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

app.get('/api/status/:id', (req, res) => {
  res.json(jobs[req.params.id] || {})
})

app.listen(process.env.PORT || 3000, () => {
  console.log('Server running')
})
