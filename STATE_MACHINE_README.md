# File State Machine - State Pattern Implementation

## Descripción

Implementación del patrón de diseño **State** para controlar de extremo a extremo el ciclo de vida de archivos, gestionando estados, errores, reintentos y asegurando trazabilidad completa.

## Estados Permitidos

### 1. AUTHORIZED
- **Descripción**: Archivo validado en metadata y permisos
- **Transiciones permitidas**: `UPLOADED`, `REJECTED`, `ERROR`
- **Estado inicial**: ✓
- **Permite reintentos**: ✗

### 2. UPLOADED
- **Descripción**: Archivo subido correctamente a S3, con integridad validada
- **Transiciones permitidas**: `PROCESSING`, `REJECTED`, `ERROR`
- **Permite reintentos**: ✗

### 3. PROCESSING
- **Descripción**: Archivo en lectura, validación y ejecución de lógica interna
- **Transiciones permitidas**: `PROCESSED`, `REJECTED`, `ERROR`
- **Permite reintentos**: ✗

### 4. PROCESSED
- **Descripción**: Archivo procesado exitosamente
- **Transiciones permitidas**: Ninguna (estado final)
- **Estado final**: ✓
- **Permite reintentos**: ✗

### 5. REJECTED
- **Descripción**: Archivo descartado de manera definitiva por problemas funcionales o reglas de negocio
- **Ejemplos**: duplicado, metadatos inválidos, integridad fallida no recuperable, max reintentos excedidos
- **Transiciones permitidas**: Ninguna (estado final)
- **Estado final**: ✓
- **Permite reintentos**: ✗

### 6. ERROR
- **Descripción**: Estado para representar un fallo técnico recuperable
- **Ejemplos**: timeouts, errores de red, interrupciones del servicio, fallos temporales
- **Transiciones permitidas**: `PROCESSING`, `REJECTED`
- **Permite reintentos**: ✓ (hasta MAX_RETRIES = 3)

## Diagrama de Estados

```
┌──────────────┐
│  AUTHORIZED  │ (Initial State)
└──────┬───────┘
       │
       ├──────────────┐
       │              │
       v              v
┌──────────┐     ┌─────────┐
│ UPLOADED │────>│  ERROR  │<────┐
└────┬─────┘     └────┬────┘     │
     │                │          │
     v                │          │
┌────────────┐        │          │
│ PROCESSING │────────┼──────────┤
└─────┬──────┘        │          │
      │               │          │
      ├───────────────┘          │
      │                          │
      v                          │
┌───────────┐                    │
│ PROCESSED │                    │
└───────────┘                    │
  (Final)                        │
                                 │
┌───────────┐                    │
│ REJECTED  │<───────────────────┘
└───────────┘
  (Final)
```

## Reglas de Negocio

### Reintentos
- Solo permitidos desde el estado `ERROR`
- Límite máximo: **3 reintentos** (constante `MAX_RETRIES`)
- Al alcanzar el límite, el archivo transiciona automáticamente a `REJECTED`
- El contador de reintentos se incrementa con cada intento
- No se permiten reintentos desde estados `PROCESSED` o `REJECTED`

### Errores
- **Errores recuperables**: Transicionan a `ERROR` y permiten reintento
  - Ejemplos: timeouts, errores de red, fallos temporales de servicio
- **Errores no recuperables**: Transicionan directamente a `REJECTED`
  - Ejemplos: corrupción de datos, violación de integridad, errores de negocio

### Trazabilidad
- Cada transición se registra en el historial con timestamp
- Se incluyen metadata completa del archivo en cada registro
- Se rastrean métricas de volumen para cada estado
- Los logs incluyen el contexto completo de cada evento

## Arquitectura

### Clases Principales

#### `FileState` (Abstract Base Class)
Clase abstracta que define la interfaz común para todos los estados.

