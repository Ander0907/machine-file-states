# Quick Reference Guide - File State Machine

## Imports

```javascript
import FileContext from './service/states/fileState.js';
import FileStateService from './service/fileStateService.js';
import { FILE_STATES, MAX_RETRIES } from './helpers/constants.js';
```

## Estados Disponibles

```javascript
FILE_STATES.AUTHORIZED   // Estado inicial
FILE_STATES.UPLOADED     // Archivo en S3
FILE_STATES.PROCESSING   // En procesamiento
FILE_STATES.PROCESSED    // Completado ✓
FILE_STATES.REJECTED     // Rechazado ✗
FILE_STATES.ERROR        // Error recuperable
```

## FileStateService - API Principal

### Inicializar Archivo
```javascript
const service = new FileStateService();

service.initializeFile(fileId, metadata);
// Returns: { fileId, currentState: 'AUTHORIZED', ... }
```

### Transiciones de Estado
```javascript
// AUTHORIZED → UPLOADED
service.markAsUploaded(fileId);

// UPLOADED → PROCESSING
service.startProcessing(fileId);

// PROCESSING → PROCESSED
service.markAsProcessed(fileId);

// Cualquier estado → REJECTED
service.rejectFile(fileId, reason);
```

### Manejo de Errores
```javascript
// Error recuperable → ERROR state
service.handleError(fileId, errorMessage, true);

// Error no recuperable → REJECTED state
service.handleError(fileId, errorMessage, false);

// Reintentar desde ERROR state
service.retryFile(fileId);
// Returns to PROCESSING if retryCount < MAX_RETRIES
// Auto-transitions to REJECTED if retryCount >= MAX_RETRIES
```

### Consultas
```javascript
// Estado actual
const state = service.getFileState(fileId);
// Returns: 'AUTHORIZED' | 'UPLOADED' | 'PROCESSING' | etc.

// Información completa
const info = service.getFileInfo(fileId);
// Returns: { fileId, currentState, retryCount, metadata, ... }

// Historial de transiciones
const history = service.getFileHistory(fileId);
// Returns: [{ timestamp, previousState, newState, ... }]

// Métricas
const metrics = service.getFileMetrics(fileId);
// Returns: { authorized: 1, uploaded: 1, ... }

// Todos los archivos activos
const activeFiles = service.getAllActiveFiles();
// Returns: [{ fileId, currentState, ... }]
```

## FileContext - Uso Directo

### Crear Contexto
```javascript
const context = new FileContext(fileId, metadata);
```

### Transiciones
```javascript
context.transitionTo(FILE_STATES.UPLOADED);
context.transitionTo(FILE_STATES.PROCESSING);
```

### Manejo de Errores
```javascript
// Error recuperable
context.handleError('Timeout occurred', true);
// Estado: ERROR

// Reintentar
const success = context.retry();
if (success) {
  // Retornó a PROCESSING
} else {
  // Fue rechazado (max retries)
}
```

### Información
```javascript
// Estado actual
const state = context.getCurrentState();

// Historial completo
const history = context.getStateHistory();

// Métricas
const metrics = context.getMetrics();

// Info completa
const info = context.getContextInfo();
```

## Patrones Comunes

### Patrón 1: Procesamiento Simple
```javascript
const service = new FileStateService();

service.initializeFile('file-001', { filename: 'doc.pdf' });
service.markAsUploaded('file-001');
service.startProcessing('file-001');
service.markAsProcessed('file-001');
```

### Patrón 2: Con Manejo de Errores
```javascript
const service = new FileStateService();

try {
  service.initializeFile('file-002', { filename: 'data.csv' });
  service.markAsUploaded('file-002');
  service.startProcessing('file-002');
  
  // Simulación de error
  service.handleError('file-002', 'Connection timeout', true);
  
  // Reintentar
  service.retryFile('file-002');
  service.markAsProcessed('file-002');
  
} catch (error) {
  console.error('Processing failed:', error.message);
}
```

### Patrón 3: Loop de Reintentos
```javascript
const service = new FileStateService();

service.initializeFile('file-003', {});
service.markAsUploaded('file-003');
service.startProcessing('file-003');

let processed = false;
let attempts = 0;

while (!processed && attempts < MAX_RETRIES) {
  try {
    // Intenta procesar
    // ... lógica de procesamiento ...
    
    service.markAsProcessed('file-003');
    processed = true;
    
  } catch (error) {
    attempts++;
    service.handleError('file-003', error.message, true);
    
    if (attempts < MAX_RETRIES) {
      service.retryFile('file-003');
    }
  }
}

if (!processed) {
  // Auto-rechazado por max retries
  console.log('File rejected after max retries');
}
```

