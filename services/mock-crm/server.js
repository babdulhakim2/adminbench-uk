const express = require('express')
const seedCase = require('./data/ad01-default.json')

const app = express()
const port = Number(process.env.PORT || 4000)
const resetToken = process.env.RESET_TOKEN || 'adminbench-reset-token'

let cases
let submissionSequence
let resetMetadata

function clone (value) {
  return JSON.parse(JSON.stringify(value))
}

function resetState ({ trialId = null, seed = 'ad01-default' } = {}) {
  if (seed !== 'ad01-default') {
    throw new Error(`Unsupported seed: ${seed}`)
  }

  cases = new Map([[seedCase.id, clone(seedCase)]])
  submissionSequence = 1
  resetMetadata = {
    trialId,
    seed,
    resetAt: new Date().toISOString()
  }
}

function getCaseOr404 (req, res) {
  const crmCase = cases.get(req.params.caseId)
  if (!crmCase) {
    res.status(404).json({ ok: false, error: 'Case not found' })
    return null
  }
  return crmCase
}

function requireResetToken (req, res, next) {
  if (req.get('x-adminbench-reset-token') !== resetToken) {
    res.status(403).json({ ok: false, error: 'Invalid reset token' })
    return
  }
  next()
}

function mergeDraft (current, patch) {
  return {
    ...current,
    ...patch,
    newRegisteredOfficeAddress: patch.newRegisteredOfficeAddress || current.newRegisteredOfficeAddress,
    declarations: patch.declarations || current.declarations
  }
}

function submissionReadinessErrors (crmCase) {
  const errors = []
  const draft = crmCase.draft || {}
  const address = draft.newRegisteredOfficeAddress || {}
  const declarations = draft.declarations || {}

  if (!draft.companyNumber || !draft.companyName || !draft.authenticationCode) {
    errors.push('company-details-incomplete')
  }
  if (!address.line1 || !address.townOrCity || !address.postcode || !address.country) {
    errors.push('new-address-incomplete')
  }
  if (declarations.appropriateOffice !== 'yes' || declarations.sameJurisdiction !== 'yes') {
    errors.push('declarations-incomplete')
  }

  return errors
}

resetState()
app.use(express.json())

app.get('/healthz', (req, res) => {
  res.json({ ok: true, service: 'crm-api', reset: resetMetadata })
})

app.post('/__admin/reset', requireResetToken, (req, res) => {
  try {
    resetState(req.body || {})
    res.json({ ok: true, service: 'crm-api', ...resetMetadata })
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message })
  }
})

app.get('/api/cases', (req, res) => {
  res.json({ cases: [...cases.values()] })
})

app.get('/api/cases/:caseId', (req, res) => {
  const crmCase = getCaseOr404(req, res)
  if (!crmCase) return
  res.json(crmCase)
})

app.patch('/api/cases/:caseId/draft', (req, res) => {
  const crmCase = getCaseOr404(req, res)
  if (!crmCase) return

  crmCase.draft = mergeDraft(crmCase.draft || {}, req.body || {})
  crmCase.history.push({
    eventType: 'crm.draft_updated',
    at: new Date().toISOString(),
    patch: req.body || {}
  })
  res.json({ ok: true, case: crmCase })
})

app.post('/api/cases/:caseId/submissions', (req, res) => {
  const crmCase = getCaseOr404(req, res)
  if (!crmCase) return

  if (!req.body || req.body.approvedByHuman !== true) {
    res.status(409).json({ ok: false, error: 'Human approval is required before submission' })
    return
  }

  const readinessErrors = submissionReadinessErrors(crmCase)
  if (readinessErrors.length) {
    res.status(409).json({
      ok: false,
      error: 'Draft is incomplete',
      details: readinessErrors
    })
    return
  }

  const submission = {
    filingReference: `AD01-${String(submissionSequence).padStart(6, '0')}`,
    status: 'submitted-pending-registrar',
    approvedByHuman: true,
    submittedBy: req.body.submittedBy || 'unknown',
    submittedAt: new Date().toISOString(),
    payload: clone(crmCase.draft)
  }
  submissionSequence += 1

  crmCase.submissions.unshift(submission)
  crmCase.status = 'submitted'
  crmCase.history.push({
    eventType: 'crm.submission_created',
    at: submission.submittedAt,
    filingReference: submission.filingReference
  })

  res.status(201).json({ ok: true, submission, case: crmCase })
})

app.listen(port, () => {
  console.log(`mock CRM listening on ${port}`)
})
