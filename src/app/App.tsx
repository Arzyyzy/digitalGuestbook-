import { useEffect } from 'react';
import { RouterProvider } from 'react-router';
import { router } from './routes';
import { installCanvasDebugGlobals } from './utils/canvasDebug';

export default function App() {
  useEffect(() => {
    // Install debug tools for troubleshooting (especially Fortu/Xibo signage)
    installCanvasDebugGlobals();
    console.log('[App] Initialized');
  }, []);

  return <RouterProvider router={router} />;
}
