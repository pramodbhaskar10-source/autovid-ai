import express from "express"

const app = express()
app.use(express.json())

app.get("/", (req, res) => {
  res.send("Backend running ✅")
})

// CALL WORKER
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

    // ✅ DIRECT PASS
    res.json({
      project: data.project
    })

  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// STATUS CHECK
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
