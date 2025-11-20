import 'dotenv/config';
import crypto from 'crypto';

console.log('\n🔑 Verificación de clave de encriptación\n');

const key = process.env.AUDIT_ENCRYPTION_KEY;

if (!key) {
  console.log('❌ NO está configurada AUDIT_ENCRYPTION_KEY');
  console.log('   Se está usando: "clave-por-defecto-32-caracteres"');
} else {
  console.log('✅ Clave configurada:', key.substring(0, 10) + '...');
  
  const hash = crypto.createHash('sha256').update(key).digest('hex');
  console.log('🔐 Hash SHA256:', hash.substring(0, 20) + '...');
}

console.log('\n');