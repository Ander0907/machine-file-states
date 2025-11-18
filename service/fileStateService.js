import FileJob from './fileJob.js';
import FileState from './states/fileState.js';
import { FILE_STATES } from '../helpers/constants.js';

class FileStateService {
  constructor() {
    this.jobs = new Map();
  }

  /**
   * Crea un nuevo job de archivo
   * @param {string} id - Identificador único
   * @param {Object} metadata - Metadata del archivo
   * @param {string} initialState - Estado inicial
   * @returns {FileJob} Nueva instancia
   */
  createJob({ id, metadata = {}, initialState = FILE_STATES.PROCESSING }) {
    const job = new FileJob({ id, metadata, initialState });
    this.jobs.set(id, job);
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
   * Procesa la subida de un archivo
   * @param {FileJob} job - Job a procesar
   * @returns {FileJob}
   */
  handleUpload(job) {
    if (job.state === FILE_STATES.AUTHORIZED) {
      job.transitionTo(FILE_STATES.UPLOADED, { reason: 'FILE_UPLOADED' });
    }
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
   * Maneja un error técnico (recuperable)
   * @param {FileJob} job - Job con error
   * @param {Object} error - Detalles del error
   * @returns {FileJob}
   */
  handleTechnicalError(job, error) {
    return job.applyTechnicalError(error);
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
}

export default FileStateService;
