import Logger from '../../helpers/logger.js';
import { FILE_STATES, MAX_RETRIES } from '../../helpers/constants.js';

const logger = new Logger();

/**
 * Base abstract class for file states
 * Implements the State pattern
 */
class FileState {
  constructor(stateName) {
    if (new.target === FileState) {
      throw new TypeError('Cannot construct FileState instances directly');
    }
    this.stateName = stateName;
  }

  /**
   * Returns the name of the current state
   */
  getStateName() {
    return this.stateName;
  }

  /**
   * Validates if transition to next state is allowed
   */
  canTransitionTo(nextState) {
    throw new Error('canTransitionTo must be implemented by subclass');
  }

  /**
   * Handles the transition to the next state
   */
  transitionTo(context, nextState) {
    throw new Error('transitionTo must be implemented by subclass');
  }

  /**
   * Checks if retry is allowed from this state
   */
  canRetry() {
    return false;
  }

  /**
   * Executes state-specific logic
   */
  execute(context) {
    throw new Error('execute must be implemented by subclass');
  }
}

/**
 * AUTHORIZED State
 * Archivo validado en metadata y permisos
 */
class AuthorizedState extends FileState {
  constructor() {
    super(FILE_STATES.AUTHORIZED);
  }

  canTransitionTo(nextState) {
    return [FILE_STATES.UPLOADED, FILE_STATES.REJECTED, FILE_STATES.ERROR].includes(nextState);
  }

  transitionTo(context, nextState) {
    if (!this.canTransitionTo(nextState)) {
      throw new Error(`Invalid transition from ${this.stateName} to ${nextState}`);
    }

    logger.info(`Transitioning from ${this.stateName} to ${nextState}. File: ${context.fileId}`);
    context.setState(nextState);
  }

  execute(context) {
    logger.info(`Executing ${this.stateName} state for file: ${context.fileId}`);
    // Note: metrics are logged in recordStateChange, not here
  }
}

/**
 * UPLOADED State
 * Archivo subido correctamente a S3, con integridad validada
 */
class UploadedState extends FileState {
  constructor() {
    super(FILE_STATES.UPLOADED);
  }

  canTransitionTo(nextState) {
    return [FILE_STATES.PROCESSING, FILE_STATES.REJECTED, FILE_STATES.ERROR].includes(nextState);
  }

  transitionTo(context, nextState) {
    if (!this.canTransitionTo(nextState)) {
      throw new Error(`Invalid transition from ${this.stateName} to ${nextState}`);
    }

    logger.info(`Transitioning from ${this.stateName} to ${nextState}. File: ${context.fileId}`);
    context.setState(nextState);
  }

  execute(context) {
    logger.info(`Executing ${this.stateName} state for file: ${context.fileId}`);
  }
}

/**
 * PROCESSING State
 * Archivo en lectura, validación y ejecución de lógica interna
 */
class ProcessingState extends FileState {
  constructor() {
    super(FILE_STATES.PROCESSING);
  }

  canTransitionTo(nextState) {
    return [FILE_STATES.PROCESSED, FILE_STATES.REJECTED, FILE_STATES.ERROR].includes(nextState);
  }

  transitionTo(context, nextState) {
    if (!this.canTransitionTo(nextState)) {
      throw new Error(`Invalid transition from ${this.stateName} to ${nextState}`);
    }

    logger.info(`Transitioning from ${this.stateName} to ${nextState}. File: ${context.fileId}`);
    context.setState(nextState);
  }

  execute(context) {
    logger.info(`Executing ${this.stateName} state for file: ${context.fileId}`);
  }
}

/**
 * PROCESSED State
 * Archivo procesado exitosamente
 * Este es un estado final - no se permiten reintentos
 */
class ProcessedState extends FileState {
  constructor() {
    super(FILE_STATES.PROCESSED);
  }

  canTransitionTo(nextState) {
    // Estado final - no hay transiciones permitidas
    return false;
  }

  transitionTo(context, nextState) {
    throw new Error(`Cannot transition from final state ${this.stateName}`);
  }

  execute(context) {
    logger.info(`File successfully processed: ${context.fileId}`);
  }

  canRetry() {
    return false;
  }
}

/**
 * REJECTED State
 * Archivo descartado de manera definitiva
 * Este es un estado final - no se permiten reintentos
 */
class RejectedState extends FileState {
  constructor() {
    super(FILE_STATES.REJECTED);
  }

  canTransitionTo(nextState) {
    // Estado final - no hay transiciones permitidas
    return false;
  }

  transitionTo(context, nextState) {
    throw new Error(`Cannot transition from final state ${this.stateName}`);
  }

  execute(context) {
    logger.error(`File rejected: ${context.fileId}. Reason: ${context.rejectionReason || 'Not specified'}`);
  }

  canRetry() {
    return false;
  }
}

/**
 * ERROR State
 * Estado para representar un fallo técnico recuperable
 * Permite reintentos si no se ha alcanzado el límite
 */
class ErrorState extends FileState {
  constructor() {
    super(FILE_STATES.ERROR);
  }

  canTransitionTo(nextState) {
    return [FILE_STATES.PROCESSING, FILE_STATES.REJECTED].includes(nextState);
  }