```javascript
class FileState {
  getStateName()        // Retorna el nombre del estado
  canTransitionTo(next) // Valida si la transición es permitida
  transitionTo(ctx, next) // Ejecuta la transición
  canRetry()            // Indica si permite reintentos
  execute(ctx)          // Ejecuta lógica específica del estado
}
```

#### Estados Concretos
- `AuthorizedState`
- `UploadedState`
- `ProcessingState`
- `ProcessedState`
- `RejectedState`
- `ErrorState`

#### `FileContext`
Clase de contexto que gestiona la máquina de estados.

```javascript
class FileContext {
  constructor(fileId, metadata)
  
  // Gestión de estados
  setState(stateName)
  getCurrentState()
  transitionTo(nextState)
  
  // Manejo de errores
  handleError(message, isRecoverable)
  retry()
  
  // Información y trazabilidad
  getStateHistory()
  getMetrics()
  getContextInfo()
}
```

#### `FileStateService`
Servicio de alto nivel que proporciona operaciones de negocio.

```javascript
class FileStateService {
  // Operaciones principales
  initializeFile(fileId, metadata)
  markAsUploaded(fileId)
  startProcessing(fileId)
  markAsProcessed(fileId)
  rejectFile(fileId, reason)
  
  // Manejo de errores
  handleError(fileId, message, isRecoverable)
  retryFile(fileId)
  
  // Consultas
  getFileState(fileId)
  getFileInfo(fileId)
  getFileHistory(fileId)
  getAllActiveFiles()
}
```

## Uso

### Ejemplo 1: Flujo Exitoso

```javascript
import FileStateService from './service/fileStateService.js';

const service = new FileStateService();

// Inicializar archivo
service.initializeFile('file-001', {
  filename: 'document.pdf',
  size: 2048,
  owner: 'user@example.com'
});

// Marcar como subido
service.markAsUploaded('file-001');

// Iniciar procesamiento
service.startProcessing('file-001');

// Completar procesamiento
service.markAsProcessed('file-001');

// Estado final: PROCESSED
```

### Ejemplo 2: Error Recuperable con Reintento

```javascript
const service = new FileStateService();

service.initializeFile('file-002', { filename: 'data.csv' });
service.markAsUploaded('file-002');
service.startProcessing('file-002');

// Ocurre un error recuperable
service.handleError('file-002', 'Network timeout', true);
// Estado: ERROR

// Reintentar procesamiento
service.retryFile('file-002');
// Estado: PROCESSING (retryCount = 1)

// Procesar exitosamente
service.markAsProcessed('file-002');
// Estado: PROCESSED
```

### Ejemplo 3: Error No Recuperable

```javascript
const service = new FileStateService();

service.initializeFile('file-003', { filename: 'corrupted.bin' });
service.markAsUploaded('file-003');
service.startProcessing('file-003');

// Error no recuperable
service.handleError(
  'file-003',
  'Data integrity check failed',
  false // No recuperable
);
// Estado: REJECTED (directo, sin pasar por ERROR)
```

### Ejemplo 4: Alcanzar Límite de Reintentos

```javascript
const service = new FileStateService();

service.initializeFile('file-004', { filename: 'problematic.zip' });
service.markAsUploaded('file-004');
service.startProcessing('file-004');

// 3 errores con reintentos
for (let i = 0; i < 3; i++) {
  service.handleError('file-004', `Timeout attempt ${i + 1}`, true);
  if (i < 2) {
    service.retryFile('file-004');
  }
}

// Después del 3er error, automáticamente: Estado = REJECTED
const info = service.getFileInfo('file-004');
console.log(info.rejectionReason); // "Max retries (3) exceeded"
```

### Ejemplo 5: Uso del FileContext Directamente

```javascript
import FileContext from './service/states/fileState.js';

const fileContext = new FileContext('file-005', {
  owner: 'admin',
  uploadDate: new Date().toISOString()
});

// Transiciones manuales
fileContext.transitionTo('UPLOADED');
fileContext.transitionTo('PROCESSING');

// Ver historial completo
const history = fileContext.getStateHistory();
console.log(history);

// Ver métricas
const metrics = fileContext.getMetrics();
console.log(metrics);
```

