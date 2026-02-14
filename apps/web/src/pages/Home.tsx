import { Link } from 'react-router-dom';
import { Button, usePlatform } from '@chadder/ui';

export function Home() {
  const platform = usePlatform();

  return (
    <main className="container">
      <h1>Welcome to Chadder</h1>
      <p>Running on: <strong>{platform}</strong></p>
      <div className="actions">
        <Button variant="primary">Get Started</Button>
        <Link to="/about">
          <Button variant="secondary">Learn More</Button>
        </Link>
      </div>
    </main>
  );
}
