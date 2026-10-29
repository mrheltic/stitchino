import { RouterProvider, createHashRouter } from 'react-router';
import { Layout } from './Layout.tsx';
import { Home } from './routes/Home.tsx';
import { NotFound } from './routes/NotFound.tsx';

// Hash routing: works on any static host and offline, with no server rewrites.
const router = createHashRouter([
  {
    element: <Layout />,
    children: [
      { index: true, element: <Home /> },
      {
        path: 'new',
        lazy: async () => ({ Component: (await import('./routes/Wizard.tsx')).default }),
      },
      {
        path: 'project/:id',
        handle: { fullscreen: true },
        lazy: async () => ({ Component: (await import('./routes/Editor.tsx')).default }),
      },
      {
        path: 'project/:id/real-size',
        lazy: async () => ({ Component: (await import('./routes/RealSize.tsx')).default }),
      },
      {
        path: 'project/:id/stitch',
        handle: { fullscreen: true, immersive: true },
        lazy: async () => ({ Component: (await import('./routes/Stitch.tsx')).default }),
      },
      {
        path: 'inventory',
        lazy: async () => ({ Component: (await import('./routes/Inventory.tsx')).default }),
      },
      {
        path: 'import-pdf',
        lazy: async () => ({ Component: (await import('./routes/ImportPdf.tsx')).default }),
      },
      {
        path: 'settings',
        lazy: async () => ({ Component: (await import('./routes/Settings.tsx')).default }),
      },
      {
        path: 'guide',
        lazy: async () => ({ Component: (await import('./routes/Guide.tsx')).default }),
      },
      { path: '*', element: <NotFound /> },
    ],
  },
]);

export function App() {
  return <RouterProvider router={router} />;
}
