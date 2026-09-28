import { Outlet, type RouteObject } from 'react-router';
import { AuthGate, useAuth } from '@appbase/ui-react/auth.js';
import { authClient } from './auth';

function Shell(){
  const auth = useAuth();
  return (
    <main className="app">
      <header className="app-header">
        <div>
          <div className="eyebrow">AppBase</div>
          <h1>__APP_NAME__</h1>
        </div>
        <button className="link-button" type="button" onClick={() => void auth.logout()}>__LOGOUT_TEXT__</button>
      </header>
      <Outlet />
    </main>
  );
}

function Home(){
  return (
    <section className="card">
      <h2>__READY_TITLE__</h2>
      <p>__READY_TEXT__</p>
    </section>
  );
}

function AppGate(){
  return <AuthGate client={authClient} locale="__APP_LOCALE__" productName="__APP_NAME__"><Shell /></AuthGate>;
}

export const routes: RouteObject[] = [{
  path:'/',
  element:<AppGate />,
  children:[{index:true, element:<Home />}]
}];
