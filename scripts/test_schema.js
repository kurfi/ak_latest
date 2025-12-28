// scripts/test_schema.js
const { db } = require('../db/db');

async function test() {
  try {
    console.log("Checking DB schema...");
    const tables = db.tables.map(t => t.name);
    console.log("Tables found:", tables);
    
    const users = await db.users.toArray();
    console.log("Local Users count:", users.length);
  } catch (e) {
    console.error("Schema test failed:", e);
  }
}

test();
