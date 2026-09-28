import { Component, type ErrorInfo, type ReactNode } from 'react';
import './error-boundary.css';

export interface AppErrorBoundaryProps {
  children: ReactNode;
  locale?: 'ru' | 'en';
  onError?: (error: Error, info: ErrorInfo) => void;
}

interface State { error: Error | null; }

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, State> {
  state: State = {error:null};

  static getDerivedStateFromError(error: Error): State {
    return {error};
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    try{ this.props.onError?.(error, info); }catch(_){}
  }

  private reload = (): void => {
    location.reload();
  };

  render(){
    if(!this.state.error) return this.props.children;
    const en = this.props.locale === 'en';
    return (
      <main className="ab-fatal" role="alert">
        <section className="ab-fatal-card">
          <div className="ab-fatal-kicker">{en ? 'Application error' : 'Ошибка приложения'}</div>
          <h1>{en ? 'Something went wrong' : 'Что-то пошло не так'}</h1>
          <p>{en ? 'The error was recorded. Reload the app and try again.' : 'Ошибка записана. Перезагрузи приложение и попробуй ещё раз.'}</p>
          <button type="button" onClick={this.reload}>{en ? 'Reload' : 'Перезагрузить'}</button>
        </section>
      </main>
    );
  }
}
