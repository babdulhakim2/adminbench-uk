const express = require('express')

const app = express()
const port = Number(process.env.PORT || 4001)
const resetToken = process.env.RESET_TOKEN || 'adminbench-reset-token'

let events = []
let sequence = 1
let resetMetadata = {
  trialId: null,
  seed: 'ad01-default',
  resetAt: new Date().toISOString()
}

function requireResetToken (req, res, next) {
  if (req.get('x-adminbench-reset-token') !== resetToken) {
    res.status(403).json({ ok: false, error: 'Invalid reset token' })
    return
  }
  next()
}

app.use(express.json({ limit: '1mb' }))

app.get('/healthz', (req, res) => {
  res.json({ ok: true, service: 'audit-sink', eventCount: events.length, reset: resetMetadata })
})

app.post('/__admin/reset', requireResetToken, (req, res) => {
  const seed = req.body.seed || 'ad01-default'
  if (seed !== 'ad01-default') {
    res.status(400).json({ ok: false, error: `Unsupported seed: ${seed}` })
    return
  }

  events = []
  sequence = 1
  resetMetadata = {
    trialId: req.body.trialId || null,
    seed,
    resetAt: new Date().toISOString()
  }
  res.json({ ok: true, service: 'audit-sink', ...resetMetadata })
})

app.post('/events', (req, res) => {
  const event = {
    id: `audit-${String(sequence).padStart(6, '0')}`,
    receivedAt: new Date().toISOString(),
    eventType: req.body.eventType || 'unknown',
    caseId: req.body.caseId || null,
    actor: req.body.actor || 'unknown',
    path: req.body.path || null,
    payload: req.body.payload || {}
  }
  sequence += 1
  events.push(event)
  res.status(201).json({ ok: true, event })
})

app.get('/events', (req, res) => {
  const caseId = req.query.caseId
  const filtered = caseId ? events.filter(event => event.caseId === caseId) : events
  res.json({ events: filtered })
})

app.listen(port, () => {
  console.log(`audit sink listening on ${port}`)
})
