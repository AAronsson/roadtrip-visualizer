const { app } = require('@azure/functions')
const { BlobServiceClient } = require('@azure/storage-blob')

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'PUT, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Write-Key',
}

function jsonResponse(status, body, extraHeaders = {}) {
  return {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', ...extraHeaders },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  }
}

app.http('tripState', {
  methods: ['PUT', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'trip-state',
  handler: async (request) => {
    if (request.method === 'OPTIONS') {
      return { status: 204, headers: corsHeaders }
    }

    const expectedKey = process.env.WRITE_KEY
    if (!expectedKey) {
      return jsonResponse(500, { error: 'Server not configured' })
    }

    const providedKey = request.headers.get('x-write-key')
    if (!providedKey || providedKey !== expectedKey) {
      return jsonResponse(401, { error: 'Unauthorized' })
    }

    let payload
    try {
      payload = await request.json()
    } catch {
      return jsonResponse(400, { error: 'Invalid JSON body' })
    }

    if (!payload || typeof payload !== 'object') {
      return jsonResponse(400, { error: 'Body must be a JSON object' })
    }

    const connectionString = process.env.AzureWebJobsStorage
    const containerName = process.env.LIVE_STATE_CONTAINER || 'trip'
    const blobName = process.env.LIVE_STATE_BLOB || 'live-state.json'
    if (!connectionString) {
      return jsonResponse(500, { error: 'Storage not configured' })
    }

    const state = {
      ...payload,
      updatedAt: new Date().toISOString(),
    }

    const client = BlobServiceClient.fromConnectionString(connectionString)
    const blob = client.getContainerClient(containerName).getBlockBlobClient(blobName)
    const body = JSON.stringify(state)
    await blob.upload(body, Buffer.byteLength(body), {
      blobHTTPHeaders: { blobContentType: 'application/json' },
      overwrite: true,
    })

    return jsonResponse(200, { ok: true, updatedAt: state.updatedAt })
  },
})
