import FileStateService from '../service/fileStateService.js';
import FileJob from '../service/fileJob.js';
import Logger from '../helpers/logger.js';
import { FILE_STATES } from '../helpers/constants.js';

const logger = new Logger();

/**
 * Demo: State Machine Pattern for File Lifecycle Management
 * 
 * This demo shows all possible scenarios:
 * 1. Happy path: AUTHORIZED → UPLOADED → PROCESSING → PROCESSED
 * 2. Recoverable error with retry
 * 3. Max retries exceeded → REJECTED
 * 4. Non-recoverable error → REJECTED
 * 5. Business rule rejection
 */

async function runDemos() {
  const service = new FileStateService();
  const fileJob = new FileJob(service);

  logger.info('='.repeat(60));
  logger.info('DEMO 1: Happy Path - Successful Processing');
  logger.info('='.repeat(60));
  
  try {
    const result1 = await fileJob.processFile('file-success-001', {
      filename: 'document.pdf',
      size: 2048,
      owner: 'user@example.com',
      uploadDate: new Date().toISOString()
    });
    
    logger.info(`Result: ${JSON.stringify(result1, null, 2)}`);
  } catch (error) {
    logger.error(`Demo 1 failed: ${error.message}`);
  }

  logger.info('\n' + '='.repeat(60));
  logger.info('DEMO 2: Recoverable Error with Retry (1 failure)');
  logger.info('='.repeat(60));
  
  try {
    const result2 = await fileJob.processFileWithRetry('file-retry-001', {
      filename: 'data.csv',
      size: 1024,
      owner: 'admin@example.com'
    }, 1); // Fail 1 time, succeed on retry
    
    logger.info(`Result: ${JSON.stringify(result2, null, 2)}`);
    
    const history = service.getFileHistory('file-retry-001');
    logger.info(`State History: ${JSON.stringify(history, null, 2)}`);
  } catch (error) {
    logger.error(`Demo 2 failed: ${error.message}`);
  }

  logger.info('\n' + '='.repeat(60));
  logger.info('DEMO 3: Max Retries Exceeded (3 failures)');
  logger.info('='.repeat(60));
  
  try {
    const result3 = await fileJob.processFileWithRetry('file-max-retry-001', {
      filename: 'large-file.zip',
      size: 10240,
      owner: 'user@example.com'
    }, 3); // Fail 3 times, should be REJECTED
    
    logger.info(`Result: ${JSON.stringify(result3, null, 2)}`);
    
    const info = service.getFileInfo('file-max-retry-001');
    logger.info(`Final State: ${info.currentState}`);
    logger.info(`Rejection Reason: ${info.rejectionReason}`);
  } catch (error) {
    // File might be archived already
    logger.info(`File was archived (expected): ${error.message}`);
  }

  logger.info('\n' + '='.repeat(60));
  logger.info('DEMO 4: Non-Recoverable Error');
  logger.info('='.repeat(60));
  
  try {
    const result4 = await fileJob.processFileWithFatalError('file-fatal-001', {
      filename: 'corrupted.bin',
      size: 512,
      checksum: 'invalid'
    });
    
    logger.info(`Result: ${JSON.stringify(result4, null, 2)}`);
  } catch (error) {
    logger.info(`File was archived (expected): ${error.message}`);
  }

  logger.info('\n' + '='.repeat(60));
  logger.info('DEMO 5: Business Rule Rejection');
  logger.info('='.repeat(60));
  
  try {
    const result5 = await fileJob.processFileWithRejection('file-duplicate-001', {
      filename: 'duplicate.pdf',
      size: 2048,
      uploadDate: '2025-01-01'
    }, 'Duplicate file detected - already processed');
    
    logger.info(`Result: ${JSON.stringify(result5, null, 2)}`);
  } catch (error) {
    logger.info(`File was archived (expected): ${error.message}`);
  }

  logger.info('\n' + '='.repeat(60));
  logger.info('DEMO 6: Manual State Management');
  logger.info('='.repeat(60));
  
  try {
    // Initialize file
    service.initializeFile('file-manual-001', {
      filename: 'manual.txt',
      size: 128
    });
    logger.info(`State: ${service.getFileState('file-manual-001')}`);
    
    // Mark as uploaded
    service.markAsUploaded('file-manual-001');
    logger.info(`State after upload: ${service.getFileState('file-manual-001')}`);
    
    // Start processing
    service.startProcessing('file-manual-001');
    logger.info(`State after start processing: ${service.getFileState('file-manual-001')}`);
    
    // Simulate error
    service.handleError('file-manual-001', 'Network timeout', true);
    logger.info(`State after error: ${service.getFileState('file-manual-001')}`);
    
    // Retry
    service.retryFile('file-manual-001');
    logger.info(`State after retry: ${service.getFileState('file-manual-001')}`);
    
    // Complete processing
    service.markAsProcessed('file-manual-001');
    logger.info(`Final state: ${service.getFileState('file-manual-001')}`);
    
    // Get complete info
    setTimeout(() => {
      try {
        const info = service.getFileInfo('file-manual-001');
        logger.info(`Complete Info: ${JSON.stringify(info, null, 2)}`);
      } catch (error) {
        logger.info(`File archived: ${error.message}`);
      }
    }, 100);
    
  } catch (error) {
    logger.error(`Demo 6 failed: ${error.message}`);
  }

  logger.info('\n' + '='.repeat(60));
  logger.info('DEMO 7: Invalid Transitions');
  logger.info('='.repeat(60));
  
  try {
    service.initializeFile('file-invalid-001', {});
    
    // Try invalid transition: AUTHORIZED -> PROCESSING (should fail)
    try {
      service.startProcessing('file-invalid-001');
      logger.error('Should have thrown error for invalid transition');
    } catch (error) {
      logger.info(`✓ Expected error: ${error.message}`);
    }
    
    // Try to retry from non-ERROR state (should fail)
    try {
      service.retryFile('file-invalid-001');
      logger.error('Should have thrown error for retry from AUTHORIZED');
    } catch (error) {
      logger.info(`✓ Expected error: ${error.message}`);
    }
    
  } catch (error) {
    logger.error(`Demo 7 failed: ${error.message}`);
  }

  logger.info('\n' + '='.repeat(60));
  logger.info('DEMO 8: Multiple Files Tracking');
  logger.info('='.repeat(60));
  
  try {
    // Initialize multiple files
    service.initializeFile('file-batch-001', { filename: 'batch1.pdf' });
    service.initializeFile('file-batch-002', { filename: 'batch2.pdf' });
    service.initializeFile('file-batch-003', { filename: 'batch3.pdf' });
    
    // Progress them to different states
    service.markAsUploaded('file-batch-001');
    
    service.markAsUploaded('file-batch-002');
    service.startProcessing('file-batch-002');
    
    service.markAsUploaded('file-batch-003');
    service.startProcessing('file-batch-003');
    service.markAsProcessed('file-batch-003');
    
    // Get all active files
    const activeFiles = service.getAllActiveFiles();
    logger.info(`Active files count: ${activeFiles.length}`);
    activeFiles.forEach(file => {
      logger.info(`  - ${file.fileId}: ${file.currentState}`);
    });
    
  } catch (error) {
    logger.error(`Demo 8 failed: ${error.message}`);
  }

  logger.info('\n' + '='.repeat(60));
  logger.info('DEMOS COMPLETED');
  logger.info('='.repeat(60));
}

// Run all demos
runDemos().catch(error => {
  logger.error(`Fatal error in demos: ${error.message}`);
  console.error(error);
});
