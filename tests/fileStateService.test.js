import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import FileContext from '../service/states/fileState.js';
import FileStateService from '../service/fileStateService.js';
import { FILE_STATES, MAX_RETRIES } from '../helpers/constants.js';

describe('FileState - State Machine Pattern', () => {
  let fileContext;
  let fileService;

  beforeEach(() => {
    fileContext = new FileContext('test-file-123', { owner: 'test-user' });
    fileService = new FileStateService();
  });

  describe('State Initialization', () => {
    it('should initialize in AUTHORIZED state', () => {
      assert.strictEqual(fileContext.getCurrentState(), FILE_STATES.AUTHORIZED);
    });

    it('should store file metadata', () => {
      assert.deepStrictEqual(fileContext.metadata, { owner: 'test-user' });
    });

    it('should initialize retry count to 0', () => {
      assert.strictEqual(fileContext.retryCount, 0);
    });
  });

  describe('State Transitions - Happy Path', () => {
    it('should transition from AUTHORIZED to UPLOADED', () => {
      fileContext.transitionTo(FILE_STATES.UPLOADED);
      assert.strictEqual(fileContext.getCurrentState(), FILE_STATES.UPLOADED);
    });

    it('should transition from UPLOADED to PROCESSING', () => {
      fileContext.transitionTo(FILE_STATES.UPLOADED);
      fileContext.transitionTo(FILE_STATES.PROCESSING);
      assert.strictEqual(fileContext.getCurrentState(), FILE_STATES.PROCESSING);
    });

    it('should transition from PROCESSING to PROCESSED', () => {
      fileContext.transitionTo(FILE_STATES.UPLOADED);
      fileContext.transitionTo(FILE_STATES.PROCESSING);
      fileContext.transitionTo(FILE_STATES.PROCESSED);
      assert.strictEqual(fileContext.getCurrentState(), FILE_STATES.PROCESSED);
    });

    it('should complete full lifecycle: AUTHORIZED → UPLOADED → PROCESSING → PROCESSED', () => {
      fileContext.transitionTo(FILE_STATES.UPLOADED);
      fileContext.transitionTo(FILE_STATES.PROCESSING);
      fileContext.transitionTo(FILE_STATES.PROCESSED);

      const history = fileContext.getStateHistory();
      assert.strictEqual(history.length, 4); // Initial + 3 transitions
      assert.strictEqual(history[history.length - 1].newState, FILE_STATES.PROCESSED);
    });
  });

  describe('State Transitions - Error Path', () => {
    it('should transition from AUTHORIZED to ERROR', () => {
      fileContext.handleError('Authorization validation failed', true);
      assert.strictEqual(fileContext.getCurrentState(), FILE_STATES.ERROR);
    });

    it('should transition from UPLOADED to ERROR', () => {
      fileContext.transitionTo(FILE_STATES.UPLOADED);
      fileContext.handleError('S3 upload verification failed', true);
      assert.strictEqual(fileContext.getCurrentState(), FILE_STATES.ERROR);
    });

    it('should transition from PROCESSING to ERROR', () => {
      fileContext.transitionTo(FILE_STATES.UPLOADED);
      fileContext.transitionTo(FILE_STATES.PROCESSING);
      fileContext.handleError('Processing timeout', true);
      assert.strictEqual(fileContext.getCurrentState(), FILE_STATES.ERROR);
    });
  });

  describe('State Transitions - Rejection Path', () => {
    it('should transition from AUTHORIZED to REJECTED', () => {
      fileContext.rejectionReason = 'Invalid permissions';
      fileContext.transitionTo(FILE_STATES.REJECTED);
      assert.strictEqual(fileContext.getCurrentState(), FILE_STATES.REJECTED);
    });

    it('should reject directly on non-recoverable error', () => {
      fileContext.handleError('File corrupted - integrity check failed', false);
      assert.strictEqual(fileContext.getCurrentState(), FILE_STATES.REJECTED);
      assert.ok(fileContext.rejectionReason.includes('Non-recoverable error'));
    });

    it('should not allow transitions from REJECTED state', () => {
      fileContext.rejectionReason = 'Duplicate file';
      fileContext.transitionTo(FILE_STATES.REJECTED);

      assert.throws(() => fileContext.transitionTo(FILE_STATES.PROCESSING), /Cannot transition from final state/);
    });
  });

  describe('Retry Logic', () => {
    it('should allow retry from ERROR state', () => {
      fileContext.transitionTo(FILE_STATES.UPLOADED);
      fileContext.transitionTo(FILE_STATES.PROCESSING);
      fileContext.handleError('Timeout', true);

      const success = fileContext.retry();
      assert.strictEqual(success, true);
      assert.strictEqual(fileContext.getCurrentState(), FILE_STATES.PROCESSING);
      assert.strictEqual(fileContext.retryCount, 1);
    });

    it('should increment retry count on each retry', () => {
      fileContext.transitionTo(FILE_STATES.UPLOADED);
      fileContext.transitionTo(FILE_STATES.PROCESSING);

      // First error and retry
      fileContext.handleError('Error 1', true);
      fileContext.retry();
      assert.strictEqual(fileContext.retryCount, 1);

      // Second error and retry
      fileContext.handleError('Error 2', true);
      fileContext.retry();
      assert.strictEqual(fileContext.retryCount, 2);
    });

    it('should reject file after MAX_RETRIES attempts', () => {
      fileContext.transitionTo(FILE_STATES.UPLOADED);
      fileContext.transitionTo(FILE_STATES.PROCESSING);

      // Go through max retries: 3 successful retries, then 4th retry attempt should reject
      for (let i = 0; i < MAX_RETRIES; i++) {
        fileContext.handleError(`Error attempt ${i + 1}`, true);
        fileContext.retry(); // Retries 1, 2, 3 will work
      }

      // Now cause one more error and try to retry - this should reject
      fileContext.handleError('Final error', true);
      const result = fileContext.retry(); // 4th retry attempt - should reject

      assert.strictEqual(result, false);
      assert.strictEqual(fileContext.getCurrentState(), FILE_STATES.REJECTED);
      assert.ok(fileContext.rejectionReason.includes('Max retries'));
    });

    it('should not allow retry from PROCESSED state', () => {
      fileContext.transitionTo(FILE_STATES.UPLOADED);
      fileContext.transitionTo(FILE_STATES.PROCESSING);
      fileContext.transitionTo(FILE_STATES.PROCESSED);

      assert.throws(() => fileContext.retry(), /Cannot retry from state: PROCESSED/);
    });

    it('should not allow retry from REJECTED state', () => {
      fileContext.rejectionReason = 'Duplicate';
      fileContext.transitionTo(FILE_STATES.REJECTED);

      assert.throws(() => fileContext.retry(), /Cannot retry from state: REJECTED/);
    });
  });

  describe('Invalid Transitions', () => {
    it('should not allow direct transition from AUTHORIZED to PROCESSING', () => {
      assert.throws(() => fileContext.transitionTo(FILE_STATES.PROCESSING), /Invalid transition/);
    });

    it('should not allow direct transition from AUTHORIZED to PROCESSED', () => {
      assert.throws(() => fileContext.transitionTo(FILE_STATES.PROCESSED), /Invalid transition/);
    });

    it('should not allow transition from PROCESSED to any state', () => {
      fileContext.transitionTo(FILE_STATES.UPLOADED);
      fileContext.transitionTo(FILE_STATES.PROCESSING);
      fileContext.transitionTo(FILE_STATES.PROCESSED);

      assert.throws(() => fileContext.transitionTo(FILE_STATES.PROCESSING), /Cannot transition from final state/);
    });
  });

  describe('State History and Metrics', () => {
    it('should record all state changes in history', () => {
      fileContext.transitionTo(FILE_STATES.UPLOADED);
      fileContext.transitionTo(FILE_STATES.PROCESSING);
      fileContext.transitionTo(FILE_STATES.PROCESSED);

      const history = fileContext.getStateHistory();
      assert.strictEqual(history.length, 4);
      assert.strictEqual(history[0].newState, FILE_STATES.AUTHORIZED);
      assert.strictEqual(history[1].newState, FILE_STATES.UPLOADED);
      assert.strictEqual(history[2].newState, FILE_STATES.PROCESSING);
      assert.strictEqual(history[3].newState, FILE_STATES.PROCESSED);
    });

    it('should track metrics for each state', () => {
      fileContext.transitionTo(FILE_STATES.UPLOADED);
      fileContext.transitionTo(FILE_STATES.PROCESSING);
      fileContext.transitionTo(FILE_STATES.PROCESSED);

      const metrics = fileContext.getMetrics();
      // Note: AUTHORIZED is not counted as it was the initial state
      assert.strictEqual(metrics.uploaded, 1);
      assert.strictEqual(metrics.processing, 1);
      assert.strictEqual(metrics.processed, 1);
      assert.strictEqual(metrics.error, 0);
      assert.strictEqual(metrics.rejected, 0);
    });

    it('should include retry count in state history', () => {
      fileContext.transitionTo(FILE_STATES.UPLOADED);
      fileContext.transitionTo(FILE_STATES.PROCESSING);
      fileContext.handleError('Error', true);
      fileContext.retry();

      const history = fileContext.getStateHistory();
      const lastEntry = history[history.length - 1];
      assert.strictEqual(lastEntry.retryCount, 1);
    });
  });

  describe('FileStateService Integration', () => {
    it('should initialize a new file', () => {
      const info = fileService.initializeFile('file-1', { owner: 'user-1' });
      assert.strictEqual(info.currentState, FILE_STATES.AUTHORIZED);
      assert.strictEqual(info.fileId, 'file-1');
    });

    it('should process file through complete lifecycle', () => {
      fileService.initializeFile('file-2');
      fileService.markAsUploaded('file-2');
      fileService.startProcessing('file-2');
      const info = fileService.markAsProcessed('file-2');

      assert.strictEqual(info.currentState, FILE_STATES.PROCESSED);
    });

    it('should handle error and retry', () => {
      fileService.initializeFile('file-3');
      fileService.markAsUploaded('file-3');
      fileService.startProcessing('file-3');

      let info = fileService.handleError('file-3', 'Timeout', true);
      assert.strictEqual(info.currentState, FILE_STATES.ERROR);

      info = fileService.retryFile('file-3');
      assert.strictEqual(info.currentState, FILE_STATES.PROCESSING);
      assert.strictEqual(info.retryCount, 1);
    });

    it('should reject file after max retries', () => {
      fileService.initializeFile('file-4');
      fileService.markAsUploaded('file-4');
      fileService.startProcessing('file-4');

      // Do 3 successful retries
      for (let i = 0; i < MAX_RETRIES; i++) {
        fileService.handleError('file-4', `Error ${i}`, true);
        fileService.retryFile('file-4');
      }

      // One more error and retry attempt - this should cause rejection
      fileService.handleError('file-4', 'Final error', true);
      fileService.retryFile('file-4');

      const info = fileService.getFileInfo('file-4');
      assert.strictEqual(info.currentState, FILE_STATES.REJECTED);
    });

    it('should track multiple files independently', () => {
      fileService.initializeFile('file-5');
      fileService.initializeFile('file-6');

      fileService.markAsUploaded('file-5');
      fileService.markAsUploaded('file-6');
      fileService.startProcessing('file-5');

      const info5 = fileService.getFileInfo('file-5');
      const info6 = fileService.getFileInfo('file-6');

      assert.strictEqual(info5.currentState, FILE_STATES.PROCESSING);
      assert.strictEqual(info6.currentState, FILE_STATES.UPLOADED);
    });

    it('should get all active files', () => {
      fileService.initializeFile('file-7');
      fileService.initializeFile('file-8');

      const activeFiles = fileService.getAllActiveFiles();
      assert.strictEqual(activeFiles.length, 2);
    });
  });

  describe('Context Information', () => {
    it('should return complete context information', () => {
      fileContext.transitionTo(FILE_STATES.UPLOADED);
      const info = fileContext.getContextInfo();

      assert.strictEqual(info.fileId, 'test-file-123');
      assert.strictEqual(info.currentState, FILE_STATES.UPLOADED);
      assert.strictEqual(info.retryCount, 0);
      assert.ok(info.metadata);
      assert.ok(info.stateHistory);
      assert.ok(info.metrics);
    });
  });
});
