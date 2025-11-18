// tests/fileStateService.test.js
// Escenarios de prueba para validar la implementación completa

import FileStateService, { FILE_STATES } from '../service/fileStateService.js';

console.log('=== TESTS: File State Service ===\n');

const service = new FileStateService();

// Test 1: Transición inválida debe lanzar error
console.log('Test 1: Transición inválida (REJECTED → PROCESSING)');
try {
  const job = service.createJob({ 
    id: 'test-invalid', 
    metadata: { filename: 'test.pdf', size: 100 },
    initialState: FILE_STATES.REJECTED 
  });
  
  job.transitionTo(FILE_STATES.PROCESSING, { reason: 'INVALID' });
  console.log('❌ FAILED: Should have thrown error\n');
} catch (error) {
  console.log(`✅ PASSED: ${error.message}\n`);
}

// Test 2: Flujo completo con validación de integridad
console.log('Test 2: Flujo completo AUTHORIZED → UPLOADED → PROCESSING → PROCESSED');
const job2 = service.createJob({
  id: 'test-full-flow',
  metadata: { filename: 'document.pdf', size: 2048 }
});

console.log('Estado inicial:', job2.state);
service.handleUpload(job2);
console.log('Después de upload:', job2.state);
service.startProcessing(job2);
console.log('Después de start:', job2.state);
service.markAsProcessed(job2);
console.log('Estado final:', job2.state);
console.log(job2.state === FILE_STATES.PROCESSED ? '✅ PASSED\n' : '❌ FAILED\n');

// Test 3: Validación de integridad falla → REJECTED
console.log('Test 3: Validación de integridad falla');
const job3 = service.createJob({
  id: 'test-integrity-fail',
  metadata: { filename: 'bad-file.exe', size: 0 } // extensión inválida y size 0
});

service.handleUpload(job3);
console.log('Estado después de upload fallido:', job3.state);
console.log(job3.state === FILE_STATES.REJECTED ? '✅ PASSED\n' : '❌ FAILED\n');

// Test 4: Reintentos habilitados - 3 intentos → REJECTED
console.log('Test 4: Límite de reintentos (3)');
const job4 = service.createJob({
  id: 'test-retry-limit',
  metadata: { filename: 'retry.pdf', size: 1024 }
});

service.handleUpload(job4);
service.startProcessing(job4);

// Simular 3 errores técnicos y reintentos
for (let i = 1; i <= 3; i++) {
  service.handleTechnicalError(job4, { code: 'TIMEOUT', attempt: i });
  console.log(`Intento ${i} - Estado:`, job4.state, '- Reintentos:', job4.retryCount);
  
  if (job4.state === FILE_STATES.ERROR) {
    service.retryJob(job4);
  }
}

console.log('Estado final después de 3 reintentos:', job4.state);
console.log(job4.state === FILE_STATES.REJECTED ? '✅ PASSED: Max retries reached\n' : '❌ FAILED\n');

// Test 5: Reintentos deshabilitados
console.log('Test 5: Reintentos deshabilitados');
const job5 = service.createJob({
  id: 'test-retry-disabled',
  metadata: { filename: 'no-retry.pdf', size: 1024 },
  retryEnabled: false
});

service.handleUpload(job5);
service.startProcessing(job5);
service.handleTechnicalError(job5, { code: 'DB_ERROR' });

console.log('Estado después de error:', job5.state);

try {
  service.retryJob(job5);
  console.log('❌ FAILED: Should have thrown error\n');
} catch (error) {
  console.log(`✅ PASSED: ${error.message}\n`);
}

// Test 6: Error técnico no recuperable → REJECTED directo
console.log('Test 6: Error técnico no recuperable');
const job6 = service.createJob({
  id: 'test-non-recoverable',
  metadata: { filename: 'fatal.pdf', size: 1024 }
});

service.handleUpload(job6);
service.startProcessing(job6);
service.handleTechnicalError(job6, { code: 'FATAL_ERROR' }, false); // recoverable=false

console.log('Estado después de error no recuperable:', job6.state);
console.log(job6.state === FILE_STATES.REJECTED ? '✅ PASSED\n' : '❌ FAILED\n');

// Test 7: handleTechnicalError en PROCESSED lanza excepción
console.log('Test 7: Error en estado PROCESSED debe lanzar excepción');
const job7 = service.createJob({
  id: 'test-error-in-processed',
  metadata: { filename: 'complete.pdf', size: 1024 }
});

service.handleUpload(job7);
service.startProcessing(job7);
service.markAsProcessed(job7);

try {
  service.handleTechnicalError(job7, { code: 'UNEXPECTED' });
  console.log('❌ FAILED: Should have thrown error\n');
} catch (error) {
  console.log(`✅ PASSED: ${error.message}\n`);
}

// Test 8: Error de negocio desde cualquier estado
console.log('Test 8: Error de negocio en PROCESSING → REJECTED');
const job8 = service.createJob({
  id: 'test-business-error',
  metadata: { filename: 'business-fail.pdf', size: 1024 }
});

service.handleUpload(job8);
service.startProcessing(job8);
service.handleBusinessError(job8, { code: 'INVALID_DATA', message: 'Data corruption' });

console.log('Estado después de business error:', job8.state);
console.log(job8.state === FILE_STATES.REJECTED ? '✅ PASSED\n' : '❌ FAILED\n');

// Test 9: Métricas del servicio
console.log('Test 9: Métricas del servicio');
const metrics = service.getMetrics();
console.log('Métricas:', JSON.stringify(metrics, null, 2));
console.log(metrics.created >= 8 ? '✅ PASSED: Metrics tracking\n' : '❌ FAILED\n');

// Test 10: Estado inicial por defecto es AUTHORIZED
console.log('Test 10: Estado inicial por defecto');
const job10 = service.createJob({
  id: 'test-default-state',
  metadata: { filename: 'default.pdf', size: 1024 }
});

console.log('Estado inicial sin especificar:', job10.state);
console.log(job10.state === FILE_STATES.AUTHORIZED ? '✅ PASSED\n' : '❌ FAILED\n');

// Resumen final
console.log('=== RESUMEN DE TESTS ===');
service.logMetrics();
