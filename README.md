# File State Machine - Patrón State

Implementación completa del patrón State para gestión del ciclo de vida de archivos con logs estructurados, métricas y validaciones de integridad.

## 🎯 Características Principales

✅ **Patrón State Clásico**: Estados encapsulados con comportamiento propio  
✅ **Logs Estructurados**: Trazabilidad completa con winston  
✅ **Métricas en Tiempo Real**: Contadores de transiciones, errores y estados  
✅ **Validación de Integridad**: Verificación automática antes de upload  
✅ **Control de Reintentos**: Configurable con límite de 3 intentos  
✅ **Clasificación de Errores**: Técnicos (recuperables/no recuperables) vs Negocio  
✅ **Estado Inicial Forzado**: AUTHORIZED por defecto para flujo completo  

## 📊 Estados del Sistema

```
AUTHORIZED → UPLOADED → PROCESSING → PROCESSED (terminal)
                ↓            ↓
            REJECTED ←── ERROR ⟲ (max 3 retries)
           (terminal)
```

### Estados Disponibles

- **AUTHORIZED**: Archivo autorizado, pendiente de validación
- **UPLOADED**: Archivo validado y subido exitosamente
- **PROCESSING**: Procesamiento en curso
- **PROCESSED**: Procesamiento completado (terminal)
- **ERROR**: Error técnico recuperable (permite reintentos)
- **REJECTED**: Error irrecuperable o límite alcanzado (terminal)

## 🚀 Uso Rápido

### Instalar Dependencias

```bash
npm install
```

### Ejecutar Demo

```bash
npm start
```

### Ejecutar Tests

```bash
node tests/fileStateService.test.js
```

## 📝 Ejemplos de Código

### 1. Flujo Completo Exitoso

```javascript
import FileStateService from './service/fileStateService.js';

const service = new FileStateService();

// Crear job (inicia en AUTHORIZED)
const job = service.createJob({
  id: 'file-123',
  metadata: { filename: 'document.pdf', size: 2048 }
});

// Validar y subir (AUTHORIZED → UPLOADED)
service.handleUpload(job);

// Iniciar procesamiento (UPLOADED → PROCESSING)
service.startProcessing(job);

// Completar (PROCESSING → PROCESSED)
service.markAsProcessed(job);

console.log(job.state); // 'PROCESSED'
```

### 2. Manejo de Errores Técnicos con Reintentos

```javascript
const job = service.processFile({
  id: 'file-456',
  metadata: { filename: 'image.jpg', size: 1024 }
});

// Error técnico recuperable (va a ERROR)
service.handleTechnicalError(job, { 
  code: 'TIMEOUT', 
  message: 'Database timeout' 
}, true); // recoverable = true

console.log(job.state); // 'ERROR'

// Reintentar (ERROR → PROCESSING)
service.retryJob(job);

console.log(job.retryCount); // 1
```

### 3. Error No Recuperable

```javascript
// Error técnico NO recuperable (va directo a REJECTED)
service.handleTechnicalError(job, { 
  code: 'FATAL_ERROR' 
}, false); // recoverable = false

console.log(job.state); // 'REJECTED'
```

### 4. Deshabilitar Reintentos

```javascript
const job = service.createJob({
  id: 'file-789',
  metadata: { filename: 'no-retry.pdf', size: 512 },
  retryEnabled: false
});

service.handleUpload(job);
service.startProcessing(job);
service.handleTechnicalError(job, { code: 'ERROR' });

try {
  service.retryJob(job); // Lanza excepción
} catch (error) {
  console.error(error.message); // "Retries are disabled for this job"
}
```

### 5. Validación de Integridad

```javascript
// Archivo con extensión inválida y tamaño 0
const job = service.createJob({
  id: 'file-bad',
  metadata: { filename: 'malware.exe', size: 0 }
});

service.handleUpload(job);

console.log(job.state); // 'REJECTED' (fallo en validación)
console.log(job.lastError); 
// { code: 'INTEGRITY_VALIDATION_FAILED', ... }
```

## 📈 Métricas

### Obtener Métricas

```javascript
const metrics = service.getMetrics();
console.log(metrics);

// Output:
// {
//   transitions: { 'AUTHORIZED_to_UPLOADED': 10, ... },
//   errors: { business: 2, technical: 5 },
//   created: 15,
//   completed: 8,
//   rejected: 3,
//   activeJobs: 15,
//   byState: {
//     authorized: 2,
//     uploaded: 1,
//     processing: 3,
//     processed: 8,
//     rejected: 3,
//     error: 0
//   }
// }
```

### Logs Automáticos

Todos los eventos importantes se registran automáticamente:

```
[2025-11-18 15:24:46] INFO - FileJob created {"jobId":"file-123","initialState":"AUTHORIZED",...}
[2025-11-18 15:24:46] INFO - State transition {"transition":"AUTHORIZED → UPLOADED",...}
[2025-11-18 15:24:46] ERROR - Business error applied {"jobId":"file-123",...}
```

## 🏗️ Arquitectura

```
service/
  ├── states/
  │   └── fileState.js       # Clase base + 6 estados concretos
  ├── fileJob.js             # Context del patrón State
  └── fileStateService.js    # Orquestador con métricas

helpers/
  ├── constants.js           # FILE_STATES, MAX_RETRIES
  └── logger.js              # Logger estructurado (winston)

tests/
  └── fileStateService.test.js  # Suite de tests completa
```

## 🧪 Escenarios de Prueba Cubiertos

1. ✅ Transición inválida lanza error
2. ✅ Flujo completo con logs y métricas
3. ✅ Validación de integridad rechaza archivos inválidos
4. ✅ Límite de 3 reintentos → REJECTED
5. ✅ Reintentos deshabilitados lanzan error
6. ✅ Error técnico no recuperable → REJECTED directo
7. ✅ handleTechnicalError en PROCESSED lanza excepción
8. ✅ Error de negocio → REJECTED desde cualquier estado
9. ✅ Métricas agregadas correctas
10. ✅ Estado inicial por defecto es AUTHORIZED

## 🔧 Configuración

### Modificar Límite de Reintentos

En `helpers/constants.js`:

```javascript
export const MAX_RETRIES = 5; // Cambiar de 3 a 5
```

### Agregar Nuevos Estados

1. Agregar constante en `helpers/constants.js`
2. Crear clase en `service/states/fileState.js`
3. Actualizar `getStateByName()` factory
4. Definir transiciones permitidas

### Personalizar Validaciones

En `fileStateService.js` → `validateIntegrity()`:

```javascript
validateIntegrity(job) {
  const { metadata } = job;
  
  return {
    isValid: metadata.size > 0 && metadata.checksum !== null,
    validations: { /* ... */ }
  };
}
```

## 📦 Dependencias

- **winston**: Logger estructurado
- **Node.js**: v18+ (ES Modules)

## 🤝 Contribuir

1. Agregar tests para nuevas funcionalidades
2. Mantener logs estructurados en todas las transiciones
3. Documentar nuevas validaciones
4. Actualizar métricas cuando sea necesario

## 📄 Licencia

MIT

---

**Autor**: Ander0907  
**Repositorio**: machine-file-states  
**Branch**: development
