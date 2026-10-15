import { createHashHistory, createRouter } from '@tanstack/react-router';
import { routeTree } from '@/routeTree.gen';
import { isDesktop } from './services';

export const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
  ...(isDesktop ? { history: createHashHistory() } : {}),
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
