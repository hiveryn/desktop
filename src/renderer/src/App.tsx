import { useEffect, useState } from 'react';
import TrayPalette from './components/TrayPalette/TrayPalette';
import ArchitectWindow from './pages/architect-window';
import Launcher from './pages/launcher';

function readRoute(): string {
  return window.location.hash || '#/launcher';
}

export default function App() {
  const [route, setRoute] = useState(readRoute);

  useEffect(() => {
    const handleHashChange = () => setRoute(readRoute());
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  if (route.startsWith('#/tray')) {
    return <TrayPalette />;
  }

  if (route.startsWith('#/architect/')) {
    return <ArchitectWindow />;
  }

  return <Launcher />;
}
