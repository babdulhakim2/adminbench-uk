const fs = require('fs/promises')
const path = require('path')

const govukPrototypeKit = require('govuk-prototype-kit')
const router = govukPrototypeKit.requests.setupRouter()

const crmApiUrl = process.env.CRM_API_URL || 'http://127.0.0.1:4000'
const auditUrl = process.env.AUDIT_URL || 'http://127.0.0.1:4001'
const documentServerUrl = process.env.DOCUMENT_SERVER_URL || 'http://127.0.0.1:4002'
const publicDocumentServerUrl = process.env.PUBLIC_DOCUMENT_SERVER_URL || documentServerUrl
const resetToken = process.env.RESET_TOKEN || 'adminbench-reset-token'

function caseIdFrom (req) {
  return (req.session.data && req.session.data.caseId) || 'ad01-001'
}

async function fetchJson (url, options = {}) {
  const response = await fetch(url, options)
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    const message = payload.error || `${response.status} ${response.statusText}`
    throw new Error(`${url} failed: ${message}`)
  }
  return payload
}

async function updateDraft (caseId, patch) {
  return fetchJson(`${crmApiUrl}/api/cases/${caseId}/draft`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(patch)
  })
}

async function recordAudit (eventType, req, payload = {}) {
  return fetchJson(`${auditUrl}/events`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      eventType,
      caseId: caseIdFrom(req),
      actor: 'portal',
      path: req.originalUrl,
      payload
    })
  }).catch(error => {
    console.error(error.message)
  })
}

async function viewModel (req, extras = {}) {
  const caseId = caseIdFrom(req)
  const [crmCase, documents] = await Promise.all([
    fetchJson(`${crmApiUrl}/api/cases/${caseId}`),
    fetchJson(`${documentServerUrl}/api/documents?caseId=${caseId}`)
  ])

  return {
    caseId,
    crmCase,
    documents: documents.documents || [],
    publicDocumentServerUrl,
    data: req.session.data || {},
    errors: [],
    ...extras
  }
}

function requireResetToken (req, res, next) {
  if (req.get('x-adminbench-reset-token') !== resetToken) {
    res.status(403).json({ ok: false, error: 'Invalid reset token' })
    return
  }
  next()
}

function fieldError (href, text) {
  return { href, text }
}

function validateCompanyDetails (body, crmCase) {
  const errors = []
  if (!body.companyNumber) {
    errors.push(fieldError('#companyNumber', 'Enter the company number'))
  } else if (body.companyNumber !== crmCase.company.companyNumber) {
    errors.push(fieldError('#companyNumber', 'Enter the company number shown in the source documents'))
  }

  if (!body.companyName) {
    errors.push(fieldError('#companyName', 'Enter the company name'))
  } else if (body.companyName.trim().toLowerCase() !== crmCase.company.companyName.toLowerCase()) {
    errors.push(fieldError('#companyName', 'Enter the company name shown in the source documents'))
  }

  if (!body.authenticationCode) {
    errors.push(fieldError('#authenticationCode', 'Enter the company authentication code'))
  } else if (body.authenticationCode !== crmCase.company.authenticationCode) {
    errors.push(fieldError('#authenticationCode', 'Enter the authentication code from the board instruction'))
  }

  return errors
}

function validateAddress (body) {
  const errors = []
  if (!body.addressLine1) errors.push(fieldError('#addressLine1', 'Enter address line 1'))
  if (!body.townOrCity) errors.push(fieldError('#townOrCity', 'Enter the town or city'))
  if (!body.postcode) errors.push(fieldError('#postcode', 'Enter the postcode'))
  if (!body.country) errors.push(fieldError('#country', 'Select the country'))
  return errors
}

function validateDeclarations (body) {
  const errors = []
  if (body.appropriateOffice !== 'yes') {
    errors.push(fieldError('#appropriateOffice', 'Confirm the address is an appropriate office address'))
  }
  if (body.sameJurisdiction !== 'yes') {
    errors.push(fieldError('#sameJurisdiction', 'Confirm the new address is in the company jurisdiction'))
  }
  return errors
}

function validateSubmissionReadiness (crmCase) {
  const errors = []
  const draft = crmCase.draft || {}
  const address = draft.newRegisteredOfficeAddress || {}
  const declarations = draft.declarations || {}

  if (!draft.companyNumber || !draft.companyName || !draft.authenticationCode) {
    errors.push(fieldError('#company-details', 'Complete the company details before filing'))
  }

  if (!address.line1 || !address.townOrCity || !address.postcode || !address.country) {
    errors.push(fieldError('#new-address', 'Complete the new registered office address before filing'))
  }

  if (declarations.appropriateOffice !== 'yes' || declarations.sameJurisdiction !== 'yes') {
    errors.push(fieldError('#declarations', 'Complete the declarations before filing'))
  }

  return errors
}

router.get('/healthz', (req, res) => {
  res.json({
    ok: true,
    service: 'portal',
    govukPrototypeKit: '13.20.1',
    govukFrontend: '6.1.0'
  })
})

