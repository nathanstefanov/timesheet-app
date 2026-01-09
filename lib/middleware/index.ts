// lib/middleware/index.ts
export { withAuth, requireAdmin, requireEmployee } from './withAuth';
export type { AuthenticatedRequest, AuthOptions } from './withAuth';

export {
  withServerAuth,
  requireServerAdmin,
  requireServerEmployee,
} from './withServerAuth';
export type { AuthenticatedUser, ServerAuthContext, ServerAuthOptions } from './withServerAuth';

export {
  handleApiError,
  createApiError,
  throwValidationError,
  throwNotFoundError,
  throwConflictError,
  ErrorCodes,
} from './errorHandler';
export type { ApiError } from './errorHandler';
