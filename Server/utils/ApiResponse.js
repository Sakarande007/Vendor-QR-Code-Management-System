/**
 * Standardized API response envelope for consistent client handling.
 */
export class ApiResponse {
  /**
   * @param {import('express').Response} res
   * @param {unknown} [data]
   * @param {string|null} [message]
   * @param {number} [statusCode]
   */
  static success(res, data = null, message = null, statusCode = 200) {
    return res.status(statusCode).json({
      success: true,
      data,
      message,
      requestId: res.locals.requestId ?? null,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * @param {import('express').Response} res
   * @param {string} message
   * @param {number} [statusCode]
   * @param {unknown} [errors]
   */
  static error(res, message, statusCode = 400, errors = null) {
    return res.status(statusCode).json({
      success: false,
      data: null,
      message,
      errors,
      requestId: res.locals.requestId ?? null,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * @param {import('express').Response} res
   * @param {unknown} data
   * @param {{ pageSize: number, hasMore: boolean, nextCursor: string|null }} pagination
   * @param {string|null} [message]
   */
  static paginated(res, data, pagination, message = null) {
    return res.status(200).json({
      success: true,
      data,
      pagination,
      message,
      requestId: res.locals.requestId ?? null,
      timestamp: new Date().toISOString(),
    });
  }
}
