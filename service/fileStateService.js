import { FILE_STATES, FILE_EVENTS, MAX_RETRIES } from "../helpers/constants.js";

/**
 * Crea un nuevo contexto de archivo.
 * Estado inicial → PROCESSING
 */
export function createNewFileJob({ id, metadata = {} }) {
  const now = new Date().toISOString();
  return {
    id,
    state: FILE_STATES.PROCESSING,
    retryCount: 0,
    metadata,
    lastError: null,
    history: [
      {
        from: null,
        to: FILE_STATES.PROCESSING,
        event: "INIT",
        at: now,
      },
    ],
  };
}

/**
 * Recibe:
 *  - fileJob: estado actual del archivo
 *  - event: { type, error? }
 *
 * Retorna:
 *  - el nuevo fileJob actualizado
 */
export function transitionFileState(fileJob, event) {
  const { state } = fileJob;

  if (state === FILE_STATES.PROCESSED || state === FILE_STATES.REJECTED) {
    return fileJob;
  }

  switch (state) {
    case FILE_STATES.AUTHORIZED:
      return handleFromAuthorized(fileJob, event);
    case FILE_STATES.UPLOADED:
      return handleFromUploaded(fileJob, event);
    case FILE_STATES.PROCESSING:
      return handleFromProcessing(fileJob, event);
    case FILE_STATES.ERROR:
      return handleFromError(fileJob, event);
    default:
      return fileJob;
  }
}

/**
 * AUTHORIZED → ...
 */
function handleFromAuthorized(fileJob, event) {
  switch (event.type) {
    case FILE_EVENTS.FILE_UPLOADED:
      return moveToState(fileJob, FILE_STATES.UPLOADED, event);
    case FILE_EVENTS.BUSINESS_ERROR:
      return moveToState(
        { ...fileJob, lastError: event.error || null },
        FILE_STATES.REJECTED,
        event
      );
    case FILE_EVENTS.TECHNICAL_ERROR:
      return moveToErrorOrReject(fileJob, event);
    default:
      return fileJob;
  }
}

/**
 * UPLOADED → ...
 */
function handleFromUploaded(fileJob, event) {
  switch (event.type) {
    case FILE_EVENTS.START_PROCESSING:
      return moveToState(fileJob, FILE_STATES.PROCESSING, event);
    case FILE_EVENTS.BUSINESS_ERROR:
      return moveToState(
        { ...fileJob, lastError: event.error || null },
        FILE_STATES.REJECTED,
        event
      );
    case FILE_EVENTS.TECHNICAL_ERROR:
      return moveToErrorOrReject(fileJob, event);
    default:
      return fileJob;
  }
}

/**
 * PROCESSING → ...
 */
function handleFromProcessing(fileJob, event) {
  switch (event.type) {
    case FILE_EVENTS.PROCESSING_SUCCESS:
      return moveToState(fileJob, FILE_STATES.PROCESSED, event);
    case FILE_EVENTS.BUSINESS_ERROR:
      return moveToState(
        { ...fileJob, lastError: event.error || null },
        FILE_STATES.REJECTED,
        event
      );
    case FILE_EVENTS.TECHNICAL_ERROR:
      return moveToErrorOrReject(fileJob, event);
    default:
      return fileJob;
  }
}

/**
 * ERROR → RETRY o se queda igual
 */
function handleFromError(fileJob, event) {
  switch (event.type) {
    case FILE_EVENTS.RETRY: {
      const nextRetryCount = fileJob.retryCount + 1;

      if (nextRetryCount > MAX_RETRIES) {
        // Supera el máximo → REJECTED
        return moveToState(
          {
            ...fileJob,
            retryCount: nextRetryCount,
            lastError: {
              code: "MAX_RETRIES_REACHED",
            },
          },
          FILE_STATES.REJECTED,
          event
        );
      }

      // Retry válido → vuelve a PROCESSING
      return moveToState(
        { ...fileJob, retryCount: nextRetryCount },
        FILE_STATES.PROCESSING,
        event
      );
    }

    default:
      return fileJob;
  }
}

/**
 * Maneja errores técnicos recuperables.
 */
function moveToErrorOrReject(fileJob, event) {
  const nextRetryCount = fileJob.retryCount + 1;

  const errorPayload = event.error || {
    code: "TECH_ERROR",
    message: "Technical error",
  };

  if (nextRetryCount > MAX_RETRIES) {
    return moveToState(
      {
        ...fileJob,
        retryCount: nextRetryCount,
        lastError: {
          ...errorPayload,
          code: "MAX_RETRIES_REACHED",
        },
      },
      FILE_STATES.REJECTED,
      event
    );
  }

  return moveToState(
    {
      ...fileJob,
      retryCount: nextRetryCount,
      lastError: errorPayload,
    },
    FILE_STATES.ERROR,
    event
  );
}

/**
 * Transición normal: actualiza estado e histórico.
 */
function moveToState(fileJob, nextState, event) {
  const now = new Date().toISOString();

  return {
    ...fileJob,
    state: nextState,
    history: [
      ...fileJob.history,
      {
        from: fileJob.state,
        to: nextState,
        event: event.type,
        at: now,
        error: event.error || null,
      },
    ],
  };
}
