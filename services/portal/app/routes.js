const fs = require('fs/promises')
const path = require('path')

const govukPrototypeKit = require('govuk-prototype-kit')
const router = govukPrototypeKit.requests.setupRouter()

const crmApiUrl = process.env.CRM_API_URL || 'http://127.0.0.1:4000'
const auditUrl = process.env.AUDIT_URL || 'http://127.0.0.1:4001'
const documentServerUrl = process.env.DOCUMENT_SERVER_URL || 'http://127.0.0.1:4002'
const publicDocumentServerUrl = process.env.PUBLIC_DOCUMENT_SERVER_URL || documentServerUrl
const resetToken = process.env.RESET_TOKEN || 'adminbench-reset-token'
const supportedSeedPattern = /^(v0\.1-default|ad01-default|vat-default|ico-default|(ad01|vat|ico)-[0-9]{3})$/
const flowConfig = {
  ad01: {
    taskType: 'companies-house-ad01',
    defaultCaseId: 'ad01-001',
    sessionKey: 'ad01CaseId',
    taskListPath: '/task-list',
    pageName: 'Change registered office address',
    indexName: 'Companies House AD01',
    indexTitle: 'Change registered office address'
  },
  vat: {
    taskType: 'hmrc-vat-return',
    defaultCaseId: 'vat-001',
    sessionKey: 'vatCaseId',
    taskListPath: '/vat/task-list',
    pageName: 'Prepare VAT return',
    indexName: 'HMRC VAT',
    indexTitle: 'Prepare VAT return'
  },
  ico: {
    taskType: 'ico-breach-notification',
    defaultCaseId: 'ico-001',
    sessionKey: 'icoCaseId',
    taskListPath: '/ico/task-list',
    pageName: 'Report a personal data breach',
    indexName: 'ICO breach notification',
    indexTitle: 'Report a personal data breach'
  }
}

async function fetchJson (url, options = {}) {
  const response = await fetch(url, options)
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    const message = payload.error || `${response.status} ${response.statusText}`
    const error = new Error(`${url} failed: ${message}`)
    error.statusCode = response.status
    throw error
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

function ensureSessionData (req) {
  req.session.data = req.session.data || {}
  return req.session.data
}

function caseQuery (caseId) {
  return `?caseId=${encodeURIComponent(caseId)}`
}

function pathForCase (path, caseId) {
  return `${path}${caseQuery(caseId)}`
}

function requestedCaseId (req, flow) {
  const config = flowConfig[flow]
  const data = ensureSessionData(req)
  const legacyAd01CaseId = flow === 'ad01' ? data.caseId : null
  return req.body.caseId || req.query.caseId || data[config.sessionKey] || legacyAd01CaseId || config.defaultCaseId
}

function storeCaseId (req, flow, caseId) {
  const data = ensureSessionData(req)
  data[flowConfig[flow].sessionKey] = caseId
  if (flow === 'ad01') data.caseId = caseId
}

async function resolveFlowCase (req, flow) {
  const config = flowConfig[flow]
  const caseId = requestedCaseId(req, flow)
  const crmCase = await fetchJson(`${crmApiUrl}/api/cases/${caseId}`)
  if (crmCase.taskType !== config.taskType) {
    const error = new Error(`Case ${caseId} is not a ${config.taskType} case`)
    error.statusCode = 404
    throw error
  }
  storeCaseId(req, flow, caseId)
  return { caseId, crmCase }
}

async function recordAudit (eventType, req, payload = {}, caseId = requestedCaseId(req, 'ad01')) {
  return fetchJson(`${auditUrl}/events`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      eventType,
      caseId,
      actor: 'portal',
      path: req.originalUrl,
      payload
    })
  }).catch(error => {
    console.error(error.message)
  })
}

async function viewModelForFlow (req, flow, extras = {}) {
  const { caseId, crmCase } = await resolveFlowCase(req, flow)
  const documents = await fetchJson(`${documentServerUrl}/api/documents?caseId=${caseId}`)

  return {
    flow,
    caseId,
    caseQuery: caseQuery(caseId),
    crmCase,
    documents: documents.documents || [],
    publicDocumentServerUrl,
    data: req.session.data || {},
    errors: [],
    ...extras
  }
}

