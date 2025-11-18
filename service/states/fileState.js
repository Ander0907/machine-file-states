import { FILE_STATES, MAX_RETRIES } from '../../helpers/constants.js';
import Logger from '../../helpers/logger.js';

const logger = new Logger();

class FileState {
  constructor(name) {
    this.name = name;
  }

  canTransitionTo(targetState) {
    const allowedTransitions = this.getAllowedTransitions();
    return allowedTransitions.includes(targetState);
  }

  getAllowedTransitions() {
    return [];
  }

  transitionTo(context, targetStateName, meta = {}) {
    const targetState = FileState.getStateByName(targetStateName);
    
    if (!this.canTransitionTo(targetStateName)) {
      throw new Error(
        `Invalid state transition: ${this.name} → ${targetStateName}`
      );
    }

    context._setState(targetState, meta);
    return context;
  }

  handleBusinessError(context, error) {
    return this.transitionTo(context, FILE_STATES.REJECTED, {
      reason: 'BUSINESS_ERROR',
      error,
    });
  }

  handleTechnicalError(context, error, recoverable = true) {
    // Si el error NO es recuperable, va directo a REJECTED
    if (!recoverable) {
      logger.warn('Non-recoverable technical error, moving to REJECTED', {
        jobId: context.id,
        error,
        state: this.name
      });
      
      return this.transitionTo(context, FILE_STATES.REJECTED, {
        reason: 'NON_RECOVERABLE_TECHNICAL_ERROR',
        error,
      });
    }
    
    // Error recuperable -> va a ERROR para posible reintento
    return this.transitionTo(context, FILE_STATES.ERROR, {
      reason: 'TECHNICAL_ERROR',
      error,
    });
  }

  retry(context) {
    throw new Error(`Cannot retry from state: ${this.name}`);
  }

  static getStateByName(stateName) {
    const stateMap = {
      [FILE_STATES.AUTHORIZED]: new AuthorizedState(),
      [FILE_STATES.UPLOADED]: new UploadedState(),
      [FILE_STATES.PROCESSING]: new ProcessingState(),
      [FILE_STATES.PROCESSED]: new ProcessedState(),
      [FILE_STATES.REJECTED]: new RejectedState(),
      [FILE_STATES.ERROR]: new ErrorState(),
    };
    return stateMap[stateName];
  }
}

class AuthorizedState extends FileState {
  constructor() {
    super(FILE_STATES.AUTHORIZED);
  }

  getAllowedTransitions() {
    return [FILE_STATES.UPLOADED, FILE_STATES.REJECTED, FILE_STATES.ERROR];
  }
}

class UploadedState extends FileState {
  constructor() {
    super(FILE_STATES.UPLOADED);
  }

  getAllowedTransitions() {
    return [FILE_STATES.PROCESSING, FILE_STATES.REJECTED, FILE_STATES.ERROR];
  }
}

class ProcessingState extends FileState {
  constructor() {
    super(FILE_STATES.PROCESSING);
  }

  getAllowedTransitions() {
    return [FILE_STATES.PROCESSED, FILE_STATES.REJECTED, FILE_STATES.ERROR];
  }
}

class ProcessedState extends FileState {
  constructor() {
    super(FILE_STATES.PROCESSED);
  }

  getAllowedTransitions() {
    return [];
  }

  handleBusinessError(context, error) {
    throw new Error('Cannot handle errors from PROCESSED state');
  }

  handleTechnicalError(context, error) {
    throw new Error('Cannot handle errors from PROCESSED state');
  }
}

class RejectedState extends FileState {
  constructor() {
    super(FILE_STATES.REJECTED);
  }

  getAllowedTransitions() {
    return [];
  }

  handleBusinessError(context, error) {
    throw new Error('Cannot handle errors from REJECTED state');
  }

  handleTechnicalError(context, error) {
    throw new Error('Cannot handle errors from REJECTED state');
  }
}

class ErrorState extends FileState {
  constructor() {
    super(FILE_STATES.ERROR);
  }

  getAllowedTransitions() {
    return [FILE_STATES.PROCESSING, FILE_STATES.REJECTED];
  }

  retry(context) {
    // Validar si los reintentos están habilitados
    if (!context.retryEnabled) {
      logger.warn('Retry attempt blocked - retries disabled', {
        jobId: context.id,
        retryCount: context.retryCount,
        state: this.name
      });
      
      // Permanecer en ERROR sin incrementar contador
      throw new Error('Retries are disabled for this job');
    }
    
    const nextRetryCount = context.retryCount + 1;
    
    logger.info('Retry attempt', {
      jobId: context.id,
      retryCount: context.retryCount,
      nextRetryCount,
      maxRetries: MAX_RETRIES
    });
    
    context.retryCount = nextRetryCount;

    const reachedLimit = nextRetryCount >= MAX_RETRIES;
    const nextState = reachedLimit
      ? FILE_STATES.REJECTED
      : FILE_STATES.PROCESSING;
    const reason = reachedLimit ? 'MAX_RETRIES_REACHED' : 'RETRY';
    
    if (reachedLimit) {
      logger.error('Max retries reached, moving to REJECTED', {
        jobId: context.id,
        retryCount: nextRetryCount,
        maxRetries: MAX_RETRIES
      });
    }

    return this.transitionTo(context, nextState, { reason });
  }
}

export default FileState;