import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from '@tanstack/react-router';
import { router } from '@/app/router';
import { isDesktop } from '@/app/services';
import { DesktopFrame } from '@/components/layout/desktop-frame';
import '@/styles/app.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isDesktop ? (
      <DesktopFrame>
        <RouterProvider router={router} />
      </DesktopFrame>
    ) : (
      <RouterProvider router={router} />
    )}
  </StrictMode>,
);
