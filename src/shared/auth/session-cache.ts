import { cache } from 'react';
import { SessionService } from './session';

export const getValidatedSession = cache((token: string) => SessionService.validate(token));
