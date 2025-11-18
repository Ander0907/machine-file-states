import FileStateService from './service/fileStateService.js';
import { FILE_STATES } from './helpers/constants.js';


const service = new FileStateService();

console.log('=== Ejemplo 1: Flujo orquestado por el servicio ===\n');

// El servicio orquesta AUTHORIZED → UPLOADED → PROCESSING automáticamente
const job1 = service.processFile({
  id: 'file-123',
  metadata: { filename: 'documento.pdf', size: 1024 }
});

console.log('Estado después de processFile():', job1.state); // PROCESSING
console.log('Jobs en memoria:', service.getAllJobs().length);

// Simulamos que el procesamiento termina exitosamente
service.markAsProcessed(job1);
console.log('Estado final:', job1.state); // PROCESSED

console.log('\n=== Ejemplo 2: Manejo de errores con reintentos ===\n');

const job2 = service.createJob({
  id: 'file-456',
  metadata: { filename: 'imagen.jpg', size: 2048 }, // ✅ Agregado size
  initialState: FILE_STATES.AUTHORIZED
});

console.log('Estado inicial:', job2.state); // AUTHORIZED

// Orquestar subida e inicio de procesamiento
service.handleUpload(job2);
service.startProcessing(job2);
console.log('Estado después de iniciar:', job2.state); // PROCESSING

// Simular error técnico
service.handleTechnicalError(job2, {
  code: 'TIMEOUT',
  message: 'Database connection timeout'
});
console.log('Estado después de error:', job2.state); // ERROR
console.log('Reintentos:', job2.retryCount);

// Reintentar
service.retryJob(job2);
console.log('Estado después de retry:', job2.state); // PROCESSING
console.log('Reintentos:', job2.retryCount);

// Esta vez tiene éxito
service.markAsProcessed(job2);
console.log('Estado final:', job2.state); // PROCESSED

console.log('\n=== Ejemplo 3: Consultas y filtros ===\n');

// Crear más jobs
service.createJob({ id: 'file-789', initialState: FILE_STATES.UPLOADED });
service.createJob({ id: 'file-101', initialState: FILE_STATES.ERROR });

console.log('Total de jobs:', service.getAllJobs().length);
console.log('Jobs en PROCESSED:', service.getJobsByState(FILE_STATES.PROCESSED).length);
console.log('Jobs en ERROR:', service.getJobsByState(FILE_STATES.ERROR).length);

// Obtener un job específico
const retrieved = service.getJob('file-456');
console.log('\nJob recuperado:', retrieved?.id, '-', retrieved?.state);
console.log('Historial completo:', retrieved?.history);

console.log('\n=== Ejemplo 4: Error de negocio (no recuperable) ===\n');

const job3 = service.processFile({
  id: 'file-999',
  metadata: { filename: 'data.pdf', size: 512 } // ✅ Extensión válida
});

// Simular error de negocio durante el procesamiento
service.handleBusinessError(job3, {
  code: 'INVALID_DATA',
  message: 'Data corruption detected during processing'
});

console.log('Estado después de business error:', job3.state); // REJECTED
console.log('Último error:', job3.lastError);

// Cleanup
service.removeJob('file-789');
console.log('\nJobs después de limpiar:', service.getAllJobs().length);
