import React, { useState } from 'react';
import './App.css';
import MapboxPolygonAnalyzer from './components/MapboxPolygonAnalyzer';

function App() {
  // Get token from environment variable
  const mapboxToken = process.env.REACT_APP_MAPBOX_TOKEN;
  const [error, setError] = useState(null);
  
  // Error boundary to catch any Mapbox initialization errors
  if (error) {
    return (
      <div className="error-container">
        <h1>Error Loading Map</h1>
        <p>{error.message}</p>
        <button onClick={() => window.location.reload()}>Reload Page</button>
      </div>
    );
  }
  
  return (
    <div className="App">
      <ErrorBoundary onError={setError}>
        <MapboxPolygonAnalyzer mapboxToken={mapboxToken} />
      </ErrorBoundary>
    </div>
  );
}

// Simple error boundary component
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    console.error("Map error:", error, errorInfo);
    if (this.props.onError) {
      this.props.onError(error);
    }
  }

  render() {
    if (this.state.hasError) {
      return <div>Something went wrong with the map.</div>;
    }

    return this.props.children;
  }
}

export default App; 