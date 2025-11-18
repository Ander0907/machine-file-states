import FileJob from './fileJob.js';
import FileState from './states/fileState.js';
import { FILE_STATES } from '../helpers/constants.js';
import Logger from '../helpers/logger.js';

const logger = new Logger();

class FileStateService {
  constructor() {
    this.jobs = new Map();
    this.metrics = {
      transitions: {},
      errors: { business: 0, technical: 0 },
      retries: 0,
      created: 0,
      completed: 0,
      rejected: 0
    };
  }
  
  /**
   * Hook para métricas - se llama en cada transición
   */
  _metricsHook(data) {
    if (data.type === 'state_transition') {
      const key = `${data.from}_to_${data.to}`;
      this.metrics.transitions[key] = (this.metrics.transitions[key] || 0) + 1;
      
      if (data.to === FILE_STATES.PROCESSED) {
        this.metrics.completed++;
      } else if (data.to === FILE_STATES.REJECTED) {
        this.metrics.rejected++;
      }
    } else if (data.type === 'business_error') {
      this.metrics.errors.business++;
    } else if (data.type === 'technical_error') {
      this.metrics.errors.technical++;
    }
  }

  /**
   * Crea un nuevo job de archivo
   * @param {string} id - Identificador único
   * @param {Object} metadata - Metadata del archivo
   * @param {string} initialState - Estado inicial
   * @param {boolean} retryEnabled - Habilitar reintentos
   * @returns {FileJob} Nueva instancia
   */
  createJob({ 
    id, 
    metadata = {}, 
    initialState = FILE_STATES.AUTHORIZED,
    retryEnabled = true 
  }) {
    const job = new FileJob({ 
      id, 
      metadata, 
      initialState,
      retryEnabled,
      metricsHook: this._metricsHook.bind(this)
    });
    
    this.jobs.set(id, job);
    this.metrics.created++;
    
    logger.info('Job created by service', {
      jobId: id,
      initialState,
      retryEnabled,
      totalJobs: this.jobs.size
    });
    
    return job;
  }

  /**
   * Obtiene un job por su ID
   * @param {string} id - ID del job
   * @returns {FileJob|undefined}
   */
  getJob(id) {
    return this.jobs.get(id);
  }

  /**
   * Verifica si una transición es válida
   * @param {string} fromState - Estado origen
   * @param {string} toState - Estado destino
   * @returns {boolean}
   */
  canTransition(fromState, toState) {
    const state = FileState.getStateByName(fromState);
    return state.canTransitionTo(toState);
  }

  /**
   * Valida integridad del archivo
   * @param {FileJob} job - Job a validar
   * @returns {Object} Resultado de validación
   */
  validateIntegrity(job) {
    const { metadata } = job;
    
    // Validaciones básicas de integridad
    const validations = {
      hasFilename: !!metadata.filename,
      hasSize: metadata.size !== undefined && metadata.size > 0,
      hasValidExtension: metadata.filename ? /\.(pdf|jpg|png|doc|docx)$/i.test(metadata.filename) : false
    };
    
    const isValid = Object.values(validations).every(v => v);
    
    logger.info('Integrity validation', {
      jobId: job.id,
      validations,
      isValid,
      metadata
    });
    
    return { isValid, validations };
  }
  
  /**
   * Procesa la subida de un archivo con validación de integridad
   * @param {FileJob} job - Job a procesar
   * @returns {FileJob}
   */
  handleUpload(job) {
    if (job.state !== FILE_STATES.AUTHORIZED) {
      logger.warn('Upload attempted from invalid state', {
        jobId: job.id,
        currentState: job.state
      });
      return job;
    }
    
    // Validar integridad antes de permitir upload
    const validation = this.validateIntegrity(job);
    
    if (!validation.isValid) {
      logger.error('Integrity validation failed', {
        jobId: job.id,
        validations: validation.validations
      });
      
      job.applyBusinessError({
        code: 'INTEGRITY_VALIDATION_FAILED',
        message: 'File integrity validation failed',
        details: validation.validations
      });
      
      return job;
    }
    
    job.transitionTo(FILE_STATES.UPLOADED, { reason: 'FILE_UPLOADED' });
    return job;
  }

