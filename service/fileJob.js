import FileStateService from './fileStateService.js';
import Logger from '../helpers/logger.js';

const logger = new Logger();

/**
 * Simulates a file processing job
 * Demonstrates the complete lifecycle of a file through the state machine
 */
class FileJob {
  constructor(fileStateService) {
    this.fileStateService = fileStateService || new FileStateService();
  }

  /**
   * Processes a file through its complete lifecycle
   */
  async processFile(fileId, metadata = {}) {
    try {
      logger.info(`Starting file processing job for: ${fileId}`);

      // Step 1: Initialize file (AUTHORIZED state)
      this.fileStateService.initializeFile(fileId, metadata);
      await this.simulateDelay(500);

      // Step 2: Upload to S3 (UPLOADED state)
      logger.info(`Uploading file ${fileId} to S3...`);
      this.fileStateService.markAsUploaded(fileId);
      await this.simulateDelay(1000);

      // Step 3: Start processing (PROCESSING state)
      logger.info(`Starting processing for file ${fileId}...`);
      this.fileStateService.startProcessing(fileId);
      await this.simulateDelay(1500);

      // Step 4: Complete processing (PROCESSED state)
      logger.info(`Completing processing for file ${fileId}...`);
      this.fileStateService.markAsProcessed(fileId);

      logger.info(`File ${fileId} processed successfully!`);
      return { success: true, fileId };

    } catch (error) {
      logger.error(`Error in file job for ${fileId}: ${error.message}`);
      return { success: false, fileId, error: error.message };
    }
  }

  /**
   * Processes a file with simulated error and retry logic
   */
  async processFileWithRetry(fileId, metadata = {}, shouldFailAttempts = 1) {
    try {
      logger.info(`Starting file processing job with retry for: ${fileId}`);

      // Step 1: Initialize file
      this.fileStateService.initializeFile(fileId, metadata);
      await this.simulateDelay(500);

      // Step 2: Upload to S3
      logger.info(`Uploading file ${fileId} to S3...`);
      this.fileStateService.markAsUploaded(fileId);
      await this.simulateDelay(1000);

      // Step 3: Start processing
      logger.info(`Starting processing for file ${fileId}...`);
      this.fileStateService.startProcessing(fileId);
      await this.simulateDelay(1000);

      // Simulate processing with errors
      let attempt = 0;
      let processed = false;

      while (!processed && attempt < 10) {
        attempt++;
        
        if (attempt <= shouldFailAttempts) {
          // Simulate recoverable error
          logger.warn(`Processing attempt ${attempt} failed for file ${fileId}`);
          this.fileStateService.handleError(
            fileId,
            `Timeout during processing attempt ${attempt}`,
            true
          );
          await this.simulateDelay(1000);

          // Retry
          const info = this.fileStateService.retryFile(fileId);
          if (info.currentState === 'REJECTED') {
            logger.error(`File ${fileId} rejected after max retries`);
            return { success: false, fileId, reason: 'Max retries exceeded' };
          }
          await this.simulateDelay(1500);

        } else {
          // Success on this attempt
          this.fileStateService.markAsProcessed(fileId);
          processed = true;
          logger.info(`File ${fileId} processed successfully after ${attempt} attempts!`);
        }
      }

      return { success: true, fileId, attempts: attempt };

    } catch (error) {
      logger.error(`Error in file job with retry for ${fileId}: ${error.message}`);
      return { success: false, fileId, error: error.message };
    }
  }

  /**
   * Processes a file that will be rejected
   */
  async processFileWithRejection(fileId, metadata = {}, rejectionReason = 'Invalid metadata') {
    try {
      logger.info(`Starting file processing job (will reject): ${fileId}`);

      // Step 1: Initialize file
      this.fileStateService.initializeFile(fileId, metadata);
      await this.simulateDelay(500);

      // Step 2: Upload to S3
      logger.info(`Uploading file ${fileId} to S3...`);
      this.fileStateService.markAsUploaded(fileId);
      await this.simulateDelay(1000);

      // Step 3: Start processing
      logger.info(`Starting processing for file ${fileId}...`);
      this.fileStateService.startProcessing(fileId);
      await this.simulateDelay(1000);

      // Step 4: Reject file
      logger.warn(`Rejecting file ${fileId}: ${rejectionReason}`);
      this.fileStateService.rejectFile(fileId, rejectionReason);

      return { success: false, fileId, rejected: true, reason: rejectionReason };

    } catch (error) {
      logger.error(`Error in rejection job for ${fileId}: ${error.message}`);
      return { success: false, fileId, error: error.message };
    }
  }

  /**
   * Processes a file with non-recoverable error
   */
  async processFileWithFatalError(fileId, metadata = {}) {
    try {
      logger.info(`Starting file processing job (fatal error): ${fileId}`);

      // Step 1: Initialize file
      this.fileStateService.initializeFile(fileId, metadata);
      await this.simulateDelay(500);

      // Step 2: Upload to S3
      logger.info(`Uploading file ${fileId} to S3...`);
      this.fileStateService.markAsUploaded(fileId);
      await this.simulateDelay(1000);

      // Step 3: Start processing
      logger.info(`Starting processing for file ${fileId}...`);
      this.fileStateService.startProcessing(fileId);
      await this.simulateDelay(1000);

      // Step 4: Non-recoverable error
      logger.error(`Fatal error for file ${fileId}`);
      this.fileStateService.handleError(
        fileId,
        'Data integrity check failed - file corrupted',
        false // Non-recoverable
      );

      return { success: false, fileId, fatalError: true };

    } catch (error) {
      logger.error(`Error in fatal error job for ${fileId}: ${error.message}`);
      return { success: false, fileId, error: error.message };
    }
  }

  /**
   * Helper to simulate async delay
   */
  simulateDelay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export default FileJob;
