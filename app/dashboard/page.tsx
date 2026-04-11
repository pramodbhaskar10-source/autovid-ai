'use client'
import { useState } from 'react'

export default function Dashboard() {
  const [loading, setLoading] = useState(false)

  const generate = async () => {
    setLoading(true)
    await fetch('/api/autopilot', { method: 'POST' })
    setLoading(false)
  }

  return (
    <div style={{ padding: 40 }}>
      <button onClick={generate}>
        {loading ? 'Generating...' : 'Generate Video'}
      </button>
    </div>
  )
}
