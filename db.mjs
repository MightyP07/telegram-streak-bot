// db.mjs
import { Low } from 'lowdb'
import { JSONFile } from 'lowdb/node'

// 1. Set up the JSON file adapter
const adapter = new JSONFile('db.json')

// 2. Provide your default structure here 🔥
const defaultData = { users: {} }

// 3. Create the Low instance with adapter + default data
const db = new Low(adapter, defaultData)

await db.read()

// (Optional) If you ever want to merge in missing keys later:
// db.data = { ...defaultData, ...db.data }

await db.write()

export default db