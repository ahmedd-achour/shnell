import { CanActivateFn } from '@angular/router';

export const controllerGuard: CanActivateFn = (route, state) => {
  return true;
};