  /**
   * Inicia el procesamiento de un archivo
   * @param {FileJob} job - Job a procesar
   * @returns {FileJob}
   */
  startProcessing(job) {
    if (job.state === FILE_STATES.UPLOADED) {
      job.transitionTo(FILE_STATES.PROCESSING, { reason: 'START_PROCESSING' });
    }
    return job;
  }

  /**
   * Marca un archivo como procesado exitosamente
   * @param {FileJob} job - Job a marcar
   * @returns {FileJob}
   */
  markAsProcessed(job) {
    if (job.state === FILE_STATES.PROCESSING) {
      job.transitionTo(FILE_STATES.PROCESSED, { reason: 'PROCESSING_SUCCESS' });
    }
    return job;
  }

  /**
   * Maneja un error de negocio (irrecuperable)
   * @param {FileJob} job - Job con error
   * @param {Object} error - Detalles del error
   * @returns {FileJob}
   */
  handleBusinessError(job, error) {
    return job.applyBusinessError(error);
  }

  /**
   * Maneja un error técnico con clasificación de recuperabilidad
   * @param {FileJob} job - Job con error
   * @param {Object} error - Detalles del error
   * @param {boolean} recoverable - Si el error es recuperable
   * @returns {FileJob}
   */
  handleTechnicalError(job, error, recoverable = true) {
    logger.info('Handling technical error', {
      jobId: job.id,
      error,
      recoverable
    });
    
    return job.applyTechnicalError(error, recoverable);
  }

  /**
   * Intenta reintentar un job en estado ERROR
   * @param {FileJob} job - Job a reintentar
   * @returns {FileJob}
   */
  retryJob(job) {
    if (job.state === FILE_STATES.ERROR) {
      job.retry();
    }
    return job;
  }

  /**
   * Orquesta el flujo completo desde AUTHORIZED hasta PROCESSING
   * @param {string} id - ID del archivo
   * @param {Object} metadata - Metadata del archivo
   * @returns {FileJob}
   */
  processFile({ id, metadata = {} }) {
    const job = this.createJob({ 
      id, 
      metadata, 
      initialState: FILE_STATES.AUTHORIZED 
    });

    this.handleUpload(job);
    this.startProcessing(job);
    
    return job;
  }

  /**
   * Elimina un job del almacén
   * @param {string} id - ID del job
   */
  removeJob(id) {
    this.jobs.delete(id);
  }

  /**
   * Obtiene todos los jobs activos
   * @returns {Array<FileJob>}
   */
  getAllJobs() {
    return Array.from(this.jobs.values());
  }

  /**
   * Obtiene jobs filtrados por estado
   * @param {string} state - Estado a filtrar
   * @returns {Array<FileJob>}
   */
  getJobsByState(state) {
    return this.getAllJobs().filter(job => job.state === state);
  }
  
  /**
   * Obtiene métricas agregadas del servicio
   * @returns {Object} Métricas
   */
  getMetrics() {
    return {
      ...this.metrics,
      activeJobs: this.jobs.size,
      byState: {
        authorized: this.getJobsByState(FILE_STATES.AUTHORIZED).length,
        uploaded: this.getJobsByState(FILE_STATES.UPLOADED).length,
        processing: this.getJobsByState(FILE_STATES.PROCESSING).length,
        processed: this.getJobsByState(FILE_STATES.PROCESSED).length,
        rejected: this.getJobsByState(FILE_STATES.REJECTED).length,
        error: this.getJobsByState(FILE_STATES.ERROR).length
      }
    };
  }
  
  /**
   * Registra las métricas en el log
   */
  logMetrics() {
    const metrics = this.getMetrics();
    logger.info('Service metrics', metrics);
    return metrics;
  }
}

export default FileStateService;
export { FILE_STATES, FileJob, FileState };
