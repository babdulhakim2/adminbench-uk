const express = require('express')
const documents = require('./data/documents')

const app = express()
const port = Number(process.env.PORT || 4002)
const resetToken = process.env.RESET_TOKEN || 'adminbench-reset-token'
const publicPortalUrl = process.env.PUBLIC_PORTAL_URL || 'http://localhost:3000'
const defaultSeedAliases = new Map([
  ['ad01-default', 'ad01-001'],
  ['vat-default', 'vat-001'],
  ['ico-default', 'ico-001']
])
const supportedCaseIds = new Set(documents.map(document => document.caseId))

let resetMetadata = {
  trialId: null,
  seed: 'v0.1-default',
  resetAt: new Date().toISOString()
}

function requireResetToken (req, res, next) {
  if (req.get('x-adminbench-reset-token') !== resetToken) {
    res.status(403).json({ ok: false, error: 'Invalid reset token' })
    return
  }
  next()
}

function isSupportedSeed (seed) {
  if (seed === 'v0.1-default') return true
  const caseId = defaultSeedAliases.get(seed) || seed
  return supportedCaseIds.has(caseId)
}

function page (title, content) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.5; margin: 40px; max-width: 760px; }
    a { color: #1d70b8; }
    h1 { font-size: 36px; margin-bottom: 20px; }
    .meta { color: #505a5f; margin-bottom: 30px; }
  </style>
</head>
<body>${content}</body>
</html>`
}

function caseQuery (caseId) {
  return caseId ? `?caseId=${encodeURIComponent(caseId)}` : ''
}

function portalDocumentUrl (documentId, caseId) {
  if (!caseId) return `/documents/${encodeURIComponent(documentId)}`
  const url = new URL(`/documents/${encodeURIComponent(documentId)}`, publicPortalUrl)
  url.searchParams.set('caseId', caseId)
  return url.toString()
}

function taskListPath (caseId) {
  if (caseId && caseId.startsWith('vat-')) return '/vat/task-list'
  if (caseId && caseId.startsWith('ico-')) return '/ico/task-list'
  return '/task-list'
}

function portalTaskListUrl (caseId) {
  const url = new URL(taskListPath(caseId), publicPortalUrl)
  if (caseId) url.searchParams.set('caseId', caseId)
  return url.toString()
}

app.use(express.json())

app.get('/healthz', (req, res) => {
  res.json({ ok: true, service: 'document-server', documentCount: documents.length, reset: resetMetadata })
})

app.post('/__admin/reset', requireResetToken, (req, res) => {
  const seed = req.body.seed || 'v0.1-default'
  if (!isSupportedSeed(seed)) {
    res.status(400).json({ ok: false, error: `Unsupported seed: ${seed}` })
    return
  }

  resetMetadata = {
    trialId: req.body.trialId || null,
    seed,
    resetAt: new Date().toISOString()
  }
  res.json({ ok: true, service: 'document-server', ...resetMetadata })
})

app.get('/api/documents', (req, res) => {
  const caseId = req.query.caseId
  const filtered = caseId ? documents.filter(document => document.caseId === caseId) : documents
  res.json({
    documents: filtered.map(({ body, ...metadata }) => metadata)
  })
})

app.get('/api/documents/:documentId', (req, res) => {
  const document = documents.find(item => item.id === req.params.documentId)
  if (!document) {
    res.status(404).json({ ok: false, error: 'Document not found' })
    return
  }
  res.json(document)
})

app.get('/documents', (req, res) => {
  const caseId = req.query.caseId
  const visibleDocuments = caseId ? documents.filter(document => document.caseId === caseId) : documents
  const links = visibleDocuments
    .map(document => `<li><a href="${portalDocumentUrl(document.id, caseId)}">${document.title}</a> <span class="meta">${document.type}</span></li>`)
    .join('')
  const backLink = caseId ? `<p><a href="${portalTaskListUrl(caseId)}">Back to task list</a></p>` : ''
  res.type('html').send(page('Documents', `${backLink}<h1>Task documents</h1><ul>${links}</ul>`))
})

app.get('/documents/:documentId', (req, res) => {
  const document = documents.find(item => item.id === req.params.documentId)
  if (!document) {
    res.status(404).type('html').send(page('Document not found', '<h1>Document not found</h1>'))
    return
  }

  const caseId = req.query.caseId || document.caseId
  res.type('html').send(page(
    document.title,
    `<p><a href="/documents${caseQuery(caseId)}">Back to documents</a></p>
     <p><a href="${portalTaskListUrl(caseId)}">Back to task list</a></p>
     <h1>${document.title}</h1>
     <p class="meta">${document.type} · ${document.source}</p>
     ${document.body}`
  ))
})

app.listen(port, () => {
  console.log(`document server listening on ${port}`)
})
