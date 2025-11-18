import winston from "winston";
const { createLogger, format } = winston;

const customFormat = format.printf(({ level, message }) => {
  return `${level.toUpperCase()} - ${message}`;
});

class Logger {
  constructor() {
    const transports = [
      new winston.transports.Console({
        format: format.combine(customFormat),
      }),
    ];
    this.logger = createLogger({
      transports: transports,
    });
  }

  info(message) {
    this.logger.info(message);
  }

  error(message) {
    this.logger.error(message);
  }
}

export default Logger;
