import express from "express"
import path from "path"
import { fileURLToPath } from "url"

const app = express()

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

app.use(express.json())

// ✅ FIXED STATIC PATH
app.use(express.static(path.join(__dirname, "../public")))

// ✅ FIXED ROOT ROUTE
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/index.html"))
})

// CREATE VIDEO
app.post("/api/autopilot", async (req, res) => {
  try {
    const response = await fetch(process.env.WORKER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(req.body)
    })

    const data = await response.json()

    res.json({
      project: data.project
    })

  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// CHECK STATUS
app.get("/status/:id", async (req, res) => {
  try {
    const response = await fetch(
      `https://api.json2video.com/v2/movies/${req.params.id}`,
      {
        headers: {
          "x-api-key": process.env.JSON2VIDEO_API_KEY
        }
      }
    )

    const data = await response.json()
    res.json(data)

  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.listen(process.env.PORT || 10000, () => {
  console.log("Server running 🚀")
})