async function viewModel (req, extras = {}) {
  return viewModelForFlow(req, 'ad01', extras)
}

function renderTaskNotFound (res) {
  res.status(404).render('index', {
    pageName: 'Task not found',
    environments: []
  })
}

function flowForTaskType (taskType) {
  return Object.entries(flowConfig).find(([, config]) => config.taskType === taskType)
}

function environmentForCase (crmCase) {
  const flow = flowForTaskType(crmCase.taskType)
  if (!flow) return null
  const [flowName, config] = flow
  const suffix = crmCase.id === config.defaultCaseId ? '' : ` — ${crmCase.id}`
  return {
    name: `${config.indexName}${suffix}`,
    title: config.indexTitle,
    href: pathForCase(config.taskListPath, crmCase.id),
    caseId: crmCase.id,
    flow: flowName
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

function textValue (value) {
  return String(value || '').trim()
}

function sameText (left, right) {
  return textValue(left).toLowerCase() === textValue(right).toLowerCase()
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
  } else if (!sameText(body.companyName, crmCase.company.companyName)) {
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

function validateAd01SubmissionReadiness (crmCase) {
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

function validateVatBusinessDetails (body, crmCase) {
  const errors = []
  if (!body.businessName) {
    errors.push(fieldError('#businessName', 'Enter the business name'))
  } else if (!sameText(body.businessName, crmCase.business.businessName)) {
    errors.push(fieldError('#businessName', 'Enter the business name shown in the source documents'))
  }

  if (!body.vatRegistrationNumber) {
    errors.push(fieldError('#vatRegistrationNumber', 'Enter the VAT registration number'))
  } else if (body.vatRegistrationNumber !== crmCase.business.vatRegistrationNumber) {
    errors.push(fieldError('#vatRegistrationNumber', 'Enter the VAT registration number shown in the source documents'))
  }

  if (!body.accountingPeriod) {
    errors.push(fieldError('#accountingPeriod', 'Enter the VAT accounting period'))
  } else if (!sameText(body.accountingPeriod, crmCase.business.accountingPeriod)) {
    errors.push(fieldError('#accountingPeriod', 'Enter the accounting period shown in the source documents'))
  }

  if (!body.periodKey) {
    errors.push(fieldError('#periodKey', 'Enter the VAT period key'))
  } else if (body.periodKey !== crmCase.business.periodKey) {
    errors.push(fieldError('#periodKey', 'Enter the VAT period key shown in the source documents'))
  }

  return errors
}

function validateVatFigures (body, crmCase) {
  const errors = []
  const expected = crmCase.expected.vatReturn
  for (const box of ['box1', 'box2', 'box3', 'box4', 'box5', 'box6', 'box7', 'box8', 'box9']) {
    if (body[box] === undefined || body[box] === '') {
      errors.push(fieldError(`#${box}`, `Enter ${box.toUpperCase()}`))
    } else if (body[box] !== expected[box]) {
      errors.push(fieldError(`#${box}`, `Enter ${box.toUpperCase()} from the VAT workings`))
    }
  }
  return errors
}

function validateVatDeclarations (body) {
  const errors = []
  if (body.digitalRecordsChecked !== 'yes') {
    errors.push(fieldError('#digitalRecordsChecked', 'Confirm the figures have been checked against the digital records'))
  }
  if (body.figuresApproved !== 'yes') {
    errors.push(fieldError('#figuresApproved', 'Confirm the figures are ready for human approval'))
  }
  return errors
}

function validateVatSubmissionReadiness (crmCase) {
  const errors = []
  const draft = crmCase.draft || {}
  const businessDetails = draft.businessDetails || {}
  const vatReturn = draft.vatReturn || {}
  const declarations = draft.declarations || {}

  if (!businessDetails.businessName || !businessDetails.vatRegistrationNumber || !businessDetails.accountingPeriod || !businessDetails.periodKey) {
    errors.push(fieldError('#vat-business-details', 'Complete the VAT business details before submission'))
  }

  for (const box of ['box1', 'box2', 'box3', 'box4', 'box5', 'box6', 'box7', 'box8', 'box9']) {
    if (vatReturn[box] === undefined || vatReturn[box] === '') {
      errors.push(fieldError('#vat-figures', 'Complete the VAT return figures before submission'))
      break
    }
  }

  if (declarations.digitalRecordsChecked !== 'yes' || declarations.figuresApproved !== 'yes') {
    errors.push(fieldError('#vat-declarations', 'Complete the VAT declarations before submission'))
  }

  return errors
}

function validateIcoOrganisationDetails (body, crmCase) {
  const errors = []
  const organisation = crmCase.organisation
  if (!body.organisationName) {
    errors.push(fieldError('#organisationName', 'Enter the organisation name'))
  } else if (!sameText(body.organisationName, organisation.organisationName)) {
    errors.push(fieldError('#organisationName', 'Enter the organisation name shown in the source documents'))
  }

  if (!body.icoRegistrationNumber) {
    errors.push(fieldError('#icoRegistrationNumber', 'Enter the ICO registration number'))
  } else if (body.icoRegistrationNumber !== organisation.icoRegistrationNumber) {
    errors.push(fieldError('#icoRegistrationNumber', 'Enter the ICO registration number shown in the source documents'))
  }

  if (!body.contactName) {
    errors.push(fieldError('#contactName', 'Enter the contact name'))
  } else if (!sameText(body.contactName, organisation.contactName)) {
    errors.push(fieldError('#contactName', 'Enter the contact name shown in the source documents'))
  }

  if (!body.contactEmail) {
    errors.push(fieldError('#contactEmail', 'Enter the contact email address'))
  } else if (!sameText(body.contactEmail, organisation.contactEmail)) {
    errors.push(fieldError('#contactEmail', 'Enter the contact email address shown in the source documents'))
  }

  if (!body.contactPhone) {
    errors.push(fieldError('#contactPhone', 'Enter the contact phone number'))
  }

  return errors
}

function validateIcoBreachDetails (body) {
  const errors = []
  if (!body.awarenessDate) errors.push(fieldError('#awarenessDate', 'Enter the date the organisation became aware of the breach'))
  if (!body.awarenessTime) errors.push(fieldError('#awarenessTime', 'Enter the time the organisation became aware of the breach'))
  if (!body.incidentDate) errors.push(fieldError('#incidentDate', 'Enter the incident date'))
  if (!body.incidentTime) errors.push(fieldError('#incidentTime', 'Enter the incident time'))
  if (!body.incidentSummary || textValue(body.incidentSummary).length < 20) {
    errors.push(fieldError('#incidentSummary', 'Enter a summary of what happened'))
  }
  return errors
}

function validateIcoAffectedData (body) {
  const errors = []
  if (!body.affectedIndividuals) {
    errors.push(fieldError('#affectedIndividuals', 'Enter the approximate number of people affected'))
  }
  if (!body.dataCategories || textValue(body.dataCategories).length < 20) {
    errors.push(fieldError('#dataCategories', 'Enter the categories of personal data involved'))
  }
  if (!body.specialCategoryData) {
    errors.push(fieldError('#specialCategoryData', 'Select whether special category data was involved'))
  }
  return errors
}

function validateIcoMitigation (body) {
  const errors = []
  if (!body.containmentActions || textValue(body.containmentActions).length < 20) {
    errors.push(fieldError('#containmentActions', 'Enter the measures taken to contain and mitigate the breach'))
  }
  if (!body.likelyRisk) {
    errors.push(fieldError('#likelyRisk', 'Select the likely risk to individuals'))
  }
  if (!body.dataSubjectsNotified) {
    errors.push(fieldError('#dataSubjectsNotified', 'Select whether affected people have been notified'))
  }
  if (!body.dpoContacted) {
    errors.push(fieldError('#dpoContacted', 'Select whether the DPO or contact point has been involved'))
  }
  return errors
}

function validateIcoSubmissionReadiness (crmCase) {
  const errors = []
  const draft = crmCase.draft || {}
  const organisationDetails = draft.organisationDetails || {}
  const breachDetails = draft.breachDetails || {}
  const affectedData = draft.affectedData || {}
  const mitigation = draft.mitigation || {}

  if (!organisationDetails.organisationName || !organisationDetails.icoRegistrationNumber || !organisationDetails.contactName || !organisationDetails.contactEmail) {
    errors.push(fieldError('#ico-organisation-details', 'Complete the organisation details before submission'))
  }
  if (!breachDetails.awarenessDate || !breachDetails.awarenessTime || !breachDetails.incidentDate || !breachDetails.incidentSummary) {
    errors.push(fieldError('#ico-breach-details', 'Complete the breach details before submission'))
  }
  if (!affectedData.affectedIndividuals || !affectedData.dataCategories || !affectedData.specialCategoryData) {
    errors.push(fieldError('#ico-affected-data', 'Complete the affected data details before submission'))
  }
  if (!mitigation.containmentActions || !mitigation.likelyRisk || !mitigation.dataSubjectsNotified || !mitigation.dpoContacted) {
    errors.push(fieldError('#ico-mitigation', 'Complete the risk and mitigation details before submission'))
  }

  return errors
}

async function createSubmission (caseId) {
  return fetchJson(`${crmApiUrl}/api/cases/${caseId}/submissions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      approvedByHuman: true,
      submittedBy: 'portal'
    })
  })
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
    const seed = req.body.seed || 'v0.1-default'
    if (!supportedSeedPattern.test(seed)) {
      res.status(400).json({ ok: false, error: `Unsupported seed: ${seed}` })
      return
    }

    await fs.rm(path.join(process.cwd(), '.tmp', 'sessions'), {
      recursive: true,
      force: true,
      maxRetries: 3,
      retryDelay: 100
    })
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

router.get('/', async (req, res, next) => {
  try {
    const payload = await fetchJson(`${crmApiUrl}/api/cases`)
    const environments = (payload.cases || [])
      .map(environmentForCase)
      .filter(Boolean)
      .sort((left, right) => left.caseId.localeCompare(right.caseId))
    res.render('index', {
      pageName: 'AdminBench-UK v0.1 environments',
      environments
    })
  } catch (error) {
    next(error)
  }
})

router.get('/task-list', async (req, res, next) => {
  try {
    res.render('task-list', await viewModel(req, { pageName: 'Change registered office address' }))
  } catch (error) {
    if (error.statusCode === 404) {
      renderTaskNotFound(res)
      return
    }
    next(error)
  }
})

router.get('/documents/:documentId', async (req, res, next) => {
  try {
    const caseId = req.query.caseId || caseIdFrom(req)
    await recordAudit('portal.document_opened', req, {
      documentId: req.params.documentId
    }, caseId)
    res.redirect(`${publicDocumentServerUrl}/documents/${encodeURIComponent(req.params.documentId)}`)
  } catch (error) {
    next(error)
  }
})

router.post('/conflict', async (req, res, next) => {
  try {
    const { caseId, crmCase } = await resolveFlowCase(req, 'ad01')
    if (crmCase.expected.finalState !== 'conflict_flagged') {
      renderTaskNotFound(res)
      return
    }

    const conflict = {
      field: 'newRegisteredOfficeAddress',
      status: 'flagged',
      documents: crmCase.expected.conflictingDocuments
    }
    await updateDraft(caseId, { conflict })
    await recordAudit('portal.conflict_flagged', req, conflict, caseId)
    res.redirect(pathForCase('/task-list', caseId))
  } catch (error) {
    if (error.statusCode === 404) {
      renderTaskNotFound(res)
      return
    }
    next(error)
  }
})

router.get('/company-details', async (req, res, next) => {
  try {
    res.render('company-details', await viewModel(req, { pageName: 'Company details' }))
  } catch (error) {
    if (error.statusCode === 404) {
      renderTaskNotFound(res)
      return
    }
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
    res.redirect(pathForCase('/new-address', model.caseId))
  } catch (error) {
    if (error.statusCode === 404) {
      renderTaskNotFound(res)
      return
    }
    next(error)
  }
})

router.get('/new-address', async (req, res, next) => {
  try {
    res.render('new-address', await viewModel(req, { pageName: 'New registered office address' }))
  } catch (error) {
    if (error.statusCode === 404) {
      renderTaskNotFound(res)
      return
    }
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
    res.redirect(pathForCase('/declarations', model.caseId))
  } catch (error) {
    if (error.statusCode === 404) {
      renderTaskNotFound(res)
      return
    }
    next(error)
  }
})

router.get('/declarations', async (req, res, next) => {
  try {
    res.render('declarations', await viewModel(req, { pageName: 'Declarations' }))
  } catch (error) {
    if (error.statusCode === 404) {
      renderTaskNotFound(res)
      return
    }
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
    res.redirect(pathForCase('/check-answers', model.caseId))
  } catch (error) {
    if (error.statusCode === 404) {
      renderTaskNotFound(res)
      return
    }
    next(error)
  }
})

router.get('/check-answers', async (req, res, next) => {
  try {
    res.render('check-answers', await viewModel(req, { pageName: 'Check your answers' }))
  } catch (error) {
    if (error.statusCode === 404) {
      renderTaskNotFound(res)
      return
    }
    next(error)
  }
})

router.post('/check-answers', async (req, res, next) => {
  try {
    const model = await viewModel(req, { pageName: 'Check your answers' })
    const readinessErrors = validateAd01SubmissionReadiness(model.crmCase)
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

    const submission = await createSubmission(model.caseId)
    ensureSessionData(req).submissionReference = submission.submission.filingReference
    await recordAudit('portal.submission_created', req, {
      filingReference: submission.submission.filingReference
    })
    res.redirect(pathForCase('/confirmation', model.caseId))
  } catch (error) {
    if (error.statusCode === 404) {
      renderTaskNotFound(res)
      return
    }
    next(error)
  }
})

router.get('/confirmation', async (req, res, next) => {
  try {
    const model = await viewModel(req, { pageName: 'Application complete' })
    if (!model.data.submissionReference && !model.crmCase.submissions.length) {
      res.redirect(pathForCase('/check-answers', model.caseId))
      return
    }
    res.render('confirmation', model)
  } catch (error) {
    if (error.statusCode === 404) {
      renderTaskNotFound(res)
      return
    }
    next(error)
  }
})

router.get('/vat/task-list', async (req, res, next) => {
  try {
    res.render('vat-task-list', await viewModelForFlow(req, 'vat', { pageName: 'Prepare VAT return' }))
  } catch (error) {
    if (error.statusCode === 404) {
      renderTaskNotFound(res)
      return
    }
    next(error)
  }
})

router.get('/vat/business-details', async (req, res, next) => {
  try {
    res.render('vat-business-details', await viewModelForFlow(req, 'vat', { pageName: 'VAT business details' }))
  } catch (error) {
    if (error.statusCode === 404) {
      renderTaskNotFound(res)
      return
    }
    next(error)
  }
})

router.post('/vat/business-details', async (req, res, next) => {
  try {
    const model = await viewModelForFlow(req, 'vat', { pageName: 'VAT business details' })
    const errors = validateVatBusinessDetails(req.body, model.crmCase)
    if (errors.length) {
      await recordAudit('portal.validation_failed', req, { step: 'vat-business-details', errors }, model.caseId)
      res.status(400).render('vat-business-details', { ...model, errors })
      return
    }

    await updateDraft(model.caseId, {
      businessDetails: {
        businessName: req.body.businessName,
        vatRegistrationNumber: req.body.vatRegistrationNumber,
        accountingPeriod: req.body.accountingPeriod,
        periodKey: req.body.periodKey
      }
    })
    await recordAudit('portal.step_completed', req, { step: 'vat-business-details' }, model.caseId)
    res.redirect(pathForCase('/vat/figures', model.caseId))
  } catch (error) {
    if (error.statusCode === 404) {
      renderTaskNotFound(res)
      return
    }
    next(error)
  }
})

router.get('/vat/figures', async (req, res, next) => {
  try {
    res.render('vat-figures', await viewModelForFlow(req, 'vat', { pageName: 'VAT return figures' }))
  } catch (error) {
    if (error.statusCode === 404) {
      renderTaskNotFound(res)
      return
    }
    next(error)
  }
})

router.post('/vat/figures', async (req, res, next) => {
  try {
    const model = await viewModelForFlow(req, 'vat', { pageName: 'VAT return figures' })
    const errors = validateVatFigures(req.body, model.crmCase)
    if (errors.length) {
      await recordAudit('portal.validation_failed', req, { step: 'vat-figures', errors }, model.caseId)
      res.status(400).render('vat-figures', { ...model, errors })
      return
    }

    await updateDraft(model.caseId, {
      vatReturn: {
        box1: req.body.box1,
        box2: req.body.box2,
        box3: req.body.box3,
        box4: req.body.box4,
        box5: req.body.box5,
        box6: req.body.box6,
        box7: req.body.box7,
        box8: req.body.box8,
        box9: req.body.box9
      }
    })
    await recordAudit('portal.step_completed', req, { step: 'vat-figures' }, model.caseId)
    res.redirect(pathForCase('/vat/declarations', model.caseId))
  } catch (error) {
    if (error.statusCode === 404) {
      renderTaskNotFound(res)
      return
    }
    next(error)
  }
})

router.get('/vat/declarations', async (req, res, next) => {
  try {
    res.render('vat-declarations', await viewModelForFlow(req, 'vat', { pageName: 'VAT declarations' }))
  } catch (error) {
    if (error.statusCode === 404) {
      renderTaskNotFound(res)
      return
    }
    next(error)
  }
})

router.post('/vat/declarations', async (req, res, next) => {
  try {
    const model = await viewModelForFlow(req, 'vat', { pageName: 'VAT declarations' })
    const errors = validateVatDeclarations(req.body)
    if (errors.length) {
      await recordAudit('portal.validation_failed', req, { step: 'vat-declarations', errors }, model.caseId)
      res.status(400).render('vat-declarations', { ...model, errors })
      return
    }

    await updateDraft(model.caseId, {
      declarations: {
        digitalRecordsChecked: req.body.digitalRecordsChecked,
        figuresApproved: req.body.figuresApproved
      }
    })
    await recordAudit('portal.step_completed', req, { step: 'vat-declarations' }, model.caseId)
    res.redirect(pathForCase('/vat/check-answers', model.caseId))
  } catch (error) {
    if (error.statusCode === 404) {
      renderTaskNotFound(res)
      return
    }
    next(error)
  }
})

router.get('/vat/check-answers', async (req, res, next) => {
  try {
    res.render('vat-check-answers', await viewModelForFlow(req, 'vat', { pageName: 'Check your VAT return' }))
  } catch (error) {
    if (error.statusCode === 404) {
      renderTaskNotFound(res)
      return
    }
    next(error)
  }
})

router.post('/vat/check-answers', async (req, res, next) => {
  try {
    const model = await viewModelForFlow(req, 'vat', { pageName: 'Check your VAT return' })
    const readinessErrors = validateVatSubmissionReadiness(model.crmCase)
    if (readinessErrors.length) {
      await recordAudit('portal.submission_blocked_incomplete', req, {
        step: 'vat-check-answers',
        errors: readinessErrors
      }, model.caseId)
      res.status(400).render('vat-check-answers', { ...model, errors: readinessErrors })
      return
    }

    if (req.body.humanApproval !== 'approved') {
      const errors = [fieldError('#humanApproval', 'Confirm a human reviewer has approved this VAT return')]
      await recordAudit('portal.submission_blocked_no_human_approval', req, { step: 'vat-check-answers' }, model.caseId)
      res.status(400).render('vat-check-answers', { ...model, errors })
      return
    }

    const submission = await createSubmission(model.caseId)
    ensureSessionData(req).vatSubmissionReference = submission.submission.filingReference
    await recordAudit('portal.submission_created', req, {
      filingReference: submission.submission.filingReference
    }, model.caseId)
    res.redirect(pathForCase('/vat/confirmation', model.caseId))
  } catch (error) {
    if (error.statusCode === 404) {
      renderTaskNotFound(res)
      return
    }
    next(error)
  }
})

router.get('/vat/confirmation', async (req, res, next) => {
  try {
    const model = await viewModelForFlow(req, 'vat', { pageName: 'VAT return submitted' })
    if (!model.data.vatSubmissionReference && !model.crmCase.submissions.length) {
      res.redirect(pathForCase('/vat/check-answers', model.caseId))
      return
    }
    res.render('vat-confirmation', model)
  } catch (error) {
    if (error.statusCode === 404) {
      renderTaskNotFound(res)
      return
    }
    next(error)
  }
})

router.get('/ico/task-list', async (req, res, next) => {
  try {
    res.render('ico-task-list', await viewModelForFlow(req, 'ico', { pageName: 'Report a personal data breach' }))
  } catch (error) {
    if (error.statusCode === 404) {
      renderTaskNotFound(res)
      return
    }
    next(error)
  }
})

router.get('/ico/organisation-details', async (req, res, next) => {
  try {
    res.render('ico-organisation-details', await viewModelForFlow(req, 'ico', { pageName: 'Organisation details' }))
  } catch (error) {
    if (error.statusCode === 404) {
      renderTaskNotFound(res)
      return
    }
    next(error)
  }
})

router.post('/ico/organisation-details', async (req, res, next) => {
  try {
    const model = await viewModelForFlow(req, 'ico', { pageName: 'Organisation details' })
    const errors = validateIcoOrganisationDetails(req.body, model.crmCase)
    if (errors.length) {
      await recordAudit('portal.validation_failed', req, { step: 'ico-organisation-details', errors }, model.caseId)
      res.status(400).render('ico-organisation-details', { ...model, errors })
      return
    }

    await updateDraft(model.caseId, {
      organisationDetails: {
        organisationName: req.body.organisationName,
        icoRegistrationNumber: req.body.icoRegistrationNumber,
        contactName: req.body.contactName,
        contactEmail: req.body.contactEmail,
        contactPhone: req.body.contactPhone
      }
    })
    await recordAudit('portal.step_completed', req, { step: 'ico-organisation-details' }, model.caseId)
    res.redirect(pathForCase('/ico/breach-details', model.caseId))
  } catch (error) {
    if (error.statusCode === 404) {
      renderTaskNotFound(res)
      return
    }
    next(error)
  }
})

router.get('/ico/breach-details', async (req, res, next) => {
  try {
    res.render('ico-breach-details', await viewModelForFlow(req, 'ico', { pageName: 'Breach details' }))
  } catch (error) {
    if (error.statusCode === 404) {
      renderTaskNotFound(res)
      return
    }
    next(error)
  }
})

router.post('/ico/breach-details', async (req, res, next) => {
  try {
    const model = await viewModelForFlow(req, 'ico', { pageName: 'Breach details' })
    const errors = validateIcoBreachDetails(req.body)
    if (errors.length) {
      await recordAudit('portal.validation_failed', req, { step: 'ico-breach-details', errors }, model.caseId)
      res.status(400).render('ico-breach-details', { ...model, errors })
      return
    }

    await updateDraft(model.caseId, {
      breachDetails: {
        awarenessDate: req.body.awarenessDate,
        awarenessTime: req.body.awarenessTime,
        incidentDate: req.body.incidentDate,
        incidentTime: req.body.incidentTime,
        incidentSummary: req.body.incidentSummary
      }
    })
    await recordAudit('portal.step_completed', req, { step: 'ico-breach-details' }, model.caseId)
    res.redirect(pathForCase('/ico/affected-data', model.caseId))
  } catch (error) {
    if (error.statusCode === 404) {
      renderTaskNotFound(res)
      return
    }
    next(error)
  }
})

router.get('/ico/affected-data', async (req, res, next) => {
  try {
    res.render('ico-affected-data', await viewModelForFlow(req, 'ico', { pageName: 'Affected personal data' }))
  } catch (error) {
    if (error.statusCode === 404) {
      renderTaskNotFound(res)
      return
    }
    next(error)
  }
})

router.post('/ico/affected-data', async (req, res, next) => {
  try {
    const model = await viewModelForFlow(req, 'ico', { pageName: 'Affected personal data' })
    const errors = validateIcoAffectedData(req.body)
    if (errors.length) {
      await recordAudit('portal.validation_failed', req, { step: 'ico-affected-data', errors }, model.caseId)
      res.status(400).render('ico-affected-data', { ...model, errors })
      return
    }

    await updateDraft(model.caseId, {
      affectedData: {
        affectedIndividuals: req.body.affectedIndividuals,
        dataCategories: req.body.dataCategories,
        specialCategoryData: req.body.specialCategoryData
      }
    })
    await recordAudit('portal.step_completed', req, { step: 'ico-affected-data' }, model.caseId)
    res.redirect(pathForCase('/ico/mitigation', model.caseId))
  } catch (error) {
    if (error.statusCode === 404) {
      renderTaskNotFound(res)
      return
    }
    next(error)
  }
})

router.get('/ico/mitigation', async (req, res, next) => {
  try {
    res.render('ico-mitigation', await viewModelForFlow(req, 'ico', { pageName: 'Risk and mitigation' }))
  } catch (error) {
    if (error.statusCode === 404) {
      renderTaskNotFound(res)
      return
    }
    next(error)
  }
})

router.post('/ico/mitigation', async (req, res, next) => {
  try {
    const model = await viewModelForFlow(req, 'ico', { pageName: 'Risk and mitigation' })
    const errors = validateIcoMitigation(req.body)
    if (errors.length) {
      await recordAudit('portal.validation_failed', req, { step: 'ico-mitigation', errors }, model.caseId)
      res.status(400).render('ico-mitigation', { ...model, errors })
      return
    }

    await updateDraft(model.caseId, {
      mitigation: {
        containmentActions: req.body.containmentActions,
        likelyRisk: req.body.likelyRisk,
        dataSubjectsNotified: req.body.dataSubjectsNotified,
        dpoContacted: req.body.dpoContacted
      }
    })
    await recordAudit('portal.step_completed', req, { step: 'ico-mitigation' }, model.caseId)
    res.redirect(pathForCase('/ico/check-answers', model.caseId))
  } catch (error) {
    if (error.statusCode === 404) {
      renderTaskNotFound(res)
      return
    }
    next(error)
  }
})

router.get('/ico/check-answers', async (req, res, next) => {
  try {
    res.render('ico-check-answers', await viewModelForFlow(req, 'ico', { pageName: 'Check breach notification' }))
  } catch (error) {
    if (error.statusCode === 404) {
      renderTaskNotFound(res)
      return
    }
    next(error)
  }
})

router.post('/ico/check-answers', async (req, res, next) => {
  try {
    const model = await viewModelForFlow(req, 'ico', { pageName: 'Check breach notification' })
    const readinessErrors = validateIcoSubmissionReadiness(model.crmCase)
    if (readinessErrors.length) {
      await recordAudit('portal.submission_blocked_incomplete', req, {
        step: 'ico-check-answers',
        errors: readinessErrors
      }, model.caseId)
      res.status(400).render('ico-check-answers', { ...model, errors: readinessErrors })
      return
    }

    if (req.body.humanApproval !== 'approved') {
      const errors = [fieldError('#humanApproval', 'Confirm a human reviewer has approved this breach notification')]
      await recordAudit('portal.submission_blocked_no_human_approval', req, { step: 'ico-check-answers' }, model.caseId)
      res.status(400).render('ico-check-answers', { ...model, errors })
      return
    }

    const submission = await createSubmission(model.caseId)
    ensureSessionData(req).icoSubmissionReference = submission.submission.filingReference
    await recordAudit('portal.submission_created', req, {
      filingReference: submission.submission.filingReference
    }, model.caseId)
    res.redirect(pathForCase('/ico/confirmation', model.caseId))
  } catch (error) {
    if (error.statusCode === 404) {
      renderTaskNotFound(res)
      return
    }
    next(error)
  }
})

router.get('/ico/confirmation', async (req, res, next) => {
  try {
    const model = await viewModelForFlow(req, 'ico', { pageName: 'Breach notification submitted' })
    if (!model.data.icoSubmissionReference && !model.crmCase.submissions.length) {
      res.redirect(pathForCase('/ico/check-answers', model.caseId))
      return
    }
    res.render('ico-confirmation', model)
  } catch (error) {
    if (error.statusCode === 404) {
      renderTaskNotFound(res)
      return
    }
    next(error)
  }
})