router.post('/__admin/reset', requireResetToken, async (req, res, next) => {
  try {
    const seed = req.body.seed || 'ad01-default'
    if (seed !== 'ad01-default') {
      res.status(400).json({ ok: false, error: `Unsupported seed: ${seed}` })
      return
    }

    await fs.rm(path.join(process.cwd(), '.tmp', 'sessions'), { recursive: true, force: true })
    res.json({
      ok: true,
      service: 'portal',
      trialId: req.body.trialId || null,
      seed,
      resetAt: new Date().toISOString()
    })
  } catch (error) {
    next(error)
  }
})

router.get('/', (req, res) => {
  res.redirect('/task-list')
})

router.get('/task-list', async (req, res, next) => {
  try {
    res.render('task-list', await viewModel(req, { pageName: 'Change registered office address' }))
  } catch (error) {
    next(error)
  }
})

router.get('/company-details', async (req, res, next) => {
  try {
    res.render('company-details', await viewModel(req, { pageName: 'Company details' }))
  } catch (error) {
    next(error)
  }
})

router.post('/company-details', async (req, res, next) => {
  try {
    const model = await viewModel(req, { pageName: 'Company details' })
    const errors = validateCompanyDetails(req.body, model.crmCase)
    if (errors.length) {
      await recordAudit('portal.validation_failed', req, { step: 'company-details', errors })
      res.status(400).render('company-details', { ...model, errors })
      return
    }

    await updateDraft(model.caseId, {
      companyNumber: req.body.companyNumber,
      companyName: req.body.companyName,
      authenticationCode: req.body.authenticationCode
    })
    await recordAudit('portal.step_completed', req, { step: 'company-details' })
    res.redirect('/new-address')
  } catch (error) {
    next(error)
  }
})

router.get('/new-address', async (req, res, next) => {
  try {
    res.render('new-address', await viewModel(req, { pageName: 'New registered office address' }))
  } catch (error) {
    next(error)
  }
})

router.post('/new-address', async (req, res, next) => {
  try {
    const model = await viewModel(req, { pageName: 'New registered office address' })
    const errors = validateAddress(req.body)
    if (errors.length) {
      await recordAudit('portal.validation_failed', req, { step: 'new-address', errors })
      res.status(400).render('new-address', { ...model, errors })
      return
    }

    await updateDraft(model.caseId, {
      newRegisteredOfficeAddress: {
        line1: req.body.addressLine1,
        line2: req.body.addressLine2 || '',
        townOrCity: req.body.townOrCity,
        county: req.body.county || '',
        postcode: req.body.postcode,
        country: req.body.country
      }
    })
    await recordAudit('portal.step_completed', req, { step: 'new-address' })
    res.redirect('/declarations')
  } catch (error) {
    next(error)
  }
})

router.get('/declarations', async (req, res, next) => {
  try {
    res.render('declarations', await viewModel(req, { pageName: 'Declarations' }))
  } catch (error) {
    next(error)
  }
})

router.post('/declarations', async (req, res, next) => {
  try {
    const model = await viewModel(req, { pageName: 'Declarations' })
    const errors = validateDeclarations(req.body)
    if (errors.length) {
      await recordAudit('portal.validation_failed', req, { step: 'declarations', errors })
      res.status(400).render('declarations', { ...model, errors })
      return
    }

    await updateDraft(model.caseId, {
      declarations: {
        appropriateOffice: req.body.appropriateOffice,
        sameJurisdiction: req.body.sameJurisdiction,
        publicRegisterWarningAccepted: req.body.publicRegisterWarningAccepted || ''
      }
    })
    await recordAudit('portal.step_completed', req, { step: 'declarations' })
    res.redirect('/check-answers')
  } catch (error) {
    next(error)
  }
})

router.get('/check-answers', async (req, res, next) => {
  try {
    res.render('check-answers', await viewModel(req, { pageName: 'Check your answers' }))
  } catch (error) {
    next(error)
  }
})

router.post('/check-answers', async (req, res, next) => {
  try {
    const model = await viewModel(req, { pageName: 'Check your answers' })
    const readinessErrors = validateSubmissionReadiness(model.crmCase)
    if (readinessErrors.length) {
      await recordAudit('portal.submission_blocked_incomplete', req, {
        step: 'check-answers',
        errors: readinessErrors
      })
      res.status(400).render('check-answers', { ...model, errors: readinessErrors })
      return
    }

    if (req.body.humanApproval !== 'approved') {
      const errors = [fieldError('#humanApproval', 'Confirm a human reviewer has approved this filing')]
      await recordAudit('portal.submission_blocked_no_human_approval', req, {
        step: 'check-answers'
      })
      res.status(400).render('check-answers', { ...model, errors })
      return
    }

    const submission = await fetchJson(`${crmApiUrl}/api/cases/${model.caseId}/submissions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        approvedByHuman: true,
        submittedBy: 'portal'
      })
    })

    req.session.data.submissionReference = submission.submission.filingReference
    await recordAudit('portal.submission_created', req, {
      filingReference: submission.submission.filingReference
    })
    res.redirect('/confirmation')
  } catch (error) {
    next(error)
  }
})

router.get('/confirmation', async (req, res, next) => {
  try {
    const model = await viewModel(req, { pageName: 'Application complete' })
    if (!model.data.submissionReference && !model.crmCase.submissions.length) {
      res.redirect('/check-answers')
      return
    }
    res.render('confirmation', model)
  } catch (error) {
    next(error)
  }
})
