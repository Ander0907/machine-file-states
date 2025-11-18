# Flujo Visual del Sistema - File State Machine

## Flujo Completo de Estados

```
┌─────────────────────────────────────────────────────────────────┐
│                    INICIO: Nuevo Archivo                         │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           v
                   ┌───────────────┐
                   │  AUTHORIZED   │  ← Estado Inicial
                   │ (Validación)  │
                   └───────┬───────┘
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
        v                  v                  v
   ┌─────────┐      ┌─────────────┐     ┌─────────┐
   │ REJECTED│      │   UPLOADED  │     │  ERROR  │
   │  ✗      │      │  (En S3)    │     │  (*)    │
   └─────────┘      └──────┬──────┘     └────┬────┘
                           │                  │
        ┌──────────────────┼──────────┐       │
        │                  │          │       │
        v                  v          v       │
   ┌─────────┐      ┌─────────────┐  ┌──────────┐
   │ REJECTED│      │ PROCESSING  │  │  ERROR   │
   │  ✗      │      │ (Procesa)   │  │  (*)     │
   └─────────┘      └──────┬──────┘  └────┬─────┘
                           │              │
        ┌──────────────────┼──────────┐   │
        │                  │          │   │
        v                  v          v   │
   ┌─────────┐      ┌──────────┐   ┌─────────┐
   │ REJECTED│      │PROCESSED │   │  ERROR  │
   │  ✗      │      │    ✓     │   │  (*)    │
   └─────────┘      └──────────┘   └────┬────┘
                                          │
                                    ┌─────┴─────┐
                                    │  Reintento │
                                    │    Logic   │
                                    └─────┬──────┘
                                          │
                            ┌─────────────┴─────────────┐
                            │                           │
                            v                           v
                    ┌──────────────┐           ┌────────────┐
                    │  PROCESSING  │           │  REJECTED  │
                    │ (Si < 3)     │           │ (Si >= 3)  │
                    └──────────────┘           └────────────┘

(*) ERROR = Error técnico recuperable
```

## Matriz de Transiciones

| Desde \ Hacia | AUTHORIZED | UPLOADED | PROCESSING | PROCESSED | REJECTED | ERROR |
|---------------|------------|----------|------------|-----------|----------|-------|
| **AUTHORIZED** | - | ✓ | ✗ | ✗ | ✓ | ✓ |
| **UPLOADED** | ✗ | - | ✓ | ✗ | ✓ | ✓ |
| **PROCESSING** | ✗ | ✗ | - | ✓ | ✓ | ✓ |
| **PROCESSED** | ✗ | ✗ | ✗ | - | ✗ | ✗ |
| **REJECTED** | ✗ | ✗ | ✗ | ✗ | - | ✗ |
| **ERROR** | ✗ | ✗ | ✓* | ✗ | ✓* | - |

`*` Condiciones especiales:
- ERROR → PROCESSING: Solo si retryCount < 3
- ERROR → REJECTED: Automático si retryCount >= 3

## Flujo de Reintentos Detallado

```
Intento 1:
PROCESSING ─[Error]→ ERROR ─[retry()]→ PROCESSING (retryCount=1)
                                              │
Intento 2:                                    │
                                    ┌─────────┘
                                    v
                         ERROR ─[retry()]→ PROCESSING (retryCount=2)
                                              │
Intento 3:                                    │
                                    ┌─────────┘
                                    v
                         ERROR ─[retry()]→ PROCESSING (retryCount=3)
                                              │
Intento 4 (Falla):                            │
                                    ┌─────────┘
                                    v
                         ERROR ─[retry()]→ REJECTED ✗
                                       (retryCount >= MAX_RETRIES)
```

## Ejemplo de Uso: Ciclo Completo

```javascript
// 1. AUTHORIZED (Estado Inicial)
const service = new FileStateService();
service.initializeFile('file-001', {
  filename: 'document.pdf',
  size: 2048,
  owner: 'user@example.com'
});
// Estado: AUTHORIZED

// 2. UPLOADED
service.markAsUploaded('file-001');
// Estado: UPLOADED

// 3. PROCESSING
service.startProcessing('file-001');
// Estado: PROCESSING

// 4. ERROR (Fallo recuperable)
service.handleError('file-001', 'Network timeout', true);
// Estado: ERROR (retryCount=0)

// 5. Reintento 1
service.retryFile('file-001');
// Estado: PROCESSING (retryCount=1)

// 6. ERROR nuevamente
service.handleError('file-001', 'Database busy', true);
// Estado: ERROR (retryCount=1)

// 7. Reintento 2
service.retryFile('file-001');
// Estado: PROCESSING (retryCount=2)

// 8. PROCESSED (Éxito!)
service.markAsProcessed('file-001');
// Estado: PROCESSED ✓
```

## Trazabilidad: Historial Completo

