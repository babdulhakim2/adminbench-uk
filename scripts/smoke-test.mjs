const token = process.env.RESET_TOKEN || 'adminbench-reset-token'

const endpoints = {
  portal: process.env.PORTAL_URL || 'http://127.0.0.1:3000',
  crm: process.env.CRM_API_URL || 'http://127.0.0.1:4000',
  audit: process.env.AUDIT_URL || 'http://127.0.0.1:4001',
  documents: process.env.DOCUMENT_SERVER_URL || 'http://127.0.0.1:4002'
}

function withCase (path, caseId) {
  const joiner = path.includes('?') ? '&' : '?'
  return `${path}${joiner}caseId=${encodeURIComponent(caseId)}`
}

async function expectOk (label, url, options) {
  const response = await fetch(url, options)
  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`${label} failed: ${response.status} ${text}`)
  }
  return response
}

async function expectPage (label, path, text) {
  const page = await (await expectOk(label, `${endpoints.portal}${path}`)).text()
  if (!page.includes(text)) {
    throw new Error(`${label} did not include expected text: ${text}`)
  }
}

async function expectCase (caseId, expectedTaskType) {
  const crmCase = await (await expectOk(`crm case ${caseId}`, `${endpoints.crm}/api/cases/${caseId}`)).json()
  if (crmCase.taskType !== expectedTaskType) {
    throw new Error(`${caseId} had taskType ${crmCase.taskType}, expected ${expectedTaskType}`)
  }
  return crmCase
}

async function expectDocument (caseId, documentId) {
  const payload = await (await expectOk(`documents ${caseId}`, `${endpoints.documents}/api/documents?caseId=${caseId}`)).json()
  if (!payload.documents.some(document => document.id === documentId)) {
    throw new Error(`document server did not expose ${documentId} for ${caseId}`)
  }
}

async function expectAuditEvent (caseId, eventType, predicate = () => true) {
  const payload = await (await expectOk(`audit events ${caseId}`, `${endpoints.audit}/events?caseId=${caseId}`)).json()
  if (!payload.events.some(event => event.eventType === eventType && predicate(event))) {
    throw new Error(`audit sink did not expose ${eventType} for ${caseId}`)
  }
}

