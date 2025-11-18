import FileState from './states/fileState.js';
import { FILE_STATES } from '../helpers/constants.js';

class FileJob {
  constructor({ id, metadata = {}, initialState = FILE_STATES.PROCESSING }) {
    this.id = id;
    this.metadata = metadata;
    this.retryCount = 0;
    this.lastError = null;
    this.history = [];
    
    this.currentState = FileState.getStateByName(initialState);
    this.addToHistory(null, initialState, 'INIT');
  }

  get state() {
    return this.currentState.name;
  }

  _setState(stateObject, meta = {}) {
    const previousStateName = this.currentState.name;
    this.currentState = stateObject;
    this.addToHistory(previousStateName, this.currentState.name, meta.reason, meta);
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
    return this.currentState.handleBusinessError(this, error);
  }

  applyTechnicalError(error) {
    this.lastError = error;
    return this.currentState.handleTechnicalError(this, error);
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