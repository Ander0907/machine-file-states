import FileContext from './states/fileState.js';
import { FILE_STATES } from '../helpers/constants.js';
import Logger from '../helpers/logger.js';

const logger = new Logger();

/**
 * Service to manage file state lifecycle
 * Provides high-level operations for file processing
 */
class FileStateService {
  constructor() {
    this.activeFiles = new Map();
  }

  /**
   * Initializes a new file with AUTHORIZED state
   */
  initializeFile(fileId, metadata = {}) {
    if (this.activeFiles.has(fileId)) {
      throw new Error(`File ${fileId} is already being tracked`);
    }

    const context = new FileContext(fileId, metadata);
    this.activeFiles.set(fileId, context);
    logger.info(`File ${fileId} initialized in ${FILE_STATES.AUTHORIZED} state`);

    return context.getContextInfo();
  }

  /**
   * Marks file as uploaded after S3 upload validation
   */
  markAsUploaded(fileId) {
    const context = this.getFileContext(fileId);
    context.transitionTo(FILE_STATES.UPLOADED);
    return context.getContextInfo();
  }

  /**
   * Starts processing the file
   */
  startProcessing(fileId) {
    const context = this.getFileContext(fileId);
    context.transitionTo(FILE_STATES.PROCESSING);
    return context.getContextInfo();
  }

  /**
   * Marks file as successfully processed
   */
  markAsProcessed(fileId) {
    const context = this.getFileContext(fileId);
    context.transitionTo(FILE_STATES.PROCESSED);

    // Remove from active files as it's in final state
    setTimeout(() => this.archiveFile(fileId), 0);

    return context.getContextInfo();
  }

  /**
   * Rejects a file with a specific reason
   */
  rejectFile(fileId, reason) {
    const context = this.getFileContext(fileId);
    context.rejectionReason = reason;
    context.transitionTo(FILE_STATES.REJECTED);

    // Remove from active files as it's in final state
    setTimeout(() => this.archiveFile(fileId), 0);

    return context.getContextInfo();
  }

  /**
   * Handles an error during processing
   */
  handleError(fileId, errorMessage, isRecoverable = true) {
    const context = this.getFileContext(fileId);
    context.handleError(errorMessage, isRecoverable);
    return context.getContextInfo();
  }

  /**
   * Retries processing a file in ERROR state
   */
  retryFile(fileId) {
    const context = this.getFileContext(fileId);
    const success = context.retry();

    if (!success) {
      // File was moved to REJECTED due to max retries
      setTimeout(() => this.archiveFile(fileId), 0);
    }

    return context.getContextInfo();
  }

  /**
   * Gets the current state of a file
   */
  getFileState(fileId) {
    const context = this.getFileContext(fileId);
    return context.getCurrentState();
  }

  /**
   * Gets complete information about a file
   */
  getFileInfo(fileId) {
    const context = this.getFileContext(fileId);
    return context.getContextInfo();
  }

  /**
   * Gets the state history of a file
   */
  getFileHistory(fileId) {
    const context = this.getFileContext(fileId);
    return context.getStateHistory();
  }

  /**
   * Gets metrics for a file
   */
  getFileMetrics(fileId) {
    const context = this.getFileContext(fileId);
    return context.getMetrics();
  }

  /**
   * Gets all active files
   */
  getAllActiveFiles() {
    const files = [];
    this.activeFiles.forEach((context, fileId) => {
      files.push(context.getContextInfo());
    });
    return files;
  }

  /**
   * Archives a file (removes from active tracking)
   */
  archiveFile(fileId) {
    if (this.activeFiles.has(fileId)) {
      const context = this.activeFiles.get(fileId);
      const finalState = context.getCurrentState();

      if (![FILE_STATES.PROCESSED, FILE_STATES.REJECTED].includes(finalState)) {
        logger.warn(`Archiving file ${fileId} in non-final state: ${finalState}`);
      }

      this.activeFiles.delete(fileId);
      logger.info(`File ${fileId} archived from state ${finalState}`);
    }
  }

  /**
   * Helper to get file context or throw error
   */
  getFileContext(fileId) {
    if (!this.activeFiles.has(fileId)) {
      throw new Error(`File ${fileId} not found in active files`);
    }
    return this.activeFiles.get(fileId);
  }
}

export default FileStateService;