  transitionTo(context, nextState) {
    if (!this.canTransitionTo(nextState)) {
      throw new Error(`Invalid transition from ${this.stateName} to ${nextState}`);
    }

    logger.info(`Transitioning from ${this.stateName} to ${nextState}. File: ${context.fileId}`);
    context.setState(nextState);
  }

  execute(context) {
    logger.error(
      `Error state for file: ${context.fileId}. Retries: ${context.retryCount}/${MAX_RETRIES}. Error: ${context.errorMessage || 'Unknown'}`
    );
  }

  canRetry() {
    return true;
  }
}

/**
 * Context class that manages the file state machine
 * Handles state transitions, retry logic, and metadata
 */
class FileContext {
  constructor(fileId, metadata = {}) {
    this.fileId = fileId;
    this.metadata = metadata;
    this.retryCount = 0;
    this.errorMessage = null;
    this.rejectionReason = null;
    this.stateHistory = [];
    this.metrics = {
      authorized: 0,
      uploaded: 0,
      processing: 0,
      processed: 0,
      rejected: 0,
      error: 0,
    };

    // Initialize with AUTHORIZED state
    this.currentState = new AuthorizedState();
    this.recordStateChange(FILE_STATES.AUTHORIZED);
  }

  /**
   * Sets the current state
   */
  setState(stateName) {
    const previousState = this.currentState.getStateName();

    switch (stateName) {
      case FILE_STATES.AUTHORIZED:
        this.currentState = new AuthorizedState();
        break;
      case FILE_STATES.UPLOADED:
        this.currentState = new UploadedState();
        break;
      case FILE_STATES.PROCESSING:
        this.currentState = new ProcessingState();
        break;
      case FILE_STATES.PROCESSED:
        this.currentState = new ProcessedState();
        break;
      case FILE_STATES.REJECTED:
        this.currentState = new RejectedState();
        break;
      case FILE_STATES.ERROR:
        this.currentState = new ErrorState();
        break;
      default:
        throw new Error(`Unknown state: ${stateName}`);
    }

    this.recordStateChange(stateName, previousState);
    this.logMetrics(stateName.toLowerCase());
    this.currentState.execute(this);
  }

  /**
   * Gets the current state name
   */
  getCurrentState() {
    return this.currentState.getStateName();
  }

  /**
   * Transitions to the next state
   */
  transitionTo(nextState) {
    this.currentState.transitionTo(this, nextState);
  }

  /**
   * Handles error and manages retry logic
   */
  handleError(errorMessage, isRecoverable = true) {
    this.errorMessage = errorMessage;

    logger.error(`Error in file ${this.fileId}: ${errorMessage}. Recoverable: ${isRecoverable}`);

    if (!isRecoverable) {
      // Error no recuperable - directamente a REJECTED
      this.rejectionReason = `Non-recoverable error: ${errorMessage}`;
      this.transitionTo(FILE_STATES.REJECTED);
      return;
    }

    // Error recuperable - ir a estado ERROR
    this.transitionTo(FILE_STATES.ERROR);
  }

  /**
   * Attempts to retry from ERROR state
   */
  retry() {
    if (!this.currentState.canRetry()) {
      throw new Error(`Cannot retry from state: ${this.currentState.getStateName()}`);
    }

    if (this.retryCount >= MAX_RETRIES) {
      logger.error(`Max retries reached for file ${this.fileId}. Moving to REJECTED state.`);
      this.rejectionReason = `Max retries (${MAX_RETRIES}) exceeded`;
      this.transitionTo(FILE_STATES.REJECTED);
      return false;
    }

    this.retryCount++;
    logger.info(`Retrying file ${this.fileId}. Attempt: ${this.retryCount}/${MAX_RETRIES}`);
    this.transitionTo(FILE_STATES.PROCESSING);
    return true;
  }

  /**
   * Records state change in history
   */
  recordStateChange(newState, previousState = null) {
    const record = {
      timestamp: new Date().toISOString(),
      previousState,
      newState,
      retryCount: this.retryCount,
      metadata: { ...this.metadata },
    };

    this.stateHistory.push(record);
    logger.info(`State change recorded: ${JSON.stringify(record)}`);
  }

  /**
   * Logs metrics for monitoring
   */
  logMetrics(stateKey) {
    if (this.metrics.hasOwnProperty(stateKey)) {
      this.metrics[stateKey]++;
    }
    logger.info(`Metrics for file ${this.fileId}: ${JSON.stringify(this.metrics)}`);
  }

  /**
   * Gets the complete state history
   */
  getStateHistory() {
    return this.stateHistory;
  }

  /**
   * Gets current metrics
   */
  getMetrics() {
    return { ...this.metrics };
  }

  /**
   * Gets complete context information
   */
  getContextInfo() {
    return {
      fileId: this.fileId,
      currentState: this.getCurrentState(),
      retryCount: this.retryCount,
      metadata: this.metadata,
      errorMessage: this.errorMessage,
      rejectionReason: this.rejectionReason,
      stateHistory: this.stateHistory,
      metrics: this.metrics,
    };
  }
}

// Export classes and factory function
export { FileState, AuthorizedState, UploadedState, ProcessingState, ProcessedState, RejectedState, ErrorState, FileContext };

export default FileContext;
