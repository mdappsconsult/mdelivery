import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl) {
  throw new Error(
    'Variável de ambiente NEXT_PUBLIC_SUPABASE_URL não encontrada. Por favor, configure suas variáveis de ambiente.'
  )
}

if (!supabaseAnonKey) {
  throw new Error(
    'Variável de ambiente NEXT_PUBLIC_SUPABASE_ANON_KEY não encontrada. Por favor, configure suas variáveis de ambiente.'
  )
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey) 