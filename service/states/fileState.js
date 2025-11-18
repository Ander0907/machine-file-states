import { FILE_STATES, MAX_RETRIES } from '../../helpers/constants.js';

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

  handleTechnicalError(context, error) {
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
    const nextRetryCount = context.retryCount + 1;
    context.retryCount = nextRetryCount;

    const reachedLimit = nextRetryCount >= MAX_RETRIES;
    const nextState = reachedLimit
      ? FILE_STATES.REJECTED
      : FILE_STATES.PROCESSING;
    const reason = reachedLimit ? 'MAX_RETRIES_REACHED' : 'RETRY';

    return this.transitionTo(context, nextState, { reason });
  }
}

export default FileState;