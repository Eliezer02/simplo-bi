import { createClient } from '@supabase/supabase-js';
import 'dotenv/config'; 
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error("Variáveis de ambiente do Supabase não foram encontradas. Verifique seu arquivo .env");
}

export const supabase = createClient(supabaseUrl, supabaseKey);