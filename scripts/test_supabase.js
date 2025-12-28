// scripts/test_supabase.js
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
);

async function test() {
  const { data, error } = await supabase.from('user_profiles').select('*');
  if (error) console.error("Supabase Error:", error);
  else console.log("Supabase Connection Successful. Users:", data.length);
}

test();
