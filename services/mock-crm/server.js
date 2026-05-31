const express = require('express')
const ad01Case = require('./data/ad01-default.json')
const ad01Case002 = require('./data/ad01-002.json')
const ad01Case003 = require('./data/ad01-003.json')
const vatCase = require('./data/vat-default.json')
const icoCase = require('./data/ico-default.json')

const app = express()
const port = Number(process.env.PORT || 4000)
const resetToken = process.env.RESET_TOKEN || 'adminbench-reset-token'
const seedFixtures = {
  'v0.1-default': [ad01Case, ad01Case002, ad01Case003, vatCase, icoCase],
  'ad01-default': [ad01Case],
  'ad01-002': [ad01Case002],
  'ad01-003': [ad01Case003],
  'vat-default': [vatCase],
  'ico-default': [icoCase]
}

let cases
let submissionSequence
let resetMetadata

function clone (value) {
  return JSON.parse(JSON.stringify(value))
}

function resetState ({ trialId = null, seed = 'v0.1-default' } = {}) {
  const fixtures = seedFixtures[seed]
  if (!fixtures) {
    throw new Error(`Unsupported seed: ${seed}`)
  }

  cases = new Map(fixtures.map(crmCase => [crmCase.id, clone(crmCase)]))
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
    declarations: patch.declarations || current.declarations,
    vatReturn: patch.vatReturn || current.vatReturn,
    businessDetails: patch.businessDetails || current.businessDetails,
    organisationDetails: patch.organisationDetails || current.organisationDetails,
    breachDetails: patch.breachDetails || current.breachDetails,
    affectedData: patch.affectedData || current.affectedData,
    mitigation: patch.mitigation || current.mitigation
  }
}

function ad01ReadinessErrors (draft) {
  const errors = []
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

function vatReadinessErrors (draft) {
  const errors = []
  const businessDetails = draft.businessDetails || {}
  const vatReturn = draft.vatReturn || {}
  const declarations = draft.declarations || {}

  if (!businessDetails.businessName || !businessDetails.vatRegistrationNumber || !businessDetails.accountingPeriod) {
    errors.push('vat-business-details-incomplete')
  }

  for (const box of ['box1', 'box2', 'box3', 'box4', 'box5', 'box6', 'box7', 'box8', 'box9']) {
    if (vatReturn[box] === undefined || vatReturn[box] === '') {
      errors.push('vat-figures-incomplete')
      break
    }
  }

  if (declarations.digitalRecordsChecked !== 'yes' || declarations.figuresApproved !== 'yes') {
    errors.push('vat-declarations-incomplete')
  }

  return errors
}

function icoReadinessErrors (draft) {
  const errors = []
  const organisationDetails = draft.organisationDetails || {}
  const breachDetails = draft.breachDetails || {}
  const affectedData = draft.affectedData || {}
  const mitigation = draft.mitigation || {}

  if (!organisationDetails.organisationName || !organisationDetails.icoRegistrationNumber || !organisationDetails.contactName || !organisationDetails.contactEmail) {
    errors.push('ico-organisation-details-incomplete')
  }
  if (!breachDetails.awarenessDate || !breachDetails.awarenessTime || !breachDetails.incidentDate || !breachDetails.incidentSummary) {
    errors.push('ico-breach-details-incomplete')
  }
  if (!affectedData.affectedIndividuals || !affectedData.dataCategories || !affectedData.specialCategoryData) {
    errors.push('ico-affected-data-incomplete')
  }
  if (!mitigation.containmentActions || !mitigation.likelyRisk || !mitigation.dataSubjectsNotified || !mitigation.dpoContacted) {
    errors.push('ico-mitigation-incomplete')
  }

  return errors
}

function submissionReadinessErrors (crmCase) {
  const draft = crmCase.draft || {}
  if (crmCase.taskType === 'hmrc-vat-return') return vatReadinessErrors(draft)
  if (crmCase.taskType === 'ico-breach-notification') return icoReadinessErrors(draft)
  return ad01ReadinessErrors(draft)
}

function submissionReferencePrefix (taskType) {
  if (taskType === 'hmrc-vat-return') return 'VAT'
  if (taskType === 'ico-breach-notification') return 'ICO'
  return 'AD01'
}

function submissionStatus (taskType) {
  if (taskType === 'hmrc-vat-return') return 'submitted-pending-hmrc'
  if (taskType === 'ico-breach-notification') return 'submitted-pending-ico'
  return 'submitted-pending-registrar'
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
    filingReference: `${submissionReferencePrefix(crmCase.taskType)}-${String(submissionSequence).padStart(6, '0')}`,
    status: submissionStatus(crmCase.taskType),
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
