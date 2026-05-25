const token = process.env.RESET_TOKEN || 'adminbench-reset-token'

const endpoints = {
  portal: process.env.PORTAL_URL || 'http://127.0.0.1:3000',
  crm: process.env.CRM_API_URL || 'http://127.0.0.1:4000',
  audit: process.env.AUDIT_URL || 'http://127.0.0.1:4001',
  documents: process.env.DOCUMENT_SERVER_URL || 'http://127.0.0.1:4002'
}

async function expectOk (label, url, options) {
  const response = await fetch(url, options)
  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`${label} failed: ${response.status} ${text}`)
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
      body: JSON.stringify({ trialId: 'smoke-local', seed: 'ad01-default' })
    })
  )
)

const portalPage = await (await expectOk('portal task list', `${endpoints.portal}/task-list`)).text()
if (!portalPage.includes('Change registered office address')) {
  throw new Error('portal task list did not render the AD01 service content')
}

const crmCase = await (await expectOk('crm case', `${endpoints.crm}/api/cases/ad01-001`)).json()
if (crmCase.company.companyNumber !== '12345678') {
  throw new Error('CRM seed did not expose the expected company number')
}

const documents = await (await expectOk('documents list', `${endpoints.documents}/api/documents?caseId=ad01-001`)).json()
if (!documents.documents.some(document => document.id === 'client-instruction')) {
  throw new Error('document server did not expose the client instruction')
}

const bypassResponse = await fetch(`${endpoints.portal}/check-answers`, {
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ humanApproval: 'approved' }),
  redirect: 'manual'
})
if (bypassResponse.status !== 400) {
  throw new Error(`direct check-answers submission should be blocked, got ${bypassResponse.status}`)
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

console.log(JSON.stringify({ ok: true, endpoints }, null, 2))