## Instalación y Ejecución

### Prerequisitos
```bash
node >= 18.0.0
```

### Instalar dependencias
```bash
npm install
```

### Ejecutar tests
```bash
npm test
```

### Ejecutar demo
```bash
npm run demo
```

## Tests

El proyecto incluye tests completos que cubren:

- ✓ Inicialización de estados
- ✓ Transiciones válidas (happy path)
- ✓ Transiciones inválidas (error handling)
- ✓ Lógica de reintentos
- ✓ Límite de reintentos
- ✓ Errores recuperables y no recuperables
- ✓ Estados finales (PROCESSED, REJECTED)
- ✓ Historial de estados
- ✓ Métricas de tracking
- ✓ Integración con FileStateService
- ✓ Gestión de múltiples archivos

Ejecutar tests:
```bash
npm test
```

## Logging y Métricas

### Logging
Todos los eventos importantes generan logs:
- Inicialización de archivos
- Transiciones de estado
- Errores (recuperables y no recuperables)
- Reintentos
- Rechazo automático por max reintentos

Formato de log:
```
[INFO] - Transitioning from UPLOADED to PROCESSING. File: file-001
[ERROR] - Error in file file-001: Network timeout. Recoverable: true
[INFO] - Retrying file file-001. Attempt: 1/3
```

### Métricas
Se rastrean métricas por archivo:
```javascript
{
  authorized: 1,
  uploaded: 1,
  processing: 2,  // Incluye reintentos
  processed: 1,
  rejected: 0,
  error: 1
}
```

### Historial de Estados
Cada archivo mantiene un historial completo:
```javascript
[
  {
    timestamp: "2025-11-18T10:30:00.000Z",
    previousState: null,
    newState: "AUTHORIZED",
    retryCount: 0,
    metadata: { filename: "doc.pdf", size: 2048 }
  },
  {
    timestamp: "2025-11-18T10:30:01.500Z",
    previousState: "AUTHORIZED",
    newState: "UPLOADED",
    retryCount: 0,
    metadata: { filename: "doc.pdf", size: 2048 }
  },
  // ...
]
```

## Estructura del Proyecto

```
machine-file-states/
├── service/
│   ├── states/
│   │   └── fileState.js          # Implementación del State Pattern
│   ├── fileStateService.js       # Servicio de alto nivel
│   └── fileJob.js                # Trabajos de procesamiento
├── helpers/
│   ├── constants.js              # Constantes (estados, max retries)
│   └── logger.js                 # Sistema de logging
├── tests/
│   └── fileStateService.test.js  # Suite de tests completa
├── examples/
│   └── demo.js                   # Demos de uso
├── package.json
└── README.md
```

## Características Clave

### ✓ Patrón State Completo
- Implementación OOP del patrón State
- Clase base abstracta y clases concretas para cada estado
- Validación de transiciones según reglas de negocio

### ✓ Gestión de Reintentos
- Contador automático de reintentos
- Límite configurable (MAX_RETRIES = 3)
- Transición automática a REJECTED al alcanzar el límite

### ✓ Trazabilidad Completa
- Historial detallado de transiciones
- Timestamp en cada evento
- Metadata preservada en cada estado

### ✓ Logging Estructurado
- Logs informativos y de error
- Contexto completo en cada log
- Integración con sistema de logging

### ✓ Métricas de Monitoreo
- Contadores por estado
- Volumen de errores
- Flujo de procesamiento

### ✓ Separación de Responsabilidades
- Estados independientes y cohesivos
- Contexto gestiona la lógica de transición
- Servicio proporciona API de alto nivel

### ✓ Validación Robusta
- Validación de transiciones inválidas
- Protección de estados finales
- Manejo de errores recuperables vs no recuperables

## Licencia

MIT

## Autor

Desarrollado como implementación del patrón de diseño State para gestión de ciclo de vida de archivos.
