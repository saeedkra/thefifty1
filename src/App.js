import React from 'react';
import './App.css';
import MapboxPolygonAnalyzer from './components/MapboxPolygonAnalyzer';

function App() {
  // You can pass your Mapbox token here if needed
  const mapboxToken = 'pk.eyJ1Ijoic2FlZWRrcmEiLCJhIjoiY203OWw3NjQyMDZqYjJrcG9oZ2g4aDlidCJ9.KFDRNLhWPT8jdM7TqyhReg';
  
  return (
    <div className="App">
      <MapboxPolygonAnalyzer mapboxToken={mapboxToken} />
    </div>
  );
}

export default App; 