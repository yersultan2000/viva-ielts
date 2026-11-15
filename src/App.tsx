import { Component, useEffect } from 'react';
import type { ReactNode } from 'react';
import { Shell } from './components/Shell';
import { Button, Empty } from './components/ui';
import { useRoute } from './lib/router';
import { applyTheme, useStore } from './lib/store';
import { Dashboard } from './pages/Dashboard';
import { Exam } from './pages/Exam';
import { Landing } from './pages/Landing';
import { Notebook } from './pages/Notebook';
import { Practice } from './pages/Practice';
import { Results } from './pages/Results';
import { SettingsPage } from './pages/Settings';

class Boundary extends Component<{ children: ReactNode; resetKey: string }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidUpdate(prev: { resetKey: string }) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }
  render() {
    if (this.state.error)
      return (
        <div className="page">
          <Empty title="This page hit an error" action={<Button variant="primary" onClick={() => window.location.reload()}>Reload</Button>}>
            {this.state.error.message} Your saved tests and notebook are not affected.
          </Empty>
        </div>
      );
    return this.props.children;
  }
}

export function App() {
  const route = useRoute();
  const { settings } = useStore();

  useEffect(() => {
    applyTheme(settings.theme);
    if (settings.theme !== 'system') return;
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const on = () => applyTheme('system');
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [settings.theme]);

  const [head, second] = route.segments;
  if (!head) return <Boundary resetKey={route.path}><Landing /></Boundary>;
  if (head === 'exam') return <Boundary resetKey={route.path}><Exam route={route} /></Boundary>;

  let page: ReactNode;
  if (head === 'dashboard') page = <Dashboard />;
  else if (head === 'results' && second) page = <Results id={second} />;
  else if (head === 'practice') page = <Practice route={route} />;
  else if (head === 'notebook') page = <Notebook route={route} />;
  else if (head === 'settings') page = <SettingsPage />;
  else
    page = (
      <div className="page">
        <Empty title="Page not found" action={<Button variant="primary" href="/dashboard">Go to dashboard</Button>}>
          There is nothing at this address.
        </Empty>
      </div>
    );

  return (
    <Shell path={route.path}>
      <Boundary resetKey={route.path}>{page}</Boundary>
    </Shell>
  );
}
