const token = process.env.RESET_TOKEN || 'adminbench-reset-token'
const trialId = process.env.TRIAL_ID || `manual-${Date.now()}`
const seed = process.env.RESET_SEED || 'ad01-default'

const services = [
  ['portal', process.env.PORTAL_URL || 'http://127.0.0.1:3000'],
  ['crm-api', process.env.CRM_API_URL || 'http://127.0.0.1:4000'],
  ['audit-sink', process.env.AUDIT_URL || 'http://127.0.0.1:4001'],
  ['document-server', process.env.DOCUMENT_SERVER_URL || 'http://127.0.0.1:4002']
]

const body = JSON.stringify({ trialId, seed })

async function resetService ([name, baseUrl]) {
  const response = await fetch(`${baseUrl}/__admin/reset`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-adminbench-reset-token': token
    },
    body
  })

  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(`${name} reset failed with ${response.status}: ${JSON.stringify(payload)}`)
  }
  return { name, status: response.status, payload }
}

const results = await Promise.all(services.map(resetService))
console.log(JSON.stringify({ ok: true, trialId, seed, services: results }, null, 2))
