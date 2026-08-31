/**
 * Shared API error type.
 *
 * Thrown by the validation helpers in this directory and caught by the router's
 * top-level handler, which turns `status` into the HTTP response code.
 */
export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
