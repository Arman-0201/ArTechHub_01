import { Router } from 'express';
import { authRouter } from '../modules/auth/auth.routes.js';
import { publicRouter } from './public.routes.js';
import { accountRouter } from './account.routes.js';
import { adminRouter } from './admin.routes.js';

/**
 * API surface, versioned at the root so a future v2 can coexist.
 *
 * The four groups map exactly onto four trust levels:
 *   /auth    — anonymous, heavily rate limited, issues sessions
 *   /        — public reads, optionally personalised
 *   /account — a signed-in learner acting on their own data
 *   /admin   — staff, gated by explicit permissions
 */
export const apiRouter: Router = Router();

apiRouter.use('/auth', authRouter);
apiRouter.use('/admin', adminRouter);
apiRouter.use('/account', accountRouter);
apiRouter.use('/', publicRouter);
