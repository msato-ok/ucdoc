export class AppError extends Error {
  constructor(e?: string) {
    super(e);
    this.name = new.target.name;
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

export class ValidationError extends AppError {}

export class ParseError extends AppError {}

export class InvalidArgumentError extends AppError {}

/**
 * 実装上あり得ないエラー.
 * linter の undefined 対策など
 */
export class BugError extends AppError {
  constructor(e?: string) {
    if (!e) {
      e = 'ここでエラーになるのはバグ';
    }
    super(e);
  }
}
