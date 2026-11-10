// Browser fixture only. No database operation is permitted in this harness.
const client = { from: () => { throw new Error('Database access is forbidden in browser fixture') } }
export function createClient() { return client }
