import express from 'express'
import { exec } from 'child_process'
import ffmpegPath from 'ffmpeg-static'

const app = express()
app.use(express.json())

let jobs: any = {}

app.post('/api/autopilot', async (req, res) => {
  const job_id = Date.now().toString()
  jobs[job_id] = { status: 'processing' }

  res.json({ job_id })

  setTimeout(() => {
    exec(`${ffmpegPath} -version`, () => {
      jobs[job_id].status = 'completed'
    })
  }, 2000)
})

app.get('/api/status/:id', (req, res) => {
  res.json(jobs[req.params.id] || {})
})

app.listen(process.env.PORT || 3000, () => {
  console.log('Server running')
})
