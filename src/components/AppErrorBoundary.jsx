import { Component } from "react";

export default class AppErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("Application rendering failed:", error, errorInfo);
  }

  retry = () => {
    this.setState({ error: null });
  };

  render() {
    if (this.state.error) {
      return (
        <main className="min-h-screen bg-slate-900 px-4 text-slate-100 flex items-center justify-center">
          <section className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-800 p-6 text-center shadow-2xl">
            <h1 className="text-xl font-bold">La page n&apos;a pas pu se charger</h1>
            <p className="mt-3 text-sm text-slate-300">
              Réessayez de charger l&apos;application. Si le problème persiste, vérifiez votre connexion.
            </p>
            <button
              type="button"
              onClick={this.retry}
              className="mt-6 rounded-xl bg-emerald-500 px-4 py-2.5 font-semibold text-slate-950 transition-colors hover:bg-emerald-400"
            >
              Réessayer
            </button>
          </section>
        </main>
      );
    }

    return this.props.children;
  }
}