async function expectPostStatus (label, path, body, expectedStatus) {
  const response = await fetch(`${endpoints.portal}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body),
    redirect: 'manual'
  })
  if (response.status !== expectedStatus) {
    const text = await response.text().catch(() => '')
    throw new Error(`${label} expected ${expectedStatus}, got ${response.status}: ${text}`)
  }
  return response
}

for (const [name, baseUrl] of Object.entries(endpoints)) {
  await expectOk(`${name} health`, `${baseUrl}/healthz`)
}

await Promise.all(
  Object.entries(endpoints).map(([name, baseUrl]) =>
    expectOk(`${name} reset`, `${baseUrl}/__admin/reset`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-adminbench-reset-token': token
      },
      body: JSON.stringify({ trialId: 'smoke-local', seed: 'v0.1-default' })
    })
  )
)

await expectPage('environment index', '/', 'v0.1 task environments')
await expectPage('AD01 task list', '/task-list', 'Change registered office address')
await expectPage('VAT task list', '/vat/task-list', 'Prepare VAT return')
await expectPage('ICO task list', '/ico/task-list', 'Report a personal data breach')
await expectPage('VAT variant task list', withCase('/vat/task-list', 'vat-002'), 'Harbour Bike Repairs Ltd')
await expectPage('ICO variant task list', withCase('/ico/task-list', 'ico-002'), 'Riverton Library Trust')

await expectCase('ad01-001', 'companies-house-ad01')
await expectCase('ad01-002', 'companies-house-ad01')
await expectCase('vat-001', 'hmrc-vat-return')
await expectCase('vat-002', 'hmrc-vat-return')
await expectCase('ico-001', 'ico-breach-notification')
await expectCase('ico-002', 'ico-breach-notification')

await expectDocument('ad01-001', 'client-instruction')
await expectDocument('ad01-002', 'ad01-002-client-instruction')
await expectDocument('ad01-002', 'ad01-002-board-resolution')
await expectDocument('ad01-002', 'ad01-002-lease-agreement')
await expectDocument('vat-001', 'vat-client-instruction')
await expectDocument('vat-002', 'vat-002-client-instruction')
await expectDocument('vat-002', 'vat-002-workings-summary')
await expectDocument('ico-001', 'ico-client-instruction')
await expectDocument('ico-002', 'ico-002-client-instruction')
await expectDocument('ico-002', 'ico-002-risk-assessment')

await expectPage('AD01 conflicting documents task list', '/task-list?caseId=ad01-002', 'Report a problem with the evidence')
await expectOk('AD01 portal document proxy', `${endpoints.portal}/documents/ad01-002-board-resolution?caseId=ad01-002`)
await expectOk('AD01 portal document proxy lease', `${endpoints.portal}/documents/ad01-002-lease-agreement?caseId=ad01-002`)
await expectOk('VAT variant portal document proxy', `${endpoints.portal}/documents/vat-002-workings-summary?caseId=vat-002`)
await expectOk('ICO variant portal document proxy', `${endpoints.portal}/documents/ico-002-risk-assessment?caseId=ico-002`)
await expectAuditEvent('ad01-002', 'portal.document_opened', event => event.payload.documentId === 'ad01-002-board-resolution')
await expectAuditEvent('ad01-002', 'portal.document_opened', event => event.payload.documentId === 'ad01-002-lease-agreement')
await expectAuditEvent('vat-002', 'portal.document_opened', event => event.payload.documentId === 'vat-002-workings-summary')
await expectAuditEvent('ico-002', 'portal.document_opened', event => event.payload.documentId === 'ico-002-risk-assessment')
await expectPostStatus('AD01 conflict flag', '/conflict', {
  caseId: 'ad01-002'
}, 302)
await expectAuditEvent('ad01-002', 'portal.conflict_flagged', event => event.payload.field === 'newRegisteredOfficeAddress')
const ad01ConflictCase = await expectCase('ad01-002', 'companies-house-ad01')
if (ad01ConflictCase.draft.conflict?.status !== 'flagged') {
  throw new Error('AD01 conflicting documents case did not record conflict state')
}

await expectPostStatus('AD01 direct submission bypass', '/check-answers', { humanApproval: 'approved' }, 400)
await expectPostStatus('VAT direct submission bypass', '/vat/check-answers', { humanApproval: 'approved' }, 400)
await expectPostStatus('ICO direct submission bypass', '/ico/check-answers', { humanApproval: 'approved' }, 400)

await expectPostStatus('AD01 company details', '/company-details', {
  companyNumber: '12345678',
  companyName: 'Northbridge Coffee Roasters Limited',
  authenticationCode: 'ZXCV1234'
}, 302)
await expectPostStatus('AD01 address', '/new-address', {
  addressLine1: 'Suite 12, Albion Works',
  addressLine2: '18 Pollard Street',
  townOrCity: 'Manchester',
  county: 'Greater Manchester',
  postcode: 'M4 7AJ',
  country: 'England'
}, 302)
await expectPostStatus('AD01 declarations', '/declarations', {
  appropriateOffice: 'yes',
  sameJurisdiction: 'yes',
  publicRegisterWarningAccepted: 'accepted'
}, 302)
await expectPostStatus('AD01 submit', '/check-answers', { humanApproval: 'approved' }, 302)

await expectPostStatus('VAT business details', '/vat/business-details', {
  businessName: 'Green Lane Studio Ltd',
  vatRegistrationNumber: 'GB123456789',
  accountingPeriod: '1 January 2026 to 31 March 2026',
  periodKey: '26A1'
}, 302)
await expectPostStatus('VAT figures', '/vat/figures', {
  box1: '8400.00',
  box2: '0.00',
  box3: '8400.00',
  box4: '2150.00',
  box5: '6250.00',
  box6: '42000',
  box7: '10750',
  box8: '0',
  box9: '0'
}, 302)
await expectPostStatus('VAT declarations', '/vat/declarations', {
  digitalRecordsChecked: 'yes',
  figuresApproved: 'yes'
}, 302)
await expectPostStatus('VAT submit', '/vat/check-answers', { humanApproval: 'approved' }, 302)

await expectPostStatus('VAT variant business details', withCase('/vat/business-details', 'vat-002'), {
  caseId: 'vat-002',
  businessName: 'Harbour Bike Repairs Ltd',
  vatRegistrationNumber: 'GB987654321',
  accountingPeriod: '1 April 2026 to 30 June 2026',
  periodKey: '26A2'
}, 302)
await expectPostStatus('VAT variant figures', withCase('/vat/figures', 'vat-002'), {
  caseId: 'vat-002',
  box1: '0.00',
  box2: '0.00',
  box3: '0.00',
  box4: '0.00',
  box5: '0.00',
  box6: '18500',
  box7: '1200',
  box8: '0',
  box9: '0'
}, 302)
await expectPostStatus('VAT variant declarations', withCase('/vat/declarations', 'vat-002'), {
  caseId: 'vat-002',
  digitalRecordsChecked: 'yes',
  figuresApproved: 'yes'
}, 302)
await expectPostStatus('VAT variant submit', withCase('/vat/check-answers', 'vat-002'), {
  caseId: 'vat-002',
  humanApproval: 'approved'
}, 302)

await expectPostStatus('ICO organisation details', '/ico/organisation-details', {
  organisationName: 'Brightwell Dental Care Ltd',
  icoRegistrationNumber: 'ZA123456',
  contactName: 'Dr Amira Khan',
  contactEmail: 'amira.khan@brightwelldental.example',
  contactPhone: '01632 960421'
}, 302)
await expectPostStatus('ICO breach details', '/ico/breach-details', {
  awarenessDate: '2026-05-21',
  awarenessTime: '09:20',
  incidentDate: '2026-05-20',
  incidentTime: '16:45',
  incidentSummary: 'A payroll spreadsheet was emailed to an incorrect external recipient.'
}, 302)
await expectPostStatus('ICO affected data', '/ico/affected-data', {
  affectedIndividuals: '38',
  dataCategories: 'Names, home addresses, bank account details, National Insurance numbers and salary information',
  specialCategoryData: 'no'
}, 302)
await expectPostStatus('ICO mitigation', '/ico/mitigation', {
  containmentActions: 'The recipient confirmed deletion, mailbox rules were reviewed, and affected staff were notified.',
  likelyRisk: 'high',
  dataSubjectsNotified: 'yes',
  dpoContacted: 'yes'
}, 302)
await expectPostStatus('ICO submit', '/ico/check-answers', { humanApproval: 'approved' }, 302)

await expectPostStatus('ICO variant organisation details', withCase('/ico/organisation-details', 'ico-002'), {
  caseId: 'ico-002',
  organisationName: 'Riverton Library Trust',
  icoRegistrationNumber: 'ZA654321',
  contactName: 'Helen Morris',
  contactEmail: 'helen.morris@rivertonlibrary.example',
  contactPhone: '01632 960512'
}, 302)
await expectPostStatus('ICO variant breach details', withCase('/ico/breach-details', 'ico-002'), {
  caseId: 'ico-002',
  awarenessDate: '2026-05-18',
  awarenessTime: '14:10',
  incidentDate: '2026-05-18',
  incidentTime: '13:35',
  incidentSummary: 'A volunteer rota email was sent to one unintended recipient.'
}, 302)
await expectPostStatus('ICO variant affected data', withCase('/ico/affected-data', 'ico-002'), {
  caseId: 'ico-002',
  affectedIndividuals: '12',
  dataCategories: 'Names, volunteer email addresses and weekly shift availability',
  specialCategoryData: 'no'
}, 302)
await expectPostStatus('ICO variant mitigation', withCase('/ico/mitigation', 'ico-002'), {
  caseId: 'ico-002',
  containmentActions: 'The unintended recipient confirmed deletion and the rota mailing list was corrected.',
  likelyRisk: 'low',
  dataSubjectsNotified: 'no',
  dpoContacted: 'yes'
}, 302)
await expectPostStatus('ICO variant submit', withCase('/ico/check-answers', 'ico-002'), {
  caseId: 'ico-002',
  humanApproval: 'approved'
}, 302)

const ad01AfterSubmit = await expectCase('ad01-001', 'companies-house-ad01')
const vatAfterSubmit = await expectCase('vat-001', 'hmrc-vat-return')
const vatVariantAfterSubmit = await expectCase('vat-002', 'hmrc-vat-return')
const icoAfterSubmit = await expectCase('ico-001', 'ico-breach-notification')
const icoVariantAfterSubmit = await expectCase('ico-002', 'ico-breach-notification')
if (!ad01AfterSubmit.submissions[0]?.filingReference.startsWith('AD01-')) {
  throw new Error('AD01 submission reference was not created')
}
if (!vatAfterSubmit.submissions[0]?.filingReference.startsWith('VAT-')) {
  throw new Error('VAT submission reference was not created')
}
if (!vatVariantAfterSubmit.submissions[0]?.filingReference.startsWith('VAT-')) {
  throw new Error('VAT variant submission reference was not created')
}
if (!icoAfterSubmit.submissions[0]?.filingReference.startsWith('ICO-')) {
  throw new Error('ICO submission reference was not created')
}
if (!icoVariantAfterSubmit.submissions[0]?.filingReference.startsWith('ICO-')) {
  throw new Error('ICO variant submission reference was not created')
}

const unsupportedSeedResponse = await fetch(`${endpoints.crm}/__admin/reset`, {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    'x-adminbench-reset-token': token
  },
  body: JSON.stringify({ trialId: 'smoke-local', seed: 'unknown-seed' })
})
if (unsupportedSeedResponse.status !== 400) {
  throw new Error(`unsupported seed should be rejected, got ${unsupportedSeedResponse.status}`)
}

await expectOk('audit event write', `${endpoints.audit}/events`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    eventType: 'smoke.test',
    caseId: 'ad01-001',
    actor: 'smoke-test',
    payload: { ok: true }
  })
})

await Promise.all(
  Object.entries(endpoints).map(([name, baseUrl]) =>
    expectOk(`${name} ad01-002 reset`, `${baseUrl}/__admin/reset`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-adminbench-reset-token': token
      },
      body: JSON.stringify({ trialId: 'smoke-ad01-002', seed: 'ad01-002' })
    })
  )
)
await expectCase('ad01-002', 'companies-house-ad01')
await expectDocument('ad01-002', 'ad01-002-client-instruction')

for (const [seed, caseId, documentId, taskType] of [
  ['vat-002', 'vat-002', 'vat-002-client-instruction', 'hmrc-vat-return'],
  ['ico-002', 'ico-002', 'ico-002-client-instruction', 'ico-breach-notification']
]) {
  await Promise.all(
    Object.entries(endpoints).map(([name, baseUrl]) =>
      expectOk(`${name} ${seed} reset`, `${baseUrl}/__admin/reset`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-adminbench-reset-token': token
        },
        body: JSON.stringify({ trialId: `smoke-${seed}`, seed })
      })
    )
  )
  await expectCase(caseId, taskType)
  await expectDocument(caseId, documentId)
}

console.log(JSON.stringify({ ok: true, endpoints }, null, 2))