### Patrón 4: Validación y Rechazo
```javascript
const service = new FileStateService();

service.initializeFile('file-004', { filename: 'test.exe' });
service.markAsUploaded('file-004');
service.startProcessing('file-004');

// Validar reglas de negocio
if (isDuplicate(fileId)) {
  service.rejectFile('file-004', 'Duplicate file detected');
} else {
  service.markAsProcessed('file-004');
}
```

## Validaciones Automáticas

### Transiciones Inválidas
```javascript
const context = new FileContext('file-005', {});

// Esto lanzará error: no se puede ir directo a PROCESSING
try {
  context.transitionTo(FILE_STATES.PROCESSING);
} catch (error) {
  // Error: Invalid transition from AUTHORIZED to PROCESSING
}
```

### Estados Finales
```javascript
const context = new FileContext('file-006', {});
context.transitionTo(FILE_STATES.UPLOADED);
context.transitionTo(FILE_STATES.PROCESSING);
context.transitionTo(FILE_STATES.PROCESSED);

// Esto lanzará error: no se puede salir de estado final
try {
  context.transitionTo(FILE_STATES.PROCESSING);
} catch (error) {
  // Error: Cannot transition from final state PROCESSED
}
```

### Reintentos No Permitidos
```javascript
const context = new FileContext('file-007', {});
context.transitionTo(FILE_STATES.UPLOADED);
context.transitionTo(FILE_STATES.PROCESSING);
context.transitionTo(FILE_STATES.PROCESSED);

// Esto lanzará error: no se puede reintentar desde PROCESSED
try {
  context.retry();
} catch (error) {
  // Error: Cannot retry from state: PROCESSED
}
```

## Constantes Importantes

```javascript
MAX_RETRIES = 3  // Número máximo de reintentos permitidos
```

## Logging Automático

Todos estos eventos generan logs automáticamente:

- ✓ Inicialización de archivo
- ✓ Cada transición de estado
- ✓ Errores (recuperables y no recuperables)
- ✓ Intentos de reintento
- ✓ Rechazo automático por max retries
- ✓ Procesamiento exitoso
- ✓ Rechazo manual

## Métricas Automáticas

Se rastrean automáticamente:

- ✓ Contador por cada estado visitado
- ✓ Número de reintentos
- ✓ Timestamps de cada transición
- ✓ Historial completo de estados

## Tips de Uso

### ✓ Siempre inicializar con metadata relevante
```javascript
service.initializeFile('file-001', {
  filename: 'document.pdf',
  size: 2048,
  owner: 'user@example.com',
  uploadDate: new Date().toISOString()
});
```

### ✓ Usar handleError con isRecoverable apropiado
```javascript
// Para errores temporales
service.handleError(fileId, 'Timeout', true);

// Para errores permanentes
service.handleError(fileId, 'Corrupted data', false);
```

### ✓ Verificar estado antes de operaciones
```javascript
const currentState = service.getFileState(fileId);
if (currentState === FILE_STATES.ERROR) {
  service.retryFile(fileId);
}
```

### ✓ Usar try-catch para transiciones inválidas
```javascript
try {
  service.startProcessing(fileId);
} catch (error) {
  console.error('Invalid transition:', error.message);
}
```

### ✓ Revisar historial para debugging
```javascript
const history = service.getFileHistory(fileId);
console.log('State transitions:', history);
```

## Errores Comunes

### ❌ Transición inválida
```javascript
// Error: No se puede ir de AUTHORIZED a PROCESSING directamente
service.initializeFile('file-001');
service.startProcessing('file-001'); // ❌ Falta markAsUploaded
```

### ❌ Reintentar desde estado incorrecto
```javascript
// Error: Solo se puede reintentar desde ERROR
service.initializeFile('file-002');
service.retryFile('file-002'); // ❌ Estado actual es AUTHORIZED
```

### ❌ Modificar archivo archivado
```javascript
service.initializeFile('file-003');
service.markAsUploaded('file-003');
service.startProcessing('file-003');
service.markAsProcessed('file-003');
// El archivo se archiva automáticamente

service.getFileInfo('file-003'); // ❌ Error: File not found
```

## Solución Correcta

```javascript
// ✓ Flujo completo correcto
const service = new FileStateService();

// 1. Inicializar
service.initializeFile('file-correct', {
  filename: 'example.pdf',
  size: 2048
});

// 2. Marcar como subido
service.markAsUploaded('file-correct');

// 3. Iniciar procesamiento
service.startProcessing('file-correct');

// 4. Manejar error si ocurre
try {
  // ... lógica de procesamiento ...
  service.markAsProcessed('file-correct');
} catch (error) {
  service.handleError('file-correct', error.message, true);
  service.retryFile('file-correct');
  
  // Reintentar procesamiento
  service.markAsProcessed('file-correct');
}
```
