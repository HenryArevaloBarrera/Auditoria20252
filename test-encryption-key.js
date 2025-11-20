import 'dotenv/config';

console.log('\n🔍 Verificando configuración:\n');
console.log('SUPABASE_URL:', process.env.SUPABASE_URL);
console.log('SUPABASE_KEY:', process.env.SUPABASE_KEY ? '✅ Configurada (' + process.env.SUPABASE_KEY.substring(0, 20) + '...)' : '❌ No configurada');
console.log('AUDIT_ENCRYPTION_KEY:', process.env.AUDIT_ENCRYPTION_KEY ? '✅ Configurada (' + process.env.AUDIT_ENCRYPTION_KEY.substring(0, 10) + '...)' : '❌ No configurada');
console.log('NODE_ENV:', process.env.NODE_ENV || 'no definido');
console.log('\n');