/**
 * Mock backend entry point. Importing the handler modules registers their
 * routes. Delete this folder once VITE_API_MODE=http points at the real API.
 */
import './handlers/auth';
import './handlers/reports';
import './handlers/sms';
import './handlers/admin';
import './handlers/insights';

export { mockRequest } from './router';
