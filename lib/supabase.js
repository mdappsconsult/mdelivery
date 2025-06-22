import { createClient } from '@supabase/supabase-js'

let supabase = null

if (typeof window !== 'undefined') {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('Erro: Variáveis de ambiente não encontradas', {
      temUrl: !!supabaseUrl,
      temKey: !!supabaseAnonKey
    })
  } else {
    console.log('Inicializando Supabase com URL:', supabaseUrl)
    supabase = createClient(supabaseUrl, supabaseAnonKey)
  }
}

export { supabase } 