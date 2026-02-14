import { Link } from 'react-router-dom';
import { Button } from '@chadder/ui';

export function About() {
  return (
    <main className="container">
      <h1>About</h1>
      <p>
        This is a cross-platform application built with React, running on web,
        desktop (Electron), and mobile (Capacitor).
      </p>
      <Link to="/">
        <Button variant="ghost">Back to Home</Button>
      </Link>
    </main>
  );
}
