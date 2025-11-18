import FileStateService from './service/fileStateService.js';

const stateService = new FileStateService();

// Flujo exitoso
stateService.initializeFile('file-001', { filename: 'doc.pdf' });
stateService.markAsUploaded('file-001');
stateService.startProcessing('file-001');
stateService.markAsProcessed('file-001');

// Con reintentos
stateService.handleError('file-002', 'Timeout', true);
stateService.retryFile('file-002');
