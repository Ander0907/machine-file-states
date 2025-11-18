import {
  createNewFileJob,
  transitionFileState,
} from "./service/fileStateService.js";
import { FILE_EVENTS } from "./helpers/constants.js";
import Logger from "./helpers/logger.js";

const logger = new Logger();

logger.info("Starting file state machine simulation...");

let job = createNewFileJob({
  id: "1",
  metadata: { filename: "NEGOCIACION.txt" },
});

logger.info(
  `Created new file job with ID: ${job.id} and initial state: ${job.state}`
);

// Simula fallo técnico
job = transitionFileState(job, {
  type: FILE_EVENTS.START_PROCESSING,
});

job = transitionFileState(job, {
  type: FILE_EVENTS.FILE_UPLOADED,
});

job = transitionFileState(job, {
  type: FILE_EVENTS.PROCESSING_SUCCESS,
});

logger.info(`FINAL: ${job.state}`); // PROCESSED

console.log("File Job History:", job.history);