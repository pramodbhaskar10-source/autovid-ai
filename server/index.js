import express from "express"

const app = express()
app.use(express.json())

app.get("/", (req, res) => {
  res.send("Autovid Backend Running 🚀")
})

// MAIN API (this connects frontend → worker)
app.post("/api/autopilot", async (req, res) => {
  try {
    const topic = req.body.topic || "Success mindset"

    const response = await fetch(process.env.WORKER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ topic })
    })

    const data = await response.json()

    res.json({
      success: true,
      data
    })
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message
    })
  }
})

app.listen(process.env.PORT || 10000, () => {
  console.log("Server running 🚀")
})
