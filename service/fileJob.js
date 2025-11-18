import FileState from './states/fileState.js';
import { FILE_STATES } from '../helpers/constants.js';
import Logger from '../helpers/logger.js';

const logger = new Logger();

class FileJob {
  constructor({ 
    id, 
    metadata = {}, 
    initialState = FILE_STATES.AUTHORIZED, // Cambiado: fuerza flujo completo
    retryEnabled = true,
    metricsHook = null 
  }) {
    this.id = id;
    this.metadata = metadata;
    this.retryCount = 0;
    this.retryEnabled = retryEnabled;
    this.lastError = null;
    this.history = [];
    this.metricsHook = metricsHook; // Hook para métricas externas
    
    this.currentState = FileState.getStateByName(initialState);
    this.addToHistory(null, initialState, 'INIT');
    
    logger.info('FileJob created', {
      jobId: this.id,
      initialState,
      metadata: this.metadata
    });
  }

  get state() {
    return this.currentState.name;
  }

  _setState(stateObject, meta = {}) {
    const previousStateName = this.currentState.name;
    const newStateName = stateObject.name;
    
    this.currentState = stateObject;
    this.addToHistory(previousStateName, newStateName, meta.reason, meta);
    
    // Log estructurado de transición
    const logMeta = {
      jobId: this.id,
      transition: `${previousStateName} → ${newStateName}`,
      reason: meta.reason,
      retryCount: this.retryCount,
      metadata: this.metadata
    };
    
    if (meta.error) {
      logMeta.error = meta.error;
      logger.error(`State transition with error`, logMeta);
    } else {
      logger.info(`State transition`, logMeta);
    }
    
    // Emitir métricas si hay hook configurado
    if (this.metricsHook) {
      this.metricsHook({
        type: 'state_transition',
        jobId: this.id,
        from: previousStateName,
        to: newStateName,
        reason: meta.reason,
        timestamp: new Date().toISOString()
      });
    }
  }

  addToHistory(from, to, reason, meta = {}) {
    const historyEntry = {
      from,
      to,
      at: new Date().toISOString(),
      reason,
      ...meta,
    };
    this.history.push(historyEntry);
  }

  canTransitionTo(targetState) {
    return this.currentState.canTransitionTo(targetState);
  }

  transitionTo(targetState, meta = {}) {
    return this.currentState.transitionTo(this, targetState, meta);
  }

  applyBusinessError(error) {
    this.lastError = error;
    
    logger.error('Business error applied', {
      jobId: this.id,
      currentState: this.state,
      error,
      metadata: this.metadata
    });
    
    if (this.metricsHook) {
      this.metricsHook({
        type: 'business_error',
        jobId: this.id,
        error,
        timestamp: new Date().toISOString()
      });
    }
    
    return this.currentState.handleBusinessError(this, error);
  }

  applyTechnicalError(error, recoverable = true) {
    this.lastError = error;
    
    logger.warn('Technical error applied', {
      jobId: this.id,
      currentState: this.state,
      error,
      recoverable,
      metadata: this.metadata
    });
    
    if (this.metricsHook) {
      this.metricsHook({
        type: 'technical_error',
        jobId: this.id,
        error,
        recoverable,
        timestamp: new Date().toISOString()
      });
    }
    
    return this.currentState.handleTechnicalError(this, error, recoverable);
  }

  retry() {
    return this.currentState.retry(this);
  }

  toJSON() {
    return {
      id: this.id,
      state: this.state,
      retryCount: this.retryCount,
      metadata: this.metadata,
      lastError: this.lastError,
      history: this.history,
    };
  }
}

export default FileJob;