export class ReservationError extends Error {
  constructor(message, statusCode = 500, code = "INTERNAL_ERROR") {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
  }
}

export class ValidationError extends ReservationError {
  constructor(message) {
    super(message, 400, "INVALID_PAYLOAD");
  }
}

export class AvailabilityError extends ReservationError {
  constructor(message) {
    super(message, 409, "NOT_AVAILABLE");
  }
}