```javascript
const history = service.getFileHistory('file-001');
// Resultado:
[
  {
    timestamp: "2025-11-18T10:00:00.000Z",
    previousState: null,
    newState: "AUTHORIZED",
    retryCount: 0
  },
  {
    timestamp: "2025-11-18T10:00:01.500Z",
    previousState: "AUTHORIZED",
    newState: "UPLOADED",
    retryCount: 0
  },
  {
    timestamp: "2025-11-18T10:00:02.100Z",
    previousState: "UPLOADED",
    newState: "PROCESSING",
    retryCount: 0
  },
  {
    timestamp: "2025-11-18T10:00:03.200Z",
    previousState: "PROCESSING",
    newState: "ERROR",
    retryCount: 0
  },
  {
    timestamp: "2025-11-18T10:00:04.000Z",
    previousState: "ERROR",
    newState: "PROCESSING",
    retryCount: 1  // ← Reintento 1
  },
  {
    timestamp: "2025-11-18T10:00:05.100Z",
    previousState: "PROCESSING",
    newState: "ERROR",
    retryCount: 1
  },
  {
    timestamp: "2025-11-18T10:00:06.000Z",
    previousState: "ERROR",
    newState: "PROCESSING",
    retryCount: 2  // ← Reintento 2
  },
  {
    timestamp: "2025-11-18T10:00:07.500Z",
    previousState: "PROCESSING",
    newState: "PROCESSED",
    retryCount: 2  // ← Éxito después de 2 reintentos
  }
]
```

## Métricas por Archivo

```javascript
const metrics = service.getFileMetrics('file-001');
// Resultado:
{
  authorized: 0,     // No se cuenta el inicial
  uploaded: 1,       // Una vez
  processing: 3,     // Original + 2 reintentos
  processed: 1,      // Éxito final
  rejected: 0,       // No rechazado
  error: 2           // 2 errores recuperables
}
```

## Estados Finales

### PROCESSED ✓
```
Características:
- Archivo procesado exitosamente
- No permite ninguna transición
- Archivo se archiva automáticamente
- Reintento no permitido

Logs generados:
[INFO] - File successfully processed: file-001
[INFO] - File file-001 archived from state PROCESSED
```

### REJECTED ✗
```
Causas posibles:
1. Error no recuperable (integridad fallida)
2. Regla de negocio (archivo duplicado)
3. Max reintentos excedidos (≥3)
4. Validación de metadata fallida

Características:
- Estado final definitivo
- No permite transiciones
- Se registra razón de rechazo
- Archivo se archiva automáticamente

Logs generados:
[ERROR] - File rejected: file-001. Reason: Max retries (3) exceeded
[INFO] - File file-001 archived from state REJECTED
```

## Manejo de Errores

### Error Recuperable → ERROR State
```javascript
service.handleError(fileId, 'Network timeout', true);
//                                               ^^^^
//                                            isRecoverable
// Estado resultante: ERROR
// Permite: retry()
```

### Error No Recuperable → REJECTED State
```javascript
service.handleError(fileId, 'Data corrupted', false);
//                                             ^^^^^
//                                          No recuperable
// Estado resultante: REJECTED (directo)
// No permite: retry()
```

## Comandos Útiles

```bash
# Ejecutar tests
npm test

# Ejecutar demo completo
npm run demo

# Ver estructura del proyecto
tree /F

# Lint código
npm run lint

# Formatear código
npm run prettier
```

## Logs de Ejemplo

```
[INFO] - File file-001 initialized in AUTHORIZED state
[INFO] - Transitioning from AUTHORIZED to UPLOADED. File: file-001
[INFO] - Executing UPLOADED state for file: file-001
[INFO] - Metrics for file file-001: {"authorized":0,"uploaded":1,...}
[INFO] - Transitioning from UPLOADED to PROCESSING. File: file-001
[ERROR] - Error in file file-001: Network timeout. Recoverable: true
[INFO] - Transitioning from PROCESSING to ERROR. File: file-001
[ERROR] - Error state for file: file-001. Retries: 0/3. Error: Network timeout
[INFO] - Retrying file file-001. Attempt: 1/3
[INFO] - Transitioning from ERROR to PROCESSING. File: file-001
[INFO] - File successfully processed: file-001
```

## Resumen de Clases

```
FileContext
├── setState(stateName)        # Cambiar estado
├── transitionTo(nextState)    # Transicionar validadamente
├── handleError(msg, recoverable) # Manejar error
├── retry()                    # Reintentar desde ERROR
├── getStateHistory()          # Obtener historial
├── getMetrics()               # Obtener métricas
└── getContextInfo()           # Info completa

FileStateService
├── initializeFile(id, metadata)  # Crear archivo
├── markAsUploaded(id)            # Marcar subido
├── startProcessing(id)           # Iniciar proceso
├── markAsProcessed(id)           # Marcar completado
├── rejectFile(id, reason)        # Rechazar archivo
├── handleError(id, msg, recov)   # Manejar error
├── retryFile(id)                 # Reintentar
├── getFileState(id)              # Estado actual
├── getFileInfo(id)               # Info completa
└── getAllActiveFiles()           # Archivos activos
```
